// Step 1 measurement: how well Prisma v3.0 streaming hears shop amounts, and how fast Timbre v3.0 starts
// speaking. Synthetic lines are spoken by Timbre (REST), streamed to Prisma at real-time pace, and closed
// with a commit, the way the app's push-to-talk does it. A babble variant mixes a second voice underneath.
// Usage: node scripts/spike.mjs   (needs GNANI_API_KEY in .env.local; prints a table, writes test-audio/)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import WebSocket from "ws";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const KEY = env.match(/^GNANI_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
if (!KEY) throw new Error("GNANI_API_KEY missing");
const OUT = new URL("../test-audio/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const LINES = [
  { id: 1, text: "रमेश का तीन सौ चालीस उधार लिखो", tts: "hi-IN", stt: "hi-IN", voice: "Shivani", amount: 340, dir: "credit" },
  { id: 2, text: "रमेश ने कल दो सौ रुपये दिए थे", tts: "hi-IN", stt: "hi-IN", voice: "Avinash", amount: 200, dir: "payment" },
  { id: 3, text: "सीता का बारह सौ पचास उधार", tts: "hi-IN", stt: "hi-IN", voice: "Kalpana", amount: 1250, dir: "credit" },
  { id: 4, text: "Mohan paid five hundred rupees today", tts: "en-IN", stt: "hi-IN", voice: "Avinash", amount: 500, dir: "payment" },
  { id: 5, text: "सुरेश का पैंसठ रुपये उधार", tts: "hi-IN", stt: "hi-IN", voice: "Shivani", amount: 65, dir: "credit" },
  { id: 6, text: "नहीं, चार सौ तीस", tts: "hi-IN", stt: "hi-IN", voice: "Kalpana", amount: 430, dir: "fix" },
  { id: 7, text: "अनिल ने परसों साढ़े सात सौ दिए", tts: "hi-IN", stt: "hi-IN", voice: "Avinash", amount: 750, dir: "payment" },
  { id: 8, text: "पिंकी का two thousand उधार", tts: "auto", stt: "hi-IN", voice: "Shivani", amount: 2000, dir: "credit" },
  { id: 9, text: "Ramesh ka total kitna hai?", tts: "hi-en", stt: "hi-IN", voice: "Kalpana", amount: null, dir: "query" },
  { id: 10, text: "ರಮೇಶ್ ಅವರಿಗೆ ಮುನ್ನೂರ ನಲವತ್ತು ರೂಪಾಯಿ ಸಾಲ", tts: "kn-IN", stt: "kn-IN", voice: "Avinash", amount: 340, dir: "credit" },
];
const NAMES = ["Ramesh Sharma", "Ramesh Doodhwala", "Sita", "Mohan", "Pinky", "Anil", "Suresh"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ttsRest(text, language, voice) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.vachana.ai/api/v1/tts/inference", {
      method: "POST",
      headers: { "X-API-Key-ID": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model: "timbre-v3.0", voice, language, audio_config: { sample_rate: 16000, container: "wav" } }),
    });
    if (res.status === 429 && attempt < 5) { await sleep(1500 * attempt); continue; }
    if (!res.ok) throw new Error(`tts ${res.status} ${(await res.text()).slice(0, 160)}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

function pcmFromWav(wav) {
  let p = 12;
  let rate = 0, bits = 0, ch = 0;
  while (p + 8 <= wav.length) {
    const id = wav.toString("ascii", p, p + 4), size = wav.readUInt32LE(p + 4);
    if (id === "fmt ") { ch = wav.readUInt16LE(p + 10); rate = wav.readUInt32LE(p + 12); bits = wav.readUInt16LE(p + 22); }
    if (id === "data") {
      if (rate !== 16000 || bits !== 16 || ch !== 1) throw new Error(`wav is ${rate} Hz ${bits} bit ${ch} ch`);
      return wav.subarray(p + 8, p + 8 + Math.min(size, wav.length - p - 8));
    }
    p += 8 + size + (size % 2);
  }
  throw new Error("no data chunk");
}

function mixBabble(pcm, other, gain) {
  const out = Buffer.alloc(pcm.length);
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    const o = other.length ? other.readInt16LE(i % (other.length - (other.length % 2))) : 0;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm.readInt16LE(i) + gain * o))), i);
  }
  return out;
}

function sttStream(pcm, language, format) {
  return new Promise((resolve) => {
    const t = { open: Date.now() };
    const ws = new WebSocket("wss://api.vachana.ai/stt/v3/stream", {
      headers: {
        "x-api-key-id": KEY, model: "prisma-v3.0", language_code: language, format,
        topic: "kirana shop credit ledger, udhaar and payments", keyterms: JSON.stringify(NAMES),
        "x-sample-rate": "16000", "x-idle-timeout-sec": "30",
      },
    });
    const done = (r) => { try { ws.close(); } catch {} resolve(r); };
    const timer = setTimeout(() => done({ error: "timeout", ...t }), 20000);
    ws.on("error", (e) => { clearTimeout(timer); done({ error: String(e.message) }); });
    ws.on("unexpected-response", (_q, res) => { clearTimeout(timer); done({ error: `http ${res.statusCode}` }); });
    ws.on("message", async (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === "connected") {
        t.handshake = Date.now() - t.open;
        const start = Date.now();
        const silence = Buffer.alloc(1024 * 6);
        const audio = Buffer.concat([silence, pcm]);
        for (let i = 0, n = 0; i < audio.length; i += 1024, n++) {
          const frame = Buffer.alloc(1024);
          audio.copy(frame, 0, i, Math.min(i + 1024, audio.length));
          ws.send(frame);
          const wait = start + (n + 1) * 32 - Date.now();
          if (wait > 0) await sleep(wait);
        }
        t.commitAt = Date.now();
        ws.send(JSON.stringify({ type: "commit" }));
      } else if (m.type === "transcript") {
        clearTimeout(timer);
        done({ text: m.text, lang: m.detected_language_code, serverMs: m.latency, commitToText: Date.now() - (t.commitAt ?? Date.now()), handshake: t.handshake });
      } else if (m.type === "error") {
        clearTimeout(timer);
        done({ error: m.message });
      }
    });
  });
}

async function ttsWsTiming() {
  const t0 = Date.now();
  const ws = new WebSocket("wss://api.vachana.ai/api/v1/tts", { headers: { "X-API-Key-ID": KEY } });
  await new Promise((r, j) => { ws.once("open", r); ws.once("error", j); });
  const handshake = Date.now() - t0;
  const runs = [];
  const texts = ["रमेश शर्मा का ₹340 उधार लिखा। कुल बाकी ₹540।", "आज ₹1,250 उधार गया, 4 एंट्री।", "Pinky ka ₹2,000 udhaar likha."];
  for (const text of texts) {
    const sent = Date.now();
    let first = null, bytes = 0, started = false;
    await new Promise((resolve) => {
      const on = (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.type === "start") started = true;
        if (!started) return;
        if (m.type === "audio") { if (first === null) first = Date.now() - sent; bytes += Buffer.from(m.data.audio, "base64").length; }
        if (m.type === "complete" || m.type === "error") { ws.off("message", on); if (m.type === "error") runs.push({ error: m.message }); resolve(); }
      };
      ws.on("message", on);
      ws.send(JSON.stringify({ text, voice: "Shivani", model: "timbre-v3.0", language: "auto", speed: 1.0,
        audio_config: { sample_rate: 24000, num_channels: 1, sample_width: 2, encoding: "linear_pcm", container: "raw" } }));
    });
    runs.push({ text: text.slice(0, 24), firstAudioMs: first, totalMs: Date.now() - sent, audioSec: +(bytes / 48000).toFixed(2) });
  }
  ws.close();
  return { handshake, runs };
}

const pcms = {};
for (const l of LINES) {
  try {
    let wav;
    try { wav = readFileSync(new URL(`line-${l.id}.wav`, OUT)); } catch { wav = await ttsRest(l.text, l.tts, l.voice); }
    pcms[l.id] = pcmFromWav(wav);
    writeFileSync(new URL(`line-${l.id}.wav`, OUT), wav);
  } catch (e) {
    console.log(`line ${l.id} tts failed: ${e.message}`);
  }
}
console.log(`synthesised ${Object.keys(pcms).length}/${LINES.length} lines`);

const rows = [];
for (const [fmt, auto] of [["transcribe", false], ["codemix", false], ["transcribe", true]]) {
  for (const l of LINES) {
    if (!pcms[l.id]) continue;
    const r = await sttStream(pcms[l.id], auto ? "indic-auto" : l.stt, fmt);
    rows.push({ id: l.id, fmt: auto ? "auto+transcribe" : fmt, noise: "clean", expect: l.amount, ...r });
    console.log(JSON.stringify(rows.at(-1)));
  }
}
for (const l of LINES) {
  const other = pcms[(l.id % LINES.length) + 1];
  if (!pcms[l.id] || !other) continue;
  const r = await sttStream(mixBabble(pcms[l.id], other, 0.4), l.stt, "transcribe");
  rows.push({ id: l.id, fmt: "transcribe", noise: "babble", expect: l.amount, ...r });
  console.log(JSON.stringify(rows.at(-1)));
}
const tts = await ttsWsTiming();
console.log("TTS WS", JSON.stringify(tts));
writeFileSync(new URL("spike-results.json", OUT), JSON.stringify({ at: new Date().toISOString(), rows, tts }, null, 2));
