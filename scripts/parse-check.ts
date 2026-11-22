// Times the parse step on the transcripts Prisma produced in the spike, plus correction and clarify turns.
import { readFileSync } from "node:fs";
import { parseUtterance } from "../api/_lib/parse";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}
const customers = ["Ramesh Sharma", "Ramesh Doodhwala", "Sita", "Mohan", "Pinky", "Anil"].map((n) => ({ name: n, nameKey: n.toLowerCase() }));
const cases: [string, boolean][] = [
  ["रमेश का 340 उधार लिखो।", false], ["रमेश ने कल 200 रुपये दिए थे।", false], ["सीता का 1250 उधार।", false],
  ["Mohan paid 500 rupees today.", false], ["सुरेश का 65 रुपये उधार।", false], ["नहीं 430।", false],
  ["अनिल ने परसों 750 दिए।", false], ["पिंकी का 2000 उधार।", false], ["रमेश का total कितना है?", false],
  ["ರಮೇಶ್ ಅವರಿಗೆ 340 ರೂಪಾಯಿ ಸಾಲ.", false], ["रमेश शर्मा का 340 उधार, कल 200 दिया था", false],
  ["आज कितना उधार गया?", false], ["दूध वाले", true],
  ["पहले वाले", true], ["दूसरे वाले", true], ["शर्मा जी", true], ["जो दूध देते हैं वो", true], ["Sharma wale Ramesh", true],
];
(async () => {
  for (const [text, pending] of cases) {
    const ctx = { customers, pending: pending ? { intent: { kind: "add" as const }, candidates: customers.slice(0, 2) } : undefined };
    try {
      const r = await parseUtterance(text, ctx);
      console.log(`${String(r.ms).padStart(5)} ms ${r.model.padEnd(20)} ${text.padEnd(34)} => ${JSON.stringify(r.intent)}`);
    } catch (e) {
      console.log(`ERR ${text}: ${(e as Error).message}`);
    }
  }
})();
