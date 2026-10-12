"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CopyIcon } from "lucide-react";
import { BotFace } from "@/components/bot-face";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type Portfolio } from "@/lib/api-client";
import { describeCopy } from "@/lib/copy/describe";
import { fmtUsd } from "@/lib/format";
import { useCopyEvents } from "@/lib/use-copy-events";
import { MyBots, type Follow } from "./copy-bots";
import { CopyDialog, short, type Target } from "./copy-dialog";
import { CopyPicks, CopySteps, Leaderboard } from "./copy-leaders";

type Trade = {
  ts: number;
  tx: string;
  wallet: string;
  name: string;
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  usd: number;
  title: string;
  outcome: string;
  slug: string;
  top: boolean;
  followed: boolean;
};
type Filter = "all" | "whales" | "top" | "following";

const MAX_ROWS = 120;
const WHALE_USD = 1000;
const cents = (p: number) => `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}¢`;
const isWallet = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s);

function ago(ts: number, now: number) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`;
}

// The feed can repeat a fill (reconnect snapshot plus live push); one row per fill keeps list keys unique.
const tradeKey = (t: Trade) => `${t.tx}-${t.tokenId}-${t.side}-${t.size}`;
const uniqTrades = (list: Trade[]) => list.filter((t, i, a) => a.findIndex((x) => tradeKey(x) === tradeKey(t)) === i);

/** Live Polymarket trades over SSE (server RTDS feed), newest first. */
function useLiveTrades() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [live, setLive] = useState(false);
  const [rate, setRate] = useState(0);
  const stamps = useRef<number[]>([]);
  useEffect(() => {
    const es = new EventSource("/api/copy/stream");
    es.addEventListener("snapshot", (m) => {
      const d = JSON.parse((m as MessageEvent<string>).data) as { trades: Trade[] };
      setTrades(uniqTrades(d.trades));
      setLive(true);
    });
    es.onmessage = (m) => {
      const t = JSON.parse(m.data) as Trade;
      stamps.current.push(Date.now());
      setTrades((cur) => uniqTrades([t, ...cur]).slice(0, MAX_ROWS));
    };
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    const id = setInterval(() => {
      const cut = Date.now() - 60_000;
      stamps.current = stamps.current.filter((x) => x > cut);
      setRate(stamps.current.length);
    }, 1000);
    return () => {
      es.close();
      clearInterval(id);
    };
  }, []);
  return { trades, live, rate };
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function TradeRow({ t, now, onCopy }: { t: Trade; now: number; onCopy: () => void }) {
  const buy = t.side === "BUY";
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/40">
      <div className={`grid size-9 place-items-center rounded-full text-sm font-bold ${buy ? "bg-long/15 text-long" : "bg-short/15 text-short"}`}>{t.name.slice(0, 1).toUpperCase()}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-1.5 text-sm">
          <span className="font-semibold">{t.name}</span>
          {t.top && <span className="rounded bg-brand/15 px-1.5 text-[10px] font-semibold text-brand">TOP</span>}
          {t.followed && <span className="rounded bg-long/15 px-1.5 text-[10px] font-semibold text-long">COPYING</span>}
          <span className={buy ? "text-long" : "text-short"}>{buy ? "bought" : "sold"}</span>
          <span className="font-medium">{t.outcome}</span>
          <span className="text-muted-foreground">at {cents(t.price)}</span>
        </div>
        {t.slug ? (
          <a href={`https://polymarket.com/event/${encodeURIComponent(t.slug)}`} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-muted-foreground hover:text-foreground">
            {t.title || "View market"}
          </a>
        ) : (
          <span className="block truncate text-xs text-muted-foreground">{t.title || "Polymarket market"}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="tabular text-sm font-semibold">{fmtUsd(t.usd, t.usd >= 100 ? 0 : 2)}</div>
          <div className="tabular text-[11px] text-muted-foreground">{ago(t.ts, now)}</div>
        </div>
        <Button size="sm" variant={t.followed ? "outline" : "secondary"} onClick={onCopy} disabled={t.followed} aria-label={`Copy ${t.name}`}>
          <CopyIcon /> <span className="hidden sm:inline">{t.followed ? "Copying" : "Copy"}</span>
        </Button>
      </div>
    </li>
  );
}

const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["whales", "Whales $1k+"],
  ["top", "Top traders"],
  ["following", "Copying"],
];

