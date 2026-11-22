import WebSocket from "ws";

// Timbre v3.0 realtime. Each reply gets its own socket, opened ahead of time (the handshake costs about 260 ms,
// first audio about 200 ms on an open socket, measured 22 Nov 2026), so nothing from one request can leak into
// the next. Reusing one socket hung a reply in a live run on 22 Nov: a request whose "start" never came waited
// forever. A watchdog now fails a reply with no audio after FIRST_AUDIO_MS and retries once on a new socket.
// Barge-in closes the reply's socket; there is no cancel message.
export const VOICE = "Shivani";
export const TTS_RATE = 24000;
const FIRST_AUDIO_MS = 5000;
const WHOLE_REPLY_MS = 25000;

export class TtsSocket {
  private spareWs: WebSocket | null = null;
  private spare: Promise<WebSocket> | null = null;
  private active = new Set<WebSocket>();

  constructor(private key: string) {}

  warm(): Promise<WebSocket> {
    if (this.spare && this.spareWs && this.spareWs.readyState <= WebSocket.OPEN) return this.spare;
    const ws = new WebSocket("wss://api.vachana.ai/api/v1/tts", { headers: { "X-API-Key-ID": this.key } });
    ws.on("error", () => {}); // errors also close the socket; a listener stops Node treating them as fatal
    this.spareWs = ws;
    this.spare = new Promise((resolve, reject) => {
      ws.once("open", () => resolve(ws));
      ws.once("error", reject);
      ws.once("unexpected-response", (_q, res) => reject(new Error(`voice service refused (${res.statusCode})`)));
    });
    ws.on("close", () => {
      if (this.spareWs === ws) {
        this.spareWs = null;
        this.spare = null;
      }
    });
    this.spare.catch(() => {});
    return this.spare;
  }

  async speak(text: string, lang: string, onAudio: (pcm: Buffer) => void): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      let heard = false;
      try {
        await this.once(text, lang, (pcm) => {
          heard = true;
          onAudio(pcm);
        });
        return;
      } catch (e) {
        if (heard || attempt >= 1 || (e as Error).message === "cancelled") throw e;
      }
    }
  }

  private async once(text: string, lang: string, onAudio: (pcm: Buffer) => void): Promise<void> {
    const ws = await this.warm();
    this.spareWs = null;
    this.spare = null;
    this.active.add(ws);
    this.warm().catch(() => {});
    try {
      await new Promise<void>((resolve, reject) => {
        let got = false;
        let timer = setTimeout(() => finish(new Error("voice timed out")), FIRST_AUDIO_MS);
        const finish = (err?: Error) => {
          clearTimeout(timer);
          ws.off("message", onMessage);
          ws.off("close", onClose);
          err ? reject(err) : resolve();
        };
        const onClose = () => finish(new Error(this.active.has(ws) ? "voice socket closed" : "cancelled"));
        const onMessage = (raw: WebSocket.RawData) => {
          let m: any;
          try {
            m = JSON.parse(raw.toString());
          } catch {
            return;
          }
          if (m.type === "error") finish(new Error(String(m.message ?? "voice error")));
          else if (m.type === "audio" && m.data?.audio) {
            if (!got) {
              got = true;
              clearTimeout(timer);
              timer = setTimeout(() => finish(new Error("voice timed out")), WHOLE_REPLY_MS);
            }
            onAudio(Buffer.from(m.data.audio, "base64"));
          } else if (m.type === "complete") finish();
        };
        ws.on("message", onMessage);
        ws.on("close", onClose);
        ws.send(
          JSON.stringify({
            text,
            voice: VOICE,
            model: "timbre-v3.0",
            language: lang,
            speed: 1.0,
            audio_config: { sample_rate: TTS_RATE, num_channels: 1, sample_width: 2, encoding: "linear_pcm", container: "raw" },
          }),
        );
      });
    } finally {
      this.active.delete(ws);
      try {
        ws.close();
      } catch {}
    }
  }

  // Barge-in: stop every reply in flight. The spare socket stays open for the next reply.
  cancel() {
    const live = [...this.active];
    this.active.clear();
    for (const ws of live) {
      try {
        ws.close();
      } catch {}
    }
  }

  close() {
    this.cancel();
    const ws = this.spareWs;
    this.spareWs = null;
    this.spare = null;
    try {
      ws?.close();
    } catch {}
  }
}
