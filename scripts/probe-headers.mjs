// One-off: which header spelling makes the stream use Prisma v3.0 (echoed in the connected message).
import { readFileSync } from "node:fs";
import WebSocket from "ws";
const KEY = readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^GNANI_API_KEY=(.+)$/m)[1].trim().replace(/^"|"$/g, "");
const variants = [
  { model: "prisma-v3.0", language_code: "hi-IN" },
  { "x-model": "prisma-v3.0", language_code: "hi-IN,en-IN" },
  { model: "prisma-v3.0", "x-model": "prisma-v3.0", language_code: "hi-IN,en-IN" },
  { model: "prisma-v3.0", language_code: "indic-auto" },
  { model: "prisma-v3.0", lang_code: "hi-IN,en-IN" },
];
for (const h of variants) {
  const r = await new Promise((res) => {
    const ws = new WebSocket("wss://api.vachana.ai/stt/v3/stream", { headers: { "x-api-key-id": KEY, ...h } });
    const t = setTimeout(() => { ws.terminate(); res("timeout"); }, 8000);
    ws.on("message", (m) => { clearTimeout(t); ws.close(); res(m.toString().slice(0, 300)); });
    ws.on("unexpected-response", (_q, s) => { clearTimeout(t); res("http " + s.statusCode); });
    ws.on("error", (e) => { clearTimeout(t); res("err " + e.message); });
  });
  console.log(JSON.stringify(h), "=>", r);
}
