import { allEntries, applyOps, resetDemo } from "./store.js";
import { createPlayer } from "./player.js";

const LANGS = [
  ["hi-IN", "हिन्दी"], ["en-IN", "English"], ["kn-IN", "ಕನ್ನಡ"], ["ta-IN", "தமிழ்"], ["te-IN", "తెలుగు"],
  ["ml-IN", "മലയാളം"], ["mr-IN", "मराठी"], ["bn-IN", "বাংলা"], ["gu-IN", "ગુજરાતી"], ["pa-IN", "ਪੰਜਾਬੀ"],
];
const LANG_KEY = "vk-lang";
const SHEET_KEY = "vk-sheet";
const greetedKey = () => "vk-greeted-" + lang; // per language: the AI disclosure is owed again in a new language
const TAIL_MS = 150; // keep sending briefly after release so the last syllable is not cut
const LOG_MAX = 50;
const $ = (id) => document.getElementById(id);
const rupee = new Intl.NumberFormat("en-IN");
const money = (n) => (n < 0 ? "-" : "") + "₹" + rupee.format(Math.abs(n));
const two = (n) => String(n).padStart(2, "0");
const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const nativeName = (code) => LANGS.find(([c]) => c === code)[1];
const shortDate = (d) => d.slice(8, 10) + "/" + d.slice(5, 7);
const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => Array.from(w)[0]).join("").toUpperCase();
const splitWords = (text) => String(text || "").split(/\s+/).filter(Boolean);
const fmtHold = (ms) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + two(s % 60); };
const langFromHash = () => { const h = location.hash.slice(1); return LANGS.some(([c]) => c === h) ? h : null; };

const savedLang = localStorage.getItem(LANG_KEY);
let lang = langFromHash() || (LANGS.some(([c]) => c === savedLang) ? savedLang : null);
let sheetOn = localStorage.getItem(SHEET_KEY) === "1";

const heardEl = $("heard");
const talk = $("talk");

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
let openedAt = 0;
let attempts = 0;
let pressAt = 0;
let meterTimer = 0;
let level = 0;
let toastTimer = 0;
let revealTimer = 0;
let shownWords = [];
let queue = [];
const logQueue = [];
const expanded = new Set();

function setStatus(text, kind = "") {
  const s = $("status");
  s.textContent = text;
  s.className = kind;
}
const setIdle = () => setStatus("तैयार: बटन दबाकर बोलें");

function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2500);
}

function setTalking(on) {
  talking = on;
  talk.classList.toggle("on", on);
  talk.textContent = on ? "बोलिए..." : "दबाकर बोलें";
}

function startMeter() {
  level = 0;
  pressAt = Date.now();
  const tick = () => { $("timer").textContent = fmtHold(Date.now() - pressAt); };
  tick();
  meterTimer = setInterval(tick, 100);
}

function stopMeter() {
  clearInterval(meterTimer);
  meterTimer = 0;
  level = 0;
  talk.style.setProperty("--level", "0");
}

function meter(buf) {
  const v = new Int16Array(buf);
  let sum = 0;
  for (let i = 0; i < v.length; i++) { const f = v[i] / 32768; sum += f * f; }
  const rms = Math.sqrt(sum / (v.length || 1));
  level = 0.7 * level + 0.3 * Math.min(1, rms * 4);
  talk.style.setProperty("--level", level.toFixed(2));
}

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function log(ev, data = {}) {
  const obj = { t: "log", ev, ...data };
  if (ws && ws.readyState === WebSocket.OPEN) send(obj);
  else if (logQueue.length < LOG_MAX) logQueue.push(obj);
}

function flushLog() {
  while (logQueue.length && ws && ws.readyState === WebSocket.OPEN) send(logQueue.shift());
}

function paint(fresh, allStable) {
  const n = shownWords.length;
  const spans = [...heardEl.querySelectorAll(".w")];
  if (!spans.length) heardEl.textContent = "";
  while (spans.length > n) {
    const s = spans.pop();
    if (s.previousSibling && s.previousSibling.nodeType === Node.TEXT_NODE) s.previousSibling.remove();
    s.remove();
  }
  for (let i = spans.length; i < n; i++) {
    if (i > 0) heardEl.append(" ");
    const s = el("span", "w");
    heardEl.append(s);
    spans.push(s);
  }
  spans.forEach((s, i) => {
    s.textContent = shownWords[i];
    const vol = !allStable && i >= n - 2;
    s.classList.toggle("volatile", vol);
    s.classList.toggle("stable", !vol);
  });
  if (fresh && n) {
    const s = spans[n - 1];
    s.classList.add("in");
    setTimeout(() => s.classList.remove("in"), 200);
  }
}

