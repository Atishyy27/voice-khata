import { allEntries, applyOps, resetDemo } from "./store.js";
import { createPlayer } from "./player.js";

const LANGS = [
  ["hi-IN", "हिन्दी"], ["en-IN", "English"], ["kn-IN", "ಕನ್ನಡ"], ["ta-IN", "தமிழ்"], ["te-IN", "తెలుగు"],
  ["ml-IN", "മലയാളം"], ["mr-IN", "मराठी"], ["bn-IN", "বাংলা"], ["gu-IN", "ગુજરાતી"], ["pa-IN", "ਪੰਜਾਬੀ"],
];
const LANG_KEY = "vk-lang";
const greetedKey = () => "vk-greeted-" + lang; // per language: the AI disclosure is owed again in a new language
const TAIL_MS = 150; // keep sending briefly after release so the last syllable is not cut
const $ = (id) => document.getElementById(id);
const rupee = new Intl.NumberFormat("en-IN");
const money = (n) => (n < 0 ? "-" : "") + "₹" + rupee.format(Math.abs(n));

let lang = localStorage.getItem(LANG_KEY);
if (!LANGS.some(([c]) => c === lang)) lang = null;

let ws = null;
let ready = false;
let held = false;
let talking = false;
let sending = false;
let tailTimer = 0;
let accepting = false; // audio is dropped between a press and the next "say"
let retryMs = 500;
let retryTimer = 0;
let readyTimer = 0;
let idleTimer = 0;
let ctx = null;
let player = null;
let micPromise = null;
const expanded = new Set();

function setStatus(text, kind = "") {
  const s = $("status");
  s.textContent = text;
  s.className = kind;
}
const setIdle = () => setStatus("तैयार: बटन दबाकर बोलें");

function setTalking(on) {
  talking = on;
  $("talk").classList.toggle("on", on);
  $("talk").textContent = on ? "बोलिए..." : "दबाकर बोलें";
}

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function connect() {
  clearTimeout(retryTimer);
  clearTimeout(readyTimer);
  const old = ws;
  const sock = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);
  sock.binaryType = "arraybuffer";
  ws = sock;
  ready = false;
  if (old) old.close();

  sock.onopen = async () => {
    readyTimer = setTimeout(
      () => setStatus("सर्वर से जवाब नहीं आया। नेटवर्क जाँचें, फिर पेज दोबारा खोलें।", "err"), 8000);
    const entries = await allEntries();
    if (sock === ws && sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ t: "hello", lang, entries, greeted: sessionStorage.getItem(greetedKey()) === "1" }));
  };
  sock.onmessage = (ev) => { if (sock === ws) onMessage(ev); };
  sock.onclose = () => {
    if (sock !== ws) return;
    ready = false;
    held = false;
    sending = false;
    clearTimeout(tailTimer);
    tailTimer = 0;
    setTalking(false);
    clearTimeout(readyTimer);
    setStatus("दोबारा जुड़ रहा हूँ...", "warn");
    retryTimer = setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 2, 5000);
  };
}

function onMessage(ev) {
  if (typeof ev.data !== "string") {
    if (accepting && player) player.enqueue(ev.data);
    return;
  }
  let m;
  try { m = JSON.parse(ev.data); } catch { return; }
  switch (m.t) {
    case "ready":
      clearTimeout(readyTimer);
      ready = true;
      retryMs = 500;
      if (!talking) setIdle();
      if (ctx && sessionStorage.getItem(greetedKey()) !== "1") send({ t: "greet" });
      break;
    case "partial":
      $("heard").textContent = m.text;
      $("heard").classList.add("live");
      break;
    case "heard":
      $("heard").classList.remove("live");
      $("heard").textContent = m.text || "-";
      $("reply").textContent = "-";
      break;
    case "ops":
      applyOps(m.ops).then(render);
      break;
    case "say":
      accepting = true;
      clearTimeout(idleTimer);
      $("reply").textContent = m.text || "-";
      if (!talking) setStatus("बोल रहा हूँ", "speak");
      break;
    case "said":
      sessionStorage.setItem(greetedKey(), "1");
      if (m.firstAudioMs != null) $("badge").textContent = ((m.firstAudioMs + TAIL_MS) / 1000).toFixed(2) + " s";
      if (player && ctx) {
        const wait = Math.max(0, player.endsAt() - ctx.currentTime) * 1000 + 150;
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { if (!talking) setIdle(); }, wait);
      }
      break;
    case "error":
      clearTimeout(idleTimer);
      setStatus(m.message || "कुछ गड़बड़ हुई", "err");
      break;
  }
}

