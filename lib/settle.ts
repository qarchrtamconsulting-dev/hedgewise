"use client";
// Browser side of settling: same rules as lib/settle-core.ts, dated today in your time zone.
import { Leg, Play, today } from "@/lib/db";
import { settlePlayCore, syncSelfHedgeReturns as syncCore } from "@/lib/settle-core";
import type { Winner } from "@/lib/settle-core";

export { isRiskFree, staysOpen, waitingOnSecondLeg } from "@/lib/settle-core";
export type { Winner } from "@/lib/settle-core";

export function syncSelfHedgeReturns(db: any, play: Play, legs: Leg[], results: Record<string, Leg["result"]> | null) {
  return syncCore(db, play, legs, results, today());
}

/**
 * Settle a play: mark each pair's winner, close the play, apply the self-hedge
 * loan math, and queue a withdrawal when a bet in the client's account won.
 * Risk-free plays whose promo leg lost stay open for the second leg unless forced.
 */
export function settlePlay(db: any, play: Play, legs: Leg[], winners: Record<number, Winner>, manualProfit: number | null = null,
  opts: { force?: boolean } = {}) {
  return settlePlayCore(db, play, legs, winners, { date: today(), manualProfit, force: opts.force });
}
