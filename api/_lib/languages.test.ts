import { describe, expect, it } from "vitest";
import { LANGS, isLang, langInfo, viaLocale } from "./languages";
import { spokenText } from "./sister";
import { greeting, say } from "./replies";

const TIMBRE_LOCALES = ["hi-IN", "en-IN", "bn-IN", "mr-IN", "ta-IN", "te-IN", "gu-IN", "kn-IN", "ml-IN", "pa-IN"];

describe("LANGS", () => {
  it("has 25 codes split 10 native, 11 beta, 4 experimental", () => {
    expect(LANGS).toHaveLength(25);
    const count = (tier: string) => LANGS.filter((l) => l.tier === tier).length;
    expect([count("native"), count("beta"), count("experimental")]).toEqual([10, 11, 4]);
  });

  it("maps every language to one of the 10 Timbre locales", () => {
    for (const l of LANGS) expect(TIMBRE_LOCALES).toContain(l.via);
  });

  it("falls back to hi-IN for unknown codes", () => {
    expect(isLang("or-IN")).toBe(true);
    expect(isLang("xx-IN")).toBe(false);
    expect(langInfo("xx-IN").code).toBe("hi-IN");
    expect(viaLocale("or-IN")).toBe("bn-IN");
  });
});

describe("spokenText", () => {
  it("rewrites Odia into Bengali-block letters only", () => {
    expect(spokenText("or-IN", "ନମସ୍କାର")).toMatch(/^[\u0980-\u09FF]+$/);
  });
});

describe("reply packs", () => {
  for (const l of LANGS) {
    it(`greets with AI in ${l.code}`, () => {
      expect(greeting(l.code)).toContain("AI");
    });
    it(`has a help line in ${l.code}`, () => {
      expect(say({ key: "help" }, l.code).length).toBeGreaterThan(0);
    });
  }
});
