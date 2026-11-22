// Creates the vk_events telemetry table. Usage: node scripts/init-db.mjs   (needs DATABASE_URL in .env.local)
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
if (!url) throw new Error("DATABASE_URL missing");

const sql = neon(url);
await sql.query(`CREATE TABLE IF NOT EXISTS vk_events (
  id bigserial PRIMARY KEY,
  at timestamptz default now(),
  session text,
  ev text,
  lang text,
  kind text,
  reply text,
  stt_ms int,
  parse_ms int,
  tts_ms int,
  first_audio_ms int,
  model text,
  ok boolean,
  error text,
  props jsonb
)`);
await sql.query("CREATE INDEX IF NOT EXISTS vk_events_at ON vk_events (at)");
console.log("vk_events ready");
