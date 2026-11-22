import WebSocket from "ws";

// Prisma v3.0 realtime stream. Push-to-talk ends each utterance with a commit, so the server-side silence
// window is set to its maximum and a natural pause mid-sentence does not split the entry.
// Measured 22 Nov 2026: a comma-separated language list is rejected on this endpoint (docs say it works),
// so the session uses one locale; format=transcribe makes the model write amounts as digits.
// Partials: undocumented, but the connected config echoes partials_enabled, and the header x-partials: true turns
// it on (22 Nov 2026). Partials then arrive about every 600 ms and the final message type becomes final_transcript.
export interface SttEvents {
  onTranscript: (text: string, lang: string | undefined, serverMs: number | undefined) => void;
  onPartial: (text: string) => void;
  onSpeechStart: () => void;
  onError: (message: string) => void;
  onClose: () => void;
}

export class SttStream {
  private ws: WebSocket | null = null;
  private ready: Promise<void> | null = null;

  constructor(
    private key: string,
    private lang: string,
    private keyterms: string[],
    private events: SttEvents,
  ) {}

  get isOpen() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  open(): Promise<void> {
    if (this.ready && this.ws && this.ws.readyState <= WebSocket.OPEN) return this.ready;
    const terms = this.keyterms.filter((t) => /^[\x20-\x7e]+$/.test(t)).slice(0, 200);
    const ws = new WebSocket("wss://api.vachana.ai/stt/v3/stream", {
      headers: {
        "x-api-key-id": this.key,
        model: "prisma-v3.0",
        language_code: this.lang,
        format: "transcribe",
        topic: "kirana shop credit ledger, udhaar and payments, rupee amounts",
        ...(terms.length ? { keyterms: JSON.stringify(terms) } : {}),
        "x-sample-rate": "16000",
        "x-idle-timeout-sec": "300",
        "x-min-silence-ms": "2000",
        "x-partials": "true",
      },
    });
    this.ws = ws;
    this.ready = new Promise((resolve, reject) => {
      const fail = (msg: string) => {
        reject(new Error(msg));
        this.events.onError(msg);
      };
      ws.on("unexpected-response", (_req, res) => fail(`speech service refused (${res.statusCode})`));
      ws.on("error", (e) => fail(e.message));
      ws.on("close", () => {
        if (this.ws === ws) {
          this.ws = null;
          this.ready = null;
        }
        this.events.onClose();
      });
      ws.on("message", (raw) => {
        let m: any;
        try {
          m = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (m.type === "connected") resolve();
        else if (m.type === "speech_start") this.events.onSpeechStart();
        else if (m.type === "partial_transcript") this.events.onPartial(String(m.text ?? ""));
        else if (m.type === "transcript" || m.type === "final_transcript")
          this.events.onTranscript(String(m.text ?? ""), m.detected_language_code, m.latency);
        else if (m.type === "error") this.events.onError(String(m.message ?? "speech error"));
      });
    });
    return this.ready;
  }

  send(frame: Buffer) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(frame);
  }

  commit() {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "commit" }));
  }

  close() {
    const ws = this.ws;
    this.ws = null;
    this.ready = null;
    try {
      ws?.close();
    } catch {}
  }
}
