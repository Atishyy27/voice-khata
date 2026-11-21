// Only hi-IN and en-IN were reviewed by a reader of the language. The other eight (kn, ta, te, ml, mr, bn, gu, pa)
// are machine-written and need a native speaker's check before they are shown to a judge or a shopkeeper.
import type { Reply } from "./types";

interface Pack {
  greeting: string;
  cr: string; // credit entry written
  pay: string; // payment entry written
  fixed: string;
  crS: string; // short forms used after "fixed"
  payS: string;
  bal: string;
  balZero: string;
  balNeg: string;
  total: string;
  totalZero: string;
  totalNeg: string;
  which: string;
  or: string;
  unknown: string;
  nothing: string;
  today: string;
  help: string;
}

const PACKS: Record<string, Pack> = {
  "hi-IN": {
    greeting: "नमस्ते! मैं एक AI खाता सहायक हूँ। बटन दबाकर बोलिए, जैसे रमेश का तीन सौ चालीस उधार।",
    cr: "{name} का {amt} उधार लिखा।",
    pay: "{name} से {amt} जमा।",
    fixed: "ठीक किया।",
    crS: "{name} का {amt} उधार।",
    payS: "{name} से {amt} जमा।",
    bal: "कुल बाकी {amt}।",
    balZero: "हिसाब बराबर है।",
    balNeg: "{amt} ज़्यादा जमा है।",
    total: "{name} का कुल बाकी {amt}।",
    totalZero: "{name} का हिसाब बराबर है।",
    totalNeg: "{name} का {amt} ज़्यादा जमा है।",
    which: "कौन से {first}? {list}?",
    or: " या ",
    unknown: "{name} नाम का खाता नहीं मिला।",
    nothing: "ठीक करने के लिए कोई एंट्री नहीं है।",
    today: "आज {amt} उधार गया, {count} एंट्री।",
    help: "समझ नहीं आया। ऐसे बोलिए: रमेश का तीन सौ चालीस उधार।",
  },
  "en-IN": {
    greeting: "Hello! I am an AI khata assistant. Hold the button and speak, for example: Ramesh, three hundred forty udhaar.",
    cr: "Added {amt} udhaar for {name}.",
    pay: "Received {amt} from {name}.",
    fixed: "Fixed.",
    crS: "{name}, {amt} udhaar.",
    payS: "{name}, {amt} received.",
    bal: "Total due {amt}.",
    balZero: "All settled.",
    balNeg: "{amt} paid in advance.",
    total: "{name} owes {amt}.",
    totalZero: "{name} is all settled.",
    totalNeg: "{name} has paid {amt} extra.",
    which: "Which {first}? {list}?",
    or: " or ",
    unknown: "I could not find {name} in the khata.",
    nothing: "There is no entry to fix.",
    today: "Today {amt} udhaar given, {count} entries.",
    help: "Sorry, I did not catch that. Try: Ramesh, three hundred forty udhaar.",
  },
  "kn-IN": {
    greeting: "ನಮಸ್ಕಾರ! ನಾನು AI ಖಾತಾ ಸಹಾಯಕ. ಬಟನ್ ಒತ್ತಿ ಮಾತನಾಡಿ, ಉದಾಹರಣೆಗೆ: ರಮೇಶ್ ಮುನ್ನೂರ ನಲವತ್ತು ಉದ್ರಿ.",
    cr: "ಉದ್ರಿ ಬರೆದೆ: {name}, {amt}.",
    pay: "ಜಮಾ ಬರೆದೆ: {name}, {amt}.",
    fixed: "ಸರಿಪಡಿಸಿದೆ.",
    crS: "{name}, {amt} ಉದ್ರಿ.",
    payS: "{name}, {amt} ಜಮಾ.",
    bal: "ಒಟ್ಟು ಬಾಕಿ {amt}.",
    balZero: "ಲೆಕ್ಕ ಸರಿಯಾಗಿದೆ.",
    balNeg: "{amt} ಹೆಚ್ಚು ಜಮಾ ಆಗಿದೆ.",
    total: "ಒಟ್ಟು ಬಾಕಿ, {name}: {amt}.",
    totalZero: "{name}: ಲೆಕ್ಕ ಸರಿಯಾಗಿದೆ.",
    totalNeg: "{name}: {amt} ಹೆಚ್ಚು ಜಮಾ ಆಗಿದೆ.",
    which: "ಯಾವ {first}? {list}?",
    or: " ಅಥವಾ ",
    unknown: "{name} ಹೆಸರಿನ ಖಾತೆ ಸಿಗಲಿಲ್ಲ.",
    nothing: "ಸರಿಪಡಿಸಲು ಯಾವ ಎಂಟ್ರಿಯೂ ಇಲ್ಲ.",
    today: "ಇಂದು {amt} ಉದ್ರಿ ಕೊಟ್ಟಿದೆ, {count} ಎಂಟ್ರಿ.",
    help: "ಅರ್ಥವಾಗಲಿಲ್ಲ. ಹೀಗೆ ಹೇಳಿ: ರಮೇಶ್ ಮುನ್ನೂರ ನಲವತ್ತು ಉದ್ರಿ.",
  },
  "ta-IN": {
    greeting: "வணக்கம்! நான் ஒரு AI கணக்கு உதவியாளர். பட்டனை அழுத்திப் பேசுங்கள், உதாரணம்: ரமேஷ் முந்நூற்று நாற்பது கடன்.",
    cr: "கடன் எழுதினேன்: {name}, {amt}.",
    pay: "வரவு எழுதினேன்: {name}, {amt}.",
    fixed: "திருத்தினேன்.",
    crS: "{name}, {amt} கடன்.",
    payS: "{name}, {amt} வரவு.",
    bal: "மொத்த பாக்கி {amt}.",
    balZero: "கணக்கு சரியாக உள்ளது.",
    balNeg: "{amt} கூடுதலாகச் செலுத்தப்பட்டுள்ளது.",
    total: "மொத்த பாக்கி, {name}: {amt}.",
    totalZero: "{name}: கணக்கு சரியாக உள்ளது.",
    totalNeg: "{name}: {amt} கூடுதலாகச் செலுத்தப்பட்டுள்ளது.",
    which: "எந்த {first}? {list}?",
    or: " அல்லது ",
    unknown: "{name} என்ற பெயரில் கணக்கு இல்லை.",
    nothing: "திருத்த எந்த பதிவும் இல்லை.",
    today: "இன்று {amt} கடன் கொடுக்கப்பட்டது, {count} பதிவுகள்.",
    help: "புரியவில்லை. இப்படிச் சொல்லுங்கள்: ரமேஷ் முந்நூற்று நாற்பது கடன்.",
  },
  "te-IN": {
    greeting: "నమస్కారం! నేను ఒక AI ఖాతా సహాయకుడిని. బటన్ నొక్కి మాట్లాడండి, ఉదాహరణకు: రమేష్ మూడు వందల నలభై అప్పు.",
    cr: "అప్పు రాశాను: {name}, {amt}.",
    pay: "జమ రాశాను: {name}, {amt}.",
    fixed: "సరిచేశాను.",
    crS: "{name}, {amt} అప్పు.",
    payS: "{name}, {amt} జమ.",
    bal: "మొత్తం బాకీ {amt}.",
    balZero: "లెక్క సరిగ్గా ఉంది.",
    balNeg: "{amt} ఎక్కువ జమ అయింది.",
    total: "మొత్తం బాకీ, {name}: {amt}.",
    totalZero: "{name}: లెక్క సరిగ్గా ఉంది.",
    totalNeg: "{name}: {amt} ఎక్కువ జమ అయింది.",
    which: "ఏ {first}? {list}?",
    or: " లేదా ",
    unknown: "{name} పేరుతో ఖాతా దొరకలేదు.",
    nothing: "సరిచేయడానికి ఎంట్రీ ఏదీ లేదు.",
    today: "ఈ రోజు {amt} అప్పు ఇచ్చారు, {count} ఎంట్రీలు.",
    help: "అర్థం కాలేదు. ఇలా చెప్పండి: రమేష్ మూడు వందల నలభై అప్పు.",
  },
  "ml-IN": {
    greeting: "നമസ്കാരം! ഞാൻ ഒരു AI കണക്ക് സഹായിയാണ്. ബട്ടൺ അമർത്തി സംസാരിക്കൂ, ഉദാഹരണത്തിന്: രമേഷ് മുന്നൂറ്റി നാൽപ്പത് കടം.",
    cr: "കടം എഴുതി: {name}, {amt}.",
    pay: "വരവ് എഴുതി: {name}, {amt}.",
    fixed: "തിരുത്തി.",
    crS: "{name}, {amt} കടം.",
    payS: "{name}, {amt} വരവ്.",
    bal: "ആകെ ബാക്കി {amt}.",
    balZero: "കണക്ക് ശരിയാണ്.",
    balNeg: "{amt} അധികം അടച്ചിട്ടുണ്ട്.",
    total: "ആകെ ബാക്കി, {name}: {amt}.",
    totalZero: "{name}: കണക്ക് ശരിയാണ്.",
    totalNeg: "{name}: {amt} അധികം അടച്ചിട്ടുണ്ട്.",
    which: "ഏത് {first}? {list}?",
    or: " അല്ലെങ്കിൽ ",
    unknown: "{name} എന്ന പേരിൽ അക്കൗണ്ട് കണ്ടില്ല.",
    nothing: "തിരുത്താൻ എൻട്രി ഒന്നുമില്ല.",
    today: "ഇന്ന് {amt} കടം നൽകി, {count} എൻട്രികൾ.",
    help: "മനസ്സിലായില്ല. ഇങ്ങനെ പറയൂ: രമേഷ് മുന്നൂറ്റി നാൽപ്പത് കടം.",
  },
  "mr-IN": {
    greeting: "नमस्कार! मी एक AI खाते सहाय्यक आहे. बटण दाबून बोला, उदाहरणार्थ: रमेश यांचे तीनशे चाळीस उधार.",
    cr: "{name} यांचे {amt} उधार लिहिले.",
    pay: "{name} यांच्याकडून {amt} जमा.",
    fixed: "दुरुस्त केले.",
    crS: "{name} यांचे {amt} उधार.",
    payS: "{name} यांच्याकडून {amt} जमा.",
    bal: "एकूण बाकी {amt}.",
    balZero: "हिशोब बरोबर आहे.",
    balNeg: "{amt} जास्त जमा आहेत.",
    total: "{name} यांची एकूण बाकी {amt}.",
    totalZero: "{name} यांचा हिशोब बरोबर आहे.",
    totalNeg: "{name} यांचे {amt} जास्त जमा आहेत.",
    which: "कोणते {first}? {list}?",
    or: " किंवा ",
    unknown: "{name} नावाचे खाते सापडले नाही.",
    nothing: "दुरुस्त करण्यासाठी कोणतीही एंट्री नाही.",
    today: "आज {amt} उधार दिले, {count} एंट्री.",
    help: "समजले नाही. असे बोला: रमेश यांचे तीनशे चाळीस उधार.",
  },
  "bn-IN": {
    greeting: "নমস্কার! আমি একটি AI খাতা সহকারী। বোতাম চেপে বলুন, যেমন: রমেশের তিনশো চল্লিশ টাকা বাকি।",
    cr: "{name} এর {amt} বাকি লিখলাম।",
    pay: "{name} এর কাছ থেকে {amt} জমা।",
    fixed: "ঠিক করলাম।",
    crS: "{name} এর {amt} বাকি।",
    payS: "{name} এর কাছ থেকে {amt} জমা।",
    bal: "মোট বাকি {amt}।",
    balZero: "হিসাব মিলে গেছে।",
    balNeg: "{amt} বেশি জমা আছে।",
    total: "{name} এর মোট বাকি {amt}।",
    totalZero: "{name} এর হিসাব মিলে গেছে।",
    totalNeg: "{name} এর {amt} বেশি জমা আছে।",
    which: "কোন {first}? {list}?",
    or: " নাকি ",
    unknown: "{name} নামে কোনো খাতা পাওয়া যায়নি।",
    nothing: "ঠিক করার মতো কোনো এন্ট্রি নেই।",
    today: "আজ {amt} বাকি দেওয়া হয়েছে, {count}টি এন্ট্রি।",
    help: "বুঝতে পারিনি। এভাবে বলুন: রমেশের তিনশো চল্লিশ টাকা বাকি।",
  },
  "gu-IN": {
    greeting: "નમસ્તે! હું એક AI ખાતા સહાયક છું. બટન દબાવીને બોલો, જેમ કે: રમેશના ત્રણસો ચાળીસ ઉધાર.",
    cr: "{name} ના {amt} ઉધાર લખ્યા.",
    pay: "{name} પાસેથી {amt} જમા.",
    fixed: "સુધાર્યું.",
    crS: "{name} ના {amt} ઉધાર.",
    payS: "{name} પાસેથી {amt} જમા.",
    bal: "કુલ બાકી {amt}.",
    balZero: "હિસાબ બરાબર છે.",
    balNeg: "{amt} વધારે જમા છે.",
    total: "{name} ના કુલ બાકી {amt}.",
    totalZero: "{name} નો હિસાબ બરાબર છે.",
    totalNeg: "{name} ના {amt} વધારે જમા છે.",
    which: "કયા {first}? {list}?",
    or: " કે ",
    unknown: "{name} નામનું ખાતું મળ્યું નથી.",
    nothing: "સુધારવા માટે કોઈ એન્ટ્રી નથી.",
    today: "આજે {amt} ઉધાર ગયા, {count} એન્ટ્રી.",
    help: "સમજાયું નહીં. આમ બોલો: રમેશના ત્રણસો ચાળીસ ઉધાર.",
  },
  "pa-IN": {
    greeting: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਇੱਕ AI ਖਾਤਾ ਸਹਾਇਕ ਹਾਂ। ਬਟਨ ਦਬਾ ਕੇ ਬੋਲੋ, ਜਿਵੇਂ: ਰਮੇਸ਼ ਦਾ ਤਿੰਨ ਸੌ ਚਾਲੀ ਉਧਾਰ।",
    cr: "{name} ਦਾ {amt} ਉਧਾਰ ਲਿਖ ਲਿਆ।",
    pay: "{name} ਤੋਂ {amt} ਜਮ੍ਹਾ।",
    fixed: "ਠੀਕ ਕਰ ਦਿੱਤਾ।",
    crS: "{name} ਦਾ {amt} ਉਧਾਰ।",
    payS: "{name} ਤੋਂ {amt} ਜਮ੍ਹਾ।",
    bal: "ਕੁੱਲ ਬਕਾਇਆ {amt}।",
    balZero: "ਹਿਸਾਬ ਬਰਾਬਰ ਹੈ।",
    balNeg: "{amt} ਵੱਧ ਜਮ੍ਹਾ ਹਨ।",
    total: "{name} ਦਾ ਕੁੱਲ ਬਕਾਇਆ {amt}।",
    totalZero: "{name} ਦਾ ਹਿਸਾਬ ਬਰਾਬਰ ਹੈ।",
    totalNeg: "{name} ਦੇ {amt} ਵੱਧ ਜਮ੍ਹਾ ਹਨ।",
    which: "ਕਿਹੜਾ {first}? {list}?",
    or: " ਜਾਂ ",
    unknown: "{name} ਨਾਂ ਦਾ ਖਾਤਾ ਨਹੀਂ ਮਿਲਿਆ।",
    nothing: "ਠੀਕ ਕਰਨ ਲਈ ਕੋਈ ਐਂਟਰੀ ਨਹੀਂ ਹੈ।",
    today: "ਅੱਜ {amt} ਉਧਾਰ ਗਿਆ, {count} ਐਂਟਰੀਆਂ।",
    help: "ਸਮਝ ਨਹੀਂ ਆਇਆ। ਇੰਝ ਬੋਲੋ: ਰਮੇਸ਼ ਦਾ ਤਿੰਨ ਸੌ ਚਾਲੀ ਉਧਾਰ।",
  },
};

