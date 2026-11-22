import { CATEGORIES } from "./kharcha";
import type {
  Customer, Direction, Intent, IntentKind, KharchaIntent, KharchaItem, KharchaKind, ParsedEntry, Pending, Split,
} from "./types";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Groq's free tier caps gpt-oss-20b at 8,000 tokens a minute (about 9 turns), so a fast demo spills to 120b and
// then to Gemini, each with its own quota. PARSE_MODELS (comma list) overrides the order for tests.
const MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "gemini-flash-lite-latest"];
const GEMINI_URL = (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
const KINDS: IntentKind[] = ["add", "correct", "query_total", "query_today", "clarify_answer", "other"];
const KH_KINDS: KharchaKind[] = ["add", "correct", "query_today", "query_month", "query_category", "other"];

const RULES = `You turn one utterance from an Indian kirana shopkeeper into JSON for his credit ledger (khata).
The utterance can be in any Indian language mixed with English. Reply with one JSON object only.

{"kind": "add"|"correct"|"query_total"|"query_today"|"clarify_answer"|"other",
 "entries": [{"name": string, "nameKey": string, "amount": number, "direction": "credit"|"payment", "dayOffset": number, "note": string}],
 "fix": {"amount"?: number, "name"?: string, "nameKey"?: string, "direction"?: "credit"|"payment"},
 "name": string, "nameKey": string}

kind:
- add: new entries. One utterance can hold several ("Ramesh ka 340 udhaar, kal 200 diya tha" is two entries).
  credit = the customer took goods on credit and owes more: udhaar, likho, baaki, le gaya, credit, ಸಾಲ, கடன், అప్పు.
  payment = the customer paid money back: diya, diye, de gaya, jama, chukaya, wapas, paid, ಕೊಟ್ಟರು, கொடுத்தார்.
- correct: fixes the entry just spoken. Starts with nahi, nahin, galat, no, not, sorry, or gives only a new value
  ("nahi, 430" -> {"kind":"correct","fix":{"amount":430}}; "nahi, Sita ka" -> fix.name/nameKey).
- query_total: asks one customer's balance ("Ramesh ka total?", "kitna baaki hai").
- query_today: asks today's total credit ("aaj kitna udhaar gaya").
- clarify_answer: only when the agent just asked which customer; put what was said in name/nameKey.
- other: anything else.

amount: whole rupees as a number, read exactly as said. Never add or change digits.
dayOffset: 0 = today. kal with past tense (diya tha, gaya tha, liya tha) = -1. parso = -2. Unsure = 0.
note: a short summary (max 80 characters) of the reason or story given for that entry, in the words and script spoken ("shaadi ke liye kapda", "cheeni, chawal"). "" if none. Never put the amount or name in the note.
name: the customer name as spoken. nameKey: the same name in lowercase Latin letters (ramesh, sita).
If the spoken name is clearly one existing customer, use that customer's nameKey exactly. If it could be several
(only a first name was said), use just the first name as nameKey. Never invent a surname.`;

const KHARCHA_RULES = `You turn one utterance from an Indian household (the mother who runs the house) into JSON for her
spending tracker (kharcha). The utterance can be in any Indian language mixed with English. Reply with one JSON object only.

{"kind": "add"|"correct"|"query_today"|"query_month"|"query_category"|"other",
 "items": [{"item": string, "amount": number, "category": string, "dayOffset": number, "note": string, "split"?: {"with": string, "myShare": number}}],
 "fix": {"item"?: string, "amount"?: number, "category"?: string},
 "category": string}

kind:
- add: new spending. One utterance can hold several items ("chai 20, auto 50, sabzi 120" is three items).
- correct: fixes the item just spoken. Starts with nahi, nahin, galat, no, not, sorry, or gives only a new value.
  "nahi, chai 25 thi" -> {"kind":"correct","fix":{"item":"chai","amount":25}}.
- query_today: asks what was spent today ("aaj kitna kharcha hua").
- query_month: asks this month's total ("is mahine kitna").
- query_category: asks the total for one kind of spending ("khane pe kitna" -> category "khana"). Put it in "category".
- other: anything else.

item: the thing bought, short, in the words spoken (chai, auto, sabzi, dinner, doodh).
amount: whole rupees as a number, read exactly as said. Never add or change digits.
category: exactly one of: khana (chai, nashta, dinner, lunch, restaurant, snacks), rashan (atta, chawal, dal, cheeni, tel,
  masala, grocery), doodh-sabzi (doodh, dahi, sabzi, sabji, fal, paneer), ghar (bartan, saaban, repair, saman, safai),
  bijli-paani (bijli, light bill, paani, gas cylinder), phone-recharge (recharge, mobile, internet, wifi), safar (auto,
  rickshaw, bus, metro, petrol, taxi, train), dawai (dawai, medicine, doctor), padhai (school, fees, copy, book, tuition),
  kapde (kapda, kapde, joota, chappal, tailor), tyohar (puja, mithai, gift, shagun, rakhi, diwali), udhaar-diya (money
  lent to someone), other (anything else). Use exactly one of these words.
dayOffset: 0 = today. kal = -1. parso = -2. Unsure = 0.
split: only when the speaker shared the cost with someone. Give "with" (the other person's name as spoken) and
  "myShare" (the speaker's part, whole rupees). "aadha mera" or "aadha" = half of amount. "mera 300" = myShare 300.
  "teen log" or three people = amount/3 rounded. Shared with no name said: use "saathi" as with.
  Otherwise leave split out.
note: a short reason or detail in the words spoken (max 80 characters). "" if none. Never put the amount, item or name in the note.
For a query, leave items out. For query_category put the category in "category".
For correct, fix.item is the item name if one is said, fix.amount the new amount, fix.category only if a category is named.`;

export interface ParseResult {
  intent: Intent;
  ms: number;
  model: string;
}

export interface CallResult {
  json: any;
  model: string;
  ms: number;
}

// One model call through the fallback chain (Groq models, then Gemini). Returns the parsed JSON of the first model that answers.
export async function callModel(system: string, text: string): Promise<CallResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY missing");
  const messages = [
    { role: "system", content: system },
    { role: "user", content: text },
  ];

  const started = Date.now();
  let lastError: unknown;
  const order = process.env.PARSE_MODELS ? process.env.PARSE_MODELS.split(",") : MODELS;
  for (const model of order) {
    try {
      if (model.startsWith("gemini")) {
        const json = JSON.parse(await gemini(model, system, text));
        return { json, model, ms: Date.now() - started };
      }
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0,
          reasoning_effort: "low",
          max_completion_tokens: 400,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`groq ${res.status}`); // status only: a provider body can echo the user's words
      const body = (await res.json()) as { choices: { message: { content: string } }[] };
      const json = JSON.parse(body.choices[0].message.content);
      return { json, model, ms: Date.now() - started };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function parseUtterance(
  text: string,
  ctx: { customers: Customer[]; pending?: Pending },
): Promise<ParseResult> {
  const known = ctx.customers.map((c) => `${c.name} (${c.nameKey})`).join(", ") || "none yet";
  const options = ctx.pending?.candidates ?? [];
  const asked = options.length
    ? `\nThe agent just asked which customer: ${options.map((c, i) => `${i + 1}. ${c.name}`).join(" or ")}. ` +
      `If the shopkeeper is answering that, reply {"kind":"clarify_answer","nameKey":<exactly one of ` +
      `${options.map((c) => JSON.stringify(c.nameKey)).join(", ")}>}. "pehla", "first" or "1" means the first listed; ` +
      `a surname, a nickname, a trade or a description (doodh wale, jo doodh dete hain) picks the one it fits.`
    : "";
  const r = await callModel(`${RULES}\n\nExisting customers: ${known}.${asked}`, text);
  return { intent: toIntent(r.json), ms: r.ms, model: r.model };
}

export async function parseKharcha(text: string): Promise<{ intent: KharchaIntent; ms: number; model: string }> {
  const r = await callModel(KHARCHA_RULES, text);
  return { intent: toKharchaIntent(r.json), ms: r.ms, model: r.model };
}

async function gemini(model: string, system: string, text: string): Promise<string> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY missing");
  const res = await fetch(GEMINI_URL(model), {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 400 },
    }),
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const out = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!out) throw new Error("gemini returned no text");
  return out;
}