/** Live copy-trading dashboard: real-time trade feed, leaderboard, and your copy bots. */
export function CopyScreen() {
  const now = useNow();
  const { trades, live, rate } = useLiveTrades();
  const [filter, setFilter] = useState<Filter>("all");
  const [follows, setFollows] = useState<Follow[]>([]);
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [target, setTarget] = useState<Target>(null);
  const [manual, setManual] = useState("");
  const loadPortfolio = () => api<Portfolio>("/api/portfolio").then(setPf).catch(() => {});
  const events = useCopyEvents((e) => {
    const skipped = (e.output as { status?: string } | undefined)?.status === "skipped";
    if (e.ok && !skipped) toast.success(`Copy bot: ${describeCopy(e)}`);
    else if (!e.ok) toast.error(`Copy bot: ${describeCopy(e)}`);
    loadPortfolio();
  });

  const reload = () => {
    api<{ follows: Follow[] }>("/api/copy/follows")
      .then((d) => setFollows(d.follows))
      .catch(() => {});
    loadPortfolio();
  };
  useEffect(() => {
    reload();
    const id = setInterval(loadPortfolio, 10_000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Only running copy bots count as "Copying"; a paused one offers Resume instead.
  const following = useMemo(() => new Set(follows.filter((f) => f.active).map((f) => f.wallet)), [follows]);
  const paused = useMemo(() => new Set(follows.filter((f) => !f.active).map((f) => f.wallet)), [follows]);
  const shown = trades
    .map((t) => ({ ...t, followed: t.followed || following.has(t.wallet) }))
    .filter((t) => filter === "all" || (filter === "whales" ? t.usd >= WHALE_USD : filter === "top" ? t.top : t.followed));
  const openCopy = (wallet: string, name: string, pct?: number, maxUsd?: number) => {
    const saved = follows.find((f) => f.wallet === wallet);
    setTarget({ wallet, name, pct: pct ?? saved?.pct, maxUsd: maxUsd ?? saved?.maxUsd });
  };
  const isLive = pf?.mode === "live";

  return (
    <main className="mx-auto grid w-full max-w-[1600px] flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Copy trading</h1>
            <p className="text-sm text-muted-foreground">Pick a proven trader, set your size, and your bot mirrors every buy and sell within seconds.</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${live ? "animate-pulse bg-long" : "bg-yellow-400"}`} />
              {live ? "Live" : "Connecting"}
            </span>
            <span className="text-muted-foreground">
              <b className="tabular text-foreground">{rate}</b> trades/min
            </span>
          </div>
        </div>

        <CopySteps bots={follows.length} running={following.size} />
        <CopyPicks following={following} onCopy={(l, pct, maxUsd) => openCopy(l.wallet, l.name, pct, maxUsd)} />
        <Leaderboard following={following} paused={paused} onCopy={(l) => openCopy(l.wallet, l.name)} />

        <section className="rounded-2xl border bg-card p-2" aria-labelledby="feed-title">
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-2 pb-1">
            <h2 id="feed-title" className="font-semibold">
              Live trades
            </h2>
            <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs">
              {FILTERS.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilter(k)}
                  aria-pressed={filter === k}
                  className={`rounded-md px-2.5 py-1 font-medium ${filter === k ? "bg-background text-foreground" : "text-muted-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">{live ? "Waiting for trades…" : "Connecting to the live feed…"}</p>
          ) : (
            <ol className="flex max-h-[640px] flex-col overflow-y-auto">
              {shown.map((t) => (
                <TradeRow key={tradeKey(t)} t={t} now={now} onCopy={() => openCopy(t.wallet, t.name)} />
              ))}
            </ol>
          )}
        </section>
      </div>

      <aside className="order-first flex flex-col gap-4 lg:order-none lg:sticky lg:top-4 lg:self-start">
        <section className="rounded-2xl border bg-card p-4" aria-labelledby="bots-title">
          <h2 id="bots-title" className="mb-3 flex items-center gap-2 font-semibold">
            <BotFace className="size-4 text-brand" /> Your copy bots
            <span className="ml-auto text-xs font-normal text-muted-foreground">{follows.filter((f) => f.active).length} running</span>
          </h2>
          <MyBots follows={follows} reload={reload} />
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const w = manual.trim();
              if (!isWallet(w)) return void toast.error("Enter a valid wallet address (0x…)");
              openCopy(w.toLowerCase(), short(w));
              setManual("");
            }}
          >
            <Input placeholder="Copy any wallet 0x…" value={manual} onChange={(e) => setManual(e.target.value)} aria-label="Wallet to copy" />
            <Button type="submit" variant="outline">
              Add
            </Button>
          </form>
        </section>

        <section className="rounded-2xl border bg-card p-4" aria-labelledby="pf-title">
          <h2 id="pf-title" className="mb-3 font-semibold">
            Copy portfolio <span className="text-xs font-normal text-muted-foreground">({isLive ? "live" : "paper"})</span>
          </h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["Value", pf?.value],
                ["Open P/L", pf?.upnl],
                ["Realized", pf?.realized],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-muted/40 p-2">
                <div className="text-[11px] text-muted-foreground">{k}</div>
                <div className={`tabular text-sm font-semibold ${k !== "Value" && v ? (v > 0 ? "text-long" : "text-short") : ""}`}>{fmtUsd(v)}</div>
              </div>
            ))}
          </div>
          {pf?.cash != null && <p className="mt-2 text-center text-xs text-muted-foreground">Paper cash {fmtUsd(pf.cash)}</p>}
          {!!pf?.positions.length && (
            <>
              <h3 className="mt-4 mb-2 text-xs font-medium text-muted-foreground">Open positions</h3>
              <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                {pf.positions.map((p) => (
                  <li key={p.tokenId} className="flex items-start gap-2 text-xs" data-testid="position">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.title}</span>
                      <span className="text-muted-foreground">
                        {p.outcome} · {p.shares.toFixed(1)} sh @ {cents(p.avgPrice)}
                      </span>
                    </span>
                    <span className={`tabular shrink-0 ${p.upnl >= 0 ? "text-long" : "text-short"}`}>{fmtUsd(p.upnl)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h3 className="mt-4 mb-2 text-xs font-medium text-muted-foreground">Bot activity</h3>
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground">Copied trades appear here the moment they happen.</p>
          ) : (
            <ol className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {events.slice(0, 30).map((e) => (
                <li key={e.id} className="flex gap-2 text-xs" data-testid="bot-event">
                  <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${e.ok ? "bg-long" : "bg-short"}`} />
                  <span className={`min-w-0 flex-1 ${e.ok ? "" : "text-short"}`}>{describeCopy(e)}</span>
                  <span className="shrink-0 text-muted-foreground">{ago(e.ts, now)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
      <CopyDialog key={target?.wallet ?? "none"} target={target} live={!!isLive} onClose={() => setTarget(null)} onDone={reload} />
    </main>
  );
}