const pack = (lang: string): Pack => PACKS[lang] ?? PACKS["hi-IN"];

// Indian grouping: 1,25,000
export function money(n: number): string {
  const s = String(Math.abs(Math.round(n)));
  const head = s.slice(0, -3);
  const grouped = head ? head.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + s.slice(-3) : s;
  return "₹" + grouped;
}

function fill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

function balancePhrase(p: Pack, name: string | null, bal: number): string {
  const amt = money(bal);
  if (name === null) return bal > 0 ? fill(p.bal, { amt }) : bal === 0 ? p.balZero : fill(p.balNeg, { amt });
  return bal > 0
    ? fill(p.total, { name, amt })
    : bal === 0
      ? fill(p.totalZero, { name })
      : fill(p.totalNeg, { name, amt });
}

export function say(reply: Reply, lang: string): string {
  const p = pack(lang);
  switch (reply.key) {
    case "added": {
      const lines = reply.items.map((it) =>
        fill(it.direction === "credit" ? p.cr : p.pay, { name: it.name, amt: money(it.amount) }),
      );
      const last = new Map<string, number>();
      for (const it of reply.items) last.set(it.name, it.balance);
      const single = last.size === 1;
      for (const [name, bal] of last) lines.push(balancePhrase(p, single ? null : name, bal));
      return lines.join(" ");
    }
    case "corrected": {
      const line = fill(reply.direction === "credit" ? p.crS : p.payS, { name: reply.name, amt: money(reply.amount) });
      return `${p.fixed} ${line} ${balancePhrase(p, null, reply.balance)}`;
    }
    case "total":
      return balancePhrase(p, reply.name, reply.balance);
    case "today":
      return fill(p.today, { amt: money(reply.amount), count: reply.count });
    case "which": {
      const first = (reply.names[0] ?? "").split(" ")[0];
      return fill(p.which, { first, list: reply.names.join(p.or) });
    }
    case "unknown":
      return fill(p.unknown, { name: reply.name });
    case "nothing_to_fix":
      return p.nothing;
    case "help":
      return p.help;
  }
}

export function greeting(lang: string): string {
  return pack(lang).greeting;
}
