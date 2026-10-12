import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { LOCAL_USER } from "@/db/schema";
import { getPmBook, marketByToken, midpoints, type PmMarket } from "@/lib/polymarket/public";
import { getSettings, RiskError, type Settings } from "./index";
import { liveMarketOrder, livePositions, PmLiveError, walletInfo } from "./pm-live";

export type PmOrderInput = {
  tokenId: string;
  side: "buy" | "sell";
  usd?: number; // buy budget
  shares?: number; // sell size (default: whole position)
  limitPrice?: number; // buy: never pay above; sell: never sell below
  source: "manual" | "copy";
  copiedFrom?: string;
  copiedTx?: string;
  copyTiming?: { leaderTs: number; seenAt: number };
};

export type PmOrderResult = {
  status: "filled" | "partial" | "skipped";
  shares: number;
  avgPrice: number;
  usd: number;
  title: string;
  outcome: string;
  pnl?: number;
  message?: string;
  /** Copy trades: ms from the leader fill to us seeing it, and from seeing it to our fill. */
  detectMs?: number;
  execMs?: number;
};

const MARKET_TTL = 10 * 60_000;
// Promises are cached so concurrent followers of one leader share a single Gamma request.
const marketCache = new Map<string, { at: number; p: Promise<PmMarket | null> }>();

async function market(tokenId: string): Promise<{ m: PmMarket; outcome: string }> {
  let hit = marketCache.get(tokenId);
  if (!hit || Date.now() - hit.at >= MARKET_TTL) {
    hit = { at: Date.now(), p: marketByToken(tokenId) };
    marketCache.set(tokenId, hit);
    hit.p.catch(() => marketCache.delete(tokenId));
  }
  const m = await hit.p;
  if (!m) {
    marketCache.delete(tokenId);
    throw new RiskError(`Unknown prediction market token ${tokenId.slice(0, 10)}…`);
  }
  return { m, outcome: m.outcomes.find((o) => o.tokenId === tokenId)?.name ?? "?" };
}

async function realizedToday(mode: "paper" | "live") {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [r] = await db
    .select({ pnl: sql<number>`coalesce(sum(${schema.pmTrades.pnl}), 0)` })
    .from(schema.pmTrades)
    .where(and(eq(schema.pmTrades.mode, mode), gte(schema.pmTrades.createdAt, start)));
  return Number(r?.pnl ?? 0);
}

const timing = (o: PmOrderInput) =>
  o.copyTiming ? { detectMs: Math.max(0, o.copyTiming.seenAt - o.copyTiming.leaderTs), execMs: Date.now() - o.copyTiming.seenAt } : {};
const copyLatency = (o: PmOrderInput) => {
  const t = timing(o);
  return "execMs" in t ? { copyDetectMs: t.detectMs, copyExecMs: t.execMs } : {};
};

const skipped = (m: PmMarket, outcome: string, message: string): PmOrderResult => ({
  status: "skipped",
  shares: 0,
  avgPrice: 0,
  usd: 0,
  title: m.question,
  outcome,
  message,
});

/** Risk limits that apply to every new buy, paper or live: kill switch, per-order cap, daily loss stop. */
async function guardBuy(s: Settings, usd: number) {
  if (s.killSwitch) throw new RiskError("Kill switch is on. Turn it off in Settings to open new positions.");
  if (!(usd > 0)) throw new RiskError("Buy amount must be positive.");
  if (usd > s.maxNotional) throw new RiskError(`Order $${usd.toFixed(2)} exceeds your $${s.maxNotional} per-order limit.`);
  if ((await realizedToday(s.mode)) <= -s.dailyLossLimit) throw new RiskError("Daily loss stop hit. New buys are blocked until 00:00 UTC.");
}

/**
 * Prediction-market order. Paper mode fills against the live CLOB book; live mode sends a fill-and-kill market
 * order from your own wallet. Same risk limits either way.
 */
export async function pmOrder(o: PmOrderInput): Promise<PmOrderResult> {
  // Copy-trade hot path: warm the order book while settings and market metadata load.
  void getPmBook(o.tokenId).catch(() => {});
  const [s, mk] = await Promise.all([getSettings(), market(o.tokenId)]);
  const { m, outcome } = mk;
  if (!m.open) throw new RiskError(`"${m.question}" is not accepting orders.`);
  if (o.side === "buy" && m.settling) throw new RiskError("This event is over and its result is being confirmed, so new buys are closed. You can still sell.");
  return s.mode === "live" ? live(s, o, m, outcome) : o.side === "buy" ? buy(s, o, m, outcome) : sell(o, m, outcome);
}

