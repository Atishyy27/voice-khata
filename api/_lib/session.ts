import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { applyIntent, customers } from "./ledger";
import { applyKharcha, type KharchaState } from "./kharcha";
import { extractAmounts } from "./numbers";
import { parseKharcha, parseUtterance } from "./parse";
import { isLang, viaLocale } from "./languages";
import { greeting, say } from "./replies";
import { appendToSheet, rowsFor, sheetUrl } from "./sheet";
import { spokenText } from "./sister";
import { SttStream } from "./stt";
import { TtsSocket } from "./tts";
import { track } from "./telemetry";
import type { Entry, Expense, Intent, KharchaIntent, SessionState } from "./types";

const FRAME_BYTES = 1024;
const MAX_HOLD_MS = 20_000;
const MAX_TURNS = 150;
const MAX_CLIENT_LOGS = 200;
const MAX_TYPED = 300;
const CLIENT_EVENTS = new Set([
  "page_load", "lang_pick", "picker_shown", "ws_open", "ws_close", "ready", "mic_ok", "mic_error", "press", "release",
  "barge_in", "first_audio", "reconnect", "js_error", "sheet_toggle",
]);

const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const istTime = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
const modeOf = (m: unknown): "khata" | "kharcha" => (m === "kharcha" ? "kharcha" : "khata");

// The first spoken turn must say it is an AI: the greeting's sentences up to the one that says so.
export function disclosure(lang: string): string {
  const out: string[] = [];
  for (const part of greeting(lang).split(/(?<=[।.!?])\s+/)) {
    out.push(part);
    if (part.includes("AI")) break;
  }
  return out.join(" ");
}

// If the transcript holds exactly one amount and the LLM wrote a different one, the transcript wins.
export function crossCheck(intent: Intent, text: string): Intent {
  const heard = extractAmounts(text);
  if (heard.length !== 1) return intent;
  const a = heard[0];
  if (intent.kind === "add" && intent.entries?.length === 1 && intent.entries[0].amount !== a) {
    return { ...intent, entries: [{ ...intent.entries[0], amount: a }] };
  }
  if (intent.kind === "correct" && intent.fix?.amount && intent.fix.amount !== a) {
    return { ...intent, fix: { ...intent.fix, amount: a } };
  }
  return intent;
}

// Same rule for household spending: one amount in the transcript wins over a different amount on one item or a correction.
export function crossCheckKharcha(intent: KharchaIntent, text: string): KharchaIntent {
  const heard = extractAmounts(text);
  if (heard.length !== 1) return intent;
  const a = heard[0];
  if (intent.kind === "add" && intent.items?.length === 1 && intent.items[0].amount !== a) {
    const it = intent.items[0];
    const split = it.split ? { with: it.split.with, myShare: Math.round((it.split.myShare * a) / it.amount) } : undefined;
    return { ...intent, items: [{ ...it, amount: a, ...(split ? { split } : {}) }] };
  }
  if (intent.kind === "correct" && intent.fix?.amount && intent.fix.amount !== a) {
    return { ...intent, fix: { ...intent.fix, amount: a } };
  }
  return intent;
}

function validEntries(raw: unknown): Entry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e: any) =>
        e && typeof e.id === "string" && typeof e.name === "string" && typeof e.nameKey === "string" &&
        Number.isInteger(e.amount) && e.amount > 0 && e.amount <= 10_000_000 &&
        (e.direction === "credit" || e.direction === "payment") &&
        (e.book === undefined || e.book === "khata") &&
        /^\d{4}-\d{2}-\d{2}$/.test(e.date) && typeof e.at === "string" &&
        (e.note === undefined || (typeof e.note === "string" && e.note.length <= 120)),
    )
    .slice(0, 5000) as Entry[];
}

