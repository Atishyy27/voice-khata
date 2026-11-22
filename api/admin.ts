import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { neon } from "@neondatabase/serverless";
import { ensureTable } from "./_lib/telemetry";

type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null ? null : Math.round(Number(v)));

function authorized(token: string | null): boolean {
  const want = process.env.ADMIN_TOKEN;
  if (!want || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function windowStats(url: string, hours: number) {
  const sql = neon(url);
  await ensureTable(sql);
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const like = "client\\_%";
  const [[t], [lat], langs, clients, errors] = (await Promise.all([
    sql`
      SELECT
        count(DISTINCT session) FILTER (WHERE ev = 'connect') AS sessions,
        count(*) FILTER (WHERE ev = 'turn') AS turns,
        count(*) FILTER (WHERE ev = 'error') AS errors,
        count(*) FILTER (WHERE ev = 'barge_in') AS barge_ins
      FROM vk_events WHERE at >= ${since}::timestamptz`,
    sql`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY first_audio_ms) FILTER (WHERE ev = 'said') AS fa_p50,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY first_audio_ms) FILTER (WHERE ev = 'said') AS fa_p90,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY stt_ms) FILTER (WHERE ev = 'turn') AS stt_p50,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY stt_ms) FILTER (WHERE ev = 'turn') AS stt_p90,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY parse_ms) FILTER (WHERE ev = 'turn') AS parse_p50,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY parse_ms) FILTER (WHERE ev = 'turn') AS parse_p90,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY tts_ms) FILTER (WHERE ev = 'said') AS tts_p50,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY tts_ms) FILTER (WHERE ev = 'said') AS tts_p90
      FROM vk_events WHERE at >= ${since}::timestamptz`,
    sql`
      SELECT lang, count(*) AS n FROM vk_events
      WHERE ev = 'turn' AND lang IS NOT NULL AND at >= ${since}::timestamptz
      GROUP BY lang ORDER BY n DESC`,
    sql`
      SELECT ev, count(*) AS n FROM vk_events
      WHERE ev LIKE ${like} AND at >= ${since}::timestamptz
      GROUP BY ev ORDER BY n DESC`,
    sql`
      SELECT at, error, props->>'stage' AS stage FROM vk_events
      WHERE ev = 'error' AND at >= ${since}::timestamptz
      ORDER BY at DESC LIMIT 20`,
  ])) as Row[][];

  return {
    sessions: num(t.sessions),
    turns: num(t.turns),
    errors: num(t.errors),
    bargeIns: num(t.barge_ins),
    firstAudioMs: { p50: num(lat.fa_p50), p90: num(lat.fa_p90) },
    sttMs: { p50: num(lat.stt_p50), p90: num(lat.stt_p90) },
    parseMs: { p50: num(lat.parse_p50), p90: num(lat.parse_p90) },
    ttsMs: { p50: num(lat.tts_p50), p90: num(lat.tts_p90) },
    languages: langs.map((r) => ({ lang: String(r.lang), turns: num(r.n) })),
    clientEvents: clients.map((r) => ({ ev: String(r.ev), count: num(r.n) })),
    lastErrors: errors.map((r) => ({
      at: new Date(r.at as string).toISOString(),
      error: (r.error as string) ?? null,
      stage: (r.stage as string) ?? null,
    })),
  };
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const token = new URL(req.url ?? "/", "http://localhost").searchParams.get("token");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!authorized(token)) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: "unauthorized" }));
  }
  try {
    const url = process.env.DATABASE_URL ?? "";
    const [day, week] = await Promise.all([windowStats(url, 24), windowStats(url, 24 * 7)]);
    const body = { generatedAt: new Date().toISOString(), "24h": day, "7d": week };
    res.statusCode = 200;
    return res.end(JSON.stringify(body));
  } catch (e) {
    console.error(JSON.stringify({ ev: "admin_error", message: e instanceof Error ? e.message : String(e) }));
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: "query_failed" }));
  }
}
