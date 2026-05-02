"use client";
import { useState, useEffect } from "react";
import { toDec, toAm, fmt } from "@/lib/constants";

function Shell({title,color,children}:{title:string;color:string;children:React.ReactNode}) {
  return (
    <div className="card" style={{borderColor:color+"55"}}>
      <div style={{color,fontWeight:800,fontSize:11,letterSpacing:2.5,textTransform:"uppercase",marginBottom:16}}>{title}</div>
      {children}
    </div>
  );
}
function CRow({label,children}:{label:string;children:React.ReactNode}) {
  return <div style={{marginBottom:12}}><span className="label">{label}</span>{children}</div>;
}
function CInput({value,set,pre,suf}:{value:string;set:(s:string)=>void;pre?:string;suf?:string}) {
  return (
    <div style={{position:"relative"}}>
      {pre&&<span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"#3a3a5a",fontSize:14,pointerEvents:"none"}}>{pre}</span>}
      <input className="input" value={value} onChange={e=>set(e.target.value)} style={{paddingLeft:pre?26:12,paddingRight:suf?36:12}} />
      {suf&&<span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:"#3a3a5a",fontSize:13,pointerEvents:"none"}}>{suf}</span>}
    </div>
  );
}
function ResGrid({children}:{children:React.ReactNode}) {
  return <div style={{background:"#05050f",border:"1px solid #0e0e20",borderRadius:8,padding:14,marginTop:14,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>{children}</div>;
}
function Stat({label,value,big,green,accent}:{label:string;value:string;big?:boolean;green?:boolean;accent?:boolean}) {
  return (
    <div style={{textAlign:"center",padding:"6px 0"}}>
      <div style={{color:green?"#39ff14":accent?"#ffd60a":"#fff",fontWeight:big?800:600,fontSize:big?20:15}}>{value}</div>
      <div style={{color:"#2a2a45",fontSize:10,letterSpacing:0.5,marginTop:3}}>{label}</div>
    </div>
  );
}

export function FreeBetCalc() {
  const [amt,setAmt]=useState("500");
  const [fbO,setFbO]=useState("+200");
  const [hO,setHO]=useState("-235");
  const [res,setRes]=useState<any>(null);
  useEffect(()=>{
    const fb=parseFloat(amt),d1=toDec(fbO),d2=toDec(hO);
    if(!fb||!d1||!d2||d1<=1||d2<=1){setRes(null);return;}
    const profit=fb*(d1-1),hedge=profit/d2,guaranteed=profit-hedge;
    setRes({profit,hedge,guaranteed,conv:(guaranteed/fb)*100});
  },[amt,fbO,hO]);
  return (
    <Shell title="Free Bet Converter" color="#00e5ff">
      <CRow label="Free Bet Amount"><CInput value={amt} set={setAmt} pre="$" /></CRow>
      <CRow label="Free Bet Odds (fixed book)"><CInput value={fbO} set={setFbO} /></CRow>
      <CRow label="Hedge Odds (other book)"><CInput value={hO} set={setHO} /></CRow>
      {res&&<ResGrid>
        <Stat label="Win Payout" value={fmt(res.profit)} />
        <Stat label="Hedge Stake" value={fmt(res.hedge)} accent />
        <Stat label="Guaranteed Profit" value={fmt(res.guaranteed)} big green />
        <Stat label="Conversion Rate" value={`${res.conv.toFixed(1)}%`} big />
      </ResGrid>}
    </Shell>
  );
}

export function RiskFreeCalc() {
  const [amt,setAmt]=useState("500");
  const [bO,setBO]=useState("+200");
  const [hO,setHO]=useState("-235");
  const [conv,setConv]=useState("70");
  const [res,setRes]=useState<any>(null);
  useEffect(()=>{
    const a=parseFloat(amt),d1=toDec(bO),d2=toDec(hO),c=parseFloat(conv)/100;
    if(!a||!d1||!d2||!c||d1<=1||d2<=1){setRes(null);return;}
    const hedge=(a*d1)/d2;
    setRes({hedge,best:a*(d1-1)-hedge,worst:a*c-hedge,refund:a*c});
  },[amt,bO,hO,conv]);
  return (
    <Shell title="Risk Free Bet" color="#b388ff">
      <CRow label="Promo Amount"><CInput value={amt} set={setAmt} pre="$" /></CRow>
      <CRow label="Main Bet Odds"><CInput value={bO} set={setBO} /></CRow>
      <CRow label="Hedge Odds"><CInput value={hO} set={setHO} /></CRow>
      <CRow label="Refund Conversion %"><CInput value={conv} set={setConv} suf="%" /></CRow>
      {res&&<ResGrid>
        <Stat label="Hedge Stake" value={fmt(res.hedge)} accent />
        <Stat label="Best Case (win)" value={fmt(res.best)} big green />
        <Stat label="Worst Case (refund)" value={`${res.worst>=0?"+":"-"}${fmt(res.worst)}`} big />
        <Stat label="Refund Cash Value" value={fmt(res.refund)} />
      </ResGrid>}
    </Shell>
  );
}

export function BoostCalc() {
  const [stake,setStake]=useState("100");
  const [bO,setBO]=useState("-110");
  const [pct,setPct]=useState("25");
  const [cap,setCap]=useState("50");
  const [hO,setHO]=useState("-110");
  const [res,setRes]=useState<any>(null);
  useEffect(()=>{
    const s=parseFloat(stake),d1=toDec(bO),b=parseFloat(pct)/100,c=parseFloat(cap),d2=toDec(hO);
    if(!s||!d1||!b||!c||!d2||d1<=1||d2<=1){setRes(null);return;}
    const baseP=s*(d1-1),extra=Math.min(baseP*b,c),payout=s+baseP+extra;
    const hedge=payout/d2,guaranteed=payout-hedge-s;
    setRes({extra,boosted:toAm(payout/s),hedge,guaranteed});
  },[stake,bO,pct,cap,hO]);
  return (
    <Shell title="Profit Boost" color="#39ff14">
      <CRow label="Bet Stake"><CInput value={stake} set={setStake} pre="$" /></CRow>
      <CRow label="Base Odds"><CInput value={bO} set={setBO} /></CRow>
      <CRow label="Boost %"><CInput value={pct} set={setPct} suf="%" /></CRow>
      <CRow label="Max Boost Cap"><CInput value={cap} set={setCap} pre="$" /></CRow>
      <CRow label="Hedge Odds"><CInput value={hO} set={setHO} /></CRow>
      {res&&<ResGrid>
        <Stat label="Effective Boosted Odds" value={res.boosted} />
        <Stat label="Boost Value Added" value={fmt(res.extra)} />
        <Stat label="Hedge Stake" value={fmt(res.hedge)} accent />
        <Stat label="Guaranteed Profit" value={fmt(res.guaranteed)} big green />
      </ResGrid>}
    </Shell>
  );
}
