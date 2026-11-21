import { describe, expect, it } from "vitest";
import { crossCheck, disclosure } from "./session";
import { greeting } from "./replies";
import type { Intent } from "./types";

const add = (amount: number): Intent => ({
  kind: "add",
  entries: [{ name: "Ramesh", nameKey: "ramesh", amount, direction: "credit", dayOffset: 0 }],
});

describe("crossCheck", () => {
  it("uses the transcript's amount when the LLM wrote a different one for a single entry", () => {
    expect(crossCheck(add(34), "रमेश का 340 उधार")).toEqual(add(340));
  });
  it("keeps the LLM's amount when they agree", () => {
    expect(crossCheck(add(340), "Ramesh ka 340 udhaar")).toEqual(add(340));
  });
  it("leaves two-entry turns alone", () => {
    const two: Intent = { kind: "add", entries: [add(340).entries![0], { ...add(200).entries![0], direction: "payment", dayOffset: -1 }] };
    expect(crossCheck(two, "रमेश का 340 उधार, कल 200 दिया")).toEqual(two);
  });
  it("fixes a correction's amount from the transcript", () => {
    expect(crossCheck({ kind: "correct", fix: { amount: 43 } }, "नहीं, 430")).toEqual({ kind: "correct", fix: { amount: 430 } });
  });
  it("does nothing when the transcript has no amount", () => {
    expect(crossCheck(add(340), "Ramesh ka total kitna hai")).toEqual(add(340));
  });
});

describe("disclosure", () => {
  for (const lang of ["hi-IN", "en-IN", "kn-IN", "ta-IN", "te-IN", "ml-IN", "mr-IN", "bn-IN", "gu-IN", "pa-IN"]) {
    it(`says it is an AI and stops there in ${lang}`, () => {
      const d = disclosure(lang);
      expect(d).toContain("AI");
      expect(greeting(lang).startsWith(d)).toBe(true);
      expect(d.length).toBeLessThan(greeting(lang).length);
    });
  }
});
