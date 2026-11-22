// Machine-translates the hi-IN reply strings into the 15 new languages (Gemini), checks each one, and merges them into api/_lib/packs.json.
// Only keys that a language does not have yet are translated, so a new kh_* string needs just a run of this script.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const env = readFileSync(join(ROOT, ".env.local"), "utf8");
const key = env.match(/^GOOGLE_GENERATIVE_AI_API_KEY=(.*)$/m)?.[1].trim().replace(/^"|"$/g, "");
if (!key) {
  console.error("GOOGLE_GENERATIVE_AI_API_KEY missing in .env.local");
  process.exit(1);
}

const { PACKS } = await import("../api/_lib/replies.ts");
const { LANGS } = await import("../api/_lib/languages.ts");
const PACK_PATH = join(ROOT, "api/_lib/packs.json");
const SRC = PACKS["hi-IN"];
const ALL_KEYS = Object.keys(SRC).sort();
const tokens = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join(" ");

const existing = existsSync(PACK_PATH) ? JSON.parse(readFileSync(PACK_PATH, "utf8")) : {};

const MODEL = process.env.PACK_MODEL ?? "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function translate(lang, keys) {
  const system = [
    `Translate the JSON string values of a shopkeeper's khata and household spending app from Hindi into ${lang.native} (${lang.code}).`,
    `Write every value in the ${lang.script} script.`,
    "Keep every placeholder token such as {name}, {amt}, {count}, {item}, {mine}, {with}, {other}, {total}, {category} exactly as written, once each, unchanged.",
    "Keep any ₹ sign and amount pattern exactly.",
    'In the greeting keep the English word "AI" as it is.',
    "Keys named kh_cat_* are short category names: keep them short.",
    "Use short, plain shopkeeper register. No pressure language, no urging, no guilt.",
    "Return one JSON object with exactly the same keys and translated string values only.",
  ].join(" ");
  const source = Object.fromEntries(keys.map((k) => [k, SRC[k]]));
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(source) }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 8192 },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`gemini http ${res.status}`);
  const body = await res.json();
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return JSON.parse(text);
}

function check(out, keys) {
  if (!out || typeof out !== "object") return ["not an object"];
  const problems = [];
  const got = Object.keys(out).sort();
  const want = [...keys].sort();
  if (got.join() !== want.join()) problems.push(`keys differ (${got.length} vs ${want.length})`);
  for (const k of keys) {
    const v = out[k];
    if (typeof v !== "string" || !v.trim()) {
      problems.push(`${k} empty`);
      continue;
    }
    if (tokens(v) !== tokens(SRC[k])) problems.push(`${k} placeholders ${tokens(v) || "none"} != ${tokens(SRC[k]) || "none"}`);
  }
  if (typeof out.greeting === "string" && !out.greeting.includes("AI")) problems.push("greeting lacks AI");
  return problems;
}

const packs = { ...existing };
const newLangs = LANGS.filter((l) => l.tier !== "native");
for (const lang of newLangs) {
  const have = existing[lang.code] ?? {};
  const missing = ALL_KEYS.filter((k) => !(k in have));
  if (!missing.length) {
    console.log(`${lang.code} already complete`);
    continue;
  }
  let ok = false;
  let reason = "";
  for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
    // Gemini's free tier rate-limits bursts (429): pause before each call, and longer before a retry.
    await new Promise((r) => setTimeout(r, attempt === 1 ? 4000 : 30_000));
    try {
      const out = await translate(lang, missing);
      const problems = check(out, missing);
      if (problems.length) reason = problems.join("; ");
      else {
        packs[lang.code] = { ...have, ...Object.fromEntries(missing.map((k) => [k, out[k]])) };
        ok = true;
      }
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
    }
  }
  console.log(`${lang.code} ${ok ? `ok (${missing.length} keys)` : `failed (${reason}), hi-IN fallback`}`);
}

writeFileSync(PACK_PATH, JSON.stringify(packs, null, 2) + "\n");
const done = newLangs.filter((l) => ALL_KEYS.every((k) => k in (packs[l.code] ?? {}))).length;
console.log(`packs.json: ${done} of ${newLangs.length} complete`);
