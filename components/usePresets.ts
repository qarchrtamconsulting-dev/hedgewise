"use client";
import { useCallback, useEffect, useState } from "react";
import { BUILT_IN, Preset, PresetState, ToolKey } from "@/lib/presets";

const LOCAL_KEY = "hw-presets";

function readLocal(): Preset[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch { return []; }
}
function writeLocal(all: Preset[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(all)); } catch {}
}

// Loaded lazily so a missing Supabase env var can never break the Tools page.
async function db() {
  const { supabase } = await import("@/lib/supabase");
  return supabase;
}

/**
 * Saved presets for one tool.
 * Uses the Supabase `presets` table (shared across every device) and falls back
 * to this browser's storage if that table hasn't been created yet.
 */
export function usePresets(tool: ToolKey) {
  const [saved, setSaved] = useState<Preset[]>([]);
  const [mode, setMode] = useState<"cloud" | "local">("cloud");

  const load = useCallback(async () => {
    try {
      const { data, error } = await (await db()).from("presets").select("*").eq("tool", tool).order("name");
      if (error) throw error;
      setMode("cloud");
      setSaved((data || []).map((r: any) => ({ id: r.id, tool: r.tool, name: r.name, ...(r.state as PresetState) })));
    } catch {
      setMode("local");
      setSaved(readLocal().filter(p => p.tool === tool));
    }
  }, [tool]);

  useEffect(() => { load(); }, [load]);

  /** Saves a new preset and returns its id. */
  const save = async (name: string, state: PresetState): Promise<string | null> => {
    if (mode === "cloud") {
      try {
        const { data, error } = await (await db()).from("presets").insert({ tool, name, state }).select("id").single();
        if (!error) { await load(); return (data as any)?.id ?? null; }
      } catch {}
      setMode("local");
    }
    const all = readLocal();
    const id = `l-${Date.now()}`;
    all.push({ id, tool, name, ...state });
    writeLocal(all);
    await load();
    return id;
  };

  /** Changes a saved preset's settings and/or name. Returns false if it couldn't be saved. */
  const update = async (id: string, patch: { name?: string; state?: PresetState }): Promise<boolean> => {
    if (id.startsWith("l-")) {
      writeLocal(readLocal().map(p => (p.id !== id ? p : { ...p, ...(patch.state || {}), ...(patch.name ? { name: patch.name } : {}) })));
      await load();
      return true;
    }
    try {
      const row: Record<string, unknown> = {};
      if (patch.name) row.name = patch.name;
      if (patch.state) row.state = patch.state;
      const { error } = await (await db()).from("presets").update(row).eq("id", id);
      if (error) return false;
      await load();
      return true;
    } catch { return false; }
  };

  const remove = async (id: string) => {
    if (id.startsWith("l-")) {
      writeLocal(readLocal().filter(p => p.id !== id));
    } else {
      try { await (await db()).from("presets").delete().eq("id", id); } catch {}
    }
    load();
  };

  const builtIn = BUILT_IN.filter(p => p.tool === tool);
  return { builtIn, saved, mode, save, update, remove };
}
