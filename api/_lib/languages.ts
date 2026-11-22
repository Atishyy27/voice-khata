export type Tier = "native" | "beta" | "experimental";
export type LangCode = string;

export interface Lang {
  code: string;
  native: string;
  tier: Tier;
  via: string;
  script: string;
  score?: number;
}

export const LANGS: Lang[] = [
  { code: "hi-IN", native: "हिन्दी", tier: "native", via: "hi-IN", script: "Devanagari" },
  { code: "en-IN", native: "English", tier: "native", via: "en-IN", script: "Latin" },
  { code: "bn-IN", native: "বাংলা", tier: "native", via: "bn-IN", script: "Bengali" },
  { code: "mr-IN", native: "मराठी", tier: "native", via: "mr-IN", script: "Devanagari" },
  { code: "ta-IN", native: "தமிழ்", tier: "native", via: "ta-IN", script: "Tamil" },
  { code: "te-IN", native: "తెలుగు", tier: "native", via: "te-IN", script: "Telugu" },
  { code: "gu-IN", native: "ગુજરાતી", tier: "native", via: "gu-IN", script: "Gujarati" },
  { code: "kn-IN", native: "ಕನ್ನಡ", tier: "native", via: "kn-IN", script: "Kannada" },
  { code: "ml-IN", native: "മലയാളം", tier: "native", via: "ml-IN", script: "Malayalam" },
  { code: "pa-IN", native: "ਪੰਜਾਬੀ", tier: "native", via: "pa-IN", script: "Gurmukhi" },
  { code: "or-IN", native: "ଓଡ଼ିଆ", tier: "beta", via: "bn-IN", script: "Odia", score: 90 },
  { code: "ur-IN", native: "اردو", tier: "beta", via: "hi-IN", script: "Devanagari", score: 87 },
  { code: "bho-IN", native: "भोजपुरी", tier: "beta", via: "hi-IN", script: "Devanagari", score: 83 },
  { code: "mai-IN", native: "मैथिली", tier: "beta", via: "hi-IN", script: "Devanagari", score: 69 },
  { code: "kok-IN", native: "कोंकणी", tier: "beta", via: "mr-IN", script: "Devanagari", score: 64 },
  { code: "ks-IN", native: "कॉशुर", tier: "beta", via: "hi-IN", script: "Devanagari", score: 58 },
  { code: "sat-IN", native: "संताली", tier: "beta", via: "hi-IN", script: "Devanagari", score: 58 },
  { code: "tcy-IN", native: "ತುಳು", tier: "beta", via: "kn-IN", script: "Kannada", score: 56 },
  { code: "ne-IN", native: "नेपाली", tier: "beta", via: "hi-IN", script: "Devanagari", score: 55 },
  { code: "sd-IN", native: "सिन्धी", tier: "beta", via: "hi-IN", script: "Devanagari", score: 52 },
  { code: "as-IN", native: "অসমীয়া", tier: "beta", via: "bn-IN", script: "Bengali-Assamese", score: 50 },
  { code: "doi-IN", native: "डोगरी", tier: "experimental", via: "hi-IN", script: "Devanagari", score: 42 },
  { code: "mni-IN", native: "মৈতৈলোন্", tier: "experimental", via: "bn-IN", script: "Bengali", score: 30 },
  { code: "sa-IN", native: "संस्कृतम्", tier: "experimental", via: "hi-IN", script: "Devanagari", score: 17 },
  { code: "brx-IN", native: "बड़ो", tier: "experimental", via: "hi-IN", script: "Devanagari", score: 8 },
];

const BY_CODE = new Map(LANGS.map((l) => [l.code, l]));

export function isLang(code: unknown): boolean {
  return typeof code === "string" && BY_CODE.has(code);
}

export function langInfo(code: string): Lang {
  return BY_CODE.get(code) ?? BY_CODE.get("hi-IN")!;
}

export function viaLocale(code: string): string {
  return langInfo(code).via;
}
