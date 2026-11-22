import { allEntries, applyOps, resetDemo } from "./store.js";
import { createPlayer } from "./player.js";

// [code, native name, tier]. Tiers: native, beta, exp (picker groups below).
const LANGS = [
  ["hi-IN", "हिन्दी", "native"], ["en-IN", "English", "native"], ["bn-IN", "বাংলা", "native"],
  ["mr-IN", "मराठी", "native"], ["ta-IN", "தமிழ்", "native"], ["te-IN", "తెలుగు", "native"],
  ["gu-IN", "ગુજરાતી", "native"], ["kn-IN", "ಕನ್ನಡ", "native"], ["ml-IN", "മലയാളം", "native"],
  ["pa-IN", "ਪੰਜਾਬੀ", "native"],
  ["or-IN", "ଓଡ଼ିଆ", "beta"], ["ur-IN", "اردو", "beta"], ["bho-IN", "भोजपुरी", "beta"],
  ["mai-IN", "मैथिली", "beta"], ["kok-IN", "कोंकणी", "beta"], ["ks-IN", "कॉशुर", "beta"],
  ["sat-IN", "संताली", "beta"], ["tcy-IN", "ತುಳು", "beta"], ["ne-IN", "नेपाली", "beta"],
  ["sd-IN", "सिन्धी", "beta"], ["as-IN", "অসমীয়া", "beta"],
  ["doi-IN", "डोगरी", "exp"], ["mni-IN", "মৈতৈলোন্", "exp"], ["sa-IN", "संस्कृतम्", "exp"],
  ["brx-IN", "बड़ो", "exp"],
];
const TIERS = [
  ["native", "भाषाएँ", ""],
  ["beta", "Beta · बहन-भाषा की आवाज़", "अनुवाद मशीन से, जाँच बाकी"],
  ["exp", "Experimental", ""],
];
const TIER_TAG = { beta: "Beta", exp: "Exp" };

const MODES = ["khata", "kharcha"];
const MODE_KEY = "vk-mode";
const TILE_LABELS = {
  khata: ["कुल बाकी", "आज उधार", "ग्राहक"],
  kharcha: ["आज खर्चा", "इस महीने", "सबसे ज़्यादा"],
};
const CAT_LABEL = {
  khana: "खाना", rashan: "राशन", "doodh-sabzi": "दूध-सब्ज़ी", ghar: "घर", "bijli-paani": "बिजली-पानी",
  "phone-recharge": "फ़ोन रिचार्ज", safar: "सफ़र", dawai: "दवाई", padhai: "पढ़ाई", kapde: "कपड़े",
  tyohar: "त्योहार", "udhaar-diya": "उधार दिया", other: "अन्य",
};
const catLabel = (c) => CAT_LABEL[c] || CAT_LABEL.other;

const LANG_KEY = "vk-lang";
const SHEET_KEY = "vk-sheet";
const greetedKey = () => "vk-greeted-" + lang; // per language: the AI disclosure is owed again in a new language
const TAIL_MS = 150; // keep sending briefly after release so the last syllable is not cut
const LOG_MAX = 50;
const MAX_TURNS = 30;
const TEXT_MAX = 300;
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
const savedMode = localStorage.getItem(MODE_KEY);
let mode = MODES.includes(savedMode) ? savedMode : "khata";

const talk = $("talk");

let ws = null;
let ready = false;
// A typed message the server has not acknowledged yet. The server answers "heard" within about 100 ms, so 5 s of
// silence means the message was lost (seen once on 22 Nov); the page reconnects and resends it once.
let pendingText = "";
let pendingTimer = 0;
// A spoken turn the server never answers (seen on a stalled laptop link, 22 Nov): the server replies within about
// 4.2 s even when it hears nothing, so 8 s of silence after release means the link is gone.
let turnTimer = 0;
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
let turn = null; // latest chat turn: { root, user, bot, reply, badge, cards, typed }
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
  talk.setAttribute("aria-label", on ? "बोलिए..." : "दबाकर बोलें");
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

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// ---- Chat thread ----

function cur() { return turn || newTurn(false); }
function box() { return cur().user; } // the pending user bubble's text span (#heard)
function scrollThread() { const t = $("thread"); t.scrollTop = t.scrollHeight; }

// Starts a turn: a user bubble (#heard holds the live or final words) and an assistant bubble
// (#reply holds the reply text, #badge the latency chip). Ids move to the newest turn.
function newTurn(typed, text = "") {
  const thread = $("thread");
  if (turn) {
    turn.user.removeAttribute("id");
    turn.reply.removeAttribute("id");
    turn.badge.removeAttribute("id");
  }
  const root = el("div", "turn");

  const user = el("span", "caption", text);
  user.id = "heard";
  const userBubble = el("div", "bubble me");
  userBubble.append(user);
  const userMsg = el("div", "msg me");
  userMsg.append(userBubble);

  const reply = el("div", "", "-");
  reply.id = "reply";
  const badge = el("span", "");
  badge.id = "badge";
  const cards = el("div", "cards");
  const botMsg = el("div", "msg bot");
  botMsg.hidden = !typed; // a voice turn shows its assistant bubble once the words are heard
  const botBubble = el("div", "bubble bot");
  botBubble.append(reply, badge, cards);
  botMsg.append(botBubble);

  root.append(userMsg, botMsg);
  thread.append(root);
  while (thread.children.length > MAX_TURNS) thread.firstElementChild.remove();
  turn = { root, user, bot: botMsg, reply, badge, cards, typed };
  scrollThread();
  return turn;
}

