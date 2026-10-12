import "server-only";
import { eq } from "drizzle-orm";
import { createSecureClient, OrderSide, type SecureClient } from "@polymarket/client";
import { privateKey } from "@polymarket/client/viem";
import { privateKeyToAccount } from "viem/accounts";
import { db, schema } from "@/db";
import { LOCAL_USER } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";

/**
 * Live prediction-market orders on the Polymarket CLOB with YOUR OWN key. The key is read from the environment
 * (POLYMARKET_PRIVATE_KEY) or saved encrypted in ./data. It signs orders on this machine only and is never logged
 * or sent to the browser. Use a dedicated trading wallet holding only what you are willing to risk.
 */

const DATA = "https://data-api.polymarket.com";
const HEX_KEY = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export class PmLiveError extends Error {}

type Creds = { pk: `0x${string}`; signer: string; wallet?: string; source: "env" | "saved" };

async function credentials(): Promise<Creds | null> {
  const env = process.env.POLYMARKET_PRIVATE_KEY?.trim();
  if (env) {
    if (!HEX_KEY.test(env)) throw new PmLiveError("POLYMARKET_PRIVATE_KEY must be 0x followed by 64 hex characters.");
    const funder = process.env.POLYMARKET_FUNDER?.trim();
    if (funder && !ADDRESS.test(funder)) throw new PmLiveError("POLYMARKET_FUNDER must be a 0x wallet address.");
    return { pk: env as `0x${string}`, signer: privateKeyToAccount(env as `0x${string}`).address, wallet: funder || undefined, source: "env" };
  }
  const [row] = await db.select().from(schema.pmSessions).where(eq(schema.pmSessions.userId, LOCAL_USER));
  if (!row) return null;
  return { pk: decrypt(row.encrypted, LOCAL_USER) as `0x${string}`, signer: row.signer, wallet: row.wallet || undefined, source: "saved" };
}

/** Public facts only: addresses and where the key came from. Never the key. */
export async function walletInfo() {
  try {
    const c = await credentials();
    return c ? { connected: true as const, signer: c.signer, wallet: c.wallet ?? c.signer, source: c.source } : { connected: false as const };
  } catch (e) {
    return { connected: false as const, error: e instanceof Error ? e.message : "Wallet error" };
  }
}

/** Validate and store a signer key (encrypted at rest). `funder` is the wallet that holds the funds, if it differs from the signer. */
export async function saveWallet(pk: string, funder?: string) {
  if (!HEX_KEY.test(pk)) throw new PmLiveError("A private key is 0x followed by 64 hex characters.");
  if (funder && !ADDRESS.test(funder)) throw new PmLiveError("The funder must be a 0x wallet address.");
  const signer = privateKeyToAccount(pk as `0x${string}`).address;
  const values = { userId: LOCAL_USER, signer, encrypted: encrypt(pk, LOCAL_USER), wallet: funder || signer };
  await db.insert(schema.pmSessions).values(values).onConflictDoUpdate({ target: schema.pmSessions.userId, set: values });
  client = null;
  return { signer, wallet: values.wallet };
}

export async function clearWallet() {
  client = null;
  await db.delete(schema.pmSessions);
}

let client: Promise<SecureClient> | null = null;

function secureClient(): Promise<SecureClient> {
  if (!client) {
    const p = (async () => {
      const c = await credentials();
      if (!c) throw new PmLiveError("Connect your Polymarket wallet in Settings to trade live.");
      return createSecureClient({ signer: privateKey(c.pk), wallet: c.wallet });
    })();
    p.catch(() => {
      if (client === p) client = null;
    });
    client = p;
  }
  return client;
}

export type LiveFill = { shares: number; usd: number; avgPrice: number; orderId: string };

/** Fill-and-kill market order with a price guard. Returns what actually filled; throws on rejection or no fill. */
export async function liveMarketOrder(
  o: { tokenId: string; side: "buy"; usd: number; limitPrice?: number } | { tokenId: string; side: "sell"; shares: number; limitPrice?: number },
): Promise<LiveFill> {
  const c = await secureClient();
  const res =
    o.side === "buy"
      ? await c.placeMarketOrder({ assetId: o.tokenId, side: OrderSide.BUY, amount: o.usd, maxPrice: o.limitPrice })
      : await c.placeMarketOrder({ assetId: o.tokenId, side: OrderSide.SELL, shares: o.shares, minPrice: o.limitPrice });
  if (!res.ok) throw new PmLiveError(res.message || `Polymarket rejected the order (${res.code}).`);
  const making = Number(res.makingAmount);
  const taking = Number(res.takingAmount);
  const [shares, usd] = o.side === "buy" ? [taking, making] : [making, taking];
  if (!(shares > 0)) throw new PmLiveError("No liquidity at an acceptable price; nothing filled.");
  return { shares, usd, avgPrice: usd / shares, orderId: String(res.orderId) };
}

export type LivePosition = { tokenId: string; title: string; outcome: string; slug: string; shares: number; avgPrice: number; price: number };

/** On-chain prediction positions of the funder wallet from the public Data API (source of truth for live holdings). */
export async function livePositions(): Promise<LivePosition[]> {
  const c = await credentials();
  if (!c) return [];
  const wallet = c.wallet ?? c.signer;
  const r = await fetch(`${DATA}/positions?user=${wallet}&sizeThreshold=0.01&limit=500`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`positions ${r.status}`);
  const rows = (await r.json()) as { asset: string; title: string; outcome: string; eventSlug?: string; slug: string; size: number; avgPrice: number; curPrice: number }[];
  return rows.map((p) => ({ tokenId: p.asset, title: p.title, outcome: p.outcome, slug: p.eventSlug || p.slug, shares: +p.size, avgPrice: +p.avgPrice, price: +p.curPrice }));
}
