// Safety net: reads rupee amounts out of a transcript so the caller can cross-check the LLM.

// Index = value 1..99. Variants separated by spaces, first is canonical.
const HI_ROMAN: string[] = [
  "ek", "do", "teen tin", "chaar char", "paanch panch paach", "chhah chhe chheh chhai chah", "saat sat", "aath aat", "nau nao", "das dus",
  "gyarah gyaarah giyarah", "barah baarah", "terah tehra", "chaudah chaudaha", "pandrah pandra", "solah sola", "satrah satra", "atharah athara", "unnis unnees", "bees bis",
  "ikkis ikkees", "baais baaees bais", "teis teyis tevis", "chaubis chaubees", "pachchis pacchis pachis pachees", "chhabbis chhabbees", "sattais sattaees", "atthais athais atthaees", "unatis unattis unnatis", "tees tis",
  "ikattis iktis ikatees", "battis battees", "taintis teintis", "chauntis chauntees", "paintis paintees", "chhattis chhattees", "saintis saintees", "adtis artis adatees adtees", "unchalis untalis unataalees", "chalis chaalis",
  "iktalis ikatalis", "bayalis byalis", "taintalis tentalis", "chauvalis chavalis chauvaalis", "paintalis paitalis", "chhiyalis chhiyaalis", "saintalis saitalis", "adtalis artalis adatalis", "unchas unanchas", "pachas pachaas",
  "ikyavan ikyawan", "baavan bavan bawan", "tirpan tirapan trepan", "chauvan chauwan", "pachpan", "chhappan chhapan", "sattavan satavan", "atthavan athavan", "unsath unsaath", "saath",
  "iksath ikasath", "baasath basath", "tirsath tirisath", "chaunsath chausath", "painsath painsat", "chhiyasath chhiyaasath", "sadsath sarsath", "adsath arsath", "unhattar unahattar", "sattar",
  "ikahattar ikhattar", "bahattar", "tihattar", "chauhattar", "pachhattar pachattar pachhatar", "chhihattar", "satahattar satattar sathattar", "athahattar athattar", "unyasi unaasi unasi", "assi assee",
  "ikyasi", "bayasi bayaasi", "tirasi", "chaurasi", "pachasi", "chhiyasi", "sattasi", "atthasi athasi", "navasi nawasi", "nabbe nabbay",
  "ikyanve ikyanbe", "baanve banve", "tiranve", "chauranve", "panchanve", "chhiyanve", "sattanve", "atthanve athanve", "ninyanve ninaanve",
];

const HI_DEV: string[] = [
  "एक", "दो", "तीन", "चार", "पाँच पांच", "छह छः छे छ", "सात", "आठ", "नौ", "दस",
  "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह पन्द्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस", "बीस",
  "इक्कीस", "बाईस", "तेईस", "चौबीस", "पच्चीस", "छब्बीस", "सत्ताईस", "अट्ठाईस अठाईस", "उनतीस", "तीस",
  "इकतीस", "बत्तीस", "तैंतीस", "चौंतीस", "पैंतीस", "छत्तीस", "सैंतीस", "अड़तीस", "उनतालीस उनचालीस", "चालीस",
  "इकतालीस", "बयालीस", "तैंतालीस", "चौवालीस चवालीस", "पैंतालीस", "छियालीस", "सैंतालीस", "अड़तालीस", "उनचास", "पचास",
  "इक्यावन", "बावन", "तिरपन तिरेपन", "चौवन", "पचपन", "छप्पन", "सत्तावन", "अट्ठावन अठावन", "उनसठ", "साठ",
  "इकसठ", "बासठ", "तिरसठ तिरेसठ", "चौंसठ", "पैंसठ", "छियासठ", "सड़सठ", "अड़सठ", "उनहत्तर", "सत्तर",
  "इकहत्तर", "बहत्तर", "तिहत्तर", "चौहत्तर", "पचहत्तर", "छिहत्तर", "सतहत्तर", "अठहत्तर", "उनासी उन्यासी", "अस्सी",
  "इक्यासी", "बयासी", "तिरासी", "चौरासी", "पचासी", "छियासी", "सत्तासी", "अट्ठासी", "नवासी", "नब्बे",
  "इक्यानवे", "बानवे", "तिरानवे", "चौरानवे", "पंचानवे", "छियानवे", "सत्तानवे", "अट्ठानवे", "निन्यानवे",
];

const EN_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const MULT_WORDS: Record<number, string> = {
  100: "sau sao सौ hundred",
  1000: "hazaar hazar hajar hajaar हज़ार हजार thousand",
  100000: "lakh lakhs lac लाख",
};

const FRAC_WORDS: Record<string, number> = {
  saadhe: 0.5, sadhe: 0.5, साढ़े: 0.5, साढे: 0.5,
  sawa: 0.25, सवा: 0.25,
  paune: -0.25, पौने: -0.25,
};
const HALF_WORDS: Record<string, number> = { dedh: 1.5, dhai: 2.5, डेढ़: 1.5, डेढ: 1.5, ढाई: 2.5 };

const CURRENCY = new Set(["rupay", "rupaye", "rupaya", "rupiya", "rupee", "rupees", "rs", "रुपये", "रुपए", "रुपया", "रु"]);
// Common Hindi words that are also number words; only count with a multiplier or currency word.
const AMBIGUOUS = new Set(["saath", "sath", "साथ"]);

