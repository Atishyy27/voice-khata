export type Direction = "credit" | "payment"; // credit = udhaar given to customer, payment = customer paid (jama)

export interface Entry {
  id: string;
  name: string;
  nameKey: string;
  amount: number;
  direction: Direction;
  date: string; // YYYY-MM-DD
  at: string; // ISO
  note?: string;
  book?: "khata";
}

export interface Split {
  with: string;
  myShare: number;
}

export interface Expense {
  id: string;
  book: "kharcha";
  item: string;
  category: string;
  amount: number;
  date: string; // YYYY-MM-DD
  at: string; // ISO
  note?: string;
  split?: Split;
}

export type KharchaKind = "add" | "correct" | "query_today" | "query_month" | "query_category" | "other";

export interface KharchaItem {
  item: string;
  amount: number;
  category: string;
  dayOffset: number;
  note?: string;
  split?: Split;
}

export interface KharchaIntent {
  kind: KharchaKind;
  items?: KharchaItem[];
  fix?: { item?: string; amount?: number; category?: string };
  category?: string;
}

export type KharchaOp = { op: "add"; entry: Expense } | { op: "update"; id: string; patch: Partial<Expense> };

export type KharchaReply =
  | { key: "kh_added"; items: { item: string; amount: number; myShare?: number; with?: string }[]; todayTotal: number }
  | { key: "kh_corrected"; item: string; amount: number; todayTotal: number }
  | { key: "kh_today"; amount: number; count: number }
  | { key: "kh_month"; amount: number; count: number }
  | { key: "kh_category"; category: string; amount: number }
  | { key: "kh_nothing" }
  | { key: "kh_help" };

export interface ParsedEntry {
  name: string;
  nameKey: string;
  amount: number;
  direction: Direction;
  dayOffset: number; // 0 today, -1 kal (yesterday), -2 parso
  note?: string;
}

export type IntentKind = "add" | "correct" | "query_total" | "query_today" | "clarify_answer" | "other";

export interface Intent {
  kind: IntentKind;
  entries?: ParsedEntry[];
  fix?: { amount?: number; name?: string; nameKey?: string; direction?: Direction };
  name?: string;
  nameKey?: string;
}

export interface Customer {
  nameKey: string;
  name: string;
}

export type Op = { op: "add"; entry: Entry } | { op: "update"; id: string; patch: Partial<Entry> };

export interface Pending {
  intent: Intent;
  candidates: Customer[];
}

export interface SessionState {
  entries: Entry[];
  lastIds: string[];
  pending?: Pending;
}

export type Reply =
  | { key: "added"; items: { name: string; amount: number; direction: Direction; balance: number }[] }
  | { key: "corrected"; name: string; amount: number; direction: Direction; balance: number }
  | { key: "total"; name: string; balance: number }
  | { key: "today"; amount: number; count: number }
  | { key: "which"; names: string[] }
  | { key: "unknown"; name: string }
  | { key: "nothing_to_fix" }
  | { key: "help" };

export interface TurnResult {
  ops: Op[];
  reply: Reply;
  state: SessionState;
}
