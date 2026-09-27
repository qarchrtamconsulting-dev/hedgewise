"use client";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { getDb } from "@/lib/db";
import { checkNewPassword } from "@/lib/password";
import { autoGrade, lastGames } from "@/lib/autograde";

type State = "loading" | "in" | "out" | "recovery" | "error";

// Read the reset-link details from the URL before Supabase consumes and clears them.
// A password-reset email lands here with #...type=recovery (or #error=... if the link expired).
const initialHash = typeof window !== "undefined" ? window.location.hash : "";
const arrivedFromReset = /type=recovery/.test(initialHash);
const resetLinkError = (() => {
  const m = /error_description=([^&]+)/.exec(initialHash);
  if (!m) return null;
  const msg = decodeURIComponent(m[1].replace(/\+/g, " "));
  return /expired|invalid/i.test(msg) ? "That reset link has expired or was already used. Send a new one." : msg;
})();

export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>("loading");
  const recovering = useRef(arrivedFromReset);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const db = await getDb();
        const { data } = await db.auth.getSession();
        if (recovering.current && data.session) setState("recovery");
        else setState(data.session ? "in" : "out");
        const { data: sub } = db.auth.onAuthStateChange((event, s) => {
          if (event === "PASSWORD_RECOVERY") { recovering.current = true; setState("recovery"); return; }
          if (!s) { recovering.current = false; setState("out"); return; }
          setState(recovering.current ? "recovery" : "in");
        });
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
  if (state === "recovery") {
    return <SetNewPassword onDone={() => { recovering.current = false; setState("in"); }} />;
  }
  if (state === "out") return <Login />;
  return <><AutoGrader />{children}</>;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: "12vh" }}>
      <div className="card" style={{ width: "100%", maxWidth: 360, padding: 24 }}>{children}</div>
    </div>
  );
}

const formStyle = { display: "flex", flexDirection: "column" as const, gap: 12 };
const errStyle = { color: "var(--neg)", fontSize: 12 };
const linkBtn = {
  background: "none", border: "none", padding: 0, cursor: "pointer",
  color: "var(--muted)", fontSize: 12, textDecoration: "underline", alignSelf: "center" as const,
};

function Login() {
  const [mode, setMode] = useState<"signin" | "forgot" | "sent">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(resetLinkError);

  const signIn = async (e: FormEvent) => {
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

  const sendReset = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const db = await getDb();
      const { error } = await db.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      if (error) {
        setErr(/rate limit/i.test(error.message) ? "Too many reset emails. Wait a few minutes and try again." : error.message);
      } else {
        setMode("sent");
      }
    } catch (e: any) {
      setErr(e?.message || "Couldn't send the email.");
    }
    setBusy(false);
  };

  const emailField = (
    <div>
      <label className="label" htmlFor="hw-email">Email</label>
      <input
        id="hw-email" name="username" className="input" type="email" inputMode="email"
        autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        value={email} onChange={e => setEmail(e.target.value)} required
      />
    </div>
  );

  if (mode === "sent") {
    return (
      <Centered>
        <div className="section-title" style={{ fontSize: 16 }}>Check your email</div>
        <p className="page-sub" style={{ marginBottom: 18 }}>
          If {email.trim() || "that address"} has a Hedgewise login, a reset link is on its way. Open it on this device to set a new password. Check spam if it doesn&apos;t show up in a minute.
        </p>
        <button style={linkBtn} onClick={() => { setMode("signin"); setErr(null); }}>Back to sign in</button>
      </Centered>
    );
  }

  if (mode === "forgot") {
    return (
      <Centered>
        <div className="section-title" style={{ fontSize: 16 }}>Reset password</div>
        <p className="page-sub" style={{ marginBottom: 18 }}>We&apos;ll email you a link to set a new one.</p>
        <form onSubmit={sendReset} style={formStyle}>
          {emailField}
          <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
          {err && <div style={errStyle}>{err}</div>}
          <button type="button" style={linkBtn} onClick={() => { setMode("signin"); setErr(null); }}>Back to sign in</button>
        </form>
      </Centered>
    );
  }

  return (
    <Centered>
      <div className="section-title" style={{ fontSize: 16 }}>Sign in</div>
      <p className="page-sub" style={{ marginBottom: 18 }}>Hedgewise is private. Sign in to continue.</p>
      <form onSubmit={signIn} method="post" action="#" autoComplete="on" style={formStyle}>
        {emailField}
        <div>
          <label className="label" htmlFor="hw-password">Password</label>
          <input
            id="hw-password" name="password" className="input" type="password"
            autoComplete="current-password"
            value={password} onChange={e => setPassword(e.target.value)} required
          />
        </div>
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        {err && <div style={errStyle}>{err}</div>}
        <button type="button" style={linkBtn} onClick={() => { setMode("forgot"); setErr(null); }}>Forgot password?</button>
      </form>
    </Centered>
  );
}

function SetNewPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = checkNewPassword(pw, pw2);
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr(null);
    try {
      const db = await getDb();
      const { error } = await db.auth.updateUser({ password: pw });
      if (error) setErr(error.message);
      else onDone();
    } catch (e: any) {
      setErr(e?.message || "Couldn't save the new password.");
    }
    setBusy(false);
  };

  return (
    <Centered>
      <div className="section-title" style={{ fontSize: 16 }}>Set a new password</div>
      <p className="page-sub" style={{ marginBottom: 18 }}>Pick a new password for Hedgewise.</p>
      <form onSubmit={submit} style={formStyle}>
        <div>
          <label className="label" htmlFor="hw-new">New password</label>
          <input id="hw-new" name="new-password" className="input" type="password" autoComplete="new-password"
            value={pw} onChange={e => setPw(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="hw-new2">Confirm new password</label>
          <input id="hw-new2" name="confirm-password" className="input" type="password" autoComplete="new-password"
            value={pw2} onChange={e => setPw2(e.target.value)} required />
        </div>
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
        {err && <div style={errStyle}>{err}</div>}
      </form>
    </Centered>
  );
}

/** While signed in: check open bets' games now and every 5 minutes the site stays open (free), and grade
 *  a play from the final score once its game ends. */
function AutoGrader() {
  useEffect(() => {
    autoGrade();
    const t = setInterval(() => autoGrade(), 5 * 60 * 1000);
    // Coming back to the tab (or the phone app) after a while: check right away.
    const onShow = () => { if (document.visibilityState === "visible" && Date.now() - (lastGames()?.at || 0) > 2 * 60 * 1000) autoGrade(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onShow); };
  }, []);
  return null;
}
