"use client";
import { useState } from "react";
import FinderShell from "./FinderShell";
import GameCard from "./GameCard";
import { useGameFinder, FinderConfig } from "./useGameFinder";
import { USDInput, Slider } from "./ui";
import PresetBar from "./PresetBar";
import { PresetState, defaultPreset } from "@/lib/presets";
import { fmt } from "@/lib/constants";

export default function RiskFreeFinder({ initial, initialName }: { initial?: PresetState; initialName?: string }) {
  const start = initial || defaultPreset("riskfree");
  const [promoAmt, setPromoAmt] = useState<string>(String(start.inputs.amount ?? "500"));
  const [refundConv, setRefundConv] = useState<number>(Number(start.inputs.conv ?? 65));
  const [config, setConfig] = useState<FinderConfig>(start.config);
  const finder = useGameFinder();
  const current: PresetState = { config, inputs: { amount: promoAmt, conv: refundConv } };
  const apply = (p: PresetState) => {
    setConfig(p.config);
    if (p.inputs.amount !== undefined) setPromoAmt(String(p.inputs.amount));
    if (p.inputs.conv !== undefined) setRefundConv(Number(p.inputs.conv));
    finder.fetchGames(p.config);   // load games for the preset right away
  };

  const amt = parseFloat(promoAmt);
  const conv = refundConv / 100;

  return (
    <FinderShell
      title="Risk Free Bet Finder"
      presetBar={<PresetBar tool="riskfree" current={current} apply={apply} initialName={initialName} />}
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
            <span className="label">Promo amount</span>
            <USDInput value={promoAmt} set={setPromoAmt} placeholder="500.00" />
            <div className="hint">
              Real-money stake. If it loses, the book refunds it as bonus credit.
            </div>
          </div>
          <Slider label="Refund conversion" value={refundConv} set={setRefundConv} />
        </>
      }
      score={(g) => { const w = g.fixedDecimal - 1; const h = (w - conv + 1) / g.hedgeDecimal; return -Math.min(w - h, conv - 1 + h * (g.hedgeDecimal - 1)); }}
      renderGame={(g, rank) => {
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
            key={g.key}
            game={g}
            rank={rank}
            fixedBookName={config.fixedBook}
            fixedStake={amt || 0}
            hedgeStake={Math.max(0, hedgeStake)}
            fixedTag="Risk-free"
            metric={{ label: "Locked in", value: `${Math.min(winNet, lossNet) >= 0 ? "+" : "−"}$${Math.abs(Math.min(winNet, lossNet)).toFixed(2)}`, tone: Math.min(winNet, lossNet) >= 0 ? "pos" : "neg" }}
            outcomes={[
              { label: `${g.fixedTeam} ${g.family === "ml" ? "win" : "hits"}`, value: winNet },
              { label: `${g.hedgeTeam} ${g.family === "ml" ? "win" : "hits"} (refund)`, value: lossNet },
            ]}
            details={[{ label: "Refund valued at", value: `${refundConv}%` }]}
            ticket={{ type: "Risk Free", amount: amt || 0, fixedStake: amt || 0, hedgeStake: Math.max(0, hedgeStake), expected: Math.min(winNet, lossNet), fixedNote: "risk-free bet", fixedPayout: (amt || 0) * g.fixedDecimal, hedgePayout: Math.max(0, hedgeStake) * g.hedgeDecimal }}
          />
        );
      }}
    />
  );
}
