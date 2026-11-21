// End-to-end check against a running server: acts as the phone, streams synthetic speech through /api/ws
// exactly like the page does (press, 1,024-byte frames at real time, release), and records each turn.
// Usage: node scripts/e2e.mjs [ws-url] [--noise]   default ws://localhost:3000/api/ws
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import WebSocket from "ws";

const URL_ = process.argv.find((a) => a.startsWith("ws")) ?? "ws://localhost:3000/api/ws";
const NOISE = process.argv.includes("--noise");
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const KEY = env.match(/^GNANI_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
const AUDIO = new URL("../test-audio/", import.meta.url);
mkdirSync(AUDIO, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TURNS = [
  { file: "line-1.wav", say: "रमेश का तीन सौ चालीस उधार लिखो", expect: { reply: "which" } },
  { file: "e2e-sharma.wav", say: "शर्मा जी वाले", expect: { reply: "added", name: "Ramesh Sharma", amount: 340, direction: "credit" } },
  { file: "line-6.wav", say: "नहीं, चार सौ तीस", expect: { reply: "corrected", amount: 430 } },
  { file: "line-3.wav", say: "सीता का बारह सौ पचास उधार", expect: { reply: "added", name: "Sita", amount: 1250, direction: "credit" } },
  { file: "line-4.wav", say: "Mohan paid five hundred rupees today", expect: { reply: "added", name: "Mohan", amount: 500, direction: "payment" } },
  { file: "e2e-total.wav", say: "रमेश शर्मा का टोटल कितना है?", expect: { reply: "total" } },
  { file: "e2e-today.wav", say: "आज कितना उधार गया?", expect: { reply: "today" } },
  { file: "line-8.wav", say: "पिंकी का two thousand उधार", expect: { reply: "added", name: "Pinky", amount: 2000, direction: "credit" } },
  { file: "e2e-two.wav", say: "अनिल का पाँच सौ उधार, कल दो सौ दिया था", expect: { reply: "added", name: "Anil", amount: 500, direction: "credit" } },
];

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const SEED = [
  ["Ramesh Sharma", 200, "credit"], ["Ramesh Doodhwala", 150, "credit"], ["Sita", 300, "credit"],
  ["Mohan", 800, "credit"], ["Pinky", 120, "credit"], ["Anil", 400, "credit"],
].map(([name, amount, direction], i) => ({ id: `seed-${i}`, name, nameKey: name.toLowerCase(), amount, direction, date: today, at: new Date(Date.now() - 86_400_000).toISOString() }));

async function wavFor(t) {
  const f = new URL(t.file, AUDIO);
  if (existsSync(f)) return readFileSync(f);
  const res = await fetch("https://api.vachana.ai/api/v1/tts/inference", {
    method: "POST",
    headers: { "X-API-Key-ID": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text: t.say, model: "timbre-v3.0", voice: "Avinash", language: "auto", audio_config: { sample_rate: 16000, container: "wav" } }),
  });
  if (!res.ok) throw new Error(`tts ${res.status}`);
  const wav = Buffer.from(await res.arrayBuffer());
  writeFileSync(f, wav);
  return wav;
}
const pcmOf = (wav) => {
  let p = 12;
  while (p + 8 <= wav.length) {
    const id = wav.toString("ascii", p, p + 4), size = wav.readUInt32LE(p + 4);
    if (id === "data") return wav.subarray(p + 8, p + 8 + Math.min(size, wav.length - p - 8));
    p += 8 + size + (size % 2);
  }
  throw new Error("no data");
};
const babble = (pcm, other) => {
  const out = Buffer.alloc(pcm.length);
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    const o = other.readInt16LE(i % (other.length - (other.length % 2)));
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm.readInt16LE(i) + 0.4 * o))), i);
  }
  return out;
};

