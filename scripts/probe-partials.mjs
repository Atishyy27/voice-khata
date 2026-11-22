// Gnani's stream echoes partials_enabled/partial_interval_ms in its connected config but documents only final
// transcripts. This checks which header (if any) switches partials on, by reading the echo. No audio is sent.
import { readFileSync } from "node:fs";
import WebSocket from "ws";
const KEY = readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(/^GNANI_API_KEY=(.+)$/m)[1].trim().replace(/^"|"$/g, "");
const base = { "x-api-key-id": KEY, model: "prisma-v3.0", language_code: "hi-IN", format: "transcribe" };
const tries = ["partials_enabled", "x-partials-enabled", "partials", "x-partials", "enable_partials", "x-enable-partials", "interim_results", "x-interim-results"];
for (const h of tries) {
  const echo = await new Promise((res) => {
    const ws = new WebSocket("wss://api.vachana.ai/stt/v3/stream", { headers: { ...base, [h]: "true" } });
    const t = setTimeout(() => { ws.terminate(); res("timeout"); }, 8000);
    ws.on("message", (m) => { clearTimeout(t); ws.close(); try { res(JSON.parse(m.toString()).config ?? m.toString().slice(0, 120)); } catch { res(m.toString().slice(0, 120)); } });
    ws.on("error", (e) => { clearTimeout(t); res("err " + e.message); });
  });
  console.log(h.padEnd(20), "->", typeof echo === "object" ? `partials_enabled=${echo.partials_enabled} interval=${echo.partial_interval_ms}` : echo);
}
