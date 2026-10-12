import { NextResponse } from "next/server";
import { db, ready, schema } from "@/db";
import { hostAllowed } from "@/lib/api";
import { sse } from "@/lib/sse";
import { leaderboard } from "@/lib/polymarket/public";
import { liveTrades, type LiveTrade } from "@/lib/polymarket/live-trades";

export const dynamic = "force-dynamic";

const WHALE_USD = 1_000;
const g = globalThis as unknown as { topWallets?: { at: number; set: Set<string> } };

async function topWallets() {
  if (g.topWallets && Date.now() - g.topWallets.at < 5 * 60_000) return g.topWallets.set;
  const set = new Set((await leaderboard("WEEK", 50).catch(() => [])).map((l) => l.wallet));
  g.topWallets = { at: Date.now(), set };
  return set;
}

/** Live Polymarket trades for the copy dashboard (SSE): whales, this week top-50 traders and the wallets you copy. */
export async function GET(req: Request) {
  if (!hostAllowed(req)) return NextResponse.json({ error: "This app only answers on localhost." }, { status: 403 });
  await ready();
  const followed = new Set((await db.select({ w: schema.copyFollows.wallet }).from(schema.copyFollows)).map((r) => r.w));
  const top = await topWallets();
  const feed = liveTrades();
  const tag = (t: LiveTrade) => ({ ...t, top: top.has(t.wallet), followed: followed.has(t.wallet) });
  const keep = (t: LiveTrade) => t.usd >= WHALE_USD || top.has(t.wallet) || followed.has(t.wallet);
  return sse(req, (send) => {
    send({ live: feed.live, trades: feed.recent.filter(keep).slice(0, 50).map(tag) }, "snapshot");
    const onTrade = (t: LiveTrade) => keep(t) && send(tag(t));
    feed.on("trade", onTrade);
    return () => feed.off("trade", onTrade);
  });
}