const ws = new WebSocket(URL_);
const inbox = [];
let waiter = null;
ws.on("message", (data, isBinary) => {
  inbox.push(isBinary ? { bin: data.length, at: Date.now() } : { ...JSON.parse(data.toString()), at: Date.now() });
  waiter?.();
});
const next = (pred, ms) => new Promise((resolve) => {
  const t0 = Date.now();
  const check = () => {
    const i = inbox.findIndex(pred);
    if (i >= 0) { waiter = null; return resolve(inbox.splice(0, i + 1)); }
    if (Date.now() - t0 > ms) { waiter = null; return resolve(null); }
    waiter = check;
    setTimeout(() => waiter === check && check(), 100);
  };
  check();
});

await new Promise((r, j) => { ws.once("open", r); ws.once("error", j); });
ws.send(JSON.stringify({ t: "hello", lang: "hi-IN", entries: SEED, greeted: true }));
if (!(await next((m) => m.t === "ready" || m.t === "error", 10000))?.some((m) => m.t === "ready")) throw new Error("no ready");

const noiseSrc = pcmOf(await wavFor({ file: "line-7.wav" }));
const results = [];
for (const t of TURNS) {
  let pcm = pcmOf(await wavFor(t));
  if (NOISE) pcm = babble(pcm, noiseSrc);
  ws.send(JSON.stringify({ t: "press" }));
  const start = Date.now();
  const audio = Buffer.concat([Buffer.alloc(1024 * 4), pcm, Buffer.alloc(1024 * 3)]);
  for (let i = 0, n = 0; i < audio.length; i += 1024, n++) {
    const frame = Buffer.alloc(1024);
    audio.copy(frame, 0, i, Math.min(i + 1024, audio.length));
    ws.send(frame);
    const wait = start + (n + 1) * 32 - Date.now();
    if (wait > 0) await sleep(wait);
  }
  const releasedAt = Date.now();
  ws.send(JSON.stringify({ t: "release" }));
  const msgs = (await next((m) => m.t === "said" || m.t === "error", 15000)) ?? [];
  const heard = msgs.find((m) => m.t === "heard");
  const ops = msgs.filter((m) => m.t === "ops").flatMap((m) => m.ops);
  const sayMsg = msgs.find((m) => m.t === "say");
  const said = msgs.find((m) => m.t === "said");
  const firstBin = msgs.find((m) => m.bin);
  const err = msgs.find((m) => m.t === "error");
  const op = ops[0];
  const got = op?.op === "add" ? op.entry : op?.op === "update" ? op.patch : {};
  const e = t.expect;
  const ok =
    !err && sayMsg &&
    (e.amount === undefined || got.amount === e.amount) &&
    (e.direction === undefined || got.direction === e.direction) &&
    (e.name === undefined || got.name === e.name || got.name === undefined);
  results.push({
    file: t.file, ok: Boolean(ok), heard: heard?.text, ops: ops.map((o) => (o.op === "add" ? `add ${o.entry.name} ${o.entry.amount} ${o.entry.direction} ${o.entry.date}` : `update ${JSON.stringify(o.patch)}`)),
    reply: sayMsg?.text, error: err?.message,
    clientFirstAudioMs: firstBin ? firstBin.at - releasedAt : null, serverFirstAudioMs: said?.firstAudioMs, sttMs: said?.sttMs, parseMs: said?.parseMs, ttsMs: said?.ttsMs,
  });
  console.log(JSON.stringify(results.at(-1)));
  await sleep(300);
}
ws.close();
const pass = results.filter((r) => r.ok).length;
const lat = results.map((r) => r.clientFirstAudioMs).filter((x) => x != null).sort((a, b) => a - b);
const pct = (p) => lat[Math.min(lat.length - 1, Math.floor(p * lat.length))];
console.log(`PASS ${pass}/${results.length}  first audio p50 ${pct(0.5)} ms  p90 ${pct(0.9)} ms  (noise: ${NOISE})`);
writeFileSync(new URL(`e2e-${NOISE ? "noise" : "clean"}.json`, AUDIO), JSON.stringify({ at: new Date().toISOString(), url: URL_, results }, null, 2));
