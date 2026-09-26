"use client";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { getDb } from "@/lib/db";

type State = "loading" | "in" | "out" | "error";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const db = await getDb();
        const { data } = await db.auth.getSession();
        setState(data.session ? "in" : "out");
        const { data: sub } = db.auth.onAuthStateChange((_e, s) => setState(s ? "in" : "out"));
        unsub = () => sub.subscription.unsubscribe();
      } catch {
        setState("error");
      }
    })();
    return () => unsub?.();
  }, []);

  if (state === "loading") return <div style={{ minHeight: "60vh" }} />;
  if (state === "error") {
    return (
      <Centered>
        <div className="section-title">Database not configured</div>
        <p className="hint">The Supabase URL and key are missing from this deployment's environment variables.</p>
      </Centered>
    );
  }
  if (state === "out") return <Login />;
  return <>{children}</>;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: "12vh" }}>
      <div className="card" style={{ width: "100%", maxWidth: 360, padding: 24 }}>{children}</div>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const db = await getDb();
      const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setErr(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
    } catch (e: any) {
      setErr(e?.message || "Sign in failed.");
    }
    setBusy(false);
  };

  return (
    <Centered>
      <div className="section-title" style={{ fontSize: 16 }}>Sign in</div>
      <p className="page-sub" style={{ marginBottom: 18 }}>Hedgewise is private. Sign in to continue.</p>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <span className="label">Email</span>
          <input className="input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div>
          <span className="label">Password</span>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        {err && <div style={{ color: "var(--neg)", fontSize: 12 }}>{err}</div>}
      </form>
    </Centered>
  );
}