async function live(s: Settings, o: PmOrderInput, m: PmMarket, outcome: string): Promise<PmOrderResult> {
  const [wallet, dup] = await Promise.all([
    walletInfo(),
    o.copiedTx
      ? db
          .select({ id: schema.pmTrades.id })
          .from(schema.pmTrades)
          .where(and(eq(schema.pmTrades.userId, LOCAL_USER), eq(schema.pmTrades.copiedTx, o.copiedTx)))
          .then((r) => r[0])
      : undefined,
  ]);
  if (!wallet.connected) throw new RiskError("Connect your Polymarket wallet in Settings to trade live.");
  if (dup) throw new RiskError("Already copied this trade.");
  let pos: { shares: number; avgPrice: number } | undefined;
  if (o.side === "buy") await guardBuy(s, o.usd ?? 0);
  else {
    pos = (await livePositions()).find((p) => p.tokenId === o.tokenId);
    if (!pos || pos.shares <= 1e-6) return skipped(m, outcome, "No position to sell.");
  }
  let fill;
  try {
    fill =
      o.side === "buy"
        ? await liveMarketOrder({ tokenId: o.tokenId, side: "buy", usd: o.usd ?? 0, limitPrice: o.limitPrice })
        : await liveMarketOrder({ tokenId: o.tokenId, side: "sell", shares: Math.min(pos!.shares, o.shares ?? pos!.shares), limitPrice: o.limitPrice });
  } catch (e) {
    if (e instanceof PmLiveError) return skipped(m, outcome, e.message);
    throw e;
  }
  const pnl = o.side === "sell" && pos ? fill.usd - fill.shares * pos.avgPrice : 0;
  await db
    .insert(schema.pmTrades)
    .values({ mode: "live", tokenId: o.tokenId, title: m.question, outcome, side: o.side, price: fill.avgPrice, shares: fill.shares, pnl, source: o.source, copiedFrom: o.copiedFrom, copiedTx: o.copiedTx, ...copyLatency(o) })
    .onConflictDoNothing();
  return { status: "filled", shares: fill.shares, avgPrice: fill.avgPrice, usd: fill.usd, title: m.question, outcome, ...(o.side === "sell" ? { pnl } : {}), ...timing(o) };
}

async function buy(s: Settings, o: PmOrderInput, m: PmMarket, outcome: string): Promise<PmOrderResult> {
  const usd = o.usd ?? 0;
  const [, book] = await Promise.all([guardBuy(s, usd), getPmBook(o.tokenId)]);
  let left = usd;
  let shares = 0;
  for (const l of book.asks) {
    if (o.limitPrice !== undefined && l.price > o.limitPrice) break;
    const take = Math.min(left / l.price, l.size);
    shares += take;
    left -= take * l.price;
    if (left < 1e-6) break;
  }
  const cost = usd - Math.max(0, left);
  if (!book.asks.length) return skipped(m, outcome, "Nobody is selling this outcome right now. Try again later or pick another market.");
  if (shares < book.minSize) return skipped(m, outcome, `Polymarket minimum is ${book.minSize} shares. Raise the amount or the price limit and try again.`);
  const avg = cost / shares;

  return db.transaction(async (tx) => {
    const [paid] = await tx
      .update(schema.userSettings)
      .set({ paperBalance: sql`${schema.userSettings.paperBalance} - ${cost}` })
      .where(and(eq(schema.userSettings.userId, LOCAL_USER), gte(schema.userSettings.paperBalance, cost)))
      .returning({ bal: schema.userSettings.paperBalance });
    if (!paid) throw new RiskError(`Not enough paper cash for $${cost.toFixed(2)}.`);
    const inserted = await tx
      .insert(schema.pmTrades)
      .values({ mode: "paper", tokenId: o.tokenId, title: m.question, outcome, side: "buy", price: avg, shares, source: o.source, copiedFrom: o.copiedFrom, copiedTx: o.copiedTx, ...copyLatency(o) })
      .onConflictDoNothing()
      .returning({ id: schema.pmTrades.id });
    if (!inserted.length) throw new RiskError("Already copied this trade.");
    await tx
      .insert(schema.pmPositions)
      .values({ tokenId: o.tokenId, title: m.question, outcome, slug: m.eventSlug ?? m.slug, shares, avgPrice: avg })
      .onConflictDoUpdate({
        target: [schema.pmPositions.userId, schema.pmPositions.tokenId],
        set: {
          avgPrice: sql`(${schema.pmPositions.avgPrice} * ${schema.pmPositions.shares} + ${cost}) / (${schema.pmPositions.shares} + ${shares})`,
          shares: sql`${schema.pmPositions.shares} + ${shares}`,
        },
      });
    return { status: left > 1e-6 ? "partial" : "filled", shares, avgPrice: avg, usd: cost, title: m.question, outcome, ...timing(o) } satisfies PmOrderResult;
  });
}