function validExpenses(raw: unknown): Expense[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e: any) =>
        e && e.book === "kharcha" && typeof e.id === "string" && typeof e.item === "string" && typeof e.category === "string" &&
        Number.isInteger(e.amount) && e.amount > 0 && e.amount <= 10_000_000 &&
        /^\d{4}-\d{2}-\d{2}$/.test(e.date) && typeof e.at === "string" &&
        (e.note === undefined || (typeof e.note === "string" && e.note.length <= 120)) &&
        (e.split === undefined ||
          (typeof e.split?.with === "string" && Number.isInteger(e.split?.myShare) && e.split.myShare >= 0 && e.split.myShare <= e.amount)),
    )
    .slice(0, 5000) as Expense[];
}

export class Session {
  private state: SessionState = { entries: [], lastIds: [] };
  private kState: KharchaState = { expenses: [], lastIds: [] };
  private mode: "khata" | "kharcha" = "khata";
  private lang = "hi-IN";
  private greeted = false; // per language: the client sends its own per-language flag in hello
  private greeting = false;
  private stt: SttStream | null = null;
  private tts: TtsSocket;
  private key: string;
  private holding = false;
  private segments: string[] = [];
  private speechOpen = false;
  private utterance = "";
  private oldUtterances = new Set<string>();
  private lastPartial = "";
  private onFinal: (() => void) | null = null;
  private turn = 0;
  private turns = 0;
  private releasedAt = 0;
  private sttLang: string | undefined;
  private holdTimer: NodeJS.Timeout | undefined;
  private closed = false;
  private sheetOn = false;
  private sid = randomUUID().slice(0, 8);
  private connectedAt = Date.now();
  private speaking = false;
  private clientLogs = 0;

  constructor(private ws: WebSocket) {
    this.key = process.env.GNANI_API_KEY ?? "";
    this.tts = new TtsSocket(this.key);
    track("connect", { session: this.sid });
    ws.on("message", (data, isBinary) => {
      if (isBinary) this.onAudio(data as Buffer);
      else this.onText(data.toString()).catch((e) => this.fail(e, "message"));
    });
    ws.on("close", () => this.dispose());
    ws.on("error", () => this.dispose());
    if (!this.key || !process.env.GROQ_API_KEY) this.fail(new Error("server keys missing"), "config");
  }

