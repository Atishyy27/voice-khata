import type { Entry, Op } from "./types";

export interface SheetRow {
  date: string;
  time: string;
  customer: string;
  type: "udhaar" | "jama";
  amount: number;
  signed: number;
  note: string;
  id: string;
  session: string;
}

const row = (e: Entry, session: string, time: string, id: string, note: string): SheetRow => {
  const udhaar = e.direction === "credit";
  return {
    date: e.date,
    time,
    customer: e.name,
    type: udhaar ? "udhaar" : "jama",
    amount: e.amount,
    signed: udhaar ? e.amount : -e.amount,
    note,
    id,
    session,
  };
};

// A correction never edits an old row: it appends a reversal of the old entry, then the corrected entry.
export function rowsFor(before: Entry[], ops: Op[], session: string, time: string, stamp: string): SheetRow[] {
  const rows: SheetRow[] = [];
  for (const op of ops) {
    if (op.op === "add") {
      rows.push(row(op.entry, session, time, op.entry.id, op.entry.note ?? ""));
      continue;
    }
    const old = before.find((e) => e.id === op.id);
    if (!old) continue;
    const was = row(old, session, time, `${old.id}~r${stamp}`, `reversal of ${old.id}`);
    rows.push({ ...was, amount: -old.amount, signed: -was.signed });
    const fixed: Entry = { ...old, ...op.patch };
    rows.push(row(fixed, session, time, `${old.id}~${stamp}`, fixed.note ?? ""));
  }
  return rows;
}

// The page shows the sheet toggle only once the hook reports a sheet URL, i.e. after its owner ran setup().
let cachedUrl = "";
let lastTry = 0;
export async function sheetUrl(): Promise<string> {
  const hook = process.env.SHEET_HOOK_URL;
  if (cachedUrl || !hook || Date.now() - lastTry < 60_000) return cachedUrl;
  lastTry = Date.now();
  try {
    const res = await fetch(hook, { redirect: "follow", signal: AbortSignal.timeout(5000) });
    const body = (await res.json()) as { url?: unknown };
    if (typeof body.url === "string" && body.url.startsWith("https://docs.google.com/")) cachedUrl = body.url;
  } catch {
    // not authorised yet or unreachable: the toggle stays hidden
  }
  return cachedUrl;
}

export async function appendToSheet(rows: SheetRow[]): Promise<boolean> {
  const url = process.env.SHEET_HOOK_URL;
  if (!rows.length || !url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    const body = (await res.json()) as { ok?: unknown };
    return body.ok === true;
  } catch (e) {
    console.error(JSON.stringify({ ev: "sheet_error", message: e instanceof Error ? e.message : String(e) }));
    return false;
  }
}