async function sell(o: PmOrderInput, m: PmMarket, outcome: string): Promise<PmOrderResult> {
  const where = and(eq(schema.pmPositions.userId, LOCAL_USER), eq(schema.pmPositions.tokenId, o.tokenId));
  const [[pos], book] = await Promise.all([db.select().from(schema.pmPositions).where(where), getPmBook(o.tokenId)]);
  if (!pos || pos.shares <= 1e-9) return skipped(m, outcome, "No position to sell.");
  const want = Math.min(pos.shares, o.shares ?? pos.shares);
  let left = want;
  let proceeds = 0;
  for (const l of book.bids) {
    if (o.limitPrice !== undefined && l.price < o.limitPrice) break;
    const take = Math.min(left, l.size);
    proceeds += take * l.price;
    left -= take;
    if (left < 1e-9) break;
  }
  const sold = want - Math.max(0, left);
  if (sold <= 1e-9) return skipped(m, outcome, "Nobody is buying this outcome at an acceptable price right now. Try again later.");
  const pnl = proceeds - sold * pos.avgPrice;

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.pmTrades)
      .values({ mode: "paper", tokenId: o.tokenId, title: m.question, outcome, side: "sell", price: proceeds / sold, shares: sold, pnl, source: o.source, copiedFrom: o.copiedFrom, copiedTx: o.copiedTx, ...copyLatency(o) })
      .onConflictDoNothing()
      .returning({ id: schema.pmTrades.id });
    if (!inserted.length) throw new RiskError("Already copied this trade.");
    await tx
      .update(schema.userSettings)
      .set({ paperBalance: sql`${schema.userSettings.paperBalance} + ${proceeds}` })
      .where(eq(schema.userSettings.userId, LOCAL_USER));
    const rest = pos.shares - sold;
    if (rest <= 1e-6) await tx.delete(schema.pmPositions).where(where);
    else await tx.update(schema.pmPositions).set({ shares: rest }).where(where);
    return { status: left > 1e-9 ? "partial" : "filled", shares: sold, avgPrice: proceeds / sold, usd: proceeds, title: m.question, outcome, pnl, ...timing(o) } satisfies PmOrderResult;
  });
}

/** Positions marked at the live CLOB midpoint (paper) or read from your wallet (live), plus recent trades. */
export async function pmPortfolio(tradeLimit = 50) {
  const mode = (await getSettings()).mode;
  const trades = await db
    .select()
    .from(schema.pmTrades)
    .where(eq(schema.pmTrades.mode, mode))
    .orderBy(desc(schema.pmTrades.id))
    .limit(tradeLimit);
  const rows =
    mode === "live"
      ? (await livePositions().catch(() => [])).map((p) => ({ ...p, value: p.shares * p.price, upnl: p.shares * (p.price - p.avgPrice) }))
      : await (async () => {
          const positions = await db.select().from(schema.pmPositions);
          const mids = await midpoints(positions.map((p) => p.tokenId)).catch(() => ({}) as Record<string, number>);
          return positions.map((p) => {
            const price = mids[p.tokenId] ?? p.avgPrice;
            return { tokenId: p.tokenId, title: p.title, outcome: p.outcome, slug: p.slug ?? "", shares: p.shares, avgPrice: p.avgPrice, price, value: p.shares * price, upnl: p.shares * (price - p.avgPrice) };
          });
        })();
  const [{ realized }] = await db
    .select({ realized: sql<number>`coalesce(sum(${schema.pmTrades.pnl}), 0)` })
    .from(schema.pmTrades)
    .where(eq(schema.pmTrades.mode, mode));
  return {
    mode,
    positions: rows,
    trades: trades.map((t) => ({ ...t, ts: t.createdAt.getTime() })),
    value: rows.reduce((a, p) => a + p.value, 0),
    upnl: rows.reduce((a, p) => a + p.upnl, 0),
    realized: Number(realized),
  };
}
