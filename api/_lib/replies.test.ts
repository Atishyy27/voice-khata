import { describe, expect, it } from "vitest";
import { greeting, money, say } from "./replies";
import type { Reply } from "./types";

const LANGS = ["hi-IN", "en-IN", "kn-IN", "ta-IN", "te-IN", "ml-IN", "mr-IN", "bn-IN", "gu-IN", "pa-IN"];

describe("money", () => {
  it("uses Indian grouping", () => {
    expect(money(340)).toBe("₹340");
    expect(money(1250)).toBe("₹1,250");
    expect(money(125000)).toBe("₹1,25,000");
    expect(money(-540)).toBe("₹540");
  });
});

describe("greeting", () => {
  for (const l of LANGS) {
    it(`${l} says it is an AI`, () => expect(greeting(l)).toContain("AI"));
  }
  it("unknown language falls back to hindi", () => {
    expect(greeting("xx-XX")).toBe(greeting("hi-IN"));
  });
  it("hi-IN text", () => {
    expect(greeting("hi-IN")).toBe("नमस्ते! मैं एक AI खाता सहायक हूँ। बटन दबाकर बोलिए, जैसे रमेश का तीन सौ चालीस उधार।");
  });
});

describe("say hi-IN", () => {
  it("added credit", () => {
    const r: Reply = {
      key: "added",
      items: [{ name: "रमेश शर्मा", amount: 340, direction: "credit", balance: 540 }],
    };
    expect(say(r, "hi-IN")).toBe("रमेश शर्मा का ₹340 उधार लिखा। कुल बाकी ₹540।");
  });
  it("added payment", () => {
    const r: Reply = {
      key: "added",
      items: [{ name: "रमेश शर्मा", amount: 200, direction: "payment", balance: 340 }],
    };
    expect(say(r, "hi-IN")).toBe("रमेश शर्मा से ₹200 जमा। कुल बाकी ₹340।");
  });
  it("two items, same customer: one sentence each, balance once", () => {
    const r: Reply = {
      key: "added",
      items: [
        { name: "रमेश शर्मा", amount: 340, direction: "credit", balance: 640 },
        { name: "रमेश शर्मा", amount: 200, direction: "payment", balance: 640 },
      ],
    };
    expect(say(r, "hi-IN")).toBe("रमेश शर्मा का ₹340 उधार लिखा। रमेश शर्मा से ₹200 जमा। कुल बाकी ₹640।");
  });
  it("two customers: balance named per customer", () => {
    const r: Reply = {
      key: "added",
      items: [
        { name: "रमेश", amount: 100, direction: "credit", balance: 100 },
        { name: "सीता", amount: 50, direction: "credit", balance: 0 },
      ],
    };
    expect(say(r, "hi-IN")).toBe(
      "रमेश का ₹100 उधार लिखा। सीता का ₹50 उधार लिखा। रमेश का कुल बाकी ₹100। सीता का हिसाब बराबर है।",
    );
  });
  it("which", () => {
    expect(say({ key: "which", names: ["रमेश शर्मा", "रमेश दूधवाला"] }, "hi-IN")).toBe(
      "कौन से रमेश? रमेश शर्मा या रमेश दूधवाला?",
    );
  });
  it("total, today, corrected", () => {
    expect(say({ key: "total", name: "रमेश शर्मा", balance: 540 }, "hi-IN")).toBe("रमेश शर्मा का कुल बाकी ₹540।");
    expect(say({ key: "today", amount: 1250, count: 4 }, "hi-IN")).toBe("आज ₹1,250 उधार गया, 4 एंट्री।");
    expect(say({ key: "corrected", name: "रमेश शर्मा", amount: 430, direction: "credit", balance: 630 }, "hi-IN")).toBe(
      "ठीक किया। रमेश शर्मा का ₹430 उधार। कुल बाकी ₹630।",
    );
  });
  it("negative balance is not shown as a minus", () => {
    expect(say({ key: "total", name: "सीता", balance: -75 }, "hi-IN")).toBe("सीता का ₹75 ज़्यादा जमा है।");
  });
});

describe("say en-IN", () => {
  it("added and which", () => {
    expect(
      say({ key: "added", items: [{ name: "Sita", amount: 90, direction: "credit", balance: 190 }] }, "en-IN"),
    ).toBe("Added ₹90 udhaar for Sita. Total due ₹190.");
    expect(say({ key: "which", names: ["Ramesh Sharma", "Ramesh Doodhwala"] }, "en-IN")).toBe(
      "Which Ramesh? Ramesh Sharma or Ramesh Doodhwala?",
    );
  });
});

describe("every reply in every language", () => {
  const replies: Reply[] = [
    { key: "added", items: [{ name: "Sita", amount: 1250, direction: "credit", balance: 1250 }] },
    { key: "added", items: [{ name: "Sita", amount: 200, direction: "payment", balance: -200 }] },
    { key: "corrected", name: "Sita", amount: 430, direction: "payment", balance: 0 },
    { key: "total", name: "Sita", balance: 540 },
    { key: "total", name: "Sita", balance: 0 },
    { key: "today", amount: 1250, count: 4 },
    { key: "which", names: ["Ramesh Sharma", "Ramesh Doodhwala"] },
    { key: "unknown", name: "Mohan" },
    { key: "nothing_to_fix" },
    { key: "help" },
  ];
  it("renders with no leftover slots, no em dash, amounts present", () => {
    for (const l of LANGS) {
      for (const r of replies) {
        const t = say(r, l);
        expect(t.length, `${l} ${r.key}`).toBeGreaterThan(3);
        expect(t, `${l} ${r.key}`).not.toMatch(/[{}]|—|undefined/);
        if (r.key === "today") expect(t).toContain("₹1,250");
        if (r.key === "total" && r.balance === 540) expect(t).toContain("₹540");
      }
      expect(greeting(l)).not.toContain("—");
    }
  });
});
