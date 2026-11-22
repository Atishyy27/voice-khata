import type { LangCode } from "./languages";
import { odiaToBengaliScript } from "./odia";

// The text a sister voice should be given. Odia is rewritten in Bengali script (odia.ts).
// Assamese letters that the Bengali voice does not know are mapped to their Bengali sounds.
export function spokenText(code: LangCode, text: string): string {
  if (code === "or-IN") return odiaToBengaliScript(text);
  if (code === "as-IN") return text.replace(/ৰ/g, "র").replace(/ৱ/g, "ওৱ");
  return text;
}
