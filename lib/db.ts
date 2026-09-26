"use client";
import type { SupabaseClient } from "@supabase/supabase-js";

// Loaded lazily so a missing env var shows a message instead of crashing the page.
let cached: SupabaseClient | null = null;
export async function getDb(): Promise<SupabaseClient> {
  if (cached) return cached;
  const { supabase } = await import("@/lib/supabase");
  cached = supabase;
  return supabase;
}

/** Supabase returns at most 1000 rows per request; this pages through everything. */
export async function fetchAll<T = any>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const size = 1000;
  let from = 0;
  const out: T[] = [];
  for (;;) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < size) break;
    from += size;
  }
  return out;
}

// ─── Shapes ────────────────────────────────────────────────────
export interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  state: string | null;
  split: number | null;
  status: string | null;
  referred_by: string | null;
  notes: string | null;
  approved_books: string[] | null;
}

export interface ClientSummary {
  client_id: string;
  open_plays: number;
  settled_plays: number;
  profit: number;
  client_share: number;
  your_share: number;
  received: number;
  loan_outstanding: number;
  last_play: string | null;
}

export interface Play {
  id: string;
  client_id: string;
  promo: string | null;
  promo_type: string | null;
  book: string | null;
  status: "open" | "settled" | "void";
  placed_on: string | null;
  settled_on: string | null;
  split_override: number | null;
  client_share_override: number | null;
  profit_override: number | null;
  loan_amount: number | null;
  notes: string | null;
  legacy_row: number | null;
  withdrawal?: "pending" | "requested" | "received" | "skipped" | null;
  withdrawal_amount?: number | null;
  withdrawal_updated_at?: string | null;
  profit?: number;
  client_share?: number;
}

export interface Leg {
  id: string;
  play_id: string;
  seq: number;
  side: "promo" | "hedge";
  book: string | null;
  self_hedge: boolean;
  selection: string | null;
  odds: string | null;
  cash_stake: number;
  credit_stake: number;
  payout: number;
  result: "pending" | "won" | "lost" | "void";
  event_time: string | null;
}

export type MoveType = "sent_to_client" | "received_from_client" | "self_hedge_stake" | "self_hedge_return" | "opening_balance";
export interface Movement { id: string; client_id: string; play_id: string | null; date: string | null; type: MoveType; amount: number; notes: string | null; }
export interface Settlement { id: string; client_id: string; date: string | null; amount: number; method: string | null; notes: string | null; }

export const MOVE_LABEL: Record<MoveType, string> = {
  sent_to_client: "Sent to client",
  received_from_client: "Returned by client",
  self_hedge_stake: "Self hedge placed",
  self_hedge_return: "Self hedge paid out",
  opening_balance: "Opening balance",
};
/** Loan direction, from the AS6 notes: sending money / self hedging increases the loan. */
export const MOVE_SIGN: Record<MoveType, 1 | -1> = {
  sent_to_client: 1, self_hedge_stake: 1, opening_balance: 1,
  received_from_client: -1, self_hedge_return: -1,
};

export const PLAY_TYPES = ["Free Bet", "Risk Free", "Profit Boost", "Low Hold", "Bet Match", "Deposit Match", "Casino", "Bonus", "Other"];

// ─── Money formatting ──────────────────────────────────────────
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const money = (n: number | null | undefined) => usd.format(Number(n) || 0);
export const money0 = (n: number | null | undefined) => usd0.format(Number(n) || 0);
export const pct = (n: number | null | undefined) => `${Math.round((Number(n) || 0) * 1000) / 10}%`;
export const tone = (n: number) => (n > 0.005 ? "var(--pos)" : n < -0.005 ? "var(--neg)" : "var(--text-2)");
export const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
/** Local wall-clock time without a timezone, matching how game times are stored. */
export const localIso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);

/** Same formula as the database view and the AS6 sheet. */
export function playProfit(play: Play, legs: Leg[]) {
  if (play.profit_override != null) return Number(play.profit_override);
  const won = legs.filter(l => l.result === "won").reduce((s, l) => s + Number(l.payout || 0), 0);
  const cash = legs.reduce((s, l) => s + Number(l.cash_stake || 0), 0);
  return won - cash;
}
