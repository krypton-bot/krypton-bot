import { NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { leaderboard, type Leader, type LeaderWindow } from "@/lib/polymarket/public";

const TTL = 60_000;
const cache = new Map<string, { at: number; rows: Leader[] }>();
const WINDOWS = new Set(["DAY", "WEEK", "MONTH", "ALL"]);

/** Public Polymarket profit leaderboard (cached 60s). */
export const GET = withApi(async (req) => {
  const w = (new URL(req.url).searchParams.get("window") ?? "WEEK").toUpperCase();
  const window = (WINDOWS.has(w) ? w : "WEEK") as LeaderWindow;
  const hit = cache.get(window);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json({ leaders: hit.rows });
  try {
    const rows = await leaderboard(window, 50);
    cache.set(window, { at: Date.now(), rows });
    return NextResponse.json({ leaders: rows });
  } catch {
    if (hit) return NextResponse.json({ leaders: hit.rows, stale: true });
    return NextResponse.json({ error: "Leaderboard unavailable right now." }, { status: 502 });
  }
});
