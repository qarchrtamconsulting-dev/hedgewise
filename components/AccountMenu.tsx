"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { getDb } from "@/lib/db";
import { checkNewPassword } from "@/lib/password";

/** Top-bar "Account" button: shows who's signed in, change password, sign out. */
export default function AccountMenu() {
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const db = await getDb();
        const { data } = await db.auth.getSession();
        setEmail(data.session?.user.email ?? null);
        const { data: sub } = db.auth.onAuthStateChange((_e, s) => setEmail(s?.user.email ?? null));
        unsub = () => sub.subscription.unsubscribe();
      } catch {}
    })();
    return () => unsub?.();
  }, []);

  // Close when tapping outside the menu or pressing Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => { if (!open) setChanging(false); }, [open]);

  if (!email) return null;

  const signOut = async () => {
    if (!window.confirm("Sign out of Hedgewise on this device?")) return;
    // "local" signs out only this device; the default ("global") also logs out every other device.
    (await getDb()).auth.signOut({ scope: "local" });
  };

  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <button className="btn-ghost" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="true">
        Account
      </button>
      {open && (
        <div className="card account-menu">
          <div className="label" style={{ marginBottom: 2 }}>Signed in as</div>
          <div style={{ fontSize: 13, marginBottom: 14, wordBreak: "break-all" }}>{email}</div>

          {changing ? (
            <ChangePassword email={email} onDone={() => setChanging(false)} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="btn-ghost" style={{ padding: "8px 10px" }} onClick={() => setChanging(true)}>Change password</button>
              <button className="btn-ghost" style={{ padding: "8px 10px" }} onClick={signOut}>Sign out</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChangePassword({ email, onDone }: { email: string; onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = checkNewPassword(pw, pw2);
    if (problem) { setErr(problem); return; }
    if (pw === current) { setErr("The new password is the same as the current one."); return; }
    setBusy(true); setErr(null);
    try {
      const db = await getDb();
      // Confirm the current password first, so an unlocked phone alone can't change it.
      const check = await db.auth.signInWithPassword({ email, password: current });
      if (check.error) { setErr("Current password is wrong."); setBusy(false); return; }
      const { error } = await db.auth.updateUser({ password: pw });
      if (error) setErr(error.message);
      else setSaved(true);
    } catch (e: any) {
      setErr(e?.message || "Couldn't change the password.");
    }
    setBusy(false);
  };

  if (saved) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13, color: "var(--pos)" }}>Password changed.</div>
        <p className="hint" style={{ marginTop: 0 }}>Update it in your saved passwords too, if your phone doesn&apos;t offer to.</p>
        <button className="btn-ghost" style={{ padding: "8px 10px" }} onClick={onDone}>Done</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Hidden username so password managers know which login to update. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <div>
        <label className="label" htmlFor="hw-cur">Current password</label>
        <input id="hw-cur" name="current-password" className="input" type="password" autoComplete="current-password"
          value={current} onChange={e => setCurrent(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="hw-np">New password</label>
        <input id="hw-np" name="new-password" className="input" type="password" autoComplete="new-password"
          value={pw} onChange={e => setPw(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="hw-np2">Confirm new password</label>
        <input id="hw-np2" name="confirm-password" className="input" type="password" autoComplete="new-password"
          value={pw2} onChange={e => setPw2(e.target.value)} required />
      </div>
      <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
      {err && <div style={{ color: "var(--neg)", fontSize: 12 }}>{err}</div>}
      <button type="button" className="btn-ghost" style={{ padding: "8px 10px" }} onClick={onDone}>Cancel</button>
    </form>
  );
}
