import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getScores } from "@/lib/scores-server";

// Final scores for "Check scores" in the browser. Signed-in users only; cached per sport (see lib/scores-server).
export const dynamic = "force-dynamic";

async function signedIn(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return false;
  const { data, error } = await createClient(url, anon, { auth: { persistSession: false } }).auth.getUser(token);
  return !error && !!data?.user;
}

export async function GET(req: NextRequest) {
  if (!(await signedIn(req))) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const key = process.env.ODDS_API_KEY;
  if (!key) return NextResponse.json({ error: "ODDS_API_KEY is not set" }, { status: 500 });
  const asked = (new URL(req.url).searchParams.get("sports") || "").split(",").map(s => s.trim()).filter(Boolean);
  return NextResponse.json(await getScores(asked, key));
}
