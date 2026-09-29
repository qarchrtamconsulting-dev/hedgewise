"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchAll, getDb, today } from "@/lib/db";
import { cadenceFor, toCadencePlay } from "@/lib/cadence";
import type { Lane, PlayLike } from "@/lib/cadence";

// The process map from the brainstorm, updated to the cadence Quinn confirmed on Sept 26.
type Count = "leads" | Lane | "results";
const STAGES: { name: string; days: string; steps: string[]; lives: { label: string; href: string }[]; count?: Count; leaks: number[] }[] = [
  { name: "Find", days: "Before day 1", count: "leads",
    steps: ["Referral comes in", "Intro call so they see your face", "Google Form"],
    lives: [{ label: "Onboarding", href: "/onboarding" }], leaks: [8] },
  { name: "Onboard", days: "Before day 1",
    steps: ["Venmo checklist", "FanDuel and DraftKings links", "Send about $2,500"],
    lives: [{ label: "Onboarding", href: "/onboarding" }], leaks: [8] },
  { name: "Week 1", days: "Days 1–7", count: "week1",
    steps: ["Day 1: FanDuel min loss (~$1,300), DraftKings hedge $800–900", "Day 2: reward stack, screenshot then play", "Day 3: $25 bet match",
      "Days 4–7: FanDuel promos", "theScore; its $250 match lands 3 days after the first bet"],
    lives: [{ label: "Today", href: "/" }, { label: "Tools", href: "/tools" }], leaks: [1, 3] },
  { name: "FanDuel promo days", days: "Days 8–30", count: "promo",
    steps: ["$500 promo every Tue, Thu, Sun: deposit match, risk-free bet or bet match", "Heads-up text and screenshots the day before: Mon, Wed, Fri",
      "New apps when the cadence allows"],
    lives: [{ label: "Today", href: "/" }], leaks: [1, 2] },
  { name: "Results", days: "Every play", count: "results",
    steps: ["Confirm the receipt once the bet is placed", "Enter the winner after the game", "Withdrawal text to the client"],
    lives: [{ label: "Today", href: "/" }], leaks: [4] },
  { name: "Wrap-up", days: "Day 31+", count: "wrap",
    steps: ["Withdraw winnings", "Collect the loan and your share", "Ask for referrals"],
    lives: [{ label: "Money", href: "/money" }], leaks: [5, 7] },
];

const LEAKS: { n: number; title: string; cost: string; fix: string; status: "live" | "planned" | "parked" }[] = [
  { n: 1, title: "The next move lives in your head", cost: "No written cadence, so an app or a promo gets skipped.", fix: "Today checklist and the client board", status: "live" },
  { n: 2, title: "Every play is a live call", cost: "Your hours grow one-for-one with clients.", fix: "Send to client with a receipt; a client-first New play is next", status: "live" },
  { n: 3, title: "Sending starts from the game", cost: "Promo, then games, then the client from 30 names.", fix: "Find a game from a checklist row opens Tools with the client picked", status: "live" },
  { n: 4, title: "Results graded by hand", cost: "Every game needs a tap after it ends.", fix: "Auto-grading from Odds API final scores", status: "planned" },
  { n: 5, title: "Repayments matched by hand", cost: "Venmo and PayPal to the right client and loan.", fix: "Money: Request and Log payment; the payments inbox needs email access", status: "live" },
  { n: 6, title: "DraftKings VIP date not recorded", cost: "Match timing is a guess.", fix: "Left out for now", status: "parked" },
  { n: 7, title: "Quiet clients go unnoticed", cost: "Stopping before day 21: about $580 vs $3,300.", fix: "Gone quiet on Today's board and in Money", status: "live" },
  { n: 8, title: "Onboarding is tracked in texts", cost: "Links sent, Venmo checked, funded: nowhere.", fix: "Onboarding tab with the blueprint texts", status: "live" },
];

type CPlay = PlayLike & { client_id: string };

export default function PlaybookPage() {
  const [counts, setCounts] = useState<Partial<Record<Count, number>> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();
        const [cs, ps] = await Promise.all([
          fetchAll<{ id: string; name: string; status: string | null }>((a, b) => db.from("clients").select("id,name,status").in("status", ["active", "onboarding"]).range(a, b)),
          fetchAll<CPlay>((a, b) => db.from("plays").select("client_id,status,promo,book,placed_on,legs(book,side,event_time)").neq("status", "void").range(a, b)),
        ]);
        const by = new Map<string, ReturnType<typeof toCadencePlay>[]>();
        ps.forEach(p => { const x = by.get(p.client_id) || []; x.push(toCadencePlay(p)); by.set(p.client_id, x); });
        const t = today();
        const c: Partial<Record<Count, number>> = { results: ps.filter(p => p.status === "open" || p.status === "sent").length };
        cs.forEach(cl => {
          const lane = cadenceFor(by.get(cl.id) || [], t).lane;
          const key: Count = lane === "not_started" ? "leads" : lane;
          c[key] = (c[key] || 0) + 1;
        });
        setCounts(c);
      } catch { setCounts({}); }
    })();
  }, []);

  const countLabel = (k?: Count) => {
    if (!k || !counts) return null;
    const v = counts[k] || 0;
    return k === "results" ? `${v} open or unconfirmed` : k === "leads" ? `${v} not live yet` : `${v} client${v === 1 ? "" : "s"} now`;
  };

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 className="page-title">Playbook</h1>
        <p className="page-sub">How a client runs, where the work lives in Hedgewise, and where time used to leak. From 3,746 plays since March 2025: the median client runs about 30 days and 15 plays and earns you about $2,900.</p>
      </div>

      <div className="pb-stages">
        {STAGES.map(s => (
          <div key={s.name} className="card pb-stage">
            <div>
              <div className="pb-days">{s.days}</div>
              <div className="pb-name">{s.name}</div>
              {s.count && <div className="task-sub" style={{ marginTop: 2 }}>{countLabel(s.count) || " "}</div>}
            </div>
            <ul className="pb-steps">{s.steps.map(x => <li key={x}>{x}</li>)}</ul>
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>Lives in</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {s.lives.map(l => <Link key={l.label} href={l.href} className="name-chip">{l.label}</Link>)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>{s.leaks.map(n => <span key={n} className="pb-leak-n" title={LEAKS[n - 1].title}>{n}</span>)}</div>
          </div>
        ))}
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="section-title" style={{ fontSize: 15 }}>Where time leaked, and what handles it now</div>
        <div className="pb-leaks">
          {LEAKS.map(k => (
            <div key={k.n} className="card pb-leak">
              <span className="pb-leak-n">{k.n}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{k.title}</div>
                <div className="task-sub" style={{ lineHeight: 1.45 }}>{k.cost}</div>
                <div style={{ fontSize: 12, color: k.status === "live" ? "var(--accent)" : "var(--text-2)" }}>{k.fix}</div>
                <span className={`status ${k.status === "live" ? "settled" : k.status === "planned" ? "sent" : "void"}`} style={{ alignSelf: "flex-start", marginTop: 2 }}>
                  {k.status === "live" ? "Live" : k.status === "planned" ? "Planned" : "Parked"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
