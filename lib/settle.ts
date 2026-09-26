"use client";
import { Leg, Play, today } from "@/lib/db";

export type Winner = "promo" | "hedge" | "void";

/**
 * Self hedge loan math: the stake went on the loan when the bet was placed.
 * If your self hedge wins, the whole payout comes off the loan; if it loses, the loan stays.
 * A void refunds the stake. Only applies to plays whose self hedge was logged here
 * (imported plays already have their loan baked into the opening balance).
 */
export async function syncSelfHedgeReturns(db: any, play: Play, legs: Leg[], results: Record<string, Leg["result"]> | null) {
  const { data: stakes } = await db.from("capital_movements").select("id").eq("play_id", play.id).eq("type", "self_hedge_stake");
  if (!stakes || stakes.length === 0) return;
  await db.from("capital_movements").delete().eq("play_id", play.id).eq("type", "self_hedge_return");
  if (!results) return;
  const rows = legs.filter(l => l.self_hedge).flatMap(l => {
    const r = results[l.id];
    const amount = r === "won" ? Number(l.payout) : r === "void" ? Number(l.cash_stake) : 0;
    return amount > 0 ? [{
      client_id: play.client_id, play_id: play.id, type: "self_hedge_return", amount: Math.round(amount * 100) / 100,
      date: today(), notes: `${l.book || "Self hedge"} ${r === "won" ? "won" : "voided"}${l.selection ? `: ${l.selection}` : ""}`,
    }] : [];
  });
  if (rows.length) {
    const { error } = await db.from("capital_movements").insert(rows);
    if (error) throw error;
  }
}

/**
 * Settle a play: mark each pair's winner, close the play, apply the self-hedge
 * loan math, and queue a withdrawal when a bet in the client's account won.
 */
export async function settlePlay(db: any, play: Play, legs: Leg[], winners: Record<number, Winner>, manualProfit: number | null = null) {
  const results: Record<string, Leg["result"]> = {};
  for (const l of legs) {
    const w = winners[l.seq] || "promo";
    const result = w === "void" ? "void" : l.side === w ? "won" : "lost";
    results[l.id] = result;
    if (result !== l.result) {
      const { error } = await db.from("legs").update({ result }).eq("id", l.id);
      if (error) throw error;
    }
  }
  const patch: any = { status: "settled", settled_on: play.settled_on || today() };
  if (manualProfit != null) patch.profit_override = manualProfit;
  const { error } = await db.from("plays").update(patch).eq("id", play.id);
  if (error) throw error;
  await syncSelfHedgeReturns(db, play, legs, results);

  // Withdrawal queue (needs the withdrawal columns; skipped quietly if they aren't there yet)
  const toWithdraw = legs.filter(l => results[l.id] === "won" && !l.self_hedge && Number(l.payout) > 0)
    .reduce((t, l) => t + Number(l.payout), 0);
  try {
    const { data } = await db.from("plays").select("withdrawal").eq("id", play.id).single();
    const cur = data?.withdrawal;
    if (toWithdraw > 0 && (!cur || cur === "skipped")) {
      await db.from("plays").update({ withdrawal: "pending", withdrawal_amount: Math.round(toWithdraw * 100) / 100, withdrawal_updated_at: new Date().toISOString() }).eq("id", play.id);
    } else if (toWithdraw === 0 && cur === "pending") {
      await db.from("plays").update({ withdrawal: null, withdrawal_amount: null }).eq("id", play.id);
    }
  } catch {}
  return results;
}
