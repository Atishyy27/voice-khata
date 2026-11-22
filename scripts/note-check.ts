// Checks that the parse step keeps the reason ("kyu") as a short note, and leaves it out when none is said.
import { readFileSync } from "node:fs";
import { parseUtterance } from "../api/_lib/parse";
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}
const customers = ["Ramesh Sharma", "Sita", "Mohan"].map((n) => ({ name: n, nameKey: n.toLowerCase() }));
(async () => {
  for (const text of ["रमेश शर्मा का 340 उधार, शादी के लिए कपड़ा।", "Mohan ka 800 udhaar cheeni aur chawal ka", "सीता ने 500 दिए।", "Sita paid 200 for last month's milk"]) {
    const r = await parseUtterance(text, { customers });
    console.log(`${r.ms} ms ${r.model} | ${text} => ${JSON.stringify(r.intent.entries ?? r.intent)}`);
  }
})();
