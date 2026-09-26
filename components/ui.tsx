"use client";

export function CheckList({ label, options, value, onChange, req }:{
  label: string; options: string[]; value: string[]; onChange: (v: string[]) => void; req?: boolean;
}) {
  return (
    <div className="card">
      <span className="label">{label}{req && <span style={{ color: "var(--muted)", marginLeft: 3 }}>*</span>}</span>
      {options.map(o => {
        const on = value.includes(o);
        return (
          <div key={o} className="chk-row" onClick={() => onChange(on ? value.filter(x => x !== o) : [...value, o])}>
            <div className={`chk-box${on ? " on" : ""}`}>
              {on && (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 6.2l2.3 2.3 4.7-5" />
                </svg>
              )}
            </div>
            <span className="chk-label">{o}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Toggle({ on, set, label }: { on: boolean; set: (b: boolean) => void; label: string }) {
  return (
    <div className="tog" onClick={() => set(!on)}>
      <div className={`tog-track ${on ? "on" : "off"}`}>
        <div className="tog-thumb" style={{ left: on ? 16 : 2 }} />
      </div>
      <span style={{ color: "var(--text-2)", fontSize: 13 }}>{label}</span>
    </div>
  );
}

export function Slider({ label, value, set }: { label: string; value: number; set: (n: number) => void }) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span className="label" style={{ marginBottom: 0 }}>{label}</span>
        <span className="num" style={{ color: "var(--text)", fontWeight: 600, fontSize: 13 }}>{value}%</span>
      </div>
      <input type="range" className="input" min={0} max={100} value={value} onChange={e => set(+e.target.value)} />
    </div>
  );
}

export function USDInput({ value, set, placeholder = "0.00" }: { value: string; set: (s: string) => void; placeholder?: string }) {
  return (
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 14, pointerEvents: "none" }}>$</span>
      <input className="input num" inputMode="decimal" value={value} onChange={e => set(e.target.value)} placeholder={placeholder} style={{ paddingLeft: 22 }} />
    </div>
  );
}