  private send(obj: object) {
    if (!this.closed && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  private fail(e: unknown, stage?: string) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ ev: "error", message }));
    track("error", { session: this.sid, error: message, stage });
    this.send({ t: "error", message: "सर्वर में दिक्कत आई, फिर से कोशिश करें।" });
  }

  private async onText(raw: string) {
    let m: any;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.t === "hello") return this.hello(m);
    if (m.t === "mode") {
      this.mode = modeOf(m.mode);
      return;
    }
    if (m.t === "sheet") {
      this.sheetOn = m.on === true;
      return;
    }
    if (m.t === "log") {
      if (++this.clientLogs <= MAX_CLIENT_LOGS && CLIENT_EVENTS.has(m.ev)) {
        track("client_" + m.ev, { ...m, session: this.sid, lang: this.lang });
      }
      return;
    }
    if (!this.stt) return;
    if (m.t === "press") return this.press();
    if (m.t === "release") return this.release();
    if (m.t === "text") return this.typed(m.text);
    if (m.t === "greet") return this.greet();
  }

  private async hello(m: any) {
    this.lang = isLang(m.lang) ? m.lang : "hi-IN";
    this.greeted = m.greeted === true;
    this.sheetOn = m.sheet === true;
    this.mode = modeOf(m.mode);
    this.state = { entries: validEntries(m.entries), lastIds: [] };
    this.kState = { expenses: validExpenses(m.entries), lastIds: [] };
    this.stt?.close();
    this.stt = this.makeStt();
    await Promise.all([this.stt.open(), this.tts.warm()]);
    this.send({ t: "ready" });
    track("hello", { session: this.sid, lang: this.lang, entries: this.state.entries.length, sheet: this.sheetOn });
    void sheetUrl().then((url) => url && this.send({ t: "sheet_url", url }));
  }

  private makeStt() {
    const names = customers(this.state.entries).map((c) => c.name);
    return new SttStream(this.key, viaLocale(this.lang), names, {
      onSpeechStart: (utterance) => {
        if (utterance && this.oldUtterances.has(utterance)) return;
        this.speechOpen = true;
        if (this.holding && utterance) this.utterance = utterance;
      },
      onPartial: (text) => {
        if (text.trim()) this.lastPartial = text.trim();
        if (text.trim()) this.send({ t: "partial", text: [...this.segments, text.trim()].join(" ") });
      },
      onTranscript: (text, lang, _ms, utterance) => {
        // A final that belongs to an earlier press arrived late: drop it so it cannot leak into this turn.
        if (utterance && (this.oldUtterances.has(utterance) || (this.utterance && utterance !== this.utterance))) return;
        this.speechOpen = false;
        if (text.trim()) this.segments.push(text.trim());
        if (lang) this.sttLang = lang;
        const done = this.onFinal;
        this.onFinal = null;
        done?.();
      },
      onError: (message) => console.error(JSON.stringify({ ev: "stt_error", message })),
      onClose: () => {
        this.speechOpen = false;
        const done = this.onFinal;
        this.onFinal = null;
        done?.();
      },
    });
  }

  // Cancels the reply in progress (barge-in) and moves to a new turn.
  private interrupt() {
    if (this.speaking) {
      this.speaking = false;
      track("barge_in", { session: this.sid, lang: this.lang });
    }
    this.turn++;
    this.tts.cancel();
    this.tts.warm().catch(() => {});
  }

  private press() {
    if (this.turns >= MAX_TURNS) {
      this.send({ t: "error", message: "इस सत्र की सीमा पूरी हुई। पेज दोबारा खोलें।" });
      return;
    }
    this.interrupt();
    if (this.stt && !this.stt.isOpen) this.stt.open().catch(() => {});
    if (this.utterance) this.oldUtterances.add(this.utterance);
    if (this.oldUtterances.size > 50) this.oldUtterances.clear();
    this.segments = [];
    this.speechOpen = false;
    this.utterance = "";
    this.lastPartial = "";
    this.holding = true;
    clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(() => this.release(), MAX_HOLD_MS);
  }

  // A typed message runs the same turn as speech, from the transcript on.
  private typed(raw: unknown) {
    const text = typeof raw === "string" ? raw.trim().slice(0, MAX_TYPED) : "";
    if (!text || this.holding) return;
    if (this.turns >= MAX_TURNS) {
      this.send({ t: "error", message: "इस सत्र की सीमा पूरी हुई। पेज दोबारा खोलें।" });
      return;
    }
    this.turns++;
    this.interrupt();
    this.releasedAt = Date.now();
    return this.runTurn(this.turn, text, 0, this.lang);
  }

  private onAudio(frame: Buffer) {
    if (this.holding && frame.length === FRAME_BYTES) this.stt?.send(frame);
  }

  private waitForFinal(ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        this.onFinal = null;
        resolve();
      }, ms);
      this.onFinal = () => {
        clearTimeout(t);
        resolve();
      };
    });
  }

  private async release() {
    if (!this.holding) return;
    this.holding = false;
    clearTimeout(this.holdTimer);
    this.turns++;
    const turn = this.turn;
    this.releasedAt = Date.now();
    this.stt?.commit();
    if (this.speechOpen) await this.waitForFinal(4000);
    else if (!this.segments.length) await this.waitForFinal(900);
    if (turn !== this.turn || this.closed) return;

    // A final that came back empty or too late falls back to the last partial the user already saw on screen.
    const text = this.segments.join(" ").trim() || this.lastPartial;
    const sttMs = Date.now() - this.releasedAt;
    if (!text) {
      await this.reply(turn, say({ key: this.mode === "kharcha" ? "kh_help" : "help" }, this.lang), { sttMs });
      return;
    }
    return this.runTurn(turn, text, sttMs, this.sttLang);
  }

  private async runTurn(turn: number, text: string, sttMs: number, heardLang?: string) {
    this.send({ t: "heard", text, lang: heardLang, sttMs });
    if (this.mode === "kharcha") return this.kharchaTurn(turn, text, sttMs);

    const parseStart = Date.now();
    const parsed = await parseUtterance(text, { customers: customers(this.state.entries), pending: this.state.pending });
    if (turn !== this.turn || this.closed) return;
    const intent = crossCheck(parsed.intent, text);
    const parseMs = Date.now() - parseStart;

    const before = this.state.entries;
    const result = applyIntent(this.state, intent, { today: istToday(), now: new Date().toISOString(), newId: () => randomUUID() });
    this.state = result.state;
    if (result.ops.length) this.send({ t: "ops", ops: result.ops });
    if (this.sheetOn && result.ops.length) void appendToSheet(rowsFor(before, result.ops, this.sid, istTime(), Date.now().toString(36))).then((ok) => this.send({ t: "sheet_saved", ok }));

    console.log(JSON.stringify({ ev: "turn", kind: intent.kind, reply: result.reply.key, sttMs, parseMs, model: parsed.model }));
    track("turn", { session: this.sid, lang: this.lang, kind: intent.kind, reply: result.reply.key, stt_ms: sttMs, parse_ms: parseMs, model: parsed.model, ok: true });
    await this.reply(turn, say(result.reply, this.lang), { sttMs, parseMs });
  }

  private async kharchaTurn(turn: number, text: string, sttMs: number) {
    const parseStart = Date.now();
    const parsed = await parseKharcha(text);
    if (turn !== this.turn || this.closed) return;
    const intent = crossCheckKharcha(parsed.intent, text);
    const parseMs = Date.now() - parseStart;

    const result = applyKharcha(this.kState, intent, { today: istToday(), now: new Date().toISOString(), newId: () => randomUUID() });
    this.kState = result.state;
    if (result.ops.length) this.send({ t: "ops", ops: result.ops });

    console.log(JSON.stringify({ ev: "turn", kind: "kh_" + intent.kind, reply: result.reply.key, sttMs, parseMs, model: parsed.model }));
    track("turn", { session: this.sid, lang: this.lang, kind: "kh_" + intent.kind, reply: result.reply.key, stt_ms: sttMs, parse_ms: parseMs, model: parsed.model, ok: true });
    await this.reply(turn, say(result.reply, this.lang), { sttMs, parseMs });
  }

  // The disclosure counts as given only once a turn carrying it has been spoken to the end.
  private async reply(turn: number, text: string, timing: { sttMs?: number; parseMs?: number }) {
    const disclose = !this.greeted;
    const done = await this.speak(turn, disclose ? `${disclosure(this.lang)} ${text}` : text, timing);
    if (done && disclose) this.greeted = true;
  }

  private async greet() {
    if (this.greeted || this.greeting) return;
    this.greeting = true;
    this.turn++;
    this.releasedAt = Date.now();
    const done = await this.speak(this.turn, greeting(this.lang), {});
    this.greeting = false;
    if (done) this.greeted = true;
  }

  private async speak(turn: number, text: string, timing: { sttMs?: number; parseMs?: number }): Promise<boolean> {
    this.send({ t: "say", turn, text });
    const ttsStart = Date.now();
    let first = 0;
    this.speaking = true;
    try {
      await this.tts.speak(spokenText(this.lang, text), viaLocale(this.lang), (pcm) => {
        if (turn !== this.turn || this.closed) return;
        if (!first) first = Date.now();
        this.ws.send(pcm, { binary: true });
      });
    } catch (e) {
      // A barge-in already closed this socket and opened a fresh one; only a failure of the live turn resets it.
      if (turn === this.turn) {
        this.fail(e, "tts");
        this.tts.cancel();
      }
      return false;
    } finally {
      if (turn === this.turn) this.speaking = false;
    }
    if (turn !== this.turn || this.closed) return false;
    const firstAudioMs = first ? first - this.releasedAt : null;
    const ttsMs = first ? first - ttsStart : null;
    this.send({ t: "said", turn, firstAudioMs, ttsMs, ...timing });
    track("said", { session: this.sid, lang: this.lang, first_audio_ms: firstAudioMs, tts_ms: ttsMs });
    return true;
  }

  private dispose() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.holdTimer);
    track("disconnect", { session: this.sid, turns: this.turns, durationMs: Date.now() - this.connectedAt });
    this.stt?.close();
    this.tts.close();
  }
}