async function openMic() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  await ctx.audioWorklet.addModule("worklet.js");
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "mic-16k", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
  node.port.onmessage = (e) => {
    if (sending && ws && ws.readyState === WebSocket.OPEN) ws.send(e.data);
  };
  const mute = ctx.createGain(); // keeps the worklet pulled without playing the mic back
  mute.gain.value = 0;
  src.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);
}

function initCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    player = createPlayer(ctx);
    player.onFirstAudio(() => { if (!talking) setStatus("बोल रहा हूँ", "speak"); });
  }
  if (ctx.state === "suspended") ctx.resume();
}

async function ensureAudio() {
  initCtx();
  if (ctx.state === "suspended") await ctx.resume();
  micPromise ||= openMic().catch((e) => { micPromise = null; throw e; });
  await micPromise;
}

async function press() {
  if (held || !lang) return;
  held = true;
  accepting = false;
  if (tailTimer) {
    clearTimeout(tailTimer);
    tailTimer = 0;
    sending = false;
    send({ t: "release" });
  }
  clearTimeout(idleTimer);
  if (player) player.stop();
  try {
    await ensureAudio();
  } catch (e) {
    held = false;
    setStatus("माइक की अनुमति दें, फिर दोबारा दबाएँ", "err");
    return;
  }
  if (!held) return;
  if (!ready || !ws || ws.readyState !== WebSocket.OPEN) { held = false; return; }
  send({ t: "press" });
  sending = true;
  setTalking(true);
  setStatus("सुन रहा हूँ", "listen");
}

function release() {
  if (!held) return;
  held = false;
  if (!talking) return;
  setTalking(false);
  setStatus("सोच रहा हूँ", "think");
  tailTimer = setTimeout(() => {
    tailTimer = 0;
    sending = false;
    send({ t: "release" });
  }, TAIL_MS);
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

async function render() {
  const entries = await allEntries();
  const byKey = new Map();
  for (const e of entries) {
    let c = byKey.get(e.nameKey);
    if (!c) byKey.set(e.nameKey, (c = { key: e.nameKey, name: e.name, balance: 0, last: "", list: [] }));
    c.balance += e.direction === "payment" ? -e.amount : e.amount;
    c.list.push(e);
    if (e.at > c.last) { c.last = e.at; c.name = e.name; }
  }
  const ul = $("ledger");
  ul.textContent = "";
  for (const c of [...byKey.values()].sort((a, b) => (a.last < b.last ? 1 : -1))) {
    const li = el("li");
    const row = el("button", "row");
    row.type = "button";
    row.append(el("span", "", c.name), el("b", "", money(c.balance)));
    row.setAttribute("aria-expanded", expanded.has(c.key));
    const detail = el("div", "entries");
    detail.hidden = !expanded.has(c.key);
    for (const e of c.list.sort((a, b) => (a.at < b.at ? 1 : -1))) {
      const d = el("div");
      const credit = e.direction !== "payment";
      d.append(
        el("span", "", e.date.slice(8, 10) + "/" + e.date.slice(5, 7)),
        el("span", credit ? "cr" : "pm", money(e.amount)),
        el("span", credit ? "cr" : "pm", credit ? "उधार" : "जमा"),
      );
      detail.append(d);
    }
    row.onclick = () => {
      const open = detail.hidden;
      detail.hidden = !open;
      row.setAttribute("aria-expanded", open);
      if (open) expanded.add(c.key); else expanded.delete(c.key);
    };
    li.append(row, detail);
    ul.append(li);
  }
}

function showPicker() { $("picker").hidden = false; }

function pickLang(code) {
  const changed = code !== lang;
  lang = code;
  localStorage.setItem(LANG_KEY, code);
  $("picker").hidden = true;
  $("langbtn").textContent = "भाषा: " + LANGS.find(([c]) => c === code)[1];
  if (changed || !ws) connect();
}

const langBox = $("langs");
for (const [code, label] of LANGS) {
  const b = el("button", "", label);
  b.type = "button";
  b.lang = code;
  b.onclick = () => { initCtx(); pickLang(code); };
  langBox.append(b);
}
$("langbtn").onclick = showPicker;

const talk = $("talk");
talk.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  try { talk.setPointerCapture(e.pointerId); } catch {}
  press();
});
for (const t of ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"]) talk.addEventListener(t, release);
talk.addEventListener("contextmenu", (e) => e.preventDefault());
talk.addEventListener("selectstart", (e) => e.preventDefault());

addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || !$("picker").hidden) return;
  e.preventDefault();
  press();
});
addEventListener("keyup", (e) => {
  if (e.code !== "Space") return;
  e.preventDefault();
  release();
});
document.addEventListener("visibilitychange", () => { if (document.hidden) release(); });

$("reset").onclick = async () => {
  await resetDemo();
  await render();
  retryMs = 500;
  connect();
};

setStatus("...");
render();
if (lang) {
  pickLang(lang);
} else {
  showPicker();
}
