// Streams one synthetic line with x-partials: true and prints every message with its time since audio start.
import { readFileSync } from "node:fs";
import WebSocket from "ws";
const KEY = readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^GNANI_API_KEY=(.+)$/m)[1].trim().replace(/^"|"$/g, "");
const file = process.argv[2] ?? "test-audio/e2e-two.wav";
const wav = readFileSync(file);
const pcm = wav.subarray(44);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket("wss://api.vachana.ai/stt/v3/stream", {
  headers: { "x-api-key-id": KEY, model: "prisma-v3.0", language_code: "hi-IN", format: "transcribe", "x-partials": "true", "x-min-silence-ms": "2000" },
});
let t0 = 0;
ws.on("message", async (raw) => {
  const m = JSON.parse(raw.toString());
  const at = t0 ? Date.now() - t0 : 0;
  const { timestamp, config, ...rest } = m;
  console.log(String(at).padStart(5), "ms", JSON.stringify(rest).slice(0, 220));
  if (m.type === "connected") {
    t0 = Date.now();
    for (let i = 0, n = 0; i < pcm.length; i += 1024, n++) {
      const f = Buffer.alloc(1024);
      pcm.copy(f, 0, i, Math.min(i + 1024, pcm.length));
      ws.send(f);
      const w = t0 + (n + 1) * 32 - Date.now();
      if (w > 0) await sleep(w);
    }
    console.log(String(Date.now() - t0).padStart(5), "ms -- audio done, commit");
    ws.send(JSON.stringify({ type: "commit" }));
  }
  if (m.type === "transcript") setTimeout(() => ws.close(), 300);
});