const key = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const amount = (n: unknown) => {
  const v = typeof n === "number" ? n : Number(String(n ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;
};
const direction = (d: unknown): Direction | undefined => (d === "credit" || d === "payment" ? d : undefined);

export function toIntent(raw: any): Intent {
  const kind: IntentKind = KINDS.includes(raw?.kind) ? raw.kind : "other";
  const intent: Intent = { kind };
  if (kind === "add") {
    const entries: ParsedEntry[] = [];
    for (const e of Array.isArray(raw.entries) ? raw.entries : []) {
      const a = amount(e?.amount);
      const d = direction(e?.direction);
      const k = key(e?.nameKey || e?.name);
      if (!a || !d || !k) continue;
      const off = Number(e?.dayOffset);
      const note = String(e?.note ?? "").trim().slice(0, 80);
      entries.push({ name: String(e.name || e.nameKey), nameKey: k, amount: a, direction: d, dayOffset: Number.isFinite(off) ? Math.max(-7, Math.min(0, Math.round(off))) : 0, ...(note ? { note } : {}) });
    }
    if (!entries.length) return { kind: "other" };
    intent.entries = entries;
  }
  if (kind === "correct") {
    const f = raw.fix ?? {};
    const fix: NonNullable<Intent["fix"]> = {};
    if (amount(f.amount)) fix.amount = amount(f.amount);
    if (direction(f.direction)) fix.direction = direction(f.direction);
    if (key(f.nameKey || f.name)) { fix.name = String(f.name || f.nameKey); fix.nameKey = key(f.nameKey || f.name); }
    if (!Object.keys(fix).length) return { kind: "other" };
    intent.fix = fix;
  }
  if (kind === "query_total" || kind === "clarify_answer") {
    const k = key(raw.nameKey || raw.name);
    if (!k) return { kind: "other" };
    intent.name = String(raw.name || raw.nameKey);
    intent.nameKey = k;
  }
  return intent;
}

const category = (c: unknown): string => {
  const k = String(c ?? "").trim().toLowerCase();
  return (CATEGORIES as readonly string[]).includes(k) ? k : "other";
};

function toSplit(raw: any, total: number): Split | undefined {
  const w = String(raw?.with ?? "").trim().slice(0, 40);
  const share = Number(raw?.myShare);
  if (!raw || !w || !Number.isFinite(share)) return undefined;
  return { with: w, myShare: Math.max(0, Math.min(total, Math.round(share))) };
}

export function toKharchaIntent(raw: any): KharchaIntent {
  const kind: KharchaKind = KH_KINDS.includes(raw?.kind) ? raw.kind : "other";
  if (kind === "add") {
    const items: KharchaItem[] = [];
    for (const e of Array.isArray(raw.items) ? raw.items : []) {
      const a = amount(e?.amount);
      const item = String(e?.item ?? "").trim().slice(0, 40);
      if (!a || !item) continue;
      const off = Number(e?.dayOffset);
      const note = String(e?.note ?? "").trim().slice(0, 80);
      const split = toSplit(e?.split, a);
      items.push({
        item,
        amount: a,
        category: category(e?.category),
        dayOffset: Number.isFinite(off) ? Math.max(-7, Math.min(0, Math.round(off))) : 0,
        ...(note ? { note } : {}),
        ...(split ? { split } : {}),
      });
    }
    return items.length ? { kind, items } : { kind: "other" };
  }
  if (kind === "correct") {
    const f = raw.fix ?? {};
    const fix: NonNullable<KharchaIntent["fix"]> = {};
    const item = String(f.item ?? "").trim().slice(0, 40);
    if (item) fix.item = item;
    if (amount(f.amount)) fix.amount = amount(f.amount);
    if (String(f.category ?? "").trim()) fix.category = category(f.category);
    if (!Object.keys(fix).length) return { kind: "other" };
    return { kind, fix };
  }
  if (kind === "query_category") return { kind, category: category(raw.category) };
  return { kind };
}
