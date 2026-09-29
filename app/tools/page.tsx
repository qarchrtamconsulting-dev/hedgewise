"use client";
import { useEffect, useState } from "react";
import LowHoldFinder from "@/components/LowHold";
import FreeBetFinder from "@/components/FreeBetFinder";
import RiskFreeFinder from "@/components/RiskFreeFinder";
import SiteCreditFinder from "@/components/SiteCreditFinder";
import ProfitBoostFinder from "@/components/ProfitBoostFinder";
import { PresetState, ToolKey, defaultPreset, hedgesFor, readShareParams } from "@/lib/presets";
import { ODDS_BOOKS } from "@/lib/constants";
import Link from "next/link";
import { getDb } from "@/lib/db";


/** A tool's standard setup, with the fixed book swapped for the one picked on the Board. */
const forBook = (t: ToolKey, book: string): PresetState => {
  const d = defaultPreset(t);
  return { config: { ...d.config, fixedBook: book, hedgeBooks: hedgesFor(book) }, inputs: d.inputs };
};

const TOOLS: readonly (readonly [ToolKey, string])[] = [
  ["lowhold", "Low Hold"],
  ["freebet", "Free Bet"],
  ["riskfree", "Risk Free"],
  ["boost", "Profit Boost"],
  ["credit", "Site Credit"],
];

export default function ToolsPage() {
  const [tool, setTool] = useState<ToolKey>("lowhold");
  const [shared, setShared] = useState<{ tool: ToolKey; state: PresetState; name?: string } | null>(null);
  const [linkKey, setLinkKey] = useState(0);
  const [book, setBook] = useState<string | null>(null);
  const [forClient, setForClient] = useState<{ id: string; name: string } | null>(null);

  // Came here for a client (/tools?client=ID): say who, so Send and Log start with them picked.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("client");
    if (!id) return;
    (async () => {
      try {
        const { data } = await (await getDb()).from("clients").select("id,name").eq("id", id).maybeSingle();
        if (data) setForClient(data as { id: string; name: string });
      } catch {}
    })();
  }, []);

  // Open a shared link: /tools?tool=freebet&s=<preset>
  useEffect(() => {
    const { tool: t, state, name } = readShareParams(window.location.search);
    if (t) setTool(t);
    // From the Board: /tools?client=ID&book=FanDuel opens every finder on that book.
    const b = new URLSearchParams(window.location.search).get("book");
    if (b && ODDS_BOOKS.includes(b) && !state) { setBook(b); setLinkKey(k => k + 1); }
    if (t && state) {
      setShared({ tool: t, state, name });
      setLinkKey(k => k + 1);
    }
  }, []);

  const initialFor = (t: ToolKey) => (shared && shared.tool === t ? shared.state : book ? forBook(t, book) : undefined);
  const nameFor = (t: ToolKey) => (shared && shared.tool === t ? shared.name : undefined);

  const pick = (t: ToolKey) => {
    setTool(t);
    const client = new URLSearchParams(window.location.search).get("client");
    window.history.replaceState(null, "", `/tools?tool=${t}${client ? `&client=${encodeURIComponent(client)}` : ""}${book ? `&book=${encodeURIComponent(book)}` : ""}`);
  };

  return (
    <div>
      {forClient && (
        <div className="card for-bar">
          <span style={{ fontSize: 14 }}><span className="task-sub">For </span><b>{forClient.name}</b><span className="task-sub"> · Send and Log start with them picked</span></span>
          <span style={{ display: "flex", gap: 12, fontSize: 13 }}>
            <Link href={`/clients/${forClient.id}`}>Their page</Link>
            <a href="/tools" onClick={() => setForClient(null)}>Clear</a>
          </span>
        </div>
      )}
      <div className="tab-bar" style={{ marginBottom: 20 }}>
        {TOOLS.map(([k, l]) => (
          <button key={k} className={`tab${tool === k ? " active" : ""}`} onClick={() => pick(k)}>{l}</button>
        ))}
      </div>
      {tool === "lowhold" && <LowHoldFinder key={`lh${linkKey}`} initial={initialFor("lowhold")} initialName={nameFor("lowhold")} />}
      {tool === "freebet" && <FreeBetFinder key={`fb${linkKey}`} initial={initialFor("freebet")} initialName={nameFor("freebet")} />}
      {tool === "riskfree" && <RiskFreeFinder key={`rf${linkKey}`} initial={initialFor("riskfree")} initialName={nameFor("riskfree")} />}
      {tool === "boost" && <ProfitBoostFinder key={`pb${linkKey}`} initial={initialFor("boost")} initialName={nameFor("boost")} />}
      {tool === "credit" && <SiteCreditFinder key={`sc${linkKey}`} initial={initialFor("credit")} initialName={nameFor("credit")} />}
    </div>
  );
}
