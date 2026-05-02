"use client";

export function CheckList({ label, options, value, onChange, req }:{
  label: string; options: string[]; value: string[]; onChange: (v: string[]) => void; req?: boolean;
}) {
  return (
    <div className="card">
      <span className="label">{label}{req && <span style={{color:"#ff4444",marginLeft:3}}>*</span>}</span>
      {options.map(o => {
        const on = value.includes(o);
        return (
          <div key={o} className="chk-row" onClick={() => onChange(on ? value.filter(x=>x!==o) : [...value,o])}>
            <div className={`chk-box${on?" on":""}`}>
              {on && <span style={{color:"#000",fontSize:14,fontWeight:900,lineHeight:1}}>✓</span>}
            </div>
            <span className="chk-label">{o}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Toggle({ on, set, label }: { on: boolean; set: (b:boolean)=>void; label: string }) {
  return (
    <div className="tog" onClick={() => set(!on)}>
      <div className={`tog-track ${on?"on":"off"}`}>
        <div className="tog-thumb" style={{left: on?22:2}} />
      </div>
      <span style={{color:"#bbb",fontSize:14}}>{label}</span>
    </div>
  );
}

export function Slider({ label, value, set }: { label: string; value: number; set: (n:number)=>void }) {
  return (
    <div className="card">
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
        <span style={{color:"#bbb",fontSize:13}}>{label}</span>
        <span style={{color:"#fff",fontWeight:800,fontSize:14}}>{value}%</span>
      </div>
      <input type="range" className="input" min={0} max={100} value={value} onChange={e=>set(+e.target.value)} />
      <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
        {["0%","50%","100%"].map(l=><span key={l} style={{color:"#252540",fontSize:10}}>{l}</span>)}
      </div>
    </div>
  );
}

export function USDInput({ value, set, placeholder="0.00" }: { value: string; set: (s:string)=>void; placeholder?: string }) {
  return (
    <div style={{position:"relative"}}>
      <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"#3a3a5a",fontSize:14,pointerEvents:"none"}}>$</span>
      <input className="input" value={value} onChange={e=>set(e.target.value)} placeholder={placeholder} style={{paddingLeft:24,paddingRight:44}} />
      <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:"#252540",fontSize:11,pointerEvents:"none"}}>USD</span>
    </div>
  );
}