function revealNext() {
  revealTimer = 0;
  if (!queue.length) return;
  shownWords.push(queue.shift());
  paint(true, false);
  if (queue.length) revealTimer = setTimeout(revealNext, 70);
}

function onPartial(text) {
  const words = splitWords(text);
  let n = 0;
  while (n < words.length && n < shownWords.length && words[n] === shownWords[n]) n++;
  clearTimeout(revealTimer);
  revealTimer = 0;
  shownWords = shownWords.slice(0, n);
  queue = words.slice(n);
  paint(false, false);
  if (queue.length) revealNext();
}

function onHeard(text) {
  clearTimeout(revealTimer);
  revealTimer = 0;
  queue = [];
  shownWords = splitWords(text);
  paint(false, true);
  if (!shownWords.length) heardEl.textContent = "-";
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
    openedAt = performance.now();
    readyTimer = setTimeout(
      () => setStatus("सर्वर से जवाब नहीं आया। नेटवर्क जाँचें, फिर पेज दोबारा खोलें।", "err"), 8000);
    const entries = await allEntries();
    if (sock === ws && sock.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify({ t: "hello", lang, entries, greeted: sessionStorage.getItem(greetedKey()) === "1", sheet: sheetOn }));
      log("ws_open");
    }
  };
  sock.onmessage = (ev) => { if (sock === ws) onMessage(ev); };
  sock.onclose = (ev) => {
    if (sock !== ws) return;
    log("ws_close", { code: ev.code });
    ready = false;
    held = false;
    sending = false;
    clearTimeout(tailTimer);
    tailTimer = 0;
    setTalking(false);
    stopMeter();
    talk.classList.remove("busy");
    clearTimeout(readyTimer);
    setStatus("दोबारा जुड़ रहा हूँ...", "warn");
    retryTimer = setTimeout(() => {
      attempts++;
      log("reconnect", { attempt: attempts });
      connect();
    }, retryMs);
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
      attempts = 0;
      log("ready", { ms: Math.round(performance.now() - openedAt) });
      flushLog();
      if (!talking) setIdle();
      if (ctx && sessionStorage.getItem(greetedKey()) !== "1") send({ t: "greet" });
      break;
    case "partial":
      onPartial(m.text);
      heardEl.classList.add("live");
      break;
    case "heard":
      heardEl.classList.remove("live");
      onHeard(m.text);
      $("reply").textContent = "-";
      break;
    case "ops":
      applyOps(m.ops).then(render);
      break;
    case "say":
      talk.classList.remove("busy");
      accepting = true;
      clearTimeout(idleTimer);
      $("reply").textContent = m.text || "-";
      if (!talking) setStatus("बोल रहा हूँ", "speak");
      break;
    case "said":
      sessionStorage.setItem(greetedKey(), "1");
      if (m.firstAudioMs != null) {
        $("badge").textContent = ((m.firstAudioMs + TAIL_MS) / 1000).toFixed(2) + " s";
        log("first_audio", { ms: m.firstAudioMs });
      }
      if (player && ctx) {
        const wait = Math.max(0, player.endsAt() - ctx.currentTime) * 1000 + 150;
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { if (!talking) setIdle(); }, wait);
      }
      break;
    case "sheet_url":
      $("sheetLink").href = m.url;
      $("sheetBox").hidden = false;
      break;
    case "sheet_saved":
      toast(m.ok ? "शीट में लिखा" : "शीट में नहीं लिख पाए");
      break;
    case "error": {
      const msg = m.message || "कुछ गड़बड़ हुई";
      talk.classList.remove("busy");
      clearTimeout(idleTimer);
      setStatus(msg, "err");
      toast(msg);
      break;
    }
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
    if (talking) meter(e.data);
    if (sending && ws && ws.readyState === WebSocket.OPEN) ws.send(e.data);
  };
  const mute = ctx.createGain(); // keeps the worklet pulled without playing the mic back
  mute.gain.value = 0;
  src.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);
  log("mic_ok");
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
  talk.classList.remove("busy");
  if (player && ctx && player.endsAt() > ctx.currentTime) log("barge_in");
  if (player) player.stop();
  clearTimeout(revealTimer);
  revealTimer = 0;
  shownWords = [];
  queue = [];
  heardEl.textContent = "";
  heardEl.classList.remove("live");
  try {
    await ensureAudio();
  } catch (e) {
    held = false;
    log("mic_error", { code: e.name || "unknown" });
    setStatus("माइक की अनुमति दें, फिर दोबारा दबाएँ", "err");
    return;
  }
  if (!held) return;
  if (!ready || !ws || ws.readyState !== WebSocket.OPEN) { held = false; return; }
  send({ t: "press" });
  log("press");
  sending = true;
  setTalking(true);
  startMeter();
  setStatus("सुन रहा हूँ", "listen");
}

