// Barge-in check: start a reply, interrupt it with the next utterance as soon as its first audio arrives, and
// confirm the interrupted reply stops (no "said" for it), the next turn completes, and no error is sent.
// Usage: node scripts/bargein.mjs [ws-url]   default ws://localhost:3000/api/ws
import { readFileSync } from "node:fs";
import WebSocket from "ws";

const URL_ = process.argv[2] ?? "ws://localhost:3000/api/ws";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pcmOf = (f) => {
  const wav = readFileSync(new URL(`../test-audio/${f}`, import.meta.url));
  let p = 12;
  while (p + 8 <= wav.length) {
    const id = wav.toString("ascii", p, p + 4), size = wav.readUInt32LE(p + 4);
    if (id === "data") return wav.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size % 2);
  }
  throw new Error("no data");
};
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const seed = ["Sita", "Mohan"].map((name, i) => ({ id: `s${i}`, name, nameKey: name.toLowerCase(), amount: 100, direction: "credit", date: today, at: new Date().toISOString() }));

const ws = new WebSocket(URL_);
const log = [];
ws.on("message", (d, bin) => log.push(bin ? { bin: d.length, at: Date.now() } : { ...JSON.parse(d.toString()), at: Date.now() }));
await new Promise((r) => ws.once("open", r));
ws.send(JSON.stringify({ t: "hello", lang: "hi-IN", entries: seed, greeted: true }));
while (!log.some((m) => m.t === "ready")) await sleep(50);

async function talk(file) {
  ws.send(JSON.stringify({ t: "press" }));
  const pcm = Buffer.concat([Buffer.alloc(4096), pcmOf(file), Buffer.alloc(3072)]);
  const start = Date.now();
  for (let i = 0, n = 0; i < pcm.length; i += 1024, n++) {
    const f = Buffer.alloc(1024);
    pcm.copy(f, 0, i, Math.min(i + 1024, pcm.length));
    ws.send(f);
    const w = start + (n + 1) * 32 - Date.now();
    if (w > 0) await sleep(w);
  }
  ws.send(JSON.stringify({ t: "release" }));
}

await talk("line-3.wav");
const t0 = Date.now();
while (!log.some((m) => m.bin && m.at > t0) && Date.now() - t0 < 8000) await sleep(20);
const firstSay = log.find((m) => m.t === "say");
const cutAt = Date.now();
await talk("line-4.wav");
const t1 = Date.now();
while (!log.some((m) => m.t === "said" && m.at > t1) && !log.some((m) => m.t === "error") && Date.now() - t1 < 15000) await sleep(50);
await sleep(500);
ws.close();

const says = log.filter((m) => m.t === "say").map((m) => m.turn);
const saids = log.filter((m) => m.t === "said").map((m) => m.turn);
const errors = log.filter((m) => m.t === "error").map((m) => m.message);
const firstTurnSaid = saids.includes(firstSay?.turn);
const ok = says.length === 2 && saids.length === 1 && !firstTurnSaid && !errors.length;
console.log(JSON.stringify({ says, saids, interruptedTurnFinished: firstTurnSaid, errors, cutAfterMs: cutAt - t0 }));
console.log(ok ? "BARGE-IN PASS" : "BARGE-IN FAIL");
