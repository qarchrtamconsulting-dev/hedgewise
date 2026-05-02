import Link from "next/link";

export default function Home() {
  return (
    <div style={{ padding: "40px 0" }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: 2, marginBottom: 8 }}>HEDGEWISE</h1>
      <p style={{ color: "#888", fontSize: 14, marginBottom: 32 }}>Promo arbitrage command center</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 700 }} className="grid-2col">
        <Link href="/tools">
          <div className="card" style={{ cursor: "pointer", borderColor: "#00e5ff44", padding: 24 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🛠</div>
            <div style={{ color: "#00e5ff", fontWeight: 800, letterSpacing: 2, fontSize: 12, marginBottom: 8 }}>TOOLS</div>
            <div style={{ color: "#fff", fontSize: 14, lineHeight: 1.5 }}>Free Bet, Risk Free, Profit Boost, Low Hold finder</div>
          </div>
        </Link>
        <Link href="/clients">
          <div className="card" style={{ cursor: "pointer", borderColor: "#b388ff44", padding: 24 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
            <div style={{ color: "#b388ff", fontWeight: 800, letterSpacing: 2, fontSize: 12, marginBottom: 8 }}>CLIENTS</div>
            <div style={{ color: "#fff", fontSize: 14, lineHeight: 1.5 }}>Roster, promos, action queue, payment splits</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
