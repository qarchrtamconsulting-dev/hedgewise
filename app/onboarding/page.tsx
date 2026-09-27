"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Client, fetchAll, getDb, shortDate, today } from "@/lib/db";
import { cadenceFor, dayOn, offerBooksOf, toCadencePlay } from "@/lib/cadence";
import type { PlayLike } from "@/lib/cadence";
import { INTAKE_FORM, OFFERS, STAGE_RANK, Stage, buildSignupMessage } from "@/lib/playbook";

type Step = "call" | "form" | "venmo" | "links" | "funded" | "bet";
const STEPS: { key: Step; label: string }[] = [
  { key: "call", label: "Intro call" },
  { key: "form", label: "Google Form" },
  { key: "venmo", label: "Venmo checklist" },
  { key: "links", label: "FD + DK links" },
  { key: "funded", label: "Funded" },
  { key: "bet", label: "First bet" },
];
const MANUAL: Step[] = ["call", "form", "venmo", "links", "funded"];
type LeadClient = Client & { created_at?: string | null; call_at?: string | null };
type CPlay = PlayLike & { client_id: string };
interface StepState { done: boolean; date: string | null; auto: boolean }
interface Lead { c: LeadClient; steps: Record<Step, StepState>; current: Step | null; formSent: string | null; others: string[]; live: boolean; startedOn: string | null }

const DEFAULT_FORM_TEXT = "Hey {first}, great talking with you! Here's the quick form to get you set up: {form}";
const FD_DK = OFFERS.filter(o => o.key === "fd-sb" || o.key === "dk-sb");
const smsHref = (phone: string | null | undefined, body: string) => {
  let digits = (phone || "").replace(/[^\d+]/g, "");
  if (/^\d{10}$/.test(digits)) digits = `+1${digits}`;
  return `sms:${digits}?&body=${encodeURIComponent(body)}`;
};
const firstName = (name: string) => name.split(" ")[0];
const fill = (tpl: string, first: string) => tpl.split("{first}").join(first).split("{form}").join(INTAKE_FORM);
const localDay = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const callLabel = (iso: string, t: string) => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const day = localDay(iso);
  return day === t ? `${time} today` : `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}, ${time}`;
};

