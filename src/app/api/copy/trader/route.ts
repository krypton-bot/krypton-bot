import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi } from "@/lib/api";
import { traderProfile } from "@/lib/polymarket/public";

const TTL = 5 * 60_000;
const cache = new Map<string, { at: number; v: Awaited<ReturnType<typeof traderProfile>> }>();

/** Trader stats shown before you copy: P/L per window, win rate, rhythm, market mix (public Polymarket data, cached 5 min). */
export const GET = withApi(async (req) => {
  const { wallet } = z.object({ wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet") }).parse({ wallet: new URL(req.url).searchParams.get("wallet") });
  const w = wallet.toLowerCase();
  const hit = cache.get(w);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json({ profile: hit.v });
  const v = await traderProfile(w);
  cache.set(w, { at: Date.now(), v });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return NextResponse.json({ profile: v });
});