function release() {
  if (!held) return;
  held = false;
  if (!talking) return;
  const holdMs = Date.now() - pressAt;
  setTalking(false);
  stopMeter();
  $("timer").textContent = fmtHold(holdMs);
  talk.classList.add("busy");
  log("release", { holdMs });
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

  const today = todayIST();
  let due = 0;
  let todaySum = 0;
  for (const c of byKey.values()) if (c.balance > 0) due += c.balance;
  for (const e of entries) if (e.direction !== "payment" && e.date === today) todaySum += e.amount;
  $("sumDue").textContent = money(due);
  $("sumToday").textContent = money(todaySum);
  $("sumCount").textContent = String(byKey.size);

  const ul = $("ledger");
  ul.textContent = "";
  for (const c of [...byKey.values()].sort((a, b) => (a.last < b.last ? 1 : -1))) {
    const sorted = c.list.sort((a, b) => (a.at < b.at ? 1 : -1));
    const withNote = sorted.find((e) => e.note);
    const meta = [shortDate(sorted[0].date), withNote ? withNote.note : ""].filter(Boolean).join(" · ");
    const bal = c.balance;

    const li = el("li");
    const row = el("button", "row");
    row.type = "button";
    const who = el("span", "who");
    who.append(el("span", "name", c.name), el("span", "meta", meta));
    row.append(
      el("span", "avatar", initials(c.name)),
      who,
      el("span", "amt " + (bal > 0 ? "due" : bal < 0 ? "adv" : "zero"),
        bal < 0 ? money(-bal) + " जमा ज़्यादा" : money(bal)),
    );
    row.setAttribute("aria-expanded", expanded.has(c.key));

    const detail = el("div", "entries");
    detail.hidden = !expanded.has(c.key);
    for (const e of sorted) {
      const d = el("div");
      const credit = e.direction !== "payment";
      d.append(
        el("span", "", shortDate(e.date)),
        el("span", credit ? "cr" : "pm", money(e.amount)),
        el("span", credit ? "cr" : "pm", credit ? "उधार" : "जमा"),
      );
      if (e.note) d.append(el("div", "note", e.note));
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

function showPicker(reason) {
  $("picker").hidden = false;
  log("picker_shown", { reason });
}

function pickLang(code) {
  const changed = code !== lang;
  lang = code;
  localStorage.setItem(LANG_KEY, code);
  history.replaceState(null, "", "#" + code);
  $("picker").hidden = true;
  $("langbtn").textContent = nativeName(code);
  if (changed || !ws) connect();
}

const langBox = $("langs");
for (const [code, label] of LANGS) {
  const b = el("button", "", label);
  b.type = "button";
  b.lang = code;
  b.onclick = () => { initCtx(); log("lang_pick", { lang: code }); pickLang(code); };
  langBox.append(b);
}
$("langbtn").onclick = () => showPicker("tap");

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

addEventListener("error", (e) => {
  log("js_error", { msg: String(e.message || "").slice(0, 120), line: e.lineno || 0 });
});
addEventListener("unhandledrejection", (e) => {
  const r = e.reason;
  log("js_error", { msg: String((r && r.message) || r || "").slice(0, 120), line: 0 });
});

$("reset").onclick = async () => {
  await resetDemo();
  await render();
  retryMs = 500;
  connect();
};

$("sheetOn").checked = sheetOn;
$("sheetOn").onchange = () => {
  sheetOn = $("sheetOn").checked;
  localStorage.setItem(SHEET_KEY, sheetOn ? "1" : "0");
  send({ t: "sheet", on: sheetOn });
  log("sheet_toggle", { on: sheetOn });
};

setStatus("...");
render();
log("page_load", { standalone: matchMedia("(display-mode: standalone)").matches, w: innerWidth });
if (lang) {
  pickLang(lang);
} else {
  showPicker("no_lang");
}
