import type { Customer, Entry, Intent, ParsedEntry, SessionState, TurnResult, Op, Reply } from "./types";

export interface Ctx {
  today: string;
  now: string;
  newId: () => string;
}

export function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function customers(entries: Entry[]): Customer[] {
  const map = new Map<string, Customer>();
  for (const e of entries) map.set(e.nameKey, { nameKey: e.nameKey, name: e.name });
  return [...map.values()];
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const firstToken = (s: string) => s.split(" ")[0] ?? "";

export function matchCustomers(entries: Entry[], nameKey: string): Customer[] {
  const key = normKey(nameKey);
  const all = customers(entries);
  if (!key) return [];
  const exact = all.find((c) => c.nameKey === key);
  if (exact) return [exact];
  const first = firstToken(key);
  const sameFirst = all.filter((c) => firstToken(c.nameKey) === first);
  if (sameFirst.length) return sameFirst;
  if (first.length >= 4) return all.filter((c) => levenshtein(firstToken(c.nameKey), first) <= 1);
  return [];
}

export function balance(entries: Entry[], nameKey: string): number {
  let sum = 0;
  for (const e of entries) {
    if (e.nameKey !== nameKey) continue;
    sum += e.direction === "credit" ? e.amount : -e.amount;
  }
  return sum;
}

export function todayCredit(entries: Entry[], today: string): { amount: number; count: number } {
  let amount = 0;
  let count = 0;
  for (const e of entries) {
    if (e.direction === "credit" && e.date === today) {
      amount += e.amount;
      count++;
    }
  }
  return { amount, count };
}

export function dateFromOffset(today: string, offset: number): string {
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}

function withState(state: SessionState, patch: Partial<SessionState>): SessionState {
  return { entries: [...state.entries], lastIds: [...state.lastIds], pending: state.pending, ...patch };
}

type Resolved = { kind: "one"; c: Customer } | { kind: "none" } | { kind: "many"; cs: Customer[] };

function resolve(entries: Entry[], nameKey: string, forced?: Customer): Resolved {
  const ms = matchCustomers(entries, nameKey);
  if (ms.length === 0) return { kind: "none" };
  if (ms.length === 1) return { kind: "one", c: ms[0] };
  if (forced && ms.some((m) => m.nameKey === forced.nameKey)) return { kind: "one", c: forced };
  return { kind: "many", cs: ms };
}

function ask(state: SessionState, intent: Intent, cs: Customer[]): TurnResult {
  return {
    ops: [],
    reply: { key: "which", names: cs.map((c) => c.name) },
    state: withState(state, { pending: { intent, candidates: cs } }),
  };
}

function help(state: SessionState): TurnResult {
  return { ops: [], reply: { key: "help" }, state: withState(state, {}) };
}

function runAdd(state: SessionState, intent: Intent, ctx: Ctx, forced?: Customer): TurnResult {
  const parsed: ParsedEntry[] = intent.entries ?? [];
  if (parsed.length === 0) return help(state);
  const made: Entry[] = [];
  for (const p of parsed) {
    const key = normKey(p.nameKey || p.name);
    const r = resolve(state.entries, key, forced);
    if (r.kind === "many") return ask(state, intent, r.cs);
    const who = r.kind === "one" ? r.c : { name: p.name, nameKey: key };
    made.push({
      id: ctx.newId(),
      name: who.name,
      nameKey: who.nameKey,
      amount: p.amount,
      direction: p.direction,
      date: dateFromOffset(ctx.today, p.dayOffset),
      at: ctx.now,
    });
  }
  const entries = [...state.entries, ...made];
  const reply: Reply = {
    key: "added",
    items: made.map((e) => ({
      name: e.name,
      amount: e.amount,
      direction: e.direction,
      balance: balance(entries, e.nameKey),
    })),
  };
  const ops: Op[] = made.map((entry) => ({ op: "add", entry }));
  return { ops, reply, state: { entries, lastIds: made.map((e) => e.id) } };
}

function runCorrect(state: SessionState, intent: Intent): TurnResult {
  const id = state.lastIds[state.lastIds.length - 1];
  const target = state.entries.find((e) => e.id === id);
  if (!target) return { ops: [], reply: { key: "nothing_to_fix" }, state: withState(state, { pending: undefined }) };
  const fix = intent.fix ?? {};
  const patch: Partial<Entry> = {};
  if (fix.amount !== undefined) patch.amount = fix.amount;
  if (fix.direction !== undefined) patch.direction = fix.direction;
  if (fix.name || fix.nameKey) {
    const name = fix.name || fix.nameKey!;
    patch.name = name;
    patch.nameKey = normKey(fix.nameKey || name);
  }
  const updated: Entry = { ...target, ...patch };
  const entries = state.entries.map((e) => (e.id === id ? updated : e));
  return {
    ops: [{ op: "update", id, patch }],
    reply: {
      key: "corrected",
      name: updated.name,
      amount: updated.amount,
      direction: updated.direction,
      balance: balance(entries, updated.nameKey),
    },
    state: withState(state, { entries, pending: undefined }),
  };
}

function runTotal(state: SessionState, intent: Intent, forced?: Customer): TurnResult {
  const spoken = intent.nameKey || intent.name || "";
  const key = normKey(spoken);
  if (!key) return help(state);
  const r = resolve(state.entries, key, forced);
  if (r.kind === "many") return ask(state, intent, r.cs);
  if (r.kind === "none") {
    return { ops: [], reply: { key: "unknown", name: intent.name || spoken }, state: withState(state, { pending: undefined }) };
  }
  return {
    ops: [],
    reply: { key: "total", name: r.c.name, balance: balance(state.entries, r.c.nameKey) },
    state: withState(state, { pending: undefined }),
  };
}

function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 4 && l.startsWith(s);
}

function pickCandidate(candidates: Customer[], spoken: string): Customer | null {
  const sp = normKey(spoken).split(" ").filter(Boolean);
  if (sp.length === 0) return null;
  const scored = candidates.map((c) => {
    const toks = c.nameKey.split(" ");
    return { c, score: sp.filter((s) => toks.some((t) => tokenMatches(s, t))).length };
  });
  const best = Math.max(...scored.map((x) => x.score));
  if (best === 0) return null;
  const top = scored.filter((x) => x.score === best);
  return top.length === 1 ? top[0].c : null;
}

export function applyIntent(state: SessionState, intent: Intent, ctx: Ctx): TurnResult {
  switch (intent.kind) {
    case "add": {
      const r = runAdd(state, intent, ctx);
      return r.reply.key === "which" ? r : { ...r, state: { ...r.state, pending: undefined } };
    }
    case "correct":
      return runCorrect(state, intent);
    case "query_total":
      return runTotal(state, intent);
    case "query_today": {
      const { amount, count } = todayCredit(state.entries, ctx.today);
      return { ops: [], reply: { key: "today", amount, count }, state: withState(state, { pending: undefined }) };
    }
    case "clarify_answer": {
      const pending = state.pending;
      if (!pending) return help(state);
      const pick = pickCandidate(pending.candidates, intent.name || intent.nameKey || "");
      if (!pick) return help(state);
      const cleared = withState(state, { pending: undefined });
      const p = pending.intent;
      if (p.kind === "add") return runAdd(cleared, p, ctx, pick);
      if (p.kind === "query_total") return runTotal(cleared, p, pick);
      return help(cleared);
    }
    default:
      return help(state);
  }
}
