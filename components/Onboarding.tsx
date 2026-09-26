"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { getDb, Client } from "@/lib/db";
import { copyText } from "@/lib/clipboard";
import { Offer, STAGES, Stage, buildSignupMessage, offersFor, CASINO_STATES } from "@/lib/playbook";

const smsHref = (phone: string | null | undefined, body: string) => {
  let digits = (phone || "").replace(/[^\d+]/g, "");
  if (/^\d{10}$/.test(digits)) digits = `+1${digits}`;
  return `sms:${digits}?&body=${encodeURIComponent(body)}`;
};

export default function Onboarding({ client }: { client: Client }) {
  const [stages, setStages] = useState<Record<string, Stage>>({});
  const [notes, setNotes] = useState<Record<string, string | null>>({});
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [rules, setRules] = useState(true);
  const [form, setForm] = useState(false);
  const [body, setBody] = useState("");
  const [edited, setEdited] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  const offers = offersFor(client.state);
  const first = client.name.split(" ")[0];

  const load = async () => {
    try {
      const db = await getDb();
      const { data, error } = await db.from("client_books").select("offer,stage,notes").eq("client_id", client.id);
      if (error) throw error;
      const s: Record<string, Stage> = {}, n: Record<string, string | null> = {};
      (data || []).forEach((r: any) => { s[r.offer] = r.stage; n[r.offer] = r.notes; });
      setStages(s); setNotes(n);
      const anySent = Object.values(s).some(v => v !== "not_started" && v !== "skipped");
      setRules(!anySent);
    } catch (e: any) {
      const m = e?.message || String(e);
      setErr(/client_books|does not exist|schema cache/i.test(m) ? "The onboarding table isn't set up yet. Run supabase/onboarding.sql in the Supabase SQL Editor, then refresh." : m);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [client.id]);

  const stageOf = (o: Offer): Stage => stages[o.key] || "not_started";
  const pending = offers.filter(o => stageOf(o) === "not_started");

  const setStage = async (o: Offer, stage: Stage) => {
    setStages(s => ({ ...s, [o.key]: stage }));
    try {
      const db = await getDb();
      const { error } = await db.from("client_books").upsert(
        { client_id: client.id, offer: o.key, stage, updated_at: new Date().toISOString() },
        { onConflict: "client_id,offer" });
      if (error) throw error;
    } catch (e: any) { setErr(e?.message || "Could not save."); load(); }
  };

  const chosen = useMemo(() => offers.filter(o => picked.includes(o.key)), [offers, picked]);
  useEffect(() => {
    if (!edited) setBody(chosen.length ? buildSignupMessage(first, chosen, rules, form) : "");
  }, [chosen, rules, form, first, edited]);

  const markSent = async () => {
    const toMark = chosen.filter(o => stageOf(o) === "not_started");
    for (const o of toMark) await setStage(o, "sent");
    if (toMark.length) setStatus(`Marked ${toMark.length} app${toMark.length > 1 ? "s" : ""} as sent`);
    setPicked([]); setEdited(false);
  };

  if (err) return <div className="banner" style={{ color: "var(--neg)" }}>{err}</div>;

  const done = offers.filter(o => ["done", "skipped"].includes(stageOf(o))).length;
  const group = (kind: "sportsbook" | "casino") => offers.filter(o => o.kind === kind);

  return (
    <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <div className="section-title">Apps · {done} of {offers.length} finished</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn-ghost" onClick={() => setPicked(pending.slice(0, 3).map(o => o.key))} disabled={!pending.length}>Pick next 3</button>
            {picked.length > 0 && <button className="btn-ghost" onClick={() => setPicked([])}>Clear</button>}
          </div>
        </div>
        {!client.state && <div className="banner">No state saved for {first}. Add it with Edit client so casinos show up where they're legal.</div>}
        {client.state && !CASINO_STATES.has(client.state.toUpperCase()) && <div className="hint" style={{ marginTop: 0 }}>Casino apps hidden: online casino isn't legal in {client.state}.</div>}

        {(["sportsbook", "casino"] as const).map(kind => group(kind).length > 0 && (
          <div key={kind} className="table-wrap">
            <table className="data">
              <thead><tr><th style={{ width: 36 }}></th><th>{kind === "sportsbook" ? "Sportsbook" : "Casino"}</th><th>Promo</th><th>Stage</th></tr></thead>
              <tbody>
                {group(kind).map(o => {
                  const st = stageOf(o);
                  return (
                    <tr key={o.key}>
                      <td>
                        <input type="checkbox" checked={picked.includes(o.key)} style={{ accentColor: "var(--accent)" }}
                          onChange={e => { setEdited(false); setPicked(p => e.target.checked ? [...p, o.key] : p.filter(x => x !== o.key)); }} />
                      </td>
                      <td style={{ fontWeight: 500 }}>{o.book}{o.code && <span className="pill" style={{ marginLeft: 6 }}>{o.code}</span>}</td>
                      <td style={{ color: "var(--text-2)", whiteSpace: "normal" }}>
                        {o.promo}{o.deposit ? ` · deposit $${o.deposit.toLocaleString()}` : ""}
                        {notes[o.key] && <div style={{ fontSize: 11, color: "var(--muted)" }}>{notes[o.key]}</div>}
                      </td>
                      <td>
                        <select className="input" value={st} onChange={e => setStage(o, e.target.value as Stage)}
                          style={{ padding: "5px 28px 5px 8px", fontSize: 12, width: 150, color: st === "done" ? "var(--pos)" : st === "not_started" ? "var(--muted)" : st === "skipped" ? "var(--muted)" : "var(--warn)" }}>
                          {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, position: "sticky", top: 68 }}>
        <div className="section-title">Send instructions</div>
        {chosen.length === 0 ? (
          <div className="hint" style={{ marginTop: 0 }}>Tick the apps to send, or press Pick next 3. The text uses your signup wording, codes and links.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <label className="tog"><input type="checkbox" checked={rules} onChange={e => { setRules(e.target.checked); setEdited(false); }} style={{ accentColor: "var(--accent)" }} /><span style={{ fontSize: 13, color: "var(--text-2)" }}>Signup rules</span></label>
              <label className="tog"><input type="checkbox" checked={form} onChange={e => { setForm(e.target.checked); setEdited(false); }} style={{ accentColor: "var(--accent)" }} /><span style={{ fontSize: 13, color: "var(--text-2)" }}>Intake form link</span></label>
            </div>
            <textarea ref={boxRef} className="input" rows={14} value={body} onChange={e => { setBody(e.target.value); setEdited(true); }} style={{ resize: "vertical", fontSize: 13, lineHeight: 1.5 }} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <a className="btn-primary" style={{ width: "auto", padding: "8px 14px", display: "inline-block" }} href={smsHref(client.phone, body)} onClick={() => { void markSent(); }}>
                Open in Messages
              </a>
              <button className="btn-ghost" onClick={async () => { const ok = await copyText(body, boxRef.current); setStatus(ok ? "Copied" : "Text selected. Press Cmd+C"); }}>Copy text</button>
              <button className="btn-ghost" onClick={markSent}>Mark as sent</button>
            </div>
            {!client.phone && <div className="hint" style={{ marginTop: 0 }}>No phone number saved for {first}, so Messages will open without a recipient.</div>}
          </>
        )}
        {status && <div style={{ fontSize: 12, color: "var(--text-2)" }}>{status}</div>}
      </div>
    </div>
  );
}
