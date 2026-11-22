import { afterEach, describe, expect, it } from "vitest";
import { appendToSheet, rowsFor } from "./sheet";
import type { Entry, Op } from "./types";

const old: Entry = {
  id: "e1",
  name: "Ramesh",
  nameKey: "ramesh",
  amount: 340,
  direction: "credit",
  date: "2026-11-22",
  at: "2026-11-22T10:00:00.000Z",
  note: "cheeni",
};

afterEach(() => {
  delete process.env.SHEET_HOOK_URL;
});

describe("rowsFor", () => {
  it("writes an add of credit as one udhaar row with a plus sign", () => {
    const rows = rowsFor([], [{ op: "add", entry: old }], "s1", "10:05", "x1");
    expect(rows).toEqual([
      {
        date: "2026-11-22",
        time: "10:05",
        customer: "Ramesh",
        type: "udhaar",
        amount: 340,
        signed: 340,
        note: "cheeni",
        id: "e1",
        session: "s1",
      },
    ]);
  });

  it("writes an add of payment as a jama row with a minus sign", () => {
    const pay: Entry = { ...old, id: "e2", direction: "payment", amount: 200, note: undefined };
    const [r] = rowsFor([], [{ op: "add", entry: pay }], "s1", "10:05", "x1");
    expect(r.type).toBe("jama");
    expect(r.signed).toBe(-200);
    expect(r.note).toBe("");
  });

  it("writes a reversal row and then the corrected row for an update", () => {
    const ops: Op[] = [{ op: "update", id: "e1", patch: { amount: 430 } }];
    const [rev, fixed] = rowsFor([old], ops, "s1", "10:05", "x1");
    expect(rev).toMatchObject({ amount: -340, signed: -340, note: "reversal of e1", customer: "Ramesh", type: "udhaar" });
    expect(rev.id.endsWith("~rx1")).toBe(true);
    expect(fixed).toMatchObject({ amount: 430, signed: 430, type: "udhaar", note: "cheeni" });
    expect(fixed.id).toBe("e1~x1");
    expect(rowsFor([old], ops, "s1", "10:05", "x1")).toHaveLength(2);
  });

  it("writes nothing for an update of an unknown id", () => {
    const ops: Op[] = [{ op: "update", id: "nope", patch: { amount: 430 } }];
    expect(rowsFor([old], ops, "s1", "10:05", "x1")).toEqual([]);
  });
});

describe("appendToSheet", () => {
  it("resolves false for no rows", async () => {
    process.env.SHEET_HOOK_URL = "https://example.invalid/hook";
    expect(await appendToSheet([])).toBe(false);
  });

  it("resolves false with the hook url unset, without any network call", async () => {
    delete process.env.SHEET_HOOK_URL;
    const [r] = rowsFor([], [{ op: "add", entry: old }], "s1", "10:05", "x1");
    expect(await appendToSheet([r])).toBe(false);
  });
});
