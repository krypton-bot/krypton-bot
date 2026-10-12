import "server-only";
import { EventEmitter } from "node:events";
import { and, desc, eq } from "drizzle-orm";
import { db, ready, schema } from "@/db";
import { LOCAL_USER } from "@/db/schema";
import { isWallet } from "@/lib/polymarket/public";
import { liveTrades, type LiveTrade } from "@/lib/polymarket/live-trades";
import { getSettings, RiskError } from "@/lib/trading";
import { pmOrder } from "@/lib/trading/predictions";
import { sendTelegram } from "@/lib/telegram";
import { describeCopy } from "./describe";

export type Follow = typeof schema.copyFollows.$inferSelect;
export type { CopyEvent } from "@/lib/api-client";
import type { CopyEvent } from "@/lib/api-client";

const RELOAD_MS = 60_000;
const SLIPPAGE = 0.03; // never pay more than the leader price + 3c (or sell below - 3c)
const MAX_FOLLOWS = 20;

type G = { copyStarted?: boolean; copyByWallet?: Map<string, Follow[]>; copyBus?: EventEmitter };
const g = globalThis as unknown as G;
/** In-process bus: the activity feed (SSE) and Telegram alerts both listen to it. */
export const copyBus = (g.copyBus ??= new EventEmitter().setMaxListeners(100));

async function reload() {
  const rows = await db.select().from(schema.copyFollows).where(eq(schema.copyFollows.active, true));
  const m = new Map<string, Follow[]>();
  for (const f of rows) m.set(f.wallet, [...(m.get(f.wallet) ?? []), f]);
  g.copyByWallet = m;
}

async function record(runId: string, name: CopyEvent["name"], input: unknown, output: unknown, ok: boolean) {
  const [row] = await db.insert(schema.copyEvents).values({ runId, name, input, output, ok }).returning({ id: schema.copyEvents.id, createdAt: schema.copyEvents.createdAt });
  const e: CopyEvent = { id: row.id, runId, name, input, output, ok, ts: row.createdAt.getTime() };
  copyBus.emit("event", e);
  return e;
}

async function alert(e: CopyEvent) {
  const skipped = e.ok && (e.output as { status?: string } | null)?.status === "skipped";
  if (skipped) return; // held, nothing traded
  const s = await getSettings();
  if (s.alertTelegram && s.tgChatId) await sendTelegram(s.tgChatId, `${e.ok ? "🤖" : "⚠️"} Copy bot: ${describeCopy(e)}`);
}

/** Mirror one leader trade for one follower. Risk limits, paper/live and dedupe all live in pmOrder. */
async function copyOne(f: Follow, t: LiveTrade) {
  const runId = `copy-${f.id}`;
  const who = f.label || t.name;
  const buy = t.side === "BUY";
  const usd = buy ? Math.min((t.usd * f.pct) / 100, f.maxUsd) : 0;
  if (buy && usd < 1) return; // below the smallest order worth sending
  const input = buy
    ? { tokenId: t.tokenId, usd: +usd.toFixed(2), limitPrice: Math.min(0.99, t.price + SLIPPAGE), reason: `Copy ${who}` }
    : { tokenId: t.tokenId, shares: (t.size * f.pct) / 100, limitPrice: Math.max(0.01, t.price - SLIPPAGE), reason: `Copy ${who}` };
  const name = buy ? "buyOutcome" : "sellOutcome";
  const order = {
    tokenId: t.tokenId,
    side: buy ? ("buy" as const) : ("sell" as const),
    usd: buy ? input.usd : undefined,
    shares: buy ? undefined : (input as { shares: number }).shares,
    limitPrice: input.limitPrice,
    source: "copy" as const,
    copiedFrom: t.wallet,
    copiedTx: `${t.tx}:${t.tokenId}`,
    copyTiming: { leaderTs: t.ts, seenAt: t.seenAt },
  };
  try {
    const out = await pmOrder(order);
    void alert(await record(runId, name, input, out, true)).catch(() => {});
  } catch (e) {
    if (e instanceof RiskError && e.message === "Already copied this trade.") return; // a repeated feed message, not news
    const message = e instanceof RiskError ? e.message : "Something went wrong placing this order.";
    if (!(e instanceof RiskError)) console.error("[copy]", f.id, e instanceof Error ? e.message : "failed");
    void alert(await record(runId, name, input, { error: message }, false)).catch(() => {});
  }
  await db.update(schema.copyFollows).set({ lastSeenTs: Math.floor(t.ts / 1000) }).where(eq(schema.copyFollows.id, f.id));
}

