"use client";
import { useState } from "react";
import { CheckList, Toggle, USDInput } from "./ui";
import { BOOKS, LEAGUES, BOOK_MAP, LEAGUE_SPORT, toDec, toAm, fmt, mkHold, holdColor } from "@/lib/constants";

interface Game {
  id: string; home: string; away: string; commence: string;
  fixedOdds: string; hedgeOdds: string;
  fd: number; hd: number;
  fixedTeam: string; hedgeTeam: string;
  hedgeBook: string; hold: number;
}

export default function LowHold() {
  const [fixedBook,setFixedBook]=useState("FanDuel");
  const [leagues,setLeagues]=useState<string[]>(["NBA","MLB"]);
  const [hedgeBooks,setHedgeBooks]=useState<string[]>(["DraftKings","BetMGM","Caesars"]);
  const [hideLive,setHideLive]=useState(false);
  const [minOdds,setMinOdds]=useState("-200");
  const [maxOdds,setMaxOdds]=useState("+1000");
  const [cashSize,setCashSize]=useState("100");
  const [games,setGames]=useState<Game[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [updated,setUpdated]=useState<string|null>(null);
  const [callsLeft,setCallsLeft]=useState<string|null>(null);
  const [sortBy,setSortBy]=useState<"hold"|"time">("hold");

  const fetchOdds = async () => {
    if (!fixedBook || !leagues.length || !hedgeBooks.length) {
      setError("Pick a Fixed Book, at least one League, and at least one Hedge Book.");
      return;
    }
    setLoading(true); setError(null); setGames([]);

    const fk = Object.entries(BOOK_MAP).find(([,v]) => v === fixedBook)?.[0];
    const hks = hedgeBooks.map(b => Object.entries(BOOK_MAP).find(([,v]) => v === b)?.[0]).filter(Boolean) as string[];
    const allKeys = [...new Set([fk, ...hks])].filter(Boolean) as string[];
    const sports = [...new Set(leagues.map(l => LEAGUE_SPORT[l]).filter(Boolean))];
    const minD = toDec(minOdds), maxD = toDec(maxOdds);
    const now = new Date();
    let raw: any[] = [];

    for (const sport of sports) {
      try {
        const res = await fetch(`/api/odds?sport=${sport}&bookmakers=${allKeys.join(",")}`);
        const j = await res.json();
        if (j.remaining) setCallsLeft(j.remaining);
        if (j.error) { setError(j.error); continue; }
        raw = [...raw, ...(j.data || [])];
      } catch (e: any) {
        setError(e.message);
      }
    }

    const results: Game[] = raw.map(game => {
      if (hideLive && new Date(game.commence_time) <= now) return null;
      const bo: Record<string, Record<string, number>> = {};
      (game.bookmakers||[]).forEach((bm: any) => {
        const h2h = bm.markets?.find((m: any) => m.key === "h2h");
        if (!h2h) return;
        h2h.outcomes.forEach((o: any) => { if (!bo[o.name]) bo[o.name] = {}; bo[o.name][bm.key] = o.price; });
      });
      const teams = Object.keys(bo);
      if (teams.length < 2) return null;
      const combos: any[] = [];
      [[teams[0],teams[1]],[teams[1],teams[0]]].forEach(([ft,ht]) => {
        const fd = bo[ft]?.[fk!]; if (!fd) return;
        if (minD && fd < minD) return;
        if (maxD && fd > maxD) return;
        const bests = hks.map(k => ({k, v: bo[ht]?.[k]})).filter(x => x.v);
        if (!bests.length) return;
        const best = bests.reduce((a,b) => b.v > a.v ? b : a);
        combos.push({ft, ht, fd, hd: best.v, hk: best.k, h: mkHold(fd, best.v)});
      });
      if (!combos.length) return null;
      const best = combos.sort((a,b) => a.h - b.h)[0];
      return {
        id: game.id, home: game.home_team, away: game.away_team, commence: game.commence_time,
        fixedOdds: toAm(best.fd), hedgeOdds: toAm(best.hd), fd: best.fd, hd: best.hd,
        fixedTeam: best.ft, hedgeTeam: best.ht,
        hedgeBook: BOOK_MAP[best.hk] || best.hk, hold: best.h,
      };
    }).filter(Boolean) as Game[];

    setGames(results.sort((a,b) => a.hold - b.hold));
    setUpdated(new Date().toLocaleTimeString());
    setLoading(false);
  };

  const sorted = [...games].sort((a,b) => sortBy === "hold" ? a.hold - b.hold : new Date(a.commence).getTime() - new Date(b.commence).getTime());
  const cash = parseFloat(cashSize);

  return (
    <div className="grid-2col" style={{display:"grid",gridTemplateColumns:"320px 1fr",gap:20,alignItems:"start"}}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div className="card">
          <span className="label">Cash Bet Size (per side)</span>
          <USDInput value={cashSize} set={setCashSize} placeholder="100.00" />
        </div>

        <div className="card">
          <span className="label">Select Fixed Book *</span>
          <select className="input" value={fixedBook} onChange={e=>setFixedBook(e.target.value)}>
            <option value="">Select a book...</option>
            {BOOKS.map(b=><option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <CheckList label="Select League(s)" options={LEAGUES} value={leagues} onChange={setLeagues} req />
        <CheckList label="Select Hedge Book(s)" options={BOOKS.filter(b=>b!==fixedBook)} value={hedgeBooks} onChange={setHedgeBooks} req />

        <div className="card" style={{display:"flex",flexDirection:"column",gap:14}}>
          <Toggle on={hideLive} set={setHideLive} label="Hide Live Games" />
        </div>

        <div className="card">
          <div style={{marginBottom:12}}>
            <span className="label">Fixed Book Min Odds</span>
            <input className="input" value={minOdds} onChange={e=>setMinOdds(e.target.value)} />
          </div>
          <div>
            <span className="label">Fixed Book Max Odds</span>
            <input className="input" value={maxOdds} onChange={e=>setMaxOdds(e.target.value)} />
          </div>
        </div>

        <button className="btn-primary" onClick={fetchOdds} disabled={loading}>
          {loading ? "⟳ Fetching..." : "⚡ Find Low Hold Games"}
        </button>

        {error && <div style={{color:"#ff4444",fontSize:12,padding:"8px 0",lineHeight:1.5}}>⚠ {error}</div>}
        {callsLeft && <div style={{color:"#444",fontSize:11,padding:"4px 0"}}>{callsLeft} API calls left this month</div>}
      </div>

      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{color:"#fff",fontWeight:700,fontSize:13}}>
            {games.length>0 ? `${games.length} games` : "Results"}
            {updated && <span style={{color:"#252545",fontSize:10,marginLeft:8}}>· {updated}</span>}
          </div>
          <div style={{display:"flex",gap:6}}>
            {(["hold","time"] as const).map(s=>(
              <button key={s} className="btn-ghost" onClick={()=>setSortBy(s)}
                style={{borderColor: sortBy===s?"#ffd60a":"#1a1a2e", color: sortBy===s?"#ffd60a":"#555"}}>
                {s==="hold"?"↓ Hold":"↓ Time"}
              </button>
            ))}
          </div>
        </div>

        {games.length===0 && !loading && (
          <div className="card" style={{textAlign:"center",padding:"80px 20px"}}>
            <div style={{fontSize:48,opacity:0.06,marginBottom:14}}>⚡</div>
            <div style={{color:"#1a1a35",fontSize:13}}>Pick books + leagues, then fetch live odds</div>
          </div>
        )}

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {sorted.map(g=>{
            // CORRECT MATH: Low hold qualifying loss
            // If you bet $cash on each side, total wagered = $cash * 2
            // If fixed wins: profit = cash*(fd-1), loss = cash → net = cash*(fd-1) - cash = cash*(fd-2)
            // If hedge wins: profit = cash*(hd-1), loss = cash → net = cash*(hd-1) - cash = cash*(hd-2)
            // The qualifying loss is the worse of the two (always negative when hold > 0)
            let qualLoss = null, totalWagered = null, fixedNet = null, hedgeNet = null;
            if (cash && g.fd && g.hd) {
              totalWagered = cash * 2;
              fixedNet = cash * (g.fd - 1) - cash;
              hedgeNet = cash * (g.hd - 1) - cash;
              qualLoss = Math.min(fixedNet, hedgeNet);
            }
            return (
              <div key={g.id} className="card" style={{borderColor:holdColor(g.hold)+"55"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:"#fff",fontWeight:700,fontSize:14,marginBottom:3}}>
                      {g.away} <span style={{color:"#1a1a35"}}>@</span> {g.home}
                    </div>
                    <div style={{color:"#1e1e38",fontSize:10,marginBottom:13}}>
                      {new Date(g.commence).toLocaleDateString()} · {new Date(g.commence).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                    </div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                      <div style={{background:"#05050f",borderRadius:8,padding:"9px 14px",border:"1px solid #0e0e20"}}>
                        <div style={{color:"#252545",fontSize:9,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>{fixedBook} · BET</div>
                        <div style={{color:"#00e5ff",fontWeight:800,fontSize:22}}>{g.fixedOdds}</div>
                        <div style={{color:"#1e1e38",fontSize:10,marginTop:3}}>{g.fixedTeam}</div>
                      </div>
                      <div style={{color:"#111",fontSize:18}}>+</div>
                      <div style={{background:"#05050f",borderRadius:8,padding:"9px 14px",border:"1px solid #0e0e20"}}>
                        <div style={{color:"#252545",fontSize:9,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>{g.hedgeBook} · HEDGE</div>
                        <div style={{color:"#b388ff",fontWeight:800,fontSize:22}}>{g.hedgeOdds}</div>
                        <div style={{color:"#1e1e38",fontSize:10,marginTop:3}}>{g.hedgeTeam}</div>
                      </div>
                    </div>
                    {qualLoss !== null && (
                      <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #14142a",display:"flex",gap:20,flexWrap:"wrap"}}>
                        <div>
                          <div style={{color:"#252545",fontSize:9,letterSpacing:1,textTransform:"uppercase"}}>Bet Each Side</div>
                          <div style={{color:"#fff",fontSize:14,fontWeight:700,marginTop:2}}>{fmt(cash)}</div>
                        </div>
                        <div>
                          <div style={{color:"#252545",fontSize:9,letterSpacing:1,textTransform:"uppercase"}}>Total Wagered</div>
                          <div style={{color:"#fff",fontSize:14,fontWeight:700,marginTop:2}}>{fmt(totalWagered!)}</div>
                        </div>
                        <div>
                          <div style={{color:"#252545",fontSize:9,letterSpacing:1,textTransform:"uppercase"}}>Qualifying Loss</div>
                          <div style={{color: qualLoss >= 0 ? "#39ff14" : "#ff9800", fontSize:14,fontWeight:700,marginTop:2}}>
                            {qualLoss >= 0 ? "+" : "-"}{fmt(qualLoss)}
                          </div>
                        </div>
                        <div>
                          <div style={{color:"#252545",fontSize:9,letterSpacing:1,textTransform:"uppercase"}}>If Fixed Wins</div>
                          <div style={{color: fixedNet! >= 0 ? "#39ff14" : "#ff4444", fontSize:13,fontWeight:600,marginTop:2}}>
                            {fixedNet! >= 0 ? "+" : "-"}{fmt(fixedNet!)}
                          </div>
                        </div>
                        <div>
                          <div style={{color:"#252545",fontSize:9,letterSpacing:1,textTransform:"uppercase"}}>If Hedge Wins</div>
                          <div style={{color: hedgeNet! >= 0 ? "#39ff14" : "#ff4444", fontSize:13,fontWeight:600,marginTop:2}}>
                            {hedgeNet! >= 0 ? "+" : "-"}{fmt(hedgeNet!)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{color:holdColor(g.hold),fontWeight:800,fontSize:30,lineHeight:1}}>{g.hold.toFixed(2)}%</div>
                    <div style={{color:"#1a1a35",fontSize:10,marginTop:3}}>hold</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
