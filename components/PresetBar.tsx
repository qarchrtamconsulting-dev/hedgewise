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

export default function PresetBar({ tool, current, apply, initialName }: Props) {
  const { builtIn, saved, mode, save, remove } = usePresets(tool);
  const [selected, setSelected] = useState<string>("");
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const all: Preset[] = [...saved, ...builtIn];
  const active = all.find(p => p.id === selected);

  const notify = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 1800); };

  const choose = (id: string) => {
    setSelected(id);
    const p = all.find(x => x.id === id);
    if (p) apply({ config: p.config, inputs: p.inputs });
  };

  const doSave = async () => {
    const n = name.trim();
    if (!n) return;
    await save(n, current);
    setName(""); setNaming(false);
    notify(mode === "cloud" ? "Preset saved" : "Saved on this device");
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

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <span className="label">Preset</span>
        <select className="input" value={selected} onChange={e => choose(e.target.value)}>
          <option value="">{initialName ? `Shared: ${initialName}` : "Choose a preset"}</option>
          {saved.length > 0 && (
            <optgroup label="Saved">
              {saved.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </optgroup>
          )}
          <optgroup label="Standard">
            {builtIn.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </optgroup>
        </select>
      </div>

      {naming ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="input" autoFocus placeholder="Preset name" value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") doSave(); if (e.key === "Escape") setNaming(false); }}
          />
          <button className="btn-ghost" onClick={doSave}>Save</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="btn-ghost" onClick={() => setNaming(true)}>Save current</button>
          <button className="btn-ghost" onClick={copyLink}>Copy link</button>
          {active && !active.builtIn && (
            <button className="btn-ghost" onClick={() => { remove(active.id); setSelected(""); notify("Preset deleted"); }}>Delete</button>
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