function norm(w: string): string {
  if (/[ऀ-ॿ]/.test(w)) return w.normalize("NFC").replace(/़/g, "").replace(/ँ/g, "ं");
  return w
    .toLowerCase()
    .replace(/w/g, "v")
    .replace(/z/g, "j")
    .replace(/aa/g, "a")
    .replace(/ee|ii/g, "i")
    .replace(/uu/g, "u")
    .replace(/(.)\1+/g, "$1");
}

const HI = new Map<string, number>();
[HI_ROMAN, HI_DEV].forEach((list) =>
  list.forEach((variants, i) => variants.split(" ").forEach((v) => HI.set(norm(v), i + 1))),
);
const MULT = new Map<string, number>();
Object.entries(MULT_WORDS).forEach(([m, words]) => words.split(" ").forEach((w) => MULT.set(norm(w), Number(m))));
const FRAC = new Map(Object.entries(FRAC_WORDS).map(([k, v]) => [norm(k), v]));
const HALF = new Map(Object.entries(HALF_WORDS).map(([k, v]) => [norm(k), v]));

type Tok =
  | { k: "num"; v: number; amb: boolean }
  | { k: "digit"; v: number }
  | { k: "mult"; v: number }
  | { k: "frac"; v: number }
  | { k: "and" }
  | { k: "cur" }
  | { k: "other" };

function classify(raw: string): Tok {
  if (/^\d/.test(raw)) return { k: "digit", v: Number(raw.replace(/,/g, "")) };
  const lower = raw.toLowerCase();
  if (CURRENCY.has(lower)) return { k: "cur" };
  if (lower === "and") return { k: "and" };
  if (lower in EN_NUM) return { k: "num", v: EN_NUM[lower], amb: false };
  const n = norm(raw);
  const m = MULT.get(n);
  if (m !== undefined) return { k: "mult", v: m };
  const f = FRAC.get(n);
  if (f !== undefined) return { k: "frac", v: f };
  const h = HALF.get(n);
  if (h !== undefined) return { k: "num", v: h, amb: false };
  const v = HI.get(n);
  if (v !== undefined) return { k: "num", v, amb: AMBIGUOUS.has(lower) };
  return { k: "other" };
}

interface Run {
  total: number;
  cur: number;
  frac: number;
  mult: boolean;
  last: "none" | "num" | "frac" | "mult";
  n: number;
  amb: boolean;
}
const fresh = (): Run => ({ total: 0, cur: 0, frac: 0, mult: false, last: "none", n: 0, amb: false });

export function extractAmounts(text: string): number[] {
  const src = text
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/-/g, " ");
  const raws = src.match(/\d+(?:,\d+)*(?:\.\d+)?|[\p{L}\p{M}]+/gu) ?? [];
  const toks = raws.map(classify);
  const out: number[] = [];
  let run = fresh();

  const finish = (r: Run, next: Tok | undefined) => {
    const value = r.total + r.cur;
    if (r.n === 0 || value <= 0 || !Number.isInteger(value)) return;
    if (!r.mult) {
      const currencyNext = next?.k === "cur";
      if (!currencyNext && (r.amb || value < 10)) return;
    }
    out.push(value);
  };

  const addNum = (v: number) => {
    run.cur += v;
    run.last = "num";
    run.n++;
  };

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const next = toks[i + 1];
    if (t.k === "digit") {
      if (run.last === "mult") {
        addNum(t.v);
        continue;
      }
      finish(run, undefined);
      run = fresh();
      if (next?.k === "mult") {
        addNum(t.v);
      } else {
        out.push(Math.round(t.v));
      }
      continue;
    }
    if (t.k === "num") {
      if (run.last === "num") {
        const c = run.cur;
        if (c >= 20 && c % 10 === 0 && t.v < 10) {
          addNum(t.v);
        } else if (c >= 1 && c <= 9 && !run.mult && t.v >= 20 && t.v < 100 && t.v % 10 === 0) {
          run.cur = c * 100 + t.v;
        } else {
          finish(run, t);
          run = fresh();
          addNum(t.v);
        }
      } else {
        addNum(t.v);
      }
      if (t.amb) run.amb = true;
      continue;
    }
    if (t.k === "frac") {
      if (run.last === "num") {
        finish(run, undefined);
        run = fresh();
      }
      run.frac = t.v;
      run.last = "frac";
      run.n++;
      continue;
    }
    if (t.k === "mult") {
      if (run.n === 0) run.n = 1;
      const base = (run.cur || 1) + run.frac;
      run.frac = 0;
      if (t.v === 100) run.cur = base * 100;
      else {
        run.total += base * t.v;
        run.cur = 0;
      }
      run.mult = true;
      run.last = "mult";
      continue;
    }
    if (t.k === "and" && run.n > 0 && (next?.k === "num" || next?.k === "mult")) continue;
    finish(run, t);
    run = fresh();
  }
  finish(run, undefined);
  return out;
}

export function extractAmount(text: string): number | null {
  const all = extractAmounts(text);
  const distinct = new Set(all);
  return distinct.size === 1 ? all[0] : null;
}
