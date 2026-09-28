"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getDb } from "@/lib/db";
import { BUILT_IN, shareUrl } from "@/lib/presets";

interface Hit { kind: "Client" | "Find" | "Page"; label: string; sub?: string; go: () => string }
interface C { id: string; name: string; status: string | null }

const PAGES: { label: string; href: string; words: string }[] = [
  { label: "Board", href: "/", words: "board home clients due" },
  { label: "Find a game", href: "/tools", words: "find tools games odds" },
  { label: "Money", href: "/money", words: "money collect owed payments referrals" },
  { label: "Clients", href: "/clients", words: "clients roster" },
  { label: "Today checklist", href: "/today", words: "today checklist tasks" },
  { label: "Onboarding", href: "/onboarding", words: "onboarding leads new" },
  { label: "Playbook", href: "/playbook", words: "playbook process" },
  { label: "Import data", href: "/import", words: "import upload" },
];

// Shorthand people type for books: "fd 500 fb", "dk min loss", "tsb 1k rfb".
const ALIASES: [RegExp, string][] = [
  [/\bfd\b/g, "fanduel"], [/\bdk\b/g, "draftkings"], [/\btsb\b|\bscore\b/g, "thescore"], [/\bmgm\b/g, "betmgm"],
  [/\bczr\b/g, "caesars"], [/\bbr\b/g, "betrivers"], [/\bfb\b/g, "free bet"], [/\brfb\b|\brf\b/g, "risk free"],
  [/\bml\b/g, "min loss"], [/\blh\b/g, "low hold"],
];
const norm = (s: string) => {
  let x = s.toLowerCase().replace(/[$,]/g, " ");
  ALIASES.forEach(([re, to]) => { x = x.replace(re, to); });
  return x.replace(/\s+/g, " ").trim();
};
const matches = (hay: string, q: string) => norm(q).split(" ").filter(Boolean).every(w => norm(hay).includes(w));

/** Search: Cmd/Ctrl+K anywhere. Jump to a client, open a finder preset, or go to a page. */
export default function CommandBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [on, setOn] = useState(0);
  const [clients, setClients] = useState<C[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(o => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ(""); setOn(0);
    setTimeout(() => input.current?.focus(), 0);
    if (clients) return;
    (async () => {
      try {
        const { data } = await (await getDb()).from("clients").select("id,name,status").order("name");
        setClients((data || []) as C[]);
      } catch { setClients([]); }
    })();
  }, [open, clients]);

  const hits = useMemo<Hit[]>(() => {
    const text = q.trim();
    const out: Hit[] = [];
    const cs = (clients || []).filter(c => c.status !== "inactive" || text.length >= 2);
    if (text) {
      cs.filter(c => matches(c.name, text)).slice(0, 6).forEach(c => {
        out.push({ kind: "Client", label: c.name, sub: c.status === "inactive" ? "inactive" : undefined, go: () => `/clients/${c.id}` });
      });
      // "dylan find" or a single client match also offers Find a game for them.
      const one = cs.filter(c => matches(c.name, text.split(" ")[0] || ""));
      if (one.length === 1 && text.split(" ").length <= 2) {
        out.push({ kind: "Find", label: `Find a game for ${one[0].name}`, go: () => `/tools?client=${one[0].id}` });
      }
      BUILT_IN.filter(p => matches(`${p.name} ${p.tool}`, text)).slice(0, 5).forEach(p => {
        out.push({ kind: "Find", label: p.name, go: () => shareUrl(p.tool, { config: p.config, inputs: p.inputs }, p.name).replace(window.location.origin, "") });
      });
      PAGES.filter(p => matches(`${p.label} ${p.words}`, text)).forEach(p => out.push({ kind: "Page", label: p.label, go: () => p.href }));
    } else {
      PAGES.forEach(p => out.push({ kind: "Page", label: p.label, go: () => p.href }));
    }
    return out;
  }, [q, clients]);

  useEffect(() => { setOn(0); }, [q]);

  const pick = (h?: Hit) => {
    if (!h) return;
    setOpen(false);
    router.push(h.go());
  };

  return (
    <>
      <button className="search-btn" onClick={() => setOpen(true)} aria-label="Search clients, presets and pages">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <span className="search-label">Search</span>
        <span className="search-kbd">⌘K</span>
      </button>
      {open && (
        <div className="cmd-back" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="cmd" role="dialog" aria-modal="true" aria-label="Search">
            <input ref={input} className="cmd-input" value={q} placeholder="Client name, “fd 500 fb”, or a page…"
              aria-label="Search" autoComplete="off" autoCorrect="off" spellCheck={false}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Escape") setOpen(false);
                else if (e.key === "ArrowDown") { e.preventDefault(); setOn(i => Math.min(i + 1, hits.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setOn(i => Math.max(i - 1, 0)); }
                else if (e.key === "Enter") { e.preventDefault(); pick(hits[on]); }
              }} />
            <div className="cmd-list" role="listbox">
              {hits.length === 0 && <div className="cmd-empty">{clients === null ? "Loading…" : "Nothing matches."}</div>}
              {hits.map((h, i) => (
                <div key={`${h.kind}${h.label}${i}`} role="option" aria-selected={i === on} className={`cmd-item${i === on ? " on" : ""}`}
                  onMouseEnter={() => setOn(i)} onClick={() => pick(h)}>
                  <span>{h.label}{h.sub ? <span className="task-sub"> · {h.sub}</span> : null}</span>
                  <span className="cmd-kind">{h.kind}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
