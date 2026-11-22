import { neon } from "@neondatabase/serverless";

const TOP_STR = ["session", "lang", "kind", "reply", "model"] as const;
const TOP_INT = ["stt_ms", "parse_ms", "tts_ms", "first_audio_ms"] as const;
const PROP_KEYS = new Set([
  "code", "ms", "holdMs", "reason", "standalone", "w", "attempt", "on", "line", "msg",
  "turns", "durationMs", "entries", "sheet", "partials", "stage",
]);
const EV = /^[A-Za-z0-9_]{1,40}$/;

export type Row = {
  ev: string;
  session?: string;
  lang?: string;
  kind?: string;
  reply?: string;
  stt_ms?: number;
  parse_ms?: number;
  tts_ms?: number;
  first_audio_ms?: number;
  model?: string;
  ok?: boolean;
  error?: string;
  props: Record<string, string | number | boolean>;
};

const cut = (s: string, n: number) => s.slice(0, n);

export function clean(ev: string, data: Record<string, unknown>): Row {
  const row: Row = { ev: EV.test(ev) ? ev : "invalid", props: {} };
  for (const k of TOP_STR) {
    const v = data[k];
    if (typeof v === "string") row[k] = cut(v, 200);
  }
  for (const k of TOP_INT) {
    const v = data[k];
    if (typeof v === "number" && Number.isFinite(v)) row[k] = Math.round(v);
  }
  if (typeof data.ok === "boolean") row.ok = data.ok;
  if (typeof data.error === "string") row.error = cut(data.error, 200);
  for (const k of PROP_KEYS) {
    const v = data[k];
    if (typeof v === "number" && Number.isFinite(v)) row.props[k] = v;
    else if (typeof v === "boolean") row.props[k] = v;
    else if (typeof v === "string") row.props[k] = cut(v, 120);
  }
  return row;
}

let db: ReturnType<typeof neon> | null = null;
let ready: Promise<unknown> | null = null;

// The table is created on first use, so a fresh database needs no manual step (the laptop often cannot reach Neon).
export function ensureTable(sql: { query: (q: string) => Promise<unknown> }): Promise<unknown> {
  return sql
    .query(
      "CREATE TABLE IF NOT EXISTS vk_events (id bigserial PRIMARY KEY, at timestamptz default now(), session text, ev text, " +
        "lang text, kind text, reply text, stt_ms int, parse_ms int, tts_ms int, first_audio_ms int, model text, ok boolean, " +
        "error text, props jsonb)",
    )
    .then(() => sql.query("CREATE INDEX IF NOT EXISTS vk_events_at ON vk_events (at)"));
}
const SQL =
  "insert into vk_events (session, ev, lang, kind, reply, stt_ms, parse_ms, tts_ms, first_audio_ms, model, ok, error, props) " +
  "values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)";

function report(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(JSON.stringify({ ev: "telemetry_error", message: cut(message, 200) }));
}

export function track(ev: string, data: Record<string, unknown>): void {
  try {
    const url = process.env.DATABASE_URL;
    if (!url) return;
    db ??= neon(url);
    const sql = db;
    ready ??= ensureTable(sql).catch((e) => {
      ready = null;
      throw e;
    });
    const r = clean(ev, data);
    ready.then(() => sql.query(SQL, [
      r.session ?? null, r.ev, r.lang ?? null, r.kind ?? null, r.reply ?? null,
      r.stt_ms ?? null, r.parse_ms ?? null, r.tts_ms ?? null, r.first_audio_ms ?? null,
      r.model ?? null, r.ok ?? null, r.error ?? null, JSON.stringify(r.props),
    ])).catch(report);
  } catch (e) {
    report(e);
  }
}
