"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getDb, money0, today } from "@/lib/db";
import { loadOps, markKey } from "@/lib/ops";
import type { OpsEntry, OpsMark } from "@/lib/ops";
import { LABEL_TASKS, STAGE_NAME, labelName, morningRows, smsHref, textFor } from "@/lib/morning";
import type { LabelKey, MorningRow } from "@/lib/morning";
import { Track } from "@/components/ClientBoard";

type Outcome = "texted" | "done" | "skip";

/** The morning list, one client at a time from the top, with the right text ready. */
export default function MorningRun() {
  const [entries, setEntries] = useState<OpsEntry[] | null>(null);
  const [marks, setMarks] = useState<Map<string, OpsMark>>(new Map());
  const [err, setErr] = useState<string | null>(null);
  const [skipTouched, setSkipTouched] = useState(true);
  const [queue, setQueue] = useState<string[] | null>(null);        // client ids, fixed when the run starts
  const [i, setI] = useState(0);
  const [res, setRes] = useState<Record<string, Outcome>>({});
  const [pick, setPick] = useState<Record<string, LabelKey>>({});
  const t = today();

  const load = useCallback(async () => {
    try { const r = await loadOps(t); setEntries(r.entries); setMarks(r.marks); }
    catch (e: any) { setErr(e?.message || String(e)); }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (entries ? morningRows(entries, marks, t) : []), [entries, marks, t]);
  const byId = useMemo(() => new Map(rows.map(r => [r.e.c.id, r])), [rows]);
  useEffect(() => {
    if (!entries || queue) return;
    setQueue(rows.filter(r => !(skipTouched && r.touched)).map(r => r.e.c.id));
  }, [entries, rows, queue, skipTouched]);

  const save = (r: MorningRow, status: "texted" | "done", label?: LabelKey) => {
    const at = new Date().toISOString();
    const kinds = label ? (LABEL_TASKS[label] || []) : [];
    const out: OpsMark[] = [
      { client_id: r.e.c.id, kind: "touch", due_on: t, status, created_at: at },
      ...r.e.todo.filter(tk => kinds.includes(tk.kind)).map(tk => ({ client_id: r.e.c.id, kind: tk.kind, due_on: tk.dueOn, status: "texted" as const, created_at: at })),
    ];
    setMarks(prev => { const m = new Map(prev); out.forEach(x => m.set(markKey(x.client_id, x.kind, x.due_on), x)); return m; });
    (async () => {
      const db = await getDb();
      const { error } = await db.from("task_marks").upsert(out, { onConflict: "client_id,kind,due_on" });
      if (error) throw error;
    })().catch((e: any) => setErr(`Couldn't save that: ${e?.message || "database error"}`));
  };

  if (err) return <div className="banner" style={{ color: "var(--neg)" }}>{err}</div>;
  if (!entries || !queue) return <div style={{ color: "var(--muted)", padding: 24 }}>Loading…</div>;

  const N = queue.length;
  const go = (id: string, o: Outcome) => { setRes(x => ({ ...x, [id]: o })); setI(k => k + 1); window.scrollTo({ top: 0 }); };
  const restart = (skip: boolean) => { setSkipTouched(skip); setQueue(rows.filter(r => !(skip && r.touched)).map(r => r.e.c.id)); setI(0); setRes({}); };

  const pips = (
    <div className="run-pips" style={{ gridTemplateColumns: `repeat(${Math.max(N, 1)}, minmax(0, 1fr))` }}>
      {queue.map((id, k) => <span key={id} className={`run-pip${res[id] === "skip" ? " skip" : res[id] ? " done" : k === i ? " now" : ""}`} />)}
    </div>
  );

  if (i >= N) {
    const vals = Object.values(res);
    const skipped = queue.filter(id => res[id] === "skip").map(id => byId.get(id)?.e.c.name.split(" ")[0]).filter(Boolean);
    return (
      <div className="run">
        <div className="run-top"><Link href="/clients">‹ Clients</Link><span className="task-sub">{N} of {N}</span></div>
        {pips}
        <h1 className="page-title" style={{ marginTop: 18 }}>{N ? "Everyone's touched" : "Nobody left to touch today"}</h1>
        <p className="page-sub">{vals.filter(v => v === "texted").length} texted · {vals.filter(v => v === "done").length} handled another way{skipped.length ? ` · skipped ${skipped.join(", ")}` : ""}</p>
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <Link className="btn-primary" style={{ width: "auto" }} href="/clients">Back to the list</Link>
          {skipTouched && <button className="btn-ghost" onClick={() => restart(false)}>Run through everyone</button>}
        </div>
      </div>
    );
  }

  const r = byId.get(queue[i])!;
  const label = pick[r.e.c.id] || r.labels[0];
  const text = textFor(r, label, t);
  const first = r.e.c.name.split(" ")[0];
  const touchedN = rows.filter(x => x.touched).length;
  const upNext = queue.slice(i + 1, i + 4).map(id => byId.get(id)!).filter(Boolean);

  return (
    <div className="run">
      <div className="run-top">
        <Link href="/clients">‹ Clients</Link>
        <span className="task-sub">{i + 1} of {N} · {touchedN} of {rows.length} touched today</span>
      </div>
      {pips}

      <div className="run-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title" style={{ margin: 0 }}><Link href={`/clients/${r.e.c.id}`}>{r.e.c.name}</Link></h1>
          <div className="task-sub">{[r.e.c.state, r.e.cad.startedOn ? `started ${new Date(`${r.e.cad.startedOn}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : "no FanDuel bet yet"].filter(Boolean).join(" · ")}</div>
        </div>
        <div style={{ textAlign: "right" }}><div className="task-sub">Owes you</div><b style={{ fontSize: 20 }}>{r.e.owes > 0.5 ? money0(r.e.owes) : "—"}</b></div>
      </div>

      <div className="card run-card">
        <div className="run-card-top"><b className={`st-${r.stage}`}>{r.day == null ? "No 30-day clock" : r.day > 30 ? `Day ${r.day} · past 30` : `Day ${r.day} of 30`}</b><span className="task-sub">{STAGE_NAME[r.stage]}</span></div>
        <Track cad={r.e.cad} plays={r.e.plays} name={r.e.c.name} />
      </div>

      <div className="run-due">
        <span className="task-sub">{r.labels.length > 1 ? "Due · tap one to switch the text" : "Due"}</span>
        <div className="ml-chips">
          {r.labels.map(k => (
            <button key={k} className={`ml-chip run-chip lb-${k}${k === label ? " on" : ""}`} onClick={() => setPick(p => ({ ...p, [r.e.c.id]: k }))}>{labelName(k, t)}</button>
          ))}
          {r.labels.length === 0 && <span className="task-sub">Nothing flagged. {r.next}</span>}
        </div>
        {r.labels.length > 0 && <div style={{ fontSize: 14 }}>{r.next}</div>}
      </div>

      <div className="run-bubble">{text}</div>
      {!r.e.c.phone && <div className="task-sub" style={{ textAlign: "right" }}>No number saved, so pick {first} in Messages.</div>}

      <div className="run-actions">
        <a className="btn-primary run-send" href={smsHref(r.e.c.phone, text)} onClick={() => { save(r, "texted", label); setTimeout(() => go(r.e.c.id, "texted"), 0); }}>Text {first} · next</a>
        <div className="run-row">
          <Link className="btn-ghost" href={`/tools?client=${r.e.c.id}`}>Find a bet</Link>
          <button className="btn-ghost" onClick={() => { save(r, "done"); go(r.e.c.id, "done"); }}>Handled</button>
          <button className="btn-ghost" onClick={() => go(r.e.c.id, "skip")}>Skip today</button>
        </div>
        {i > 0 && <button className="mini" onClick={() => setI(k => Math.max(0, k - 1))}>‹ Back to {byId.get(queue[i - 1])?.e.c.name.split(" ")[0]}</button>}
      </div>

      {upNext.length > 0 && (
        <div className="run-next">
          <span className="task-sub" style={{ fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", fontSize: 11 }}>Up next</span>
          {upNext.map(u => (
            <div key={u.e.c.id} className="run-next-row"><span>{u.e.c.name}</span>{u.labels[0] && <i className={`ml-chip lb-${u.labels[0]}`}>{labelName(u.labels[0], t)}</i>}</div>
          ))}
        </div>
      )}
    </div>
  );
}