export default function OnboardingPage() {
  const [clients, setClients] = useState<LeadClient[]>([]);
  const [plays, setPlays] = useState<CPlay[]>([]);
  const [marks, setMarks] = useState<{ client_id: string; step: Step; done_on: string }[]>([]);
  const [funding, setFunding] = useState<{ client_id: string; date: string | null }[]>([]);
  const [books, setBooks] = useState<{ client_id: string; offer: string; stage: Stage }[]>([]);
  const [formSent, setFormSent] = useState<Map<string, string>>(new Map());
  const [texts, setTexts] = useState<{ form: string; venmo: string }>({ form: DEFAULT_FORM_TEXT, venmo: "" });
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const t = today();

  const load = useCallback(async () => {
    try {
      const db = await getDb();
      const [cs, ps, ls, mv, cb] = await Promise.all([
        fetchAll<LeadClient>((a, b) => db.from("clients").select("*").range(a, b)),
        fetchAll<CPlay>((a, b) => db.from("plays").select("client_id,status,promo,book,placed_on,legs(book,side,event_time)").neq("status", "void").range(a, b)),
        fetchAll<any>((a, b) => db.from("lead_steps").select("client_id,step,done_on").range(a, b)),
        fetchAll<any>((a, b) => db.from("capital_movements").select("client_id,date,type,amount").in("type", ["sent_to_client", "opening_balance"]).range(a, b)),
        fetchAll<any>((a, b) => db.from("client_books").select("client_id,offer,stage").in("offer", ["fd-sb", "dk-sb"]).range(a, b)),
      ]);
      setClients(cs); setPlays(ps); setMarks(ls); setBooks(cb);
      setFunding(mv.filter((m: any) => Number(m.amount) > 0).map((m: any) => ({ client_id: m.client_id, date: m.date })));
      const [sentMarks, settings] = await Promise.all([
        fetchAll<any>((a, b) => db.from("task_marks").select("client_id,due_on").eq("kind", "lead_form_sent").range(a, b)).catch(() => []),
        db.from("app_settings").select("key,value").in("key", ["blueprint_form", "blueprint_venmo"]),
      ]);
      const fs = new Map<string, string>();
      (sentMarks as any[]).forEach(m => { if (!fs.has(m.client_id) || m.due_on > fs.get(m.client_id)!) fs.set(m.client_id, m.due_on); });
      setFormSent(fs);
      const kv = new Map<string, string>(((settings as any).data || []).map((r: any) => [r.key, r.value]));
      setTexts({ form: kv.get("blueprint_form") || DEFAULT_FORM_TEXT, venmo: kv.get("blueprint_venmo") || "" });
      setLoaded(true);
    } catch (e: any) {
      const m = e?.message || String(e);
      setErr(/lead_steps|call_at|does not exist|schema cache/i.test(m) ? "The onboarding tables aren't set up yet. Run supabase/leads.sql in Supabase." : m);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const leads = useMemo<Lead[]>(() => {
    const playsBy = new Map<string, ReturnType<typeof toCadencePlay>[]>();
    plays.forEach(p => { const a = playsBy.get(p.client_id) || []; a.push(toCadencePlay(p)); playsBy.set(p.client_id, a); });
    const markBy = new Map<string, string>();
    marks.forEach(m => markBy.set(`${m.client_id}|${m.step}`, m.done_on));
    const fundBy = new Map<string, string | null>();
    funding.forEach(f => { const cur = fundBy.get(f.client_id); if (!fundBy.has(f.client_id) || (f.date && (!cur || f.date < cur))) fundBy.set(f.client_id, f.date); });
    const stageBy = new Map<string, Stage>();
    books.forEach(b => stageBy.set(`${b.client_id}|${b.offer}`, b.stage));

    return clients.filter(c => c.status === "onboarding" || c.status === "active").map(c => {
      const ps = playsBy.get(c.id) || [];
      const cad = cadenceFor(ps, t);
      const m = (s: Step) => markBy.get(`${c.id}|${s}`) || null;
      const linksSent = ["fd-sb", "dk-sb"].every(k => STAGE_RANK[stageBy.get(`${c.id}|${k}`) || "not_started"] >= 1);
      const steps: Record<Step, StepState> = {
        call: { done: !!m("call"), date: m("call"), auto: false },
        form: { done: !!m("form") || !!c.email, date: m("form") || (c.email && c.created_at ? localDay(c.created_at) : null), auto: !m("form") && !!c.email },
        venmo: { done: !!m("venmo"), date: m("venmo"), auto: false },
        links: { done: !!m("links") || linksSent, date: m("links"), auto: !m("links") && linksSent },
        funded: { done: !!m("funded") || fundBy.has(c.id), date: fundBy.get(c.id) || m("funded"), auto: !m("funded") && fundBy.has(c.id) },
        bet: { done: !!cad.startedOn, date: cad.startedOn, auto: true },
      };
      const others = Array.from(new Set(ps.filter(p => p.status !== "sent").flatMap(p => offerBooksOf(p)))).filter(b => b !== "FanDuel");
      return { c, steps, current: STEPS.find(s => !steps[s.key].done)?.key || null, formSent: formSent.get(c.id) || null, others, live: !!cad.startedOn, startedOn: cad.startedOn };
    });
  }, [clients, plays, marks, funding, books, formSent, t]);

  const pending = leads.filter(l => !l.live).sort((a, b) => {
    const call = (l: Lead) => (l.c.call_at && localDay(l.c.call_at) <= t && !l.steps.call.done ? 0 : 1);
    const idx = (l: Lead) => STEPS.findIndex(s => s.key === l.current);
    return call(a) - call(b) || idx(b) - idx(a) || a.c.name.localeCompare(b.c.name);
  });
  const wentLive = leads.filter(l => l.live && l.startedOn && dayOn(l.startedOn, t) <= 7).sort((a, b) => (b.startedOn || "").localeCompare(a.startedOn || ""));
  const schedule = pending.filter(l => l.c.call_at && !l.steps.call.done).sort((a, b) => (a.c.call_at || "").localeCompare(b.c.call_at || ""));
  const followUps = pending.filter(l => l.formSent && !l.steps.form.done && l.formSent < t);

  // A lead whose first FanDuel bet is logged is live: make sure Today sees them as active.
  const promoted = useRef(new Set<string>());
  useEffect(() => {
    const promote = leads.filter(l => l.live && l.c.status === "onboarding" && !promoted.current.has(l.c.id)).map(l => l.c.id);
    if (!promote.length) return;
    promote.forEach(id => promoted.current.add(id));
    (async () => { const db = await getDb(); await db.from("clients").update({ status: "active" }).in("id", promote); })().catch(() => {});
  }, [leads]);

  const saveStep = async (clientId: string, step: Step, done: boolean) => {
    setNote(null);
    setMarks(ms => done ? [...ms.filter(m => !(m.client_id === clientId && m.step === step)), { client_id: clientId, step, done_on: t }] : ms.filter(m => !(m.client_id === clientId && m.step === step)));
    try {
      const db = await getDb();
      const { error } = done
        ? await db.from("lead_steps").upsert({ client_id: clientId, step, done_on: t }, { onConflict: "client_id,step" })
        : await db.from("lead_steps").delete().eq("client_id", clientId).eq("step", step);
      if (error) throw error;
    } catch (e: any) { setNote(`Couldn't save that: ${e?.message || "database error"}`); load(); }
  };

  if (err) return <div className="banner" style={{ color: "var(--neg)" }}>{err}</div>;
  if (!loaded) return <div style={{ color: "var(--muted)", padding: 24 }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">Onboarding</h1>
          <p className="page-sub">Everyone who isn't live yet. The day their first FanDuel bet is logged, they move to Today.</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span className="task-sub" style={{ maxWidth: 300 }}>Or tell Claude in chat: "New client Jordan, Kayla referred her, meeting at 4"</span>
          <button className="btn-primary" style={{ width: "auto", padding: "8px 16px" }} onClick={() => setAdding(a => !a)}>{adding ? "Close" : "Add lead"}</button>
        </div>
      </div>

      {adding && <AddLead onDone={() => { setAdding(false); load(); }} />}
      {note && <div className="banner" style={{ color: "var(--neg)" }}>{note}</div>}

      <div className="onb-grid">
        <aside className="onb-side">
          <section className="card onb-panel">
            <div className="section-title">Schedule</div>
            {schedule.length === 0 && followUps.length === 0 && <div className="task-sub">No calls booked.</div>}
            {schedule.map(l => (
              <div key={l.c.id} className="onb-sched">
                <span className="onb-sched-time">{callLabel(l.c.call_at!, t)}</span>
                <span><b>Intro call</b> · <Link href={`/clients/${l.c.id}`}>{l.c.name}</Link>{l.c.referred_by ? <span className="task-sub"> · referred by {l.c.referred_by}</span> : null}</span>
              </div>
            ))}
            {followUps.map(l => (
              <div key={l.c.id} className="onb-sched">
                <span className="onb-sched-time">Follow up</span>
                <span><b>Form not in</b> · <Link href={`/clients/${l.c.id}`}>{l.c.name}</Link><span className="task-sub"> · sent {shortDate(l.formSent!)}</span></span>
              </div>
            ))}
          </section>

          <section className="card onb-panel">
            <div className="section-title">Where leads come from</div>
            <div className="onb-source"><span className="dot" /><span><b>Google Form:</b> answers land here on their own when the form is connected.</span></div>
            <div className="onb-source"><span className="dot" /><span><b>Chat with Claude:</b> "we got another client coming, meeting at 4" adds the lead and the call.</span></div>
            <div className="onb-source"><span className="dot" /><span><b>Add lead:</b> name, who referred them, and when you're meeting.</span></div>
          </section>

          <section className="card onb-panel">
            <div className="section-title">Went live this week</div>
            <div className="task-sub">First FanDuel bet logged, now on Today</div>
            <div className="coming-names">
              {wentLive.length === 0 && <span className="task-sub">No one yet.</span>}
              {wentLive.map(l => <Link key={l.c.id} href={`/clients/${l.c.id}`} className="name-chip">{l.c.name}</Link>)}
            </div>
          </section>
        </aside>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div className="onb-steps-head">
            <span>Lead</span>
            {STEPS.map(s => <span key={s.key}>{s.label}</span>)}
            <span />
          </div>
          {pending.length === 0 && <div className="card" style={{ color: "var(--muted)", fontSize: 13, borderStyle: "dashed" }}>No leads right now. Add one, or tell Claude about the next client.</div>}
          {pending.map(l => <LeadRow key={l.c.id} l={l} t={t} texts={texts} onStep={saveStep} onChanged={load} />)}

          <Blueprint texts={texts} onSaved={v => setTexts(v)} />
        </div>
      </div>
    </div>
  );
}

// ─── One lead ─────────────────────────────────────────────────
function LeadRow({ l, t, texts, onStep, onChanged }: {
  l: Lead; t: string; texts: { form: string; venmo: string };
  onStep: (clientId: string, step: Step, done: boolean) => void; onChanged: () => void;
}) {
  const { c } = l;
  const first = firstName(c.name);
  const [panel, setPanel] = useState<null | "time" | "fund" | "archive">(null);
  const [when, setWhen] = useState(c.call_at ? new Date(new Date(c.call_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  const [amount, setAmount] = useState("2500");
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: (db: any) => Promise<any>) => {
    setErr(null);
    try { const db = await getDb(); const r = await fn(db); if (r?.error) throw r.error; setPanel(null); onChanged(); }
    catch (e: any) { setErr(e?.message || "Could not save."); }
  };
  const saveTime = () => run(db => db.from("clients").update({ call_at: when ? new Date(when).toISOString() : null }).eq("id", c.id));
  const saveFunding = () => {
    const amt = Math.round((parseFloat(amount) || 0) * 100) / 100;
    if (!amt) return;
    return run(db => db.from("capital_movements").insert({ client_id: c.id, type: "sent_to_client", amount: amt, date: t, notes: "Funded from Onboarding" }));
  };
  const archive = () => run(db => db.from("clients").update({ status: "inactive" }).eq("id", c.id));
  const recordFormSent = () => { (async () => { const db = await getDb(); await db.from("task_marks").upsert({ client_id: c.id, kind: "lead_form_sent", due_on: t, status: "texted", created_at: new Date().toISOString() }, { onConflict: "client_id,kind,due_on" }); })().catch(() => {}); };
  const markLinksSent = () => {
    onStep(c.id, "links", true);
    (async () => {
      const db = await getDb();
      const { data } = await db.from("client_books").select("offer,stage").eq("client_id", c.id).in("offer", ["fd-sb", "dk-sb"]);
      const have = new Map<string, string>((data || []).map((r: any) => [r.offer, r.stage]));
      const rows = ["fd-sb", "dk-sb"].filter(k => !have.has(k) || have.get(k) === "not_started")
        .map(k => ({ client_id: c.id, offer: k, stage: "sent", updated_at: new Date().toISOString() }));
      if (rows.length) await db.from("client_books").upsert(rows, { onConflict: "client_id,offer" });
    })().catch(() => {});
  };

  const linkText = buildSignupMessage(first, FD_DK, true, false);
  const action = (() => {
    switch (l.current) {
      case "call": return <button className="btn-primary onb-act" onClick={() => onStep(c.id, "call", true)}>Mark called</button>;
      case "form": return l.formSent
        ? <button className="btn-primary onb-act" onClick={() => onStep(c.id, "form", true)}>Form is in</button>
        : <a className="btn-primary onb-act" href={smsHref(c.phone, fill(texts.form, first))} onClick={recordFormSent}>Send form</a>;
      case "venmo": return texts.venmo.trim()
        ? <a className="btn-primary onb-act" href={smsHref(c.phone, fill(texts.venmo, first))} onClick={() => setTimeout(() => onStep(c.id, "venmo", true), 0)}>Send Venmo checklist</a>
        : <a className="btn-ghost onb-act" href="#blueprint">Add the Venmo text</a>;
      case "links": return <a className="btn-primary onb-act" href={smsHref(c.phone, linkText)} onClick={() => setTimeout(markLinksSent, 0)}>Send FD + DK links</a>;
      case "funded": return <button className="btn-primary onb-act" onClick={() => setPanel(p => (p === "fund" ? null : "fund"))}>Log money sent</button>;
      case "bet": return <Link className="btn-primary onb-act" href={`/tools?client=${c.id}`}>Find a game</Link>;
      default: return null;
    }
  })();

  const sub = (s: Step): string => {
    const st = l.steps[s];
    if (st.done) return st.date ? shortDate(st.date) : "Done";
    if (s !== l.current) return "";
    if (s === "call") return c.call_at ? callLabel(c.call_at, t) : "Not booked";
    if (s === "form") return l.formSent ? `Sent ${shortDate(l.formSent)}` : "Not sent";
    if (s === "bet") return "FanDuel min loss";
    return "Not sent";
  };
  const hint = l.others.length ? `Already playing ${l.others.map(b => (b === "theScore Bet" ? "theScore" : b)).join(", ")}, but no FanDuel bet yet.` : null;

  return (
    <div className="onb-row">
      <div className="onb-lead">
        <Link href={`/clients/${c.id}`} style={{ fontWeight: 600 }}>{c.name}</Link>
        <span className="task-sub">{[c.referred_by ? `Referred by ${c.referred_by}` : null, c.state].filter(Boolean).join(" · ") || (c.status === "onboarding" ? "New lead" : "Active, not started")}</span>
      </div>
      {STEPS.map((s, i) => {
        const st = l.steps[s.key];
        const cur = s.key === l.current;
        const manual = MANUAL.includes(s.key) && !st.auto;
        return (
          <div key={s.key} className="onb-step">
            <button className={`onb-dot${st.done ? " done" : cur ? " cur" : ""}`} disabled={!manual}
              title={manual ? (st.done ? `Unmark ${s.label}` : `Mark ${s.label} done`) : st.auto && st.done ? `${s.label}: from your data` : s.label}
              onClick={() => manual && onStep(c.id, s.key, !st.done)} aria-label={`${s.label}${st.done ? " done" : ""}`}>
              {st.done ? <svg width="11" height="11" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2 4.1 7.3 8 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg> : cur ? i + 1 : ""}
            </button>
            <span className="onb-step-name">{s.label}</span>
            <span className="onb-step-sub">{sub(s.key)}</span>
          </div>
        );
      })}
      <div className="onb-actions">
        {action}
        <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
          {l.current === "call" && <button className="mini" onClick={() => setPanel(p => (p === "time" ? null : "time"))}>{c.call_at ? "Change time" : "Set time"}</button>}
          {l.current === "form" && l.formSent && <a className="mini" href={smsHref(c.phone, fill(texts.form, first))} onClick={recordFormSent}>Resend</a>}
          {c.status === "onboarding" && <button className="mini" onClick={() => setPanel(p => (p === "archive" ? null : "archive"))}>Archive</button>}
        </div>
      </div>
      {(panel || hint || err) && (
        <div className="onb-extra">
          {panel === "time" && (
            <>
              <input className="input" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} style={{ width: 220 }} aria-label="Intro call time" />
              <button className="btn-primary" style={{ width: "auto", padding: "7px 14px" }} onClick={saveTime}>Save</button>
              <button className="btn-ghost" onClick={() => setPanel(null)}>Cancel</button>
            </>
          )}
          {panel === "fund" && (
            <>
              <span className="task-sub">Sent to {first}</span>
              <input className="input num" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" style={{ width: 120 }} aria-label="Amount sent" />
              <button className="btn-primary" style={{ width: "auto", padding: "7px 14px" }} onClick={saveFunding}>Save</button>
              <button className="btn-ghost" onClick={() => setPanel(null)}>Cancel</button>
              <span className="task-sub">Goes on {first}'s loan.</span>
            </>
          )}
          {panel === "archive" && (
            <>
              <span className="task-sub">Not moving forward with {first}? This marks them inactive (you can switch it back on their page).</span>
              <button className="btn-ghost btn-danger" onClick={archive}>Archive</button>
              <button className="btn-ghost" onClick={() => setPanel(null)}>Cancel</button>
            </>
          )}
          {!panel && hint && <span className="onb-hint">{hint}</span>}
          {err && <span style={{ color: "var(--neg)", fontSize: 12 }}>{err}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Add a lead ───────────────────────────────────────────────
function AddLead({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: "", referred_by: "", state: "", phone: "", call_at: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: any) => setF(p => ({ ...p, [k]: e.target.value }));
  const save = async () => {
    if (!f.name.trim()) { setErr("Add a name."); return; }
    setBusy(true); setErr(null);
    try {
      const db = await getDb();
      const { error } = await db.from("clients").insert({
        name: f.name.trim(), referred_by: f.referred_by.trim() || null, state: f.state.trim().toUpperCase() || null,
        phone: f.phone.trim() || null, status: "onboarding", call_at: f.call_at ? new Date(f.call_at).toISOString() : null,
      });
      if (error) throw error;
      onDone();
    } catch (e: any) { setErr(e?.message || "Could not save."); setBusy(false); }
  };
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="form-grid">
        <div><span className="label">Name</span><input className="input" value={f.name} onChange={set("name")} autoFocus /></div>
        <div><span className="label">Referred by</span><input className="input" value={f.referred_by} onChange={set("referred_by")} /></div>
        <div><span className="label">State</span><input className="input" value={f.state} onChange={set("state")} maxLength={2} placeholder="VA" /></div>
        <div><span className="label">Phone</span><input className="input" value={f.phone} onChange={set("phone")} inputMode="tel" /></div>
        <div><span className="label">Intro call</span><input className="input" type="datetime-local" value={f.call_at} onChange={set("call_at")} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn-primary" style={{ width: "auto" }} onClick={save} disabled={busy}>{busy ? "Saving…" : "Save lead"}</button>
        {err && <span style={{ color: "var(--neg)", fontSize: 12 }}>{err}</span>}
      </div>
    </div>
  );
}

// ─── Blueprint: the same texts for every new client ───────────
function Blueprint({ texts, onSaved }: { texts: { form: string; venmo: string }; onSaved: (v: { form: string; venmo: string }) => void }) {
  const [edit, setEdit] = useState<null | "form" | "venmo">(null);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!edit) return;
    setErr(null);
    try {
      const db = await getDb();
      const { error } = await db.from("app_settings").upsert({ key: `blueprint_${edit}`, value: draft.trim() }, { onConflict: "key" });
      if (error) throw error;
      onSaved({ ...texts, [edit]: draft.trim() || (edit === "form" ? DEFAULT_FORM_TEXT : "") });
      setEdit(null);
    } catch (e: any) { setErr(e?.message || "Could not save."); }
  };
  const card = (n: number, title: string, body: React.ReactNode, key?: "form" | "venmo") => (
    <div className="onb-bp">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span className="section-title">{n} · {title}</span>
        {key && edit !== key && <button className="mini" onClick={() => { setEdit(key); setDraft(texts[key]); }}>Edit</button>}
      </div>
      {key && edit === key ? (
        <>
          <textarea className="input" rows={6} value={draft} onChange={e => setDraft(e.target.value)} style={{ fontSize: 12, lineHeight: 1.5 }} />
          <div className="task-sub">{"{first}"} becomes their first name{key === "form" ? ", {form} the form link" : ""}.</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn-primary" style={{ width: "auto", padding: "6px 12px" }} onClick={save}>Save</button>
            <button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
          </div>
          {err && <span style={{ color: "var(--neg)", fontSize: 12 }}>{err}</span>}
        </>
      ) : body}
    </div>
  );
  return (
    <section id="blueprint" className="card" style={{ display: "flex", flexDirection: "column", gap: 12, scrollMarginTop: 70 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <div className="section-title" style={{ fontSize: 15 }}>Blueprint</div>
        <span className="task-sub">The same steps and texts for every new client. Edit once, used everywhere.</span>
      </div>
      <div className="onb-bp-grid">
        {card(1, "Google Form", <div className="onb-bp-text">{texts.form}</div>, "form")}
        {card(2, "Venmo checklist", texts.venmo
          ? <div className="onb-bp-text">{texts.venmo}</div>
          : <div className="onb-bp-text" style={{ color: "var(--warn)" }}>Paste your Venmo checklist text here. It confirms how money goes back and forth before you send any.</div>, "venmo")}
        {card(3, "FanDuel + DraftKings", <div className="onb-bp-text">The FanDuel and DraftKings signup texts with the before-you-start rules, sent together. Same wording as each client's Onboarding tab.</div>)}
        {card(4, "Fund and first bet", <div className="onb-bp-text">Send about $2,500, then the FanDuel min loss with a DraftKings hedge. Logging it moves them to Today.</div>)}
      </div>
    </section>
  );
}
