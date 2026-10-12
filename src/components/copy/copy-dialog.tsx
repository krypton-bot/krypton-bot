"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { XIcon, ZapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { fmtCompact } from "@/lib/format";

export type Target = { wallet: string; name: string; pct?: number; maxUsd?: number } | null;

type Profile = {
  windows: Record<"day" | "week" | "month" | "all", { rank: number; pnl: number; volume: number } | null>;
  closedPositions: number;
  winRatePct: number | null;
  openValueUsd: number | null;
  tradesPerDay: number | null;
  medianTradeUsd: number | null;
  lastTradeHoursAgo: number | null;
  topMarkets: { title: string; trades: number }[];
};

export const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;

const signed = (n: number) => `${n >= 0 ? "+" : "-"}${fmtCompact(Math.abs(n))}`;

/** Public stats of the trader about to be copied: results per window, win rate, rhythm, market mix. */
function TraderStats({ wallet }: { wallet: string }) {
  const [p, setP] = useState<Profile | null | "error">(null);
  useEffect(() => {
    let alive = true;
    api<{ profile: Profile }>(`/api/copy/trader?wallet=${wallet}`)
      .then((d) => alive && setP(d.profile))
      .catch(() => alive && setP("error"));
    return () => {
      alive = false;
    };
  }, [wallet]);

  if (p === "error") return <p className="mt-3 text-xs text-muted-foreground">Trader stats are unavailable right now. You can still start the bot.</p>;
  if (!p) return <div className="mt-3 h-28 animate-pulse rounded-xl bg-muted/50" aria-label="Loading trader stats" />;
  const cells: [string, string, string?][] = [
    ["Win rate", p.winRatePct === null ? "—" : `${p.winRatePct}%`, p.closedPositions ? `last ${p.closedPositions} closed` : undefined],
    ["Trades / day", p.tradesPerDay === null ? "—" : String(p.tradesPerDay)],
    ["Median trade", p.medianTradeUsd === null ? "—" : fmtCompact(p.medianTradeUsd)],
    ["Last trade", p.lastTradeHoursAgo === null ? "—" : p.lastTradeHoursAgo < 1 ? "< 1h ago" : `${p.lastTradeHoursAgo}h ago`],
  ];
  return (
    <div className="mt-3 rounded-xl border bg-muted/20 p-3">
      <div className="grid grid-cols-4 gap-2 text-center">
        {(["day", "week", "month", "all"] as const).map((k) => {
          const w = p.windows[k];
          return (
            <div key={k}>
              <div className="text-[10px] tracking-wide text-muted-foreground uppercase">{k === "all" ? "All" : k}</div>
              <div className={`tabular text-sm font-semibold ${w ? (w.pnl >= 0 ? "text-long" : "text-short") : "text-muted-foreground"}`}>{w ? signed(w.pnl) : "—"}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 border-t pt-3 text-center">
        {cells.map(([k, v, hint]) => (
          <div key={k} title={hint}>
            <div className="text-[10px] tracking-wide text-muted-foreground uppercase">{k}</div>
            <div className="tabular text-sm font-semibold">{v}</div>
          </div>
        ))}
      </div>
      {p.topMarkets[0] && <p className="mt-3 truncate border-t pt-2 text-[11px] text-muted-foreground">Trades most: {p.topMarkets[0].title}</p>}
    </div>
  );
}

export function CopyDialog({ target, live, onClose, onDone }: { target: Target; live: boolean; onClose: () => void; onDone: () => void }) {
  // Resuming a paused copy bot starts from its saved sizes.
  const [pct, setPct] = useState(String(target?.pct ?? 10));
  const [max, setMax] = useState(String(target?.maxUsd ?? 50));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);
  if (!target) return null;

  async function save() {
    if (!target) return;
    setBusy(true);
    try {
      await api("/api/copy/follows", { method: "POST", body: JSON.stringify({ wallet: target.wallet, pct: +pct, maxUsd: +max, label: target.name }) });
      toast.success(`Copy bot started for ${target.name}`, { description: live ? "New trades are mirrored with real money." : "New trades are mirrored in paper mode." });
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start copy bot");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="copy-title" className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 id="copy-title" className="text-lg font-semibold">
              Copy {target.name}
            </h2>
            <p className="font-mono text-xs text-muted-foreground">{short(target.wallet)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <XIcon className="size-4" />
          </button>
        </div>
        <TraderStats wallet={target.wallet} />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-sm">
            Size (% of theirs)
            <Input type="number" min={1} max={100} value={pct} onChange={(e) => setPct(e.target.value)} autoFocus />
          </label>
          <label className="grid gap-1.5 text-sm">
            Max per trade ($)
            <Input type="number" min={1} max={10000} value={max} onChange={(e) => setMax(e.target.value)} />
          </label>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Every buy and sell they make is mirrored at {pct || 0}% of their size, never more than ${max || 0} a trade, with at most 3¢ slippage. Your risk limits and kill switch still apply.
        </p>
        {live && <p className="mt-2 rounded-lg bg-short/10 px-2.5 py-1.5 text-xs text-short">Live mode: this bot trades real money from your wallet.</p>}
        <Button className="mt-4 w-full" onClick={save} disabled={busy || !(+pct >= 1 && +pct <= 100) || !(+max >= 1 && +max <= 10000)}>
          <ZapIcon /> Start copy bot
        </Button>
      </div>
    </div>
  );
}
