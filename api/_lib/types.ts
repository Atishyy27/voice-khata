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
}

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
