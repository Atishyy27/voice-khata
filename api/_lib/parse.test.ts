import { describe, expect, it } from "vitest";
import { toIntent } from "./parse";

const one = (extra: Record<string, unknown>) =>
  toIntent({
    kind: "add",
    entries: [{ name: "Ramesh", nameKey: "ramesh", amount: 340, direction: "credit", dayOffset: 0, ...extra }],
  }).entries![0];

describe("toIntent note", () => {
  it("keeps the note", () => {
    expect(one({ note: "shaadi ke liye kapda" }).note).toBe("shaadi ke liye kapda");
  });
  it("trims whitespace", () => {
    expect(one({ note: "  cheeni, chawal  " }).note).toBe("cheeni, chawal");
  });
  it("cuts a long note to 80 characters", () => {
    expect(one({ note: "a".repeat(100) }).note).toBe("a".repeat(80));
  });
  it("drops an empty or missing note", () => {
    expect(one({ note: "" })).not.toHaveProperty("note");
    expect(one({ note: "   " })).not.toHaveProperty("note");
    expect(one({})).not.toHaveProperty("note");
  });
});
