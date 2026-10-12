import "server-only";
// Polymarket public data: Gamma (markets), CLOB (books/prices), Data API (leaderboard, trader activity). No auth, open CORS.
export const GAMMA = "https://gamma-api.polymarket.com";
export const CLOB = "https://clob.polymarket.com";
export const DATA = "https://data-api.polymarket.com";

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!r.ok) throw new Error(`Polymarket ${r.status} ${new URL(url).pathname}`);
  return r.json() as Promise<T>;
}

type RawMarket = {
  id: string;
  conditionId?: string;
  question: string;
  slug: string;
  icon?: string;
  endDate?: string;
  outcomes: string;
  outcomePrices?: string;
  clobTokenIds?: string;
  volume24hr?: number;
  liquidity?: string;
  orderMinSize?: number;
  orderPriceMinTickSize?: number;
  acceptingOrders?: boolean;
  closed?: boolean;
  umaResolutionStatus?: string;
  events?: { slug: string; title: string }[];
};

export type Outcome = { name: string; tokenId: string; price: number };
export type PmMarket = {
  id: string;
  conditionId: string;
  question: string;
  slug: string;
  eventSlug?: string;
  icon?: string;
  endDate?: string;
  volume24h: number;
  liquidity: number;
  minSize: number;
  tick: number;
  open: boolean;
  outcomes: Outcome[];
  settling: boolean;
};

const parse = <T,>(s: string | undefined, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

export function toMarket(m: RawMarket): PmMarket {
  const names = parse<string[]>(m.outcomes, []);
  const prices = parse<string[]>(m.outcomePrices, []);
  const tokens = parse<string[]>(m.clobTokenIds, []);
  return {
    id: m.id,
    conditionId: m.conditionId ?? "",
    question: m.question,
    slug: m.slug,
    eventSlug: m.events?.[0]?.slug,
    icon: m.icon,
    endDate: m.endDate,
    volume24h: m.volume24hr ?? 0,
    liquidity: +(m.liquidity ?? 0),
    minSize: m.orderMinSize ?? 5,
    tick: m.orderPriceMinTickSize ?? 0.01,
    open: !!m.acceptingOrders && !m.closed,
    // The event is over and its result is proposed or settling: holders may sell, nobody should buy.
    settling: ["proposed", "disputed", "challenged", "resolved"].includes(m.umaResolutionStatus ?? ""),
    outcomes: names.map((name, i) => ({ name, tokenId: tokens[i] ?? "", price: +(prices[i] ?? 0) })),
  };
}

export async function marketByToken(tokenId: string): Promise<PmMarket | null> {
  const rows = await get<RawMarket[]>(`${GAMMA}/markets?clob_token_ids=${encodeURIComponent(tokenId)}`);
  return rows[0] ? toMarket(rows[0]) : null;
}


export type PmLevel = { price: number; size: number };
export type PmBook = { bids: PmLevel[]; asks: PmLevel[]; tick: number; minSize: number };

/** CLOB book, best price first on both sides. */
// Order books are shared for a moment: every follower of one leader trade (and the paper fill right after a
// prefetch) reuses the same in-flight request instead of hitting the CLOB again. ponytail: per-process map.
const BOOK_TTL_MS = 1_000;
const books = new Map<string, { at: number; p: Promise<PmBook> }>();

export function getPmBook(tokenId: string): Promise<PmBook> {
  const hit = books.get(tokenId);
  if (hit && Date.now() - hit.at < BOOK_TTL_MS) return hit.p;
  const p = fetchPmBook(tokenId);
  books.set(tokenId, { at: Date.now(), p });
  p.catch(() => books.delete(tokenId));
  if (books.size > 500) for (const [k, v] of books) if (Date.now() - v.at > BOOK_TTL_MS) books.delete(k);
  return p;
}

async function fetchPmBook(tokenId: string): Promise<PmBook> {
  type L = { price: string; size: string };
  const b = await get<{ bids: L[]; asks: L[]; tick_size: string; min_order_size: string }>(
    `${CLOB}/book?token_id=${encodeURIComponent(tokenId)}`,
  );
  const lv = (l: L) => ({ price: +l.price, size: +l.size });
  return {
    bids: b.bids.map(lv).sort((a, c) => c.price - a.price),
    asks: b.asks.map(lv).sort((a, c) => a.price - c.price),
    tick: +b.tick_size,
    minSize: +b.min_order_size,
  };
}

export async function midpoints(tokenIds: string[]): Promise<Record<string, number>> {
  if (!tokenIds.length) return {};
  const r = await fetch(`${CLOB}/midpoints`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(tokenIds.map((token_id) => ({ token_id }))),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return {};
  const d = (await r.json()) as Record<string, string>;
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, +v]));
}

export type Leader = { rank: number; wallet: string; name: string; pnl: number; volume: number; image?: string; verified: boolean };
export type LeaderWindow = "DAY" | "WEEK" | "MONTH" | "ALL";

