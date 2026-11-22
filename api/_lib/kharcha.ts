import { dateFromOffset } from "./ledger";
import type { Expense, KharchaIntent, KharchaItem, KharchaOp, KharchaReply } from "./types";

export const CATEGORIES = [
  "khana", "rashan", "doodh-sabzi", "ghar", "bijli-paani", "phone-recharge", "safar",
  "dawai", "padhai", "kapde", "tyohar", "udhaar-diya", "other",
] as const;

export interface KharchaState {
  expenses: Expense[];
  lastIds: string[];
}

export interface KharchaCtx {
  today: string;
  now: string;
  newId: () => string;
}

export interface KharchaResult {
  ops: KharchaOp[];
  reply: KharchaReply;
  state: KharchaState;
}

// What the shopkeeper's family actually spent: the other person's share of a split is not counted.
const mine = (e: Expense) => e.split?.myShare ?? e.amount;
const sumMine = (es: Expense[]) => es.reduce((s, e) => s + mine(e), 0);

function make(item: KharchaItem, ctx: KharchaCtx): Expense {
  return {
    id: ctx.newId(),
    book: "kharcha",
    item: item.item,
    category: item.category,
    amount: item.amount,
    date: dateFromOffset(ctx.today, item.dayOffset),
    at: ctx.now,
    ...(item.note ? { note: item.note } : {}),
    ...(item.split ? { split: { with: item.split.with, myShare: item.split.myShare } } : {}),
  };
}

function help(state: KharchaState): KharchaResult {
  return { ops: [], reply: { key: "kh_help" }, state };
}

function add(state: KharchaState, intent: KharchaIntent, ctx: KharchaCtx): KharchaResult {
  const items = intent.items ?? [];
  if (!items.length) return help(state);
  const made = items.map((it) => make(it, ctx));
  const expenses = [...state.expenses, ...made];
  return {
    ops: made.map((entry): KharchaOp => ({ op: "add", entry })),
    reply: {
      key: "kh_added",
      items: made.map((e) => ({
        item: e.item,
        amount: e.amount,
        ...(e.split ? { myShare: e.split.myShare, with: e.split.with } : {}),
      })),
      todayTotal: sumMine(expenses.filter((e) => e.date === ctx.today)),
    },
    state: { expenses, lastIds: made.map((e) => e.id) },
  };
}

function correct(state: KharchaState, intent: KharchaIntent, ctx: KharchaCtx): KharchaResult {
  const id = state.lastIds[state.lastIds.length - 1];
  const target = state.expenses.find((e) => e.id === id);
  if (!target) return { ops: [], reply: { key: "kh_nothing" }, state };
  const fix = intent.fix ?? {};
  const patch: Partial<Expense> = {};
  if (fix.item) patch.item = fix.item;
  if (fix.category) patch.category = fix.category;
  if (fix.amount !== undefined) {
    patch.amount = fix.amount;
    // A split keeps its share of the bill when the total is corrected.
    if (target.split) {
      patch.split = { with: target.split.with, myShare: Math.round((target.split.myShare * fix.amount) / target.amount) };
    }
  }
  const updated: Expense = { ...target, ...patch };
  const expenses = state.expenses.map((e) => (e.id === id ? updated : e));
  return {
    ops: [{ op: "update", id, patch }],
    reply: {
      key: "kh_corrected",
      item: updated.item,
      amount: updated.amount,
      todayTotal: sumMine(expenses.filter((e) => e.date === ctx.today)),
    },
    state: { expenses, lastIds: state.lastIds },
  };
}

export function applyKharcha(state: KharchaState, intent: KharchaIntent, ctx: KharchaCtx): KharchaResult {
  const month = ctx.today.slice(0, 7);
  switch (intent.kind) {
    case "add":
      return add(state, intent, ctx);
    case "correct":
      return correct(state, intent, ctx);
    case "query_today": {
      const today = state.expenses.filter((e) => e.date === ctx.today);
      return { ops: [], reply: { key: "kh_today", amount: sumMine(today), count: today.length }, state };
    }
    case "query_month": {
      const monthly = state.expenses.filter((e) => e.date.startsWith(month));
      return { ops: [], reply: { key: "kh_month", amount: sumMine(monthly), count: monthly.length }, state };
    }
    case "query_category": {
      const category = intent.category ?? "other";
      const hits = state.expenses.filter((e) => e.date.startsWith(month) && e.category === category);
      return { ops: [], reply: { key: "kh_category", category, amount: sumMine(hits) }, state };
    }
    default:
      return help(state);
  }
}
