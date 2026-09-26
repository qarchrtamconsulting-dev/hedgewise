"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getDb } from "@/lib/db";

const LINKS = [
  { href: "/tools", label: "Tools" },
  { href: "/clients", label: "Clients" },
  { href: "/import", label: "Import" },
];

function SignOut() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const db = await getDb();
        const { data } = await db.auth.getSession();
        setSignedIn(!!data.session);
        const { data: sub } = db.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
        unsub = () => sub.subscription.unsubscribe();
      } catch {}
    })();
    return () => unsub?.();
  }, []);
  if (!signedIn) return null;
  return (
    <button className="btn-ghost" onClick={async () => { (await getDb()).auth.signOut(); }}>Sign out</button>
  );
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

export default function TopBar() {
  const path = usePathname() || "/";
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark" />
        <span className="brand-name">Hedgewise</span>
      </Link>
      <nav className="nav">
        {LINKS.map(l => (
          <Link key={l.href} href={l.href} className={`nav-link${path.startsWith(l.href) ? " active" : ""}`}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <SignOut />
        <ThemeToggle />
      </div>
    </header>
  );
}
