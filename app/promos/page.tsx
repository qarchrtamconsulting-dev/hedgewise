"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getDb, today } from "@/lib/db";
import { addDays, dayLabel } from "@/lib/cadence";
import { loadOps, markKey } from "@/lib/ops";
import type { OpsEntry, OpsMark } from "@/lib/ops";
import { planAll } from "@/lib/promos";
import type { PromoHit, PromoPlan } from "@/lib/promos";
import { smsHref, whenWord } from "@/lib/morning";

const DAYS = 7;
const first = (n: string) => n.split(" ")[0];

function hitLabel(h: PromoHit) {
  if (h.kind === "tsb250") return "theScore $250";
  return `FanDuel $500${h.n ? ` #${h.n}` : ""}`;
}
function note(p: PromoPlan, h: PromoHit | undefined, tsb: PromoHit | undefined) {
  if (p.e.cad.lane === "quiet") return { text: `Quiet since ${p.e.cad.lastPlay ? dayLabel(p.e.cad.lastPlay) : "—"}, check they're still in`, tone: "warn" };
  if (h && p.missed) return { text: "None logged yet, make sure it lands", tone: "warn" };
  if (h?.first) return { text: `First one · day ${h.day}`, tone: "good" };
  if (h?.last) return { text: `Last one, then wrap-up · day ${h.day}`, tone: "good" };
  if (h) return { text: `Day ${h.day}`, tone: "" };
  if (tsb) return { text: tsb.lateDays ? `Was due ${tsb.lateDays}d ago, not logged` : "3 days after their first theScore bet", tone: tsb.lateDays ? "warn" : "" };
  return { text: "", tone: "" };
}

