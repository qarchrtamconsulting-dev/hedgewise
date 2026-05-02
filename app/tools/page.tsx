"use client";
import { useState } from "react";
import { FreeBetCalc, RiskFreeCalc, BoostCalc } from "@/components/Calculators";
import LowHold from "@/components/LowHold";

export default function ToolsPage() {
  const [tool, setTool] = useState<"lowhold"|"freebet"|"riskfree"|"boost">("lowhold");

  return (
    <div>
      <div className="tab-bar" style={{marginBottom:20}}>
        {([
          ["lowhold","⚡ Low Hold"],
          ["freebet","Free Bet"],
          ["riskfree","Risk Free"],
          ["boost","Profit Boost"],
        ] as const).map(([k,l])=>(
          <button key={k} className={`tab${tool===k?" active":""}`} onClick={()=>setTool(k)}>{l}</button>
        ))}
      </div>
      <div style={{maxWidth: tool==="lowhold" ? "100%" : 480}}>
        {tool==="lowhold" && <LowHold />}
        {tool==="freebet" && <FreeBetCalc />}
        {tool==="riskfree" && <RiskFreeCalc />}
        {tool==="boost" && <BoostCalc />}
      </div>
    </div>
  );
}
