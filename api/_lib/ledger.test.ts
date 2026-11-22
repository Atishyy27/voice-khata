import { describe, expect, it } from "vitest";
import { applyIntent, balance, customers, dateFromOffset, matchCustomers, normKey, todayCredit } from "./ledger";
import type { Entry, Intent, SessionState } from "./types";

const TODAY = "2026-11-22";
let n = 0;
const ctx = () => ({ today: TODAY, now: "2026-11-22T10:00:00.000Z", newId: () => `id${++n}` });

const e = (name: string, amount: number, direction: Entry["direction"], date = TODAY): Entry => ({
  id: `seed-${name}-${amount}-${date}`,
  name,
  nameKey: normKey(name),
  amount,
  direction,
  date,
  at: "2026-11-20T10:00:00.000Z",
});

const seed = (): SessionState => ({
  entries: [e("Ramesh Sharma", 500, "credit", "2026-11-10"), e("Sita", 100, "credit", "2026-11-10")],
  lastIds: [],
});

const twoRameshes = (): SessionState => ({
  entries: [
    e("Ramesh Sharma", 500, "credit", "2026-11-10"),
    e("Ramesh Doodhwala", 300, "credit", "2026-11-10"),
    e("Sita", 100, "credit", "2026-11-10"),
  ],
  lastIds: [],
});

