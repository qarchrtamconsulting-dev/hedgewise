"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AccountMenu from "@/components/AccountMenu";
import CommandBar from "@/components/CommandBar";
import { today } from "@/lib/db";
import { loadOps } from "@/lib/ops";

const PRIMARY = [
  { href: "/", label: "Board", count: "due" as const },
  { href: "/tools", label: "Find" },
  { href: "/money", label: "Money", count: "collect" as const },
];
const MORE = [
  { href: "/clients", label: "Clients" },
  { href: "/today", label: "Today checklist" },
  { href: "/onboarding", label: "Onboarding", count: "leads" as const },
  { href: "/playbook", label: "Playbook" },
];

type Counts = { due: number; collect: number; leads: number };

/** What needs you: clients with something due today, clients to collect from, people not live yet. */
let lastCounts: { at: number; n: Counts } | null = null;
function useCounts(path: string) {
  const [n, setN] = useState<Counts | null>(lastCounts?.n || null);
  useEffect(() => {
    let alive = true;
    if (lastCounts && Date.now() - lastCounts.at < 60_000) { setN(lastCounts.n); return; }
    (async () => {
      try {
        const { entries } = await loadOps(today());
        const c = {
          due: entries.filter(e => e.todo.length).length,
          collect: entries.filter(e => e.collect).length,
          leads: entries.filter(e => e.lead).length,
        };
        lastCounts = { at: Date.now(), n: c };
        if (alive) setN(c);
      } catch {}
    })();
    return () => { alive = false; };
  }, [path]);
  return n;
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const cur = document.documentElement.getAttribute("data-theme");
    if (cur === "light" || cur === "dark") setTheme(cur);
  }, []);

  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("hw-theme", next); } catch {}
  };

  return (
    <button className="icon-btn" onClick={flip} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title="Toggle theme">
      {theme === "dark" ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

function More({ path, counts }: { path: string; counts: Counts | null }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const inMore = MORE.some(l => path.startsWith(l.href));
  return (
    <div ref={wrap} className="nav-more">
      <button className={`nav-link${inMore ? " active" : ""}`} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="true">
        More{counts?.leads ? <span className="nav-count"> · {counts.leads}</span> : null}
      </button>
      {open && (
        <div className="card nav-more-menu">
          {MORE.map(l => (
            <Link key={l.href} href={l.href} className={path.startsWith(l.href) ? "active" : ""}>
              <span>{l.label}</span>
              {l.count && counts?.[l.count] ? <span className="nav-count">{counts[l.count]}</span> : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TopBar() {
  const path = usePathname() || "/";
  const counts = useCounts(path);
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark" />
        <span className="brand-name">Hedgewise</span>
      </Link>
      <nav className="nav">
        {PRIMARY.map(l => (
          <Link key={l.href} href={l.href} className={`nav-link${(l.href === "/" ? path === "/" : path.startsWith(l.href)) ? " active" : ""}`}>
            {l.label}{l.count && counts?.[l.count] ? <span className="nav-count"> · {counts[l.count]}</span> : null}
          </Link>
        ))}
        <More path={path} counts={counts} />
      </nav>
      <div className="topbar-right">
        <CommandBar />
        <AccountMenu />
        <ThemeToggle />
      </div>
    </header>
  );
}