export async function leaderboard(window: LeaderWindow = "WEEK", limit = 25, category = "OVERALL"): Promise<Leader[]> {
  const rows = await get<
    { rank: string; proxyWallet: string; userName?: string; pnl: number; vol: number; profileImage?: string; verifiedBadge?: boolean }[]
  >(`${DATA}/v1/leaderboard?timePeriod=${window}&orderBy=PNL&limit=${limit}&category=${category}`);
  return rows.map((r) => ({
    rank: +r.rank,
    wallet: r.proxyWallet.toLowerCase(),
    name: r.userName || `${r.proxyWallet.slice(0, 6)}…${r.proxyWallet.slice(-4)}`,
    pnl: r.pnl,
    volume: r.vol,
    image: r.profileImage || undefined,
    verified: !!r.verifiedBadge,
  }));
}

/** One trader's leaderboard row for a window (rank, P/L, volume, name); null when they have no ranked activity. */
export async function traderRank(wallet: string, window: LeaderWindow = "ALL"): Promise<Leader | null> {
  const rows = await get<
    { rank: string; proxyWallet: string; userName?: string; pnl: number; vol: number; profileImage?: string; verifiedBadge?: boolean }[]
  >(`${DATA}/v1/leaderboard?timePeriod=${window}&orderBy=PNL&limit=1&user=${wallet.toLowerCase()}`);
  const r = rows[0];
  if (!r || r.proxyWallet.toLowerCase() !== wallet.toLowerCase()) return null;
  return {
    rank: +r.rank,
    wallet: r.proxyWallet.toLowerCase(),
    name: r.userName || `${r.proxyWallet.slice(0, 6)}…${r.proxyWallet.slice(-4)}`,
    pnl: r.pnl,
    volume: r.vol,
    image: r.profileImage || undefined,
    verified: !!r.verifiedBadge,
  };
}

export type LeaderTrade = {
  ts: number;
  tx: string;
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  usd: number;
  title: string;
  outcome: string;
  slug: string;
  name?: string;
};

/** A wallet's trades, oldest first, strictly after `afterTs` (unix seconds). */
export async function traderTrades(wallet: string, afterTs = 0, limit = 50): Promise<LeaderTrade[]> {
  const u = new URL(`${DATA}/activity`);
  u.searchParams.set("user", wallet);
  u.searchParams.set("type", "TRADE");
  u.searchParams.set("limit", String(limit));
  if (afterTs) u.searchParams.set("start", String(afterTs + 1));
  type Row = {
    timestamp: number;
    transactionHash: string;
    asset: string;
    side: "BUY" | "SELL";
    price: number;
    size: number;
    usdcSize: number;
    title: string;
    outcome: string;
    slug: string;
    name?: string;
  };
  const rows = await get<Row[]>(u.toString());
  return rows
    .filter((r) => r.timestamp > afterTs)
    .map((r) => ({
      ts: r.timestamp,
      tx: r.transactionHash,
      tokenId: r.asset,
      side: r.side,
      price: r.price,
      size: r.size,
      usd: r.usdcSize,
      title: r.title,
      outcome: r.outcome,
      slug: r.slug,
      name: r.name,
    }))
    .sort((a, b) => a.ts - b.ts);
}

export const isWallet = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s);

/**
 * Everything worth knowing before copying a wallet: rank and P/L in every window, win rate over its last
 * 100 closed positions (newest first, so not cherry-picked), open book value, trade rhythm and market mix.
 */
export async function traderProfile(wallet: string) {
  type Closed = { realizedPnl: number; totalBought: number; timestamp: number; title: string };
  const w = wallet.toLowerCase();
  const settle = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const [day, week, month, all, closed, value, trades] = await Promise.all([
    settle(traderRank(w, "DAY"), null),
    settle(traderRank(w, "WEEK"), null),
    settle(traderRank(w, "MONTH"), null),
    settle(traderRank(w, "ALL"), null),
    settle(get<Closed[]>(`${DATA}/closed-positions?user=${w}&limit=100&sortBy=TIMESTAMP&sortDirection=DESC`), []),
    settle(get<{ value: number }[]>(`${DATA}/value?user=${w}`), []),
    settle(traderTrades(w, 0, 100), []),
  ]);
  const wins = closed.filter((c) => c.realizedPnl > 0).length;
  const sizes = trades.map((t) => t.usd).sort((a, b) => a - b);
  const markets = new Map<string, number>();
  for (const t of trades) markets.set(t.title, (markets.get(t.title) ?? 0) + 1);
  const span = trades.length > 1 ? (trades[trades.length - 1].ts - trades[0].ts) / 86_400 : 0;
  const rank = (l: Leader | null) => (l ? { rank: l.rank, pnl: Math.round(l.pnl), volume: Math.round(l.volume) } : null);
  return {
    wallet: w,
    name: all?.name ?? month?.name ?? null,
    windows: { day: rank(day), week: rank(week), month: rank(month), all: rank(all) },
    closedPositions: closed.length,
    winRatePct: closed.length ? Math.round((wins / closed.length) * 100) : null,
    realizedPnlLast100: Math.round(closed.reduce((a, c) => a + c.realizedPnl, 0)),
    openValueUsd: value[0] ? Math.round(value[0].value) : null,
    recentTrades: trades.length,
    tradesPerDay: span > 0 ? Math.round((trades.length / span) * 10) / 10 : null,
    medianTradeUsd: sizes.length ? Math.round(sizes[Math.floor(sizes.length / 2)]) : null,
    lastTradeHoursAgo: trades.length ? Math.round((Date.now() / 1000 - trades[trades.length - 1].ts) / 360) / 10 : null,
    topMarkets: [...markets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([title, n]) => ({ title, trades: n })),
  };
}
