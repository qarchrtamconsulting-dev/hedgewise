"use client";
import { useState } from "react";
import LowHoldFinder from "@/components/LowHold";
import FreeBetFinder from "@/components/FreeBetFinder";
import RiskFreeFinder from "@/components/RiskFreeFinder";
import ProfitBoostFinder from "@/components/ProfitBoostFinder";

export default function ToolsPage() {
  const [tool, setTool] = useState<"lowhold" | "freebet" | "riskfree" | "boost">("lowhold");

  return (
    <div>
      <div className="tab-bar" style={{ marginBottom: 20 }}>
        {([
          ["lowhold", "⚡ Low Hold"],
          ["freebet", "🎟 Free Bet"],
          ["riskfree", "🛡 Risk Free"],
          ["boost", "🚀 Profit Boost"],
        ] as const).map(([k, l]) => (
          <button key={k} className={`tab${tool === k ? " active" : ""}`} onClick={() => setTool(k)}>{l}</button>
        ))}
      </div>
      {tool === "lowhold" && <LowHoldFinder />}
      {tool === "freebet" && <FreeBetFinder />}
      {tool === "riskfree" && <RiskFreeFinder />}
      {tool === "boost" && <ProfitBoostFinder />}
    </div>
  );
}
