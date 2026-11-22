import { afterEach, describe, expect, it } from "vitest";
import { clean, track } from "./telemetry";

const savedUrl = process.env.DATABASE_URL;
afterEach(() => {
  if (savedUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedUrl;
});

describe("clean", () => {
  it("drops keys that are not on the allowlist", () => {
    const row = clean("turn", { text: "रमेश 340", amount: 340, reply_text: "ठीक है", session: "abc" });
    expect(row).not.toHaveProperty("text");
    expect(row).not.toHaveProperty("amount");
    expect(row).not.toHaveProperty("reply_text");
    expect(row.session).toBe("abc");
    expect(row.props).toEqual({});
  });

  it("keeps allowed top-level keys and rounds int columns", () => {
    const row = clean("turn", { session: "s1", lang: "hi-IN", kind: "add", reply: "added", stt_ms: 812.4, parse_ms: 301.6, model: "llama", ok: true });
    expect(row).toMatchObject({ ev: "turn", session: "s1", lang: "hi-IN", kind: "add", reply: "added", stt_ms: 812, parse_ms: 302, model: "llama", ok: true });
  });

  it("puts extra allowed keys into props", () => {
    const row = clean("disconnect", { session: "s1", turns: 4, durationMs: 90_000, junk: 1 });
    expect(row.props).toEqual({ turns: 4, durationMs: 90_000 });
  });

  it("cuts long error and msg strings", () => {
    const row = clean("error", { error: "x".repeat(500), msg: "y".repeat(500) });
    expect(row.error).toHaveLength(200);
    expect(row.props.msg).toHaveLength(120);
  });

  it("drops non-finite numbers", () => {
    const row = clean("said", { first_audio_ms: NaN, tts_ms: Infinity, session: "s" });
    expect(row).not.toHaveProperty("first_audio_ms");
    expect(row).not.toHaveProperty("tts_ms");
    const p = clean("barge_in", { ms: -Infinity, holdMs: 1500 });
    expect(p.props).toEqual({ holdMs: 1500 });
  });

  it("rejects bad event names", () => {
    expect(clean("drop table", {}).ev).toBe("invalid");
    expect(clean("a-b", {}).ev).toBe("invalid");
    expect(clean("x".repeat(41), {}).ev).toBe("invalid");
    expect(clean("", {}).ev).toBe("invalid");
    expect(clean("client_barge_in", {}).ev).toBe("client_barge_in");
  });
});

describe("track", () => {
  it("returns without throwing when DATABASE_URL is unset", () => {
    delete process.env.DATABASE_URL;
    expect(() => track("connect", { session: "s1" })).not.toThrow();
  });
});