describe("normKey / customers / dateFromOffset", () => {
  it("normalises", () => {
    expect(normKey("  Ramesh,   SHARMA! ")).toBe("ramesh sharma");
  });
  it("customers are unique by nameKey, latest display name", () => {
    const list = customers([e("ramesh", 1, "credit"), e("Ramesh", 2, "credit"), e("Sita", 3, "credit")]);
    expect(list).toEqual([
      { nameKey: "ramesh", name: "Ramesh" },
      { nameKey: "sita", name: "Sita" },
    ]);
  });
  it("dateFromOffset crosses month and year", () => {
    expect(dateFromOffset("2026-11-22", -1)).toBe("2026-11-21");
    expect(dateFromOffset("2026-01-01", -2)).toBe("2025-12-30");
    expect(dateFromOffset("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("matchCustomers", () => {
  const entries = twoRameshes().entries;
  it("exact key wins", () => {
    expect(matchCustomers(entries, "ramesh sharma").map((c) => c.name)).toEqual(["Ramesh Sharma"]);
  });
  it("first token returns all", () => {
    expect(matchCustomers(entries, "ramesh").map((c) => c.name)).toEqual(["Ramesh Sharma", "Ramesh Doodhwala"]);
  });
  it("fuzzy on first token when length >= 4", () => {
    expect(matchCustomers(entries, "rameesh").length).toBe(2);
    expect(matchCustomers(entries, "sit")).toEqual([]);
  });
  it("short tokens are not fuzzy matched", () => {
    expect(matchCustomers([e("Anil", 1, "credit")], "ani")).toEqual([]);
  });
  it("no match", () => {
    expect(matchCustomers(entries, "mohan")).toEqual([]);
  });
});

describe("balance / todayCredit", () => {
  it("balance = credit - payment", () => {
    const es = [e("Sita", 300, "credit"), e("Sita", 100, "payment"), e("Mohan", 50, "credit")];
    expect(balance(es, "sita")).toBe(200);
  });
  it("todayCredit ignores payments and other days", () => {
    const es = [
      e("Sita", 300, "credit"),
      e("Sita", 100, "payment"),
      e("Mohan", 50, "credit", "2026-11-21"),
      e("Anil", 70, "credit"),
    ];
    expect(todayCredit(es, TODAY)).toEqual({ amount: 370, count: 2 });
  });
});

describe("applyIntent add", () => {
  it("copies the note onto the added entry", () => {
    const intent: Intent = {
      kind: "add",
      entries: [{ name: "Sita", nameKey: "sita", amount: 50, direction: "credit", dayOffset: 0, note: "cheeni" }],
    };
    const r = applyIntent(seed(), intent, ctx());
    expect(r.ops[0]).toMatchObject({ op: "add", entry: { nameKey: "sita", amount: 50, note: "cheeni" } });
  });
  const intent: Intent = {
    kind: "add",
    entries: [
      { name: "Ramesh Sharma", nameKey: "ramesh sharma", amount: 340, direction: "credit", dayOffset: 0 },
      { name: "Ramesh Sharma", nameKey: "ramesh sharma", amount: 200, direction: "payment", dayOffset: -1 },
    ],
  };
  it("two entries, dayOffset -1, balance after all (+140 vs before)", () => {
    const s = seed();
    const before = balance(s.entries, "ramesh sharma");
    const r = applyIntent(s, intent, ctx());
    expect(r.ops).toHaveLength(2);
    expect(r.ops[1]).toMatchObject({ op: "add", entry: { amount: 200, direction: "payment", date: "2026-11-21" } });
    expect(r.ops[0]).toMatchObject({ op: "add", entry: { amount: 340, direction: "credit", date: TODAY } });
    expect(r.reply).toEqual({
      key: "added",
      items: [
        { name: "Ramesh Sharma", amount: 340, direction: "credit", balance: before + 140 },
        { name: "Ramesh Sharma", amount: 200, direction: "payment", balance: before + 140 },
      ],
    });
    expect(r.state.lastIds).toHaveLength(2);
    expect(r.state.entries).toHaveLength(4);
  });
  it("does not mutate input state", () => {
    const s = seed();
    const snap = JSON.stringify(s);
    applyIntent(s, intent, ctx());
    expect(JSON.stringify(s)).toBe(snap);
  });
  it("unknown name becomes a new customer", () => {
    const r = applyIntent(
      seed(),
      { kind: "add", entries: [{ name: "Pinky", nameKey: "pinky", amount: 90, direction: "credit", dayOffset: 0 }] },
      ctx(),
    );
    expect(r.reply).toEqual({
      key: "added",
      items: [{ name: "Pinky", amount: 90, direction: "credit", balance: 90 }],
    });
  });
  it("single match uses stored name", () => {
    const r = applyIntent(
      seed(),
      { kind: "add", entries: [{ name: "Ramesh", nameKey: "ramesh", amount: 60, direction: "credit", dayOffset: 0 }] },
      ctx(),
    );
    expect(r.ops[0]).toMatchObject({ entry: { name: "Ramesh Sharma", nameKey: "ramesh sharma" } });
  });
});

describe("applyIntent correct", () => {
  it("changes only the last entry", () => {
    const s = seed();
    const first = applyIntent(
      s,
      {
        kind: "add",
        entries: [
          { name: "Ramesh Sharma", nameKey: "ramesh sharma", amount: 340, direction: "credit", dayOffset: 0 },
          { name: "Sita", nameKey: "sita", amount: 200, direction: "credit", dayOffset: 0 },
        ],
      },
      ctx(),
    );
    const ids = first.state.lastIds;
    const r = applyIntent(first.state, { kind: "correct", fix: { amount: 430 } }, ctx());
    expect(r.ops).toEqual([{ op: "update", id: ids[1], patch: { amount: 430 } }]);
    expect(r.reply).toEqual({ key: "corrected", name: "Sita", amount: 430, direction: "credit", balance: 530 });
    expect(r.state.entries.find((x) => x.id === ids[0])!.amount).toBe(340);
  });
  it("can flip direction", () => {
    const a = applyIntent(
      seed(),
      { kind: "add", entries: [{ name: "Sita", nameKey: "sita", amount: 50, direction: "credit", dayOffset: 0 }] },
      ctx(),
    );
    const r = applyIntent(a.state, { kind: "correct", fix: { direction: "payment" } }, ctx());
    expect(r.reply).toMatchObject({ key: "corrected", direction: "payment", balance: 50 });
  });
  it("nothing to fix without a previous entry", () => {
    const r = applyIntent(seed(), { kind: "correct", fix: { amount: 5 } }, ctx());
    expect(r.reply).toEqual({ key: "nothing_to_fix" });
    expect(r.ops).toEqual([]);
  });
});

describe("two Rameshes", () => {
  const add: Intent = {
    kind: "add",
    entries: [{ name: "Ramesh", nameKey: "ramesh", amount: 250, direction: "credit", dayOffset: 0 }],
  };
  it("asks which, then resolves from 'doodh wale'", () => {
    const s = twoRameshes();
    const q = applyIntent(s, add, ctx());
    expect(q.ops).toEqual([]);
    expect(q.reply).toEqual({ key: "which", names: ["Ramesh Sharma", "Ramesh Doodhwala"] });
    expect(q.state.pending?.candidates).toHaveLength(2);
    expect(s.pending).toBeUndefined();
    const a = applyIntent(q.state, { kind: "clarify_answer", name: "doodh wale" }, ctx());
    expect(a.reply).toEqual({
      key: "added",
      items: [{ name: "Ramesh Doodhwala", amount: 250, direction: "credit", balance: 550 }],
    });
    expect(a.state.pending).toBeUndefined();
    expect(a.ops).toHaveLength(1);
  });
  it("resolves 'sharma' and 'doodhwala'", () => {
    const q = applyIntent(twoRameshes(), add, ctx());
    const s = applyIntent(q.state, { kind: "clarify_answer", nameKey: "sharma" }, ctx());
    expect(s.reply).toMatchObject({ items: [{ name: "Ramesh Sharma", balance: 750 }] });
    const d = applyIntent(q.state, { kind: "clarify_answer", name: "Doodhwala" }, ctx());
    expect(d.reply).toMatchObject({ items: [{ name: "Ramesh Doodhwala" }] });
  });
  it("query_total asks, then answers", () => {
    const q = applyIntent(twoRameshes(), { kind: "query_total", name: "Ramesh", nameKey: "ramesh" }, ctx());
    expect(q.reply.key).toBe("which");
    const a = applyIntent(q.state, { kind: "clarify_answer", name: "sharma" }, ctx());
    expect(a.reply).toEqual({ key: "total", name: "Ramesh Sharma", balance: 500 });
  });
  it("clarify with no pending or no pick -> help", () => {
    expect(applyIntent(twoRameshes(), { kind: "clarify_answer", name: "sharma" }, ctx()).reply).toEqual({ key: "help" });
    const q = applyIntent(twoRameshes(), add, ctx());
    expect(applyIntent(q.state, { kind: "clarify_answer", name: "ramesh" }, ctx()).reply).toEqual({ key: "help" });
    expect(applyIntent(q.state, { kind: "clarify_answer", name: "xyz" }, ctx()).reply).toEqual({ key: "help" });
  });
});

describe("queries and other", () => {
  it("query_total unknown name", () => {
    const r = applyIntent(seed(), { kind: "query_total", name: "Mohan", nameKey: "mohan" }, ctx());
    expect(r.reply).toEqual({ key: "unknown", name: "Mohan" });
  });
  it("query_total known", () => {
    const r = applyIntent(seed(), { kind: "query_total", name: "Sita", nameKey: "sita" }, ctx());
    expect(r.reply).toEqual({ key: "total", name: "Sita", balance: 100 });
  });
  it("query_today", () => {
    const s = seed();
    s.entries.push(e("Sita", 40, "credit"), e("Sita", 10, "payment"));
    expect(applyIntent(s, { kind: "query_today" }, ctx()).reply).toEqual({ key: "today", amount: 40, count: 1 });
  });
  it("other -> help", () => {
    expect(applyIntent(seed(), { kind: "other" }, ctx()).reply).toEqual({ key: "help" });
  });
});
