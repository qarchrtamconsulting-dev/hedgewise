"use client";
import { useState } from "react";
import FinderShell from "./FinderShell";
import GameCard from "./GameCard";
import { useGameFinder, FinderConfig } from "./useGameFinder";
import { USDInput, Slider } from "./ui";
import { fmt } from "@/lib/constants";

export default function RiskFreeFinder() {
  const [promoAmt, setPromoAmt] = useState("500");
  const [refundConv, setRefundConv] = useState(70);
  const [config, setConfig] = useState<FinderConfig>({
    fixedBook: "FanDuel",
    leagues: ["NBA", "MLB"],
    hedgeBooks: ["DraftKings", "BetMGM", "Caesars"],
    fixedMinAmerican: "+200",   // longshot side maximizes refund value
    fixedMaxAmerican: "+1000",
    hideLive: true,
  });
  const finder = useGameFinder();

  const amt = parseFloat(promoAmt);
  const conv = refundConv / 100;

  return (
    <FinderShell
      title="Risk Free Bet Finder"
      accent="#b388ff"
      config={config}
      setConfig={setConfig}
      games={finder.games}
      loading={finder.loading}
      error={finder.error}
      updated={finder.updated}
      callsLeft={finder.callsLeft}
      cached={finder.cached}
      onFetch={() => finder.fetchGames(config)}
      inputs={
        <>
          <div className="card">
            <span className="label">Promo Amount *</span>
            <USDInput value={promoAmt} set={setPromoAmt} placeholder="500.00" />
            <div style={{ color: "#444", fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
              You bet this amount real money. If it loses, you get a refund as bonus.
            </div>
          </div>
          <Slider label="Refund Conversion %" value={refundConv} set={setRefundConv} />
        </>
      }
      renderGame={(g) => {
        // Risk free math:
        // Win scenario: stake real $amt at fixed odds → profit = amt*(d1-1), but hedge loses
        // Loss scenario: get refund worth amt*conv as bonus, hedge wins
        // We size hedge so both outcomes equal: hedge_stake * (hd-1) = amt*(d1-1) - hedge_stake (worst-case match)
        // Common approach: hedge to equalize win/loss outcomes after refund value
        const winProfit = amt * (g.fixedDecimal - 1);
        const refundValue = amt * conv;
        // hedge stake to make win-side and loss-side EV equal:
        // win: winProfit - hedgeStake = X
        // lose: refundValue - amt + hedgeStake*(hd-1) = X  (we lose the $amt, but get refundValue back as bonus)
        // → winProfit - hedgeStake = refundValue - amt + hedgeStake*(hd-1)
        // → hedgeStake * hd = winProfit - refundValue + amt
        const hedgeStake = (winProfit - refundValue + amt) / g.hedgeDecimal;
        const winNet = winProfit - hedgeStake;
        const lossNet = refundValue - amt + hedgeStake * (g.hedgeDecimal - 1);

        return (
          <GameCard
            key={g.id}
            game={g}
            fixedBookName={config.fixedBook}
            stats={[
              { label: "Real Stake", value: fmt(amt || 0) },
              { label: "Hedge Stake", value: fmt(Math.max(0, hedgeStake)), color: "#ffd60a" },
              { label: "If Win", value: `${winNet >= 0 ? "+" : ""}${fmt(winNet)}`, color: winNet >= 0 ? "#39ff14" : "#ff4444" },
              { label: "If Lose (refund)", value: `${lossNet >= 0 ? "+" : ""}${fmt(lossNet)}`, color: lossNet >= 0 ? "#39ff14" : "#ff4444" },
            ]}
            showHold={false}
          />
        );
      }}
    />
  );
}
