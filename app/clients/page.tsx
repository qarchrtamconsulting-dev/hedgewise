"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { BOOKS, PROMO_TYPES, STAGES, fmt } from "@/lib/constants";

interface Promo {
  id: string; client_id: string; book: string; type: string;
  amount: number; status: string; profit: number; date: string; notes: string;
}
interface Client {
  id: string; name: string; phone: string; books: string[];
  loan_balance: number; total_profit: number; promos?: Promo[];
}

const statusColor = (s:string) => ({"Active":"#ffd60a","Graded - Win":"#39ff14","Graded - Loss":"#ff4444","Withdrawn":"#00e5ff","Pending":"#b388ff","Flagged":"#ff9800"} as any)[s] || "#555";
const tag = {background:"transparent",border:"1px solid #1a1a2e",borderRadius:4,color:"#444",fontSize:10,padding:"2px 7px",cursor:"pointer"};

export default function ClientsPage() {
  const [clients,setClients] = useState<Client[]>([]);
  const [loading,setLoading] = useState(true);
  const [sel,setSel] = useState<string|null>(null);
  const [showAdd,setShowAdd] = useState(false);
  const [showPromo,setShowPromo] = useState(false);
  const [nc,setNc] = useState({name:"",phone:"",books:[] as string[],loan_balance:""});
  const [np,setNp] = useState({book:"FanDuel",type:"Free Bet",amount:"",status:"Active",profit:"",date:new Date().toISOString().split("T")[0],notes:""});
  const [queue,setQueue] = useState<{type:string;msg:string}[]>([]);
  const [dbError,setDbError] = useState<string|null>(null);

  const load = async () => {
    setLoading(true);
    const { data: cs, error: e1 } = await supabase.from("clients").select("*").order("name");
    const { data: ps, error: e2 } = await supabase.from("promos").select("*").order("date", {ascending:false});
    if (e1 || e2) setDbError((e1?.message || e2?.message) || "Database error");
    if (cs) setClients(cs.map(c => ({...c, promos: ps?.filter((p:Promo) => p.client_id === c.id) || []})));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addClient = async () => {
    if (!nc.name) return;
    const { error } = await supabase.from("clients").insert({
      name: nc.name, phone: nc.phone, books: nc.books,
      loan_balance: parseFloat(nc.loan_balance) || 0, total_profit: 0,
    });
    if (error) { setDbError(error.message); return; }
    setNc({name:"",phone:"",books:[],loan_balance:""});
    setShowAdd(false);
    load();
  };

  const addPromo = async (cid: string) => {
    const { error } = await supabase.from("promos").insert({
      client_id: cid, book: np.book, type: np.type,
      amount: parseFloat(np.amount) || 0, status: np.status,
      profit: parseFloat(np.profit) || 0, date: np.date, notes: np.notes,
    });
    if (error) { setDbError(error.message); return; }
    setNp({book:"FanDuel",type:"Free Bet",amount:"",status:"Active",profit:"",date:new Date().toISOString().split("T")[0],notes:""});
    setShowPromo(false);
    load();
  };

  const grade = async (cid: string, pid: string, outcome: "win"|"loss") => {
    const status = outcome === "win" ? "Graded - Win" : "Graded - Loss";
    const { error } = await supabase.from("promos").update({ status }).eq("id", pid);
    if (error) { setDbError(error.message); return; }
    const client = clients.find(c => c.id === cid);
    const promo = client?.promos?.find(p => p.id === pid);
    if (client && promo) setQueue(outcome === "win" ? [
      {type:"text",msg:`Text ${client.name}: "Your ${promo.book} promo landed! Withdraw ${promo.profit ? fmt(promo.profit) : "funds"} now 🎉"`},
      {type:"next",msg:`Next: Move ${client.name} to next book in sequence`},
    ] : [
      {type:"text",msg:`Text ${client.name}: "Refund incoming — watch for bonus cash in your ${promo.book} account"`},
      {type:"monitor",msg:`Monitor ${client.name}'s ${promo.book} account for bonus credit (24–48hrs)`},
    ]);
    load();
  };

  const sc = sel ? clients.find(c => c.id === sel) : null;

  if (loading) return <div style={{padding:40,color:"#555"}}>Loading clients...</div>;

  return (
    <div>
      {dbError && <div className="card" style={{borderColor:"#ff4444",marginBottom:16,color:"#ff4444"}}>
        ⚠ Database: {dbError} — Make sure you ran the SQL setup in Supabase (see README).
      </div>}

      <div className="grid-2col" style={{display:"grid",gridTemplateColumns:sc?"280px 1fr":"360px",gap:16}}>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <span style={{color:"#3a3a5a",fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Clients ({clients.length})</span>
            <button className="btn-ghost" onClick={()=>setShowAdd(!showAdd)} style={{borderColor:"#00e5ff",color:"#00e5ff"}}>+ Add Client</button>
          </div>

          {showAdd && (
            <div className="card" style={{marginBottom:10}}>
              {([["Full name","name"],["Phone","phone"],["Loan balance $","loan_balance"]] as const).map(([ph,k])=>(
                <input key={k} className="input" placeholder={ph} value={(nc as any)[k]} onChange={e=>setNc(p=>({...p,[k]:e.target.value}))} style={{marginBottom:8}} />
              ))}
              <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
                {BOOKS.map(b=>(
                  <button key={b} className="btn" onClick={()=>setNc(p=>({...p,books:p.books.includes(b)?p.books.filter(x=>x!==b):[...p.books,b]}))}
                    style={{...tag,borderColor:nc.books.includes(b)?"#00e5ff":"#1a1a2e",color:nc.books.includes(b)?"#00e5ff":"#444",background:nc.books.includes(b)?"#00e5ff10":"transparent"}}>
                    {b}
                  </button>
                ))}
              </div>
              <button className="btn-primary" onClick={addClient}>Save Client</button>
            </div>
          )}

          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {clients.length === 0 && !showAdd && <div style={{color:"#444",fontSize:13,textAlign:"center",padding:24}}>No clients yet</div>}
            {clients.map(c=>(
              <div key={c.id} className="card" onClick={()=>setSel(c.id===sel?null:c.id)}
                style={{cursor:"pointer",borderColor:c.id===sel?"#00e5ff55":"#1e1e35",background:c.id===sel?"#00e5ff08":"#0a0a1c"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <div>
                    <div style={{color:"#fff",fontWeight:700,fontSize:14}}>{c.name}</div>
                    <div style={{color:"#252540",fontSize:11,marginTop:2}}>{c.phone}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{color:"#39ff14",fontWeight:700}}>+{fmt(c.total_profit)}</div>
                    <div style={{color:"#ff4444",fontSize:11}}>Loan: {fmt(c.loan_balance)}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {(c.books||[]).map(b=><span key={b} style={tag}>{b}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {sc && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div style={{color:"#fff",fontWeight:800,fontSize:18}}>{sc.name}</div>
                <div style={{color:"#252540",fontSize:12,marginTop:2}}>
                  {sc.phone} · Loan: <span style={{color:"#ff4444"}}>{fmt(sc.loan_balance)}</span> · Profit: <span style={{color:"#39ff14"}}>+{fmt(sc.total_profit)}</span>
                </div>
              </div>
              <button className="btn-ghost" onClick={()=>setShowPromo(!showPromo)} style={{borderColor:"#39ff14",color:"#39ff14"}}>+ Add Promo</button>
            </div>

            {showPromo && (
              <div className="card" style={{marginBottom:12}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                  <select className="input" value={np.book} onChange={e=>setNp(p=>({...p,book:e.target.value}))}>{BOOKS.map(b=><option key={b}>{b}</option>)}</select>
                  <select className="input" value={np.type} onChange={e=>setNp(p=>({...p,type:e.target.value}))}>{PROMO_TYPES.map(t=><option key={t}>{t}</option>)}</select>
                  <input className="input" placeholder="Promo amount $" value={np.amount} onChange={e=>setNp(p=>({...p,amount:e.target.value}))} />
                  <input className="input" placeholder="Locked profit $" value={np.profit} onChange={e=>setNp(p=>({...p,profit:e.target.value}))} />
                  <input className="input" type="date" value={np.date} onChange={e=>setNp(p=>({...p,date:e.target.value}))} />
                  <select className="input" value={np.status} onChange={e=>setNp(p=>({...p,status:e.target.value}))}>{STAGES.map(s=><option key={s}>{s}</option>)}</select>
                </div>
                <input className="input" placeholder="Notes (e.g. +200/-235 conversion)" value={np.notes} onChange={e=>setNp(p=>({...p,notes:e.target.value}))} style={{marginBottom:8}} />
                <button className="btn-primary" onClick={()=>addPromo(sc.id)}>Save Promo</button>
              </div>
            )}

            {queue.length>0 && (
              <div className="card" style={{borderColor:"#ffd60a44",marginBottom:12}}>
                <div style={{color:"#ffd60a",fontWeight:700,fontSize:10,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>⚡ Action Queue</div>
                {queue.map((a,i)=>(
                  <div key={i} style={{display:"flex",gap:8,marginBottom:7}}>
                    <span>{a.type==="text"?"💬":a.type==="next"?"➡️":"👁"}</span>
                    <span style={{color:"#bbb",fontSize:12,lineHeight:1.5}}>{a.msg}</span>
                  </div>
                ))}
                <button className="btn-ghost" onClick={()=>setQueue([])} style={{borderColor:"#ffd60a",color:"#ffd60a",marginTop:6,fontSize:10}}>Clear</button>
              </div>
            )}

            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {(!sc.promos || sc.promos.length===0) && <div style={{color:"#1a1a2e",fontSize:13,textAlign:"center",padding:32}}>No promos yet</div>}
              {sc.promos?.map(p=>(
                <div key={p.id} className="card" style={{borderColor:statusColor(p.status)+"33"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:3}}>
                        <span style={{color:"#fff",fontWeight:700}}>{p.book}</span>
                        <span style={{...tag,borderColor:statusColor(p.status),color:statusColor(p.status)}}>{p.status}</span>
                      </div>
                      <div style={{color:"#3a3a5a",fontSize:12}}>{p.type} · {fmt(p.amount)} · {p.date}</div>
                      {p.notes && <div style={{color:"#252540",fontSize:11,marginTop:2}}>{p.notes}</div>}
                    </div>
                    <div style={{textAlign:"right"}}>
                      {p.profit>0 && <div style={{color:"#39ff14",fontWeight:700,marginBottom:4}}>+{fmt(p.profit)}</div>}
                      {p.status==="Active" && (
                        <div style={{display:"flex",gap:4}}>
                          <button className="btn-ghost" onClick={()=>grade(sc.id,p.id,"win")} style={{borderColor:"#39ff14",color:"#39ff14"}}>✓ Win</button>
                          <button className="btn-ghost" onClick={()=>grade(sc.id,p.id,"loss")} style={{borderColor:"#ff4444",color:"#ff4444"}}>✗ Loss</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {sc.total_profit > 0 && (
              <div className="card" style={{marginTop:12,borderColor:"#00e5ff22"}}>
                <div style={{color:"#00e5ff",fontWeight:700,fontSize:10,letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>Payment Split (60/40)</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,textAlign:"center"}}>
                  <div><div style={{color:"#fff",fontWeight:800,fontSize:20}}>{fmt(sc.total_profit)}</div><div style={{color:"#252540",fontSize:11}}>Total</div></div>
                  <div><div style={{color:"#00e5ff",fontWeight:800,fontSize:20}}>{fmt(sc.total_profit*0.6)}</div><div style={{color:"#252540",fontSize:11}}>Your 60%</div></div>
                  <div><div style={{color:"#39ff14",fontWeight:800,fontSize:20}}>{fmt(sc.total_profit*0.4)}</div><div style={{color:"#252540",fontSize:11}}>Client 40%</div></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
