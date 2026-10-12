"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Portfolio } from "@/lib/api-client";
import { fmtUsd } from "@/lib/format";

const POLL_MS = 10_000;

/** Compact balance under the bot card: cash + positions, open P/L, positions count. Tap for the Overview. */
export function SidebarBalance() {
  const [pf, setPf] = useState<Portfolio | null>(null);
  useEffect(() => {
    const load = () => document.visibilityState === "visible" && api<Portfolio>("/api/portfolio").then(setPf).catch(() => {});
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, []);
  const tone = !pf || Math.abs(pf.upnl) < 0.005 ? "text-muted-foreground" : pf.upnl > 0 ? "text-long" : "text-short";
  return (
    <Link
      href="/dashboard"
      className="grid grid-cols-3 gap-2 rounded-xl border bg-gradient-to-br from-brand/10 via-card to-card px-3 py-2 text-xs transition-colors hover:border-brand/50"
      aria-label="Balance and open P/L, open Overview"
    >
      <span className="min-w-0">
        <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">{pf?.mode === "live" ? "Positions" : "Balance"}</span>
        <span className="block truncate font-semibold tabular-nums">{pf ? fmtUsd(pf.value + (pf.cash ?? 0), 0) : "…"}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">Open P/L</span>
        <span className={`block truncate font-semibold tabular-nums ${tone}`}>{pf ? `${pf.upnl > 0 ? "+" : ""}${fmtUsd(pf.upnl)}` : "…"}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">{pf?.mode ?? "Mode"}</span>
        <span className="block truncate font-semibold tabular-nums">{pf ? `${pf.positions.length} open` : "…"}</span>
      </span>
    </Link>
  );
}
