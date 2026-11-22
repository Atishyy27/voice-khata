// Runs the kharcha parse step on real utterances and prints the intent each one becomes (live Groq/Gemini call).
import { readFileSync } from "node:fs";
import { parseKharcha } from "../api/_lib/parse";
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}
const UTTERANCES = [
  "chai 20, auto 50, sabzi 120",
  "Rahul ke saath dinner 1200, aadha mera",
  "aaj kitna kharcha hua",
  "is mahine khane pe kitna gaya",
  "nahi, chai 25 thi",
  "दूध 60 और ब्रेड 40",
];
(async () => {
  for (const text of UTTERANCES) {
    const r = await parseKharcha(text);
    console.log(`${r.ms} ms ${r.model} | ${text}\n  ${JSON.stringify(r.intent)}`);
  }
})();
