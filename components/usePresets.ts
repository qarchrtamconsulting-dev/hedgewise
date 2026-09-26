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

  const save = async (name: string, state: PresetState) => {
    if (mode === "cloud") {
      try {
        const { error } = await (await db()).from("presets").insert({ tool, name, state });
        if (!error) return load();
      } catch {}
      setMode("local");
    }
    const all = readLocal();
    all.push({ id: `l-${Date.now()}`, tool, name, ...state });
    writeLocal(all);
    load();
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
  return { builtIn, saved, mode, save, remove };
}
