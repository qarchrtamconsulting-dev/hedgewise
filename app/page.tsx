import Link from "next/link";

const SECTIONS = [
  { href: "/tools", title: "Tools", body: "Low hold, free bet, risk free and profit boost finders with live odds." },
  { href: "/clients", title: "Clients", body: "Roster, plays, settlements, loan ledger and payments." },
];

export default function Home() {
  return (
    <div style={{ paddingTop: 16 }}>
      <h1 className="page-title">Hedgewise</h1>
      <p className="page-sub">Promo arbitrage command center</p>
      <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 720, marginTop: 24 }}>
        {SECTIONS.map(s => (
          <Link key={s.href} href={s.href} className="card card-link" style={{ padding: 18 }}>
            <div className="section-title">{s.title}</div>
            <div style={{ color: "var(--text-2)", fontSize: 13, marginTop: 6 }}>{s.body}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
