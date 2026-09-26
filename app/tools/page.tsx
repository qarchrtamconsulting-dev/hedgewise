"use client";
import { useEffect, useState } from "react";
import LowHoldFinder from "@/components/LowHold";
import FreeBetFinder from "@/components/FreeBetFinder";
import RiskFreeFinder from "@/components/RiskFreeFinder";
import ProfitBoostFinder from "@/components/ProfitBoostFinder";
import { PresetState, ToolKey, readShareParams } from "@/lib/presets";

const TOOLS: readonly (readonly [ToolKey, string])[] = [
  ["lowhold", "Low Hold"],
  ["freebet", "Free Bet"],
  ["riskfree", "Risk Free"],
  ["boost", "Profit Boost"],
];

export default function ToolsPage() {
  const [tool, setTool] = useState<ToolKey>("lowhold");
  const [shared, setShared] = useState<{ tool: ToolKey; state: PresetState; name?: string } | null>(null);
  const [linkKey, setLinkKey] = useState(0);

  // Open a shared link: /tools?tool=freebet&s=<preset>
  useEffect(() => {
    const { tool: t, state, name } = readShareParams(window.location.search);
    if (t) setTool(t);
    if (t && state) {
      setShared({ tool: t, state, name });
      setLinkKey(k => k + 1);
    }
  }, []);

  const initialFor = (t: ToolKey) => (shared && shared.tool === t ? shared.state : undefined);
  const nameFor = (t: ToolKey) => (shared && shared.tool === t ? shared.name : undefined);

  const pick = (t: ToolKey) => {
    setTool(t);
    window.history.replaceState(null, "", `/tools?tool=${t}`);
  };

  return (
    <div>
      <div className="tab-bar" style={{ marginBottom: 20 }}>
        {TOOLS.map(([k, l]) => (
          <button key={k} className={`tab${tool === k ? " active" : ""}`} onClick={() => pick(k)}>{l}</button>
        ))}
      </div>
      {tool === "lowhold" && <LowHoldFinder key={`lh${linkKey}`} initial={initialFor("lowhold")} initialName={nameFor("lowhold")} />}
      {tool === "freebet" && <FreeBetFinder key={`fb${linkKey}`} initial={initialFor("freebet")} initialName={nameFor("freebet")} />}
      {tool === "riskfree" && <RiskFreeFinder key={`rf${linkKey}`} initial={initialFor("riskfree")} initialName={nameFor("riskfree")} />}
      {tool === "boost" && <ProfitBoostFinder key={`pb${linkKey}`} initial={initialFor("boost")} initialName={nameFor("boost")} />}
    </div>
  );
}
