"use client";
import { useState } from "react";
import { usePresets } from "./usePresets";
import { Preset, PresetState, ToolKey, shareUrl } from "@/lib/presets";
import { copyText } from "@/lib/clipboard";

interface Props {
  tool: ToolKey;
  current: PresetState;
  apply: (p: PresetState) => void;
  /** Name of the preset loaded from a shared link, if any */
  initialName?: string;
}

/** Same settings? Key order and "500" vs 500 don't count as a change. */
function sameState(a: PresetState, b: PresetState) {
  const norm = (v: any): any => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object") return Object.keys(v).sort().reduce((o, k) => { if (v[k] !== undefined) o[k] = norm(v[k]); return o; }, {} as any);
    if (typeof v === "number") return String(v);
    return v;
  };
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

type Naming = null | "new" | "rename" | "copy";

// Picking a preset jumps to the results, which unmounts this bar; remember the pick so Back keeps it.
const lastPick: Partial<Record<ToolKey, string>> = {};

export default function PresetBar({ tool, current, apply, initialName }: Props) {
  const { builtIn, saved, mode, save, update, remove } = usePresets(tool);
  const [selected, setSelectedState] = useState<string>(() => lastPick[tool] || "");
  const setSelected = (id: string) => { lastPick[tool] = id; setSelectedState(id); };
  const [naming, setNaming] = useState<Naming>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const all: Preset[] = [...saved, ...builtIn];
  const active = all.find(p => p.id === selected);
  const changed = !!active && !sameState(current, { config: active.config, inputs: active.inputs });

  const notify = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 2200); };

  const choose = (id: string) => {
    setSelected(id);
    setNaming(null);
    const p = all.find(x => x.id === id);
    if (p) apply({ config: p.config, inputs: p.inputs });
  };

  const startNaming = (kind: Exclude<Naming, null>) => {
    setNaming(kind);
    setName(kind === "rename" ? active?.name || "" : kind === "copy" ? `${active?.name || "Preset"} (mine)` : "");
  };

  const submitName = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    if (naming === "rename" && active) {
      const ok = await update(active.id, { name: n });
      notify(ok ? "Preset renamed" : "Couldn't rename it. Try again");
    } else {
      const id = await save(n, current);
      if (id) setSelected(id);
      notify(mode === "cloud" ? "Preset saved" : "Saved on this device");
    }
    setBusy(false);
    setName(""); setNaming(null);
  };

  const doUpdate = async () => {
    if (!active || active.builtIn || busy) return;
    setBusy(true);
    const ok = await update(active.id, { state: current });
    setBusy(false);
    notify(ok ? `Updated “${active.name}”` : "Couldn't update it. Try again");
  };

  const copyLink = async () => {
    const url = shareUrl(tool, current, active?.name || initialName);
    if (await copyText(url)) {
      notify("Link copied");
    } else {
      window.history.replaceState(null, "", url);
      notify("Couldn't copy. The link is in the address bar");
    }
  };

  const placeholder = naming === "rename" ? "New name" : "Name this preset";
  const submitLabel = naming === "rename" ? "Rename" : "Save";

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <span className="label">Preset</span>
        <select className="input" value={selected} onChange={e => choose(e.target.value)}>
          <option value="">{initialName ? `Shared: ${initialName}` : "Choose a preset to load games"}</option>
          {saved.length > 0 && (
            <optgroup label="Saved">
              {saved.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </optgroup>
          )}
          <optgroup label="Standard">
            {builtIn.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </optgroup>
        </select>
        {active && changed && <div className="hint" style={{ marginTop: 6 }}>Changed since you loaded “{active.name}”.</div>}
      </div>

      {naming ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="input" autoFocus placeholder={placeholder} value={name} aria-label={placeholder}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submitName(); if (e.key === "Escape") setNaming(null); }}
          />
          <button className="btn-ghost" onClick={submitName} disabled={busy || !name.trim()}>{submitLabel}</button>
          <button className="btn-ghost" onClick={() => setNaming(null)}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {active && !active.builtIn && (
            <button className={changed ? "btn-primary" : "btn-ghost"} style={{ width: "auto", padding: "8px 14px" }}
              onClick={doUpdate} disabled={!changed || busy} title={changed ? "Save the current settings into this preset" : "Change a setting to update this preset"}>
              Update
            </button>
          )}
          {active && active.builtIn && (
            <button className={changed ? "btn-primary" : "btn-ghost"} style={{ width: "auto", padding: "8px 14px" }} onClick={() => startNaming("copy")}>
              Save as my own
            </button>
          )}
          <button className="btn-ghost" onClick={() => startNaming("new")}>New preset</button>
          {active && !active.builtIn && <button className="btn-ghost" onClick={() => startNaming("rename")}>Rename</button>}
          <button className="btn-ghost" onClick={copyLink}>Copy link</button>
          {active && !active.builtIn && (
            <button className="btn-ghost" onClick={() => {
              if (!window.confirm(`Delete “${active.name}”?`)) return;
              remove(active.id); setSelected(""); notify("Preset deleted");
            }}>Delete</button>
          )}
        </div>
      )}

      {flash && <div style={{ color: "var(--text-2)", fontSize: 12 }}>{flash}</div>}
      {mode === "local" && !flash && (
        <div className="hint" style={{ marginTop: 0 }}>Saved presets are stored on this device until the presets table is set up.</div>
      )}
    </div>
  );
}
