import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Hedgewise",
  description: "Promo arbitrage command center",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ minHeight: "100vh", background: "#05050f" }}>
          <header style={{ borderBottom: "1px solid #0e0e20", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#07070e" }}>
            <Link href="/">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00e5ff", boxShadow: "0 0 12px #00e5ff88" }} />
                <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: 3.5 }}>HEDGEWISE</span>
              </div>
            </Link>
            <nav style={{ display: "flex", gap: 4 }}>
              <Link href="/tools"><button className="tab">🛠 Tools</button></Link>
              <Link href="/clients"><button className="tab">👥 Clients</button></Link>
            </nav>
          </header>
          <main style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>{children}</main>
        </div>
      </body>
    </html>
  );
}