function paint(fresh, allStable) {
  const heard = box();
  const n = shownWords.length;
  const spans = [...heard.querySelectorAll(".w")];
  if (!spans.length) heard.textContent = "";
  while (spans.length > n) {
    const s = spans.pop();
    if (s.previousSibling && s.previousSibling.nodeType === Node.TEXT_NODE) s.previousSibling.remove();
    s.remove();
  }
  for (let i = spans.length; i < n; i++) {
    if (i > 0) heard.append(" ");
    const s = el("span", "w");
    heard.append(s);
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
  if (!shownWords.length) box().textContent = "-";
}

// One card per entry a turn created or changed. Khata: name, amount, udhaar or jama.
// Household: item, amount, category.
function entryCard(e) {
  const card = el("div", "kcard");
  if (e.book === "kharcha") {
    card.append(el("span", "kc-main", e.item || ""), el("span", "kc-amt", money(e.amount)), el("span", "kchip", catLabel(e.category)));
  } else {
    const credit = e.direction !== "payment";
    card.append(
      el("span", "kc-main", e.name || ""),
      el("span", "kc-amt", money(e.amount)),
      el("span", credit ? "kchip cr" : "kchip pm", credit ? "उधार" : "जमा"),
    );
  }
  return card;
}

// ---- Socket ----

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
      sock.send(JSON.stringify({ t: "hello", lang, entries, greeted: sessionStorage.getItem(greetedKey()) === "1", sheet: sheetOn, mode }));
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
      if (pendingText) {
        send({ t: "text", text: pendingText });
        pendingText = "";
      }
      break;
    case "partial":
      onPartial(m.text);
      box().classList.add("live");
      break;
    case "heard": {
      clearTimeout(turnTimer);
      pendingText = "";
      clearTimeout(pendingTimer);
      const t = cur();
      t.user.classList.remove("live");
      if (t.typed) t.typed = false; // a typed turn already shows its own text
      else onHeard(m.text);
      t.reply.textContent = "-";
      t.bot.hidden = false;
      break;
    }
    case "ops": {
      const t = cur();
      applyOps(m.ops).then(async () => {
        render();
        const byId = new Map((await allEntries()).map((e) => [e.id, e]));
        for (const op of m.ops || []) {
          const e = op.op === "add" ? op.entry : byId.get(op.id);
          if (e) t.cards.append(entryCard(e));
        }
        scrollThread();
      });
      break;
    }
    case "say": {
      clearTimeout(turnTimer);
      const t = cur();
      talk.classList.remove("busy");
      accepting = true;
      clearTimeout(idleTimer);
      t.reply.textContent = m.text || "-";
      t.bot.hidden = false;
      if (!talking) setStatus("बोल रहा हूँ", "speak");
      scrollThread();
      break;
    }
    case "said":
      sessionStorage.setItem(greetedKey(), "1");
      if (m.firstAudioMs != null) {
        cur().badge.textContent = ((m.firstAudioMs + TAIL_MS) / 1000).toFixed(2) + " s";
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
      clearTimeout(turnTimer);
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

// ---- Hold to talk ----

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
  clearTimeout(turnTimer);
  newTurn(false);
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
    watchTurn();
  }, TAIL_MS);
}

function watchTurn() {
  clearTimeout(turnTimer);
  turnTimer = setTimeout(() => {
    talk.classList.remove("busy");
    setStatus("नेटवर्क धीमा है, फिर से बोलें", "warn");
    toast("नेटवर्क धीमा है, फिर से बोलें");
    log("turn_timeout");
    connect();
  }, 8000);
}

// ---- Typed input ----

function sendText() {
  const text = $("textIn").value.trim().slice(0, TEXT_MAX);
  if (!text) return;
  if (!ready || !ws || ws.readyState !== WebSocket.OPEN) {
    toast("अभी जुड़ रहा हूँ, एक पल रुकें");
    return;
  }
  $("textIn").value = "";
  initCtx();
  accepting = false;
  if (player) player.stop();
  clearTimeout(idleTimer);
  clearTimeout(revealTimer);
  revealTimer = 0;
  shownWords = [];
  queue = [];
  newTurn(true, text);
  send({ t: "text", text });
  pendingText = text;
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    if (!pendingText) return;
    log("reconnect", { attempt: -1 });
    connect();
  }, 5000);
  talk.classList.add("busy");
  setStatus("सोच रहा हूँ", "think");
}

