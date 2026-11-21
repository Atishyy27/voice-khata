import WebSocket from "ws";

// Timbre v3.0 realtime socket, kept open between turns (the handshake costs about 260 ms, first audio about
// 200 ms on a warm socket, measured 22 Nov 2026). One request at a time; audio is counted only after this
// request's "start", because a late "complete" from an earlier request can arrive on the same socket.
// Barge-in closes the socket: there is no cancel message, and a fresh socket opens while the user speaks.
export const VOICE = "Shivani";
export const TTS_RATE = 24000;

export class TtsSocket {
  private ws: WebSocket | null = null;
  private ready: Promise<WebSocket> | null = null;

  constructor(private key: string) {}

  warm(): Promise<WebSocket> {
    if (this.ready && this.ws && this.ws.readyState <= WebSocket.OPEN) return this.ready;
    const ws = new WebSocket("wss://api.vachana.ai/api/v1/tts", { headers: { "X-API-Key-ID": this.key } });
    this.ws = ws;
    this.ready = new Promise((resolve, reject) => {
      ws.once("open", () => resolve(ws));
      ws.once("error", reject);
      ws.once("unexpected-response", (_q, res) => reject(new Error(`voice service refused (${res.statusCode})`)));
    });
    ws.on("close", () => {
      if (this.ws === ws) {
        this.ws = null;
        this.ready = null;
      }
    });
    this.ready.catch(() => {});
    return this.ready;
  }

  async speak(text: string, lang: string, onAudio: (pcm: Buffer) => void): Promise<void> {
    const ws = await this.warm();
    await new Promise<void>((resolve, reject) => {
      let started = false;
      const finish = (err?: Error) => {
        ws.off("message", onMessage);
        ws.off("close", onClose);
        err ? reject(err) : resolve();
      };
      const onClose = () => finish();
      const onMessage = (raw: WebSocket.RawData) => {
        let m: any;
        try {
          m = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (m.type === "start") started = true;
        else if (m.type === "error") finish(new Error(String(m.message ?? "voice error")));
        else if (!started) return;
        else if (m.type === "audio" && m.data?.audio) onAudio(Buffer.from(m.data.audio, "base64"));
        else if (m.type === "complete") finish();
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
  }

  cancel() {
    const ws = this.ws;
    this.ws = null;
    this.ready = null;
    try {
      ws?.close();
    } catch {}
  }

  close() {
    this.cancel();
  }
}
