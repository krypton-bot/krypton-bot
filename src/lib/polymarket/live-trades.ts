import "server-only";
import { EventEmitter } from "node:events";

/** One Polymarket trade from the real-time data socket (RTDS `activity/trades`). */
export type LiveTrade = {
  ts: number; // ms, leader fill time from the feed
  seenAt: number; // ms, when this server received it
  tx: string;
  wallet: string; // lowercase proxy wallet
  name: string;
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  usd: number;
  title: string;
  outcome: string;
  slug: string;
  icon?: string;
};

type Raw = {
  asset: string;
  proxyWallet: string;
  name?: string;
  pseudonym?: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  timestamp: number;
  transactionHash: string;
  title: string;
  outcome: string;
  slug: string;
  eventSlug?: string;
  icon?: string;
};

const RTDS = "wss://ws-live-data.polymarket.com";
const PING_MS = 5_000;
const STALE_MS = 20_000;
const RECENT = 300;

/**
 * Server-side RTDS connection: every Polymarket trade in real time (~50/s). Drives copy trading
 * (followed wallets) and the live trades dashboard. One connection per server process.
 */
class LiveTrades extends EventEmitter {
  private ws: WebSocket | null = null;
  private retry = 0;
  private lastMsg = 0;
  readonly recent: LiveTrade[] = [];

  constructor() {
    super();
    this.setMaxListeners(1000);
    this.connect();
    setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send("PING");
      if (this.ws && Date.now() - this.lastMsg > STALE_MS) this.ws.close();
    }, PING_MS);
  }

  get live() {
    return !!this.ws && Date.now() - this.lastMsg < STALE_MS;
  }

  private connect() {
    const ws = new WebSocket(RTDS);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.lastMsg = Date.now();
      ws.send(JSON.stringify({ action: "subscribe", subscriptions: [{ topic: "activity", type: "trades" }] }));
    };
    ws.onmessage = (m) => {
      this.lastMsg = Date.now();
      const s = String(m.data);
      if (s === "PONG" || !s.startsWith("{")) return;
      const p = (JSON.parse(s) as { payload?: Raw }).payload;
      if (!p?.proxyWallet || !p.asset) return;
      const seenAt = Date.now();
      const t: LiveTrade = {
        seenAt,
        ts: p.timestamp > 1e12 ? p.timestamp : p.timestamp * 1000,
        tx: p.transactionHash,
        wallet: p.proxyWallet.toLowerCase(),
        name: p.name || p.pseudonym || `${p.proxyWallet.slice(0, 6)}…`,
        tokenId: p.asset,
        side: p.side,
        price: p.price,
        size: p.size,
        usd: p.price * p.size,
        title: p.title,
        outcome: p.outcome,
        slug: p.eventSlug ?? p.slug,
        icon: p.icon,
      };
      this.recent.unshift(t);
      if (this.recent.length > RECENT) this.recent.length = RECENT;
      this.emit("trade", t);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      setTimeout(() => this.connect(), Math.min(30_000, 500 * 2 ** this.retry++));
    };
    ws.onerror = () => ws.close();
  }
}

const g = globalThis as unknown as { pmLiveTrades?: LiveTrades };
export const liveTrades = () => (g.pmLiveTrades ??= new LiveTrades());
