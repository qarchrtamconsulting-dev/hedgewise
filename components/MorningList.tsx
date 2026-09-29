"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getDb, money0, today } from "@/lib/db";
import { loadOps, markKey } from "@/lib/ops";
import type { OpsEntry, OpsMark } from "@/lib/ops";
import { LABEL_ORDER, LABEL_TASKS, STAGE_NAME, labelName, morningRows, smsHref, textFor } from "@/lib/morning";
import type { LabelKey, MorningRow } from "@/lib/morning";
import { Track } from "@/components/ClientBoard";

type View = "all" | LabelKey;

/** Every live client in the order they started, with where they are and what they need. */
export default function MorningList() {
  const [entries, setEntries] = useState<OpsEntry[] | null>(null);
  const [marks, setMarks] = useState<Map<string, OpsMark>>(new Map());
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [view, setView] = useState<View>("all");
  const t = today();

  const load = useCallback(async () => {
    try {
      const r = await loadOps(t);
      setEntries(r.entries); setMarks(r.marks);
    } catch (e: any) { setErr(e?.message || String(e)); }
  }, [t]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { try { const v = sessionStorage.getItem("hw-morning-view"); if (v) setView(v as View); } catch {} }, []);
  const pick = (v: View) => { setView(v); try { sessionStorage.setItem("hw-morning-view", v); } catch {} };

  const rows = useMemo(() => (entries ? morningRows(entries, marks, t) : []), [entries, marks, t]);
  const counts = useMemo(() => {
    const c = new Map<LabelKey, number>();
    rows.forEach(r => r.labels.forEach(l => c.set(l, (c.get(l) || 0) + 1)));
    return c;
  }, [rows]);
  const leads = useMemo(() => (entries || []).filter(e => !e.cad.startedOn && e.raw.length === 0).length, [entries]);
  const list = view === "all" ? rows : rows.filter(r => r.labels.includes(view));
  const touchedN = rows.filter(r => r.touched).length;

  // Touching a client: saved as a "touch" mark for today, plus the matching Today checklist item when texting.
  const save = (r: MorningRow, on: boolean, label?: LabelKey, fromLink?: boolean) => {
    const at = new Date().toISOString();
    const kinds = label ? (LABEL_TASKS[label] || []) : [];
    const tasks = r.e.todo.filter(tk => kinds.includes(tk.kind));
    const out: OpsMark[] = [
      { client_id: r.e.c.id, kind: "touch", due_on: t, status: label ? "texted" : "done", created_at: at },
      ...tasks.map(tk => ({ client_id: r.e.c.id, kind: tk.kind, due_on: tk.dueOn, status: "texted" as const, created_at: at })),
    ];
    const apply = () => setMarks(prev => {
      const m = new Map(prev);
      if (on) out.forEach(x => m.set(markKey(x.client_id, x.kind, x.due_on), x));
      else m.delete(markKey(r.e.c.id, "touch", t));
      return m;
    });
    if (fromLink) setTimeout(apply, 0); else apply();
    (async () => {
      const db = await getDb();
      if (on) {
        const { error } = await db.from("task_marks").upsert(out.map(({ client_id, kind, due_on, status, created_at }) => ({ client_id, kind, due_on, status, created_at })), { onConflict: "client_id,kind,due_on" });
        if (error) throw error;
      } else {
        const { error } = await db.from("task_marks").delete().eq("client_id", r.e.c.id).eq("kind", "touch").eq("due_on", t);
        if (error) throw error;
      }
    })().catch((e: any) => { setNote(`Couldn't save that: ${e?.message || "database error"}`); load(); });
  };

  if (err) return <div className="banner" style={{ color: "var(--neg)" }}>{err}</div>;
  if (!entries) return <div style={{ color: "var(--muted)", padding: 24 }}>Loading…</div>;

  return (
    <div className="ml">
      <div className="ml-head">
        <div className="ml-headrow">
          <div className="ml-touched" style={{ flex: 1 }}>
            <div className="ml-touched-top"><span className="task-sub">Touched today</span><b>{touchedN} of {rows.length}</b></div>
            <div className="progress"><div style={{ width: `${rows.length ? (touchedN / rows.length) * 100 : 0}%` }} /></div>
          </div>
          <Link className="btn-primary" style={{ width: "auto", padding: "9px 16px" }} href="/clients/run">Start morning run ›</Link>
        </div>
        <div className="ml-tabs" role="tablist">
          <button className={`ml-tab${view === "all" ? " active" : ""}`} onClick={() => pick("all")}>Everyone <b>{rows.length}</b></button>
          {LABEL_ORDER.filter(k => counts.get(k)).map(k => (
            <button key={k} className={`ml-tab lb-${k}${view === k ? " active" : ""}`} onClick={() => pick(k)}>{labelName(k, t)} <b>{counts.get(k)}</b></button>
          ))}
          <Link className="ml-tab ghost" href="/promos">Promo schedule ›</Link>
          {leads > 0 && <Link className="ml-tab ghost" href="/onboarding">Leads + onboarding <b>{leads}</b></Link>}
        </div>
        {note && <div className="banner" style={{ color: "var(--neg)" }}>{note}</div>}
      </div>

      <div className="ml-list">
        {list.length === 0 && <div className="task-sub" style={{ padding: 16 }}>Nobody here right now.</div>}
        {list.map(r => {
          const label = view === "all" ? r.labels[0] : view;
          const text = textFor(r, label, t);
          return (
            <div key={r.e.c.id} className={`ml-row${r.touched ? " touched" : ""}`}>
              <button className={`ml-check${r.touched ? " on" : ""}`} aria-label={r.touched ? "Mark not touched" : "Mark touched today"}
                onClick={() => save(r, !r.touched)}>{r.touched ? "✓" : ""}</button>
              <div className="ml-name">
                <Link href={`/clients/${r.e.c.id}`}>{r.e.c.name}</Link>
                <span className="task-sub">{[r.e.c.state, r.e.cad.startedOn ? `started ${shortDay(r.e.cad.startedOn)}` : "no FanDuel bet"].filter(Boolean).join(" · ")}</span>
              </div>
              <div className={`ml-day st-${r.stage}`}>
                <b>{r.day == null ? "—" : r.day > 30 ? `Day ${r.day}` : `${r.day}/30`}</b>
                <span>{STAGE_NAME[r.stage]}</span>
              </div>
              <div className="ml-track"><Track cad={r.e.cad} plays={r.e.plays} name={r.e.c.name} /></div>
              <div className="ml-next">
                <span className={r.nextTone ? `ml-next-${r.nextTone}` : undefined}>{r.next}</span>
                <span className="ml-chips">{r.labels.map(k => <i key={k} className={`ml-chip lb-${k}`}>{labelName(k, t)}</i>)}</span>
              </div>
              <span className="ml-owes">{r.e.owes > 0.5 ? money0(r.e.owes) : "—"}</span>
              <div className="ml-act">
                <a className="btn-primary ml-text" href={smsHref(r.e.c.phone, text)} onClick={() => save(r, true, label, true)}
                  title={r.e.c.phone ? text : `No number saved, pick ${r.e.c.name.split(" ")[0]} in Messages. ${text}`}>Text</a>
              </div>
            </div>
          );
        })}
      </div>
      <p className="task-sub" style={{ margin: "4px 2px 0" }}>
        Oldest start first. Texting or logging a play ticks a client off for today; tap the box to tick one off by hand.
      </p>
    </div>
  );
}

const shortDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