export default function PromosPage() {
  const [entries, setEntries] = useState<OpsEntry[] | null>(null);
  const [marks, setMarks] = useState<Map<string, OpsMark>>(new Map());
  const [err, setErr] = useState<string | null>(null);
  const t = today();

  const load = useCallback(async () => {
    try { const r = await loadOps(t); setEntries(r.entries); setMarks(r.marks); }
    catch (e: any) { setErr(e?.message || String(e)); }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const plans = useMemo(() => (entries ? planAll(entries, t, DAYS).filter(p => p.hits.length)
    .sort((a, b) => (a.e.cad.startedOn || "9999").localeCompare(b.e.cad.startedOn || "9999") || a.e.c.name.localeCompare(b.e.c.name)) : []), [entries, t]);
  const week = useMemo(() => Array.from({ length: DAYS }, (_, k) => addDays(t, k)), [t]);
  const byDay = useMemo(() => week.map(d => ({
    d,
    rows: plans.filter(p => p.hits.some(h => h.date === d)),
    n500: plans.filter(p => p.hits.some(h => h.date === d && h.kind === "fd500")).length,
    n250: plans.filter(p => p.hits.some(h => h.date === d && h.kind === "tsb250")).length,
  })).filter(x => x.rows.length), [plans, week]);

  const touch = (p: PromoPlan) => {
    const at = new Date().toISOString();
    const rows: OpsMark[] = [{ client_id: p.e.c.id, kind: "touch", due_on: t, status: "texted", created_at: at },
      ...p.e.todo.filter(tk => tk.kind === "fd_check_in" || tk.kind === "tsb_match").map(tk => ({ client_id: p.e.c.id, kind: tk.kind, due_on: tk.dueOn, status: "texted" as const, created_at: at }))];
    setTimeout(() => setMarks(prev => { const m = new Map(prev); rows.forEach(r => m.set(markKey(r.client_id, r.kind, r.due_on), r)); return m; }), 0);
    (async () => {
      const db = await getDb();
      const { error } = await db.from("task_marks").upsert(rows, { onConflict: "client_id,kind,due_on" });
      if (error) throw error;
    })().catch(() => load());
  };

  if (err) return <div className="banner" style={{ color: "var(--neg)" }}>{err}</div>;
  if (!entries) return <div style={{ color: "var(--muted)", padding: 24 }}>Loading…</div>;

  const textFor = (p: PromoPlan, d: string) => {
    const f = first(p.e.c.name);
    const h5 = p.hits.find(h => h.date === d && h.kind === "fd500");
    const h2 = p.hits.find(h => h.date === d && h.kind === "tsb250");
    if (h5 && h2) return `Hey ${f}! You should see a $500 FanDuel promo ${whenWord(d, t)}, and your theScore $250 match should be in. Can you send me screenshots of FanDuel and theScore?`;
    if (h5) return `Hey ${f}! You should be getting a $500 FanDuel promo ${whenWord(d, t)}. Can you send me a screenshot of your FanDuel home screen when it shows up?`;
    return `Hey ${f}, your theScore $250 match should be in. Can you send me a screenshot of theScore?`;
  };

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h1 className="page-title">Promos</h1>
        <p className="page-sub">Who should see a promo in the next week, from each client&apos;s day number. FanDuel $500 on days 8–30 (Tue, Thu, Sun); theScore $250 three days after the first theScore bet.</p>
      </div>

      {/* Desktop: the week at a glance */}
      <div className="pr-week card">
        <div className="pr-grid pr-grid-head">
          <span />
          {week.map((d, k) => {
            const x = byDay.find(b => b.d === d);
            return (
              <div key={d} className={`pr-dayhead${k === 1 ? " next" : ""}${k === 0 ? " today" : ""}`}>
                <b>{k === 0 ? "Today" : dayLabel(d)}</b>
                <span className="pr-c500">{x?.n500 ? `${x.n500} × $500` : "—"}</span>
                {x?.n250 ? <span className="pr-c250">{x.n250} × $250</span> : null}
              </div>
            );
          })}
          <span className="pr-logged-h">Promos logged</span>
        </div>
        {plans.map(p => (
          <div key={p.e.c.id} className="pr-grid pr-row">
            <div className="pr-name">
              <Link href={`/clients/${p.e.c.id}`}>{p.e.c.name}</Link>
              <span className="task-sub">{p.e.cad.day != null ? `day ${p.e.cad.day} today` : "no FanDuel bet"}</span>
            </div>
            {week.map((d, k) => (
              <div key={d} className={`pr-cell${k === 1 ? " next" : ""}`}>
                {p.hits.filter(h => h.date === d).map((h, i) => (
                  <span key={i} className={`pr-pill ${h.kind}${h.first || h.last ? " edge" : ""}`}>
                    {h.kind === "tsb250" ? "tS $250" : `$500${h.n ? ` #${h.n}` : ""}${h.first ? " · 1st" : h.last ? " · last" : ""}`}
                  </span>
                ))}
              </div>
            ))}
            <div className="pr-logged">
              <b>{p.logged}</b>
              {p.e.cad.lane === "quiet" ? <span className="warn">quiet</span> : p.missed ? <span className="warn">none logged yet</span> : null}
            </div>
          </div>
        ))}
      </div>

      {/* Phone: one list per day */}
      <div className="pr-days">
        {byDay.map(({ d, rows, n500, n250 }) => (
          <section key={d} className="pr-day">
            <div className="pr-day-head">
              <div>
                <div className={`section-title${d === addDays(t, 1) ? " pr-next" : ""}`} style={{ fontSize: 16 }}>
                  {d === t ? "Today" : d === addDays(t, 1) ? `Tomorrow · ${dayLabel(d)}` : dayLabel(d)}
                </div>
                <div className="task-sub">{[n500 ? `${n500} × FanDuel $500` : "", n250 ? `${n250} × theScore $250` : ""].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
            <div className="pr-list">
              {rows.map(p => {
                const h5 = p.hits.find(h => h.date === d && h.kind === "fd500");
                const h2 = p.hits.find(h => h.date === d && h.kind === "tsb250");
                const n = note(p, h5, h2);
                const done = marks.has(markKey(p.e.c.id, "touch", t));
                const body = textFor(p, d);
                return (
                  <div key={p.e.c.id} className="pr-item">
                    <div className="pr-item-main">
                      <Link href={`/clients/${p.e.c.id}`}>{p.e.c.name}</Link>
                      {n.text && <span className={`pr-note ${n.tone}`}>{n.text}</span>}
                    </div>
                    <div className="pr-pills">{[h5, h2].filter(Boolean).map((h, i) => <span key={i} className={`pr-pill ${h!.kind}`}>{hitLabel(h!).replace("FanDuel ", "FD ")}</span>)}</div>
                    {d <= addDays(t, 1) && (
                      <a className={done ? "btn-ghost pr-text" : "btn-primary pr-text"} href={smsHref(p.e.c.phone, body)} title={body} onClick={() => touch(p)}>{done ? "✓" : "Text"}</a>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {byDay.length === 0 && <div className="card task-sub">No promos in the next week.</div>}
      </div>
    </div>
  );
}
