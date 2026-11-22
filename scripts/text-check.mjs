// Typed-turn check: connects, sends hello in the given mode, sends text messages, prints every server message.
// Usage: node scripts/text-check.mjs [ws-url] [khata|kharcha] "text 1" "text 2" ...
import WebSocket from "ws";
const [url = "wss://voice-khata-gray.vercel.app/api/ws", mode = "kharcha", ...texts] = process.argv.slice(2);
const ws = new WebSocket(url);
const t0 = Date.now();
const at = () => String(Date.now() - t0).padStart(6) + " ms";
let audio = 0;
ws.on("message", (d, bin) => {
  if (bin) { audio += d.length; return; }
  const m = JSON.parse(d.toString());
  if (m.t === "said" || m.t !== "partial") console.log(at(), JSON.stringify(m).slice(0, 220), m.t === "said" ? `(audio ${audio} bytes)` : "");
});
ws.on("close", (c) => console.log(at(), "closed", c));
await new Promise((r) => ws.once("open", r));
ws.send(JSON.stringify({ t: "hello", lang: process.env.VK_LANG || "hi-IN", mode, entries: [], greeted: true }));
await new Promise((r) => { const i = setInterval(() => {}, 1000); ws.on("message", (d, b) => { if (!b && JSON.parse(d.toString()).t === "ready") { clearInterval(i); r(); } }); });
for (const text of texts.length ? texts : ["chai 20, auto 50, sabzi 120", "aaj kitna kharcha hua"]) {
  console.log(at(), ">> text:", text);
  ws.send(JSON.stringify({ t: "text", text }));
  await new Promise((r) => setTimeout(r, 9000));
}
ws.close();