// ---- Ledger, summary, modes ----

function paintMode() {
  const kharcha = mode === "kharcha";
  $("modeKhata").setAttribute("aria-selected", String(!kharcha));
  $("modeKharcha").setAttribute("aria-selected", String(kharcha));
  document.querySelectorAll("#summary .tile span").forEach((s, i) => { s.textContent = TILE_LABELS[mode][i]; });
  $("summary").classList.toggle("kharcha", kharcha);
  $("ledgerTitle").textContent = kharcha ? "इस महीने का खर्चा" : "खाता";
  $("catBar").hidden = !kharcha;
}

function setMode(m) {
  if (m === mode) return;
  mode = m;
  localStorage.setItem(MODE_KEY, m);
  paintMode();
  send({ t: "mode", mode: m });
  render();
}

function render() {
  return mode === "kharcha" ? renderKharcha() : renderKhata();
}

async function renderKhata() {
  const entries = await allEntries("khata");
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

async function renderKharcha() {
  const entries = await allEntries("kharcha");
  const today = todayIST();
  const month = today.slice(0, 7);
  let todaySum = 0;
  let monthSum = 0;
  const monthList = [];
  const byCat = new Map();
  for (const e of entries) {
    if (e.date === today) todaySum += e.amount;
    if (!e.date.startsWith(month)) continue;
    monthList.push(e);
    monthSum += e.amount;
    const k = e.category || "other";
    byCat.set(k, (byCat.get(k) || 0) + e.amount);
  }
  const cats = [...byCat].sort((a, b) => b[1] - a[1]);
  $("sumDue").textContent = money(todaySum);
  $("sumToday").textContent = money(monthSum);
  $("sumCount").textContent = cats.length ? catLabel(cats[0][0]) + " " + money(cats[0][1]) : "-";

  const bar = $("catBar");
  bar.textContent = "";
  const top = cats.slice(0, 5);
  const max = top.length ? top[0][1] : 1;
  for (const [k, v] of top) {
    const fill = el("i");
    fill.style.width = Math.max(4, Math.round((v / max) * 100)) + "%";
    const track = el("span", "cbar");
    track.append(fill);
    const row = el("div", "crow");
    row.append(el("span", "clabel", catLabel(k)), track, el("span", "camt", money(v)));
    bar.append(row);
  }

  const ul = $("ledger");
  ul.textContent = "";
  if (!monthList.length) {
    ul.append(el("li", "empty", "इस महीने अभी कोई खर्चा नहीं"));
    return;
  }
  monthList.sort((a, b) => (a.date === b.date ? (a.at < b.at ? 1 : -1) : (a.date < b.date ? 1 : -1)));
  let day = null;
  let block = null;
  for (const e of monthList) {
    if (e.date !== day) {
      day = e.date;
      block = el("li", "dayblock");
      block.append(el("div", "dayhead", shortDate(e.date)));
      ul.append(block);
    }
    const row = el("div", "krow");
    row.append(el("span", "kitem", e.item || ""), el("span", "kchip", catLabel(e.category)), el("span", "kamt", money(e.amount)));
    if (e.note) row.append(el("div", "knote", e.note));
    if (e.split && e.split.with) row.append(el("div", "ksplit", "आधा: " + e.split.with));
    block.append(row);
  }
}

// ---- Language picker ----

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
for (const [tier, title, note] of TIERS) {
  const group = el("section", "lgroup");
  group.append(el("h3", "ghead", title));
  if (note) group.append(el("p", "gnote", note));
  const grid = el("div", "lgrid");
  for (const [code, label, t] of LANGS) {
    if (t !== tier) continue;
    const b = el("button", t);
    b.type = "button";
    b.lang = code;
    b.append(el("span", "", label));
    if (TIER_TAG[t]) b.append(el("span", "tag", TIER_TAG[t]));
    b.onclick = () => { initCtx(); log("lang_pick", { lang: code }); pickLang(code); };
    grid.append(b);
  }
  group.append(grid);
  langBox.append(group);
}
$("langbtn").onclick = () => showPicker("tap");

// ---- Input wiring ----

talk.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  try { talk.setPointerCapture(e.pointerId); } catch {}
  press();
});
for (const t of ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"]) talk.addEventListener(t, release);
talk.addEventListener("contextmenu", (e) => e.preventDefault());
talk.addEventListener("selectstart", (e) => e.preventDefault());

$("textIn").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) {
    e.preventDefault();
    sendText();
  }
});
$("send").onclick = sendText;

$("modeKhata").onclick = () => setMode("khata");
$("modeKharcha").onclick = () => setMode("kharcha");

addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || !$("picker").hidden || e.target instanceof HTMLInputElement) return;
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

// ---- Start ----

setStatus("...");
paintMode();
render();
log("page_load", { standalone: matchMedia("(display-mode: standalone)").matches, w: innerWidth });
if (lang) {
  pickLang(lang);
} else {
  showPicker("no_lang");
}
