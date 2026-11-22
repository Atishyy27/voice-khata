// Gnani has no Odia voice. Odia and Bengali share one Unicode layout and a close sound
// system, so Odia text is rewritten letter by letter into Bengali script before the cloned
// voice reads it. A native Odia listener preferred this over raw Odia script (12 Nov 2026,
// scripts/odia-bengali-check.mjs). Only the audio uses it; subtitles stay in Odia.
const ODIA_START = 0x0b00;
const ODIA_END = 0x0b7f;
const TO_BENGALI = 0x180;
// Odia letters whose Bengali slot is empty map to the nearest Bengali letter.
const GAPS: Record<number, number> = { 0x09b3: 0x09b2, 0x09b5: 0x09ac, 0x09b1: 0x09b0 };

export function odiaToBengaliScript(text: string): string {
  let out = "";
  for (const c of text) {
    const o = c.codePointAt(0)!;
    if (o < ODIA_START || o > ODIA_END) {
      out += c;
      continue;
    }
    const n = o - TO_BENGALI;
    out += String.fromCodePoint(GAPS[n] ?? n);
  }
  return out;
}
