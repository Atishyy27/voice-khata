import { describe, expect, it } from "vitest";
import { applyKharcha, CATEGORIES, type KharchaState } from "./kharcha";
import { say } from "./replies";
import { toKharchaIntent } from "./parse";
import type { Expense } from "./types";

const TODAY = "2026-11-22";
let n = 0;
const ctx = () => ({ today: TODAY, now: "2026-11-22T10:00:00.000Z", newId: () => `k${++n}` });
const empty = (): KharchaState => ({ expenses: [], lastIds: [] });

const x = (item: string, amount: number, category: string, date = TODAY, split?: Expense["split"]): Expense => ({
  id: `seed-${item}-${date}`,
  book: "kharcha",
  item,
  category,
  amount,
  date,
  at: "2026-11-20T10:00:00.000Z",
  ...(split ? { split } : {}),
});

const add = (items: unknown[], state = empty()) =>
  applyKharcha(state, toKharchaIntent({ kind: "add", items }), ctx());

describe("add", () => {
  it("three items in one utterance make three expenses", () => {
    const r = add([
      { item: "chai", amount: 20, category: "khana", dayOffset: 0 },
      { item: "auto", amount: 50, category: "safar", dayOffset: 0 },
      { item: "sabzi", amount: 120, category: "doodh-sabzi", dayOffset: 0 },
    ]);
    expect(r.ops.map((o) => o.op)).toEqual(["add", "add", "add"]);
    expect(r.reply).toEqual({
      key: "kh_added",
      items: [
        { item: "chai", amount: 20 },
        { item: "auto", amount: 50 },
        { item: "sabzi", amount: 120 },
      ],
      todayTotal: 190,
    });
    expect(r.state.lastIds).toHaveLength(3);
  });

  it("a split item counts only my share and says what the other person owes", () => {
    const r = add([{ item: "dinner", amount: 1200, category: "khana", dayOffset: 0, split: { with: "Rahul", myShare: 600 } }]);
    expect(r.ops[0]).toMatchObject({ op: "add", entry: { book: "kharcha", amount: 1200, split: { with: "Rahul", myShare: 600 } } });
    expect(r.reply).toMatchObject({ key: "kh_added", todayTotal: 600 });
    expect(say(r.reply, "hi-IN")).toBe("dinner ₹1,200, आपका हिस्सा ₹600, Rahul से ₹600 लेने हैं। आज का कुल खर्च ₹600।");
  });

  it("a utterance with no items gives the help reply", () => {
    expect(applyKharcha(empty(), { kind: "add", items: [] }, ctx()).reply).toEqual({ key: "kh_help" });
  });
});

describe("totals", () => {
  const seeded = (): KharchaState => ({
    expenses: [
      x("dinner", 1200, "khana", TODAY, { with: "Rahul", myShare: 600 }),
      x("auto", 100, "safar", "2026-11-21"),
      x("dawai", 500, "dawai", "2026-10-30"),
    ],
    lastIds: [],
  });

  it("today counts my share of a split", () => {
    expect(applyKharcha(seeded(), { kind: "query_today" }, ctx()).reply).toEqual({ key: "kh_today", amount: 600, count: 1 });
  });

  it("this month counts my share and leaves out last month", () => {
    expect(applyKharcha(seeded(), { kind: "query_month" }, ctx()).reply).toEqual({ key: "kh_month", amount: 700, count: 2 });
  });

  it("category total for this month", () => {
    const state: KharchaState = {
      expenses: [x("chai", 20, "khana"), x("dinner", 1200, "khana", TODAY, { with: "Rahul", myShare: 600 }), x("auto", 50, "safar")],
      lastIds: [],
    };
    const r = applyKharcha(state, toKharchaIntent({ kind: "query_category", category: "khana" }), ctx());
    expect(r.reply).toEqual({ key: "kh_category", category: "khana", amount: 620 });
    expect(say(r.reply, "en-IN")).toBe("This month, on Food: ₹620.");
  });
});

describe("correction", () => {
  it("fixes the last item only", () => {
    const added = add([
      { item: "chai", amount: 20, category: "khana", dayOffset: 0 },
      { item: "auto", amount: 50, category: "safar", dayOffset: 0 },
      { item: "sabzi", amount: 120, category: "doodh-sabzi", dayOffset: 0 },
    ]);
    const last = added.state.lastIds[2];
    const r = applyKharcha(added.state, toKharchaIntent({ kind: "correct", fix: { amount: 25 } }), ctx());
    expect(r.ops).toEqual([{ op: "update", id: last, patch: { amount: 25 } }]);
    expect(r.state.expenses.map((e) => e.amount)).toEqual([20, 50, 25]);
    expect(r.reply).toEqual({ key: "kh_corrected", item: "sabzi", amount: 25, todayTotal: 95 });
  });

  it("nahi, chai 25 thi fixes the chai", () => {
    const added = add([{ item: "chai", amount: 20, category: "khana", dayOffset: 0 }]);
    const r = applyKharcha(added.state, toKharchaIntent({ kind: "correct", fix: { item: "chai", amount: 25 } }), ctx());
    expect(r.reply).toEqual({ key: "kh_corrected", item: "chai", amount: 25, todayTotal: 25 });
  });

  it("a split keeps its share of the bill when the total changes", () => {
    const added = add([{ item: "dinner", amount: 1200, category: "khana", dayOffset: 0, split: { with: "Rahul", myShare: 600 } }]);
    const r = applyKharcha(added.state, toKharchaIntent({ kind: "correct", fix: { amount: 1400 } }), ctx());
    expect(r.state.expenses[0].split).toEqual({ with: "Rahul", myShare: 700 });
  });

  it("nothing to fix when no expense was added", () => {
    expect(applyKharcha(empty(), { kind: "correct", fix: { amount: 25 } }, ctx()).reply).toEqual({ key: "kh_nothing" });
  });
});

describe("toKharchaIntent", () => {
  it("drops invalid items, clamps day and share, maps unknown categories to other", () => {
    const intent = toKharchaIntent({
      kind: "add",
      items: [
        { item: "chai", amount: 20, category: "khana", dayOffset: -9 },
        { item: "", amount: 50, category: "safar" },
        { item: "sabzi", amount: 0, category: "doodh-sabzi" },
        { item: "ghee", amount: 300, category: "ghee-stuff" },
        { item: "dinner", amount: 1200, category: "khana", split: { with: "Rahul", myShare: 9999 } },
      ],
    });
    expect(intent.items).toEqual([
      { item: "chai", amount: 20, category: "khana", dayOffset: -7 },
      { item: "ghee", amount: 300, category: "other", dayOffset: 0 },
      { item: "dinner", amount: 1200, category: "khana", dayOffset: 0, split: { with: "Rahul", myShare: 1200 } },
    ]);
  });

  it("an add with no valid item is other", () => {
    expect(toKharchaIntent({ kind: "add", items: [{ item: "", amount: 5 }] })).toEqual({ kind: "other" });
  });

  it("query category is normalised, unknown kinds are other", () => {
    expect(toKharchaIntent({ kind: "query_category", category: "Khana" })).toEqual({ kind: "query_category", category: "khana" });
    expect(toKharchaIntent({ kind: "query_category", category: "pizza" })).toEqual({ kind: "query_category", category: "other" });
    expect(toKharchaIntent({ kind: "bogus" })).toEqual({ kind: "other" });
  });

  it("the category list is the fixed thirteen", () => {
    expect(CATEGORIES).toHaveLength(13);
    expect(CATEGORIES).toContain("other");
  });
});
