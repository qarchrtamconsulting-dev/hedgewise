"use client";
// Taking a bet off the books. Void keeps the play in history (a push, or a promo that didn't happen);
// Delete is only for a bet that was never actually placed, and removes it with its bets and loan entries.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Leg, Play } from "@/lib/db";
import { syncSelfHedgeReturns } from "@/lib/settle";

export async function setPlayStatus(db: SupabaseClient, play: Play, legs: Leg[], status: "open" | "void") {
  if (status === "open") await db.from("legs").update({ result: "pending" }).eq("play_id", play.id);
  const { error } = await db.from("plays").update({ status, settled_on: null }).eq("id", play.id);
  if (error) throw error;
  try { await db.from("plays").update({ withdrawal: null, withdrawal_amount: null }).eq("id", play.id); } catch {}
  // Reopen: undo any self-hedge payout; void: refund the self-hedge stake.
  const voided: Record<string, Leg["result"]> = {};
  legs.forEach(l => { voided[l.id] = "void"; });
  await syncSelfHedgeReturns(db, play, legs, status === "void" ? voided : null);
}

/** Only for bets that never went in: open or sent plays. Settled plays get voided (or reopened first). */
export const canDelete = (play: Pick<Play, "status">) => play.status === "open" || play.status === "sent";

export async function deletePlay(db: SupabaseClient, play: Play) {
  if (!canDelete(play)) throw new Error("Settled plays can't be deleted. Void it, or reopen it first.");
  await db.from("capital_movements").delete().eq("play_id", play.id);   // its loan entries
  const { error } = await db.from("plays").delete().eq("id", play.id);
  if (error) throw error;
}