/** Start once per server: listen to every Polymarket trade and copy followed wallets within the same second. */
export async function startCopyEngine() {
  if (g.copyStarted) return;
  g.copyStarted = true;
  await ready();
  await reload();
  setInterval(() => reload().catch(() => {}), RELOAD_MS);
  liveTrades().on("trade", (t: LiveTrade) => {
    const fs = g.copyByWallet?.get(t.wallet);
    if (!fs) return;
    for (const f of fs) if (Math.floor(t.ts / 1000) >= f.lastSeenTs) copyOne(f, t).catch((e) => console.error("[copy]", f.id, e instanceof Error ? e.message : "failed"));
  });
  // Trades made while the app was not running are not back-filled: copying stale fills is worse than missing them.
}

export async function listFollows() {
  return db.select().from(schema.copyFollows).orderBy(schema.copyFollows.id);
}

export async function recentEvents(limit = 100): Promise<CopyEvent[]> {
  const rows = await db.select().from(schema.copyEvents).where(eq(schema.copyEvents.userId, LOCAL_USER)).orderBy(desc(schema.copyEvents.id)).limit(limit);
  return rows.map((r) => ({ id: r.id, runId: r.runId, name: r.name as CopyEvent["name"], input: r.input, output: r.output, ok: r.ok, ts: r.createdAt.getTime() }));
}

type FollowOpts = { pct?: number; maxUsd?: number; label?: string | null };

export async function follow(wallet: string, opts: FollowOpts = {}) {
  const w = wallet.toLowerCase();
  if (!isWallet(w)) throw new RiskError("Enter a valid Polymarket wallet address (0x…).");
  const existing = await listFollows();
  const current = existing.find((f) => f.wallet === w);
  if (!current && existing.length >= MAX_FOLLOWS) throw new RiskError(`You can copy up to ${MAX_FOLLOWS} traders.`);
  // Following again resumes and changes only what was sent; sizes and label are kept.
  const { pct, maxUsd, label } = opts;
  const changes = Object.fromEntries(Object.entries({ pct, maxUsd, label }).filter(([, v]) => v !== undefined));
  const resume = current && !current.active ? { lastSeenTs: Math.floor(Date.now() / 1000) } : {}; // never replay the pause
  const [row] = await db
    .insert(schema.copyFollows)
    .values({ wallet: w, lastSeenTs: Math.floor(Date.now() / 1000), pct: 10, maxUsd: 50, label: null, active: true, ...changes })
    .onConflictDoUpdate({ target: [schema.copyFollows.userId, schema.copyFollows.wallet], set: { ...changes, ...resume, active: true } })
    .returning();
  await reload();
  return row;
}

export async function updateFollow(id: number, patch: Partial<Pick<Follow, "pct" | "maxUsd" | "active" | "label">>) {
  const set = patch.active ? { ...patch, lastSeenTs: Math.floor(Date.now() / 1000) } : patch; // resuming never replays the pause
  const [row] = await db
    .update(schema.copyFollows)
    .set(set)
    .where(and(eq(schema.copyFollows.id, id), eq(schema.copyFollows.userId, LOCAL_USER)))
    .returning();
  if (!row) throw new RiskError("Copy bot not found.");
  await reload();
  return row;
}

export async function unfollow(id: number) {
  await db.delete(schema.copyFollows).where(and(eq(schema.copyFollows.userId, LOCAL_USER), eq(schema.copyFollows.id, id)));
  await reload();
}
