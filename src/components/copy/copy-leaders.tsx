"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon, LockIcon, SparklesIcon, UsersIcon } from "lucide-react";
import { BotFace } from "@/components/bot-face";
import { Button } from "@/components/ui/button";
import { fmtCompact } from "@/lib/format";
import { CLOUD_URL } from "@/lib/site";
import { short } from "./copy-dialog";

export type Leader = { rank: number; wallet: string; name: string; pnl: number; volume: number };

const WINDOWS = ["DAY", "WEEK", "MONTH", "ALL"] as const;
type Win = (typeof WINDOWS)[number];

const STEPS = [
  ["Pick a trader", "From the picks, the top traders list or the live feed."],
  ["Set size and safety", "Copy a % of each trade with a hard $ cap and your risk limits."],
  ["Your bot copies", "Every buy and sell is mirrored in seconds while the app runs."],
] as const;

/** Where you are in the copy flow: no bot yet (step 1), bots but none running (2), running (3). */
export function CopySteps({ bots, running }: { bots: number; running: number }) {
  const at = running ? 2 : bots ? 1 : 0;
  return (
    <ol className="grid gap-2 sm:grid-cols-3" aria-label="How copy trading works">
      {STEPS.map(([title, body], i) => (
        <li key={title} className={`flex gap-3 rounded-2xl border p-3 ${i === at ? "border-brand/60 bg-brand/5" : "bg-card"}`} aria-current={i === at ? "step" : undefined}>
          <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${i < at ? "bg-brand text-black" : i === at ? "bg-brand/20 text-brand" : "bg-muted text-muted-foreground"}`}>
            {i < at ? <CheckIcon className="size-3.5" /> : i + 1}
          </span>
          <span>
            <span className="block text-sm font-semibold">{title}</span>
            <span className="block text-xs text-muted-foreground">{body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Leaderboard data shared by the picks and the full list, so the window switch loads once. */
function useLeaders(win: Win) {
  const [loaded, setLoaded] = useState<{ win: Win; rows: Leader[] } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/copy/leaders?window=${win}`)
      .then((r) => r.json())
      .then((d: { leaders?: Leader[] }) => alive && setLoaded({ win, rows: d.leaders ?? [] }))
      .catch(() => alive && setLoaded({ win, rows: [] }));
    return () => {
      alive = false;
    };
  }, [win]);
  return loaded?.win === win ? loaded.rows : null; // null while the chosen window loads
}

type Common = { following: Set<string>; paused: Set<string>; onCopy: (l: Leader, pct?: number, maxUsd?: number) => void };

/** This week's three biggest earners with a ready starter size, plus a locked teaser for the AI picks in the cloud edition. */
export function CopyPicks({ following, onCopy }: Pick<Common, "following" | "onCopy">) {
  const rows = useLeaders("WEEK");
  const picks = rows?.slice(0, 3);
  return (
    <section className="rounded-2xl border bg-gradient-to-br from-brand/10 via-card to-card p-4" aria-labelledby="picks-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="picks-title" className="flex items-center gap-2 font-semibold">
          <BotFace className="size-5 text-brand" /> Hot this week
        </h2>
        <a
          href={CLOUD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand/60 hover:text-foreground"
        >
          <LockIcon className="size-3" aria-hidden /> AI-researched picks <SparklesIcon className="size-3 text-brand" aria-hidden />
        </a>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">The three biggest Polymarket earners of the week, with a cautious starter size. Check their stats before you copy.</p>
      {!picks ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : !picks.length ? (
        <p className="mt-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Picks are unavailable right now. The leaderboard below may still load.</p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {picks.map((p) => {
            const on = following.has(p.wallet);
            return (
              <li key={p.wallet} className="flex flex-col gap-2 rounded-xl border bg-card p-3" data-testid="copy-pick">
                <div className="flex items-center justify-between gap-2">
                  <a href={`https://polymarket.com/profile/${p.wallet}`} target="_blank" rel="noopener noreferrer" className="truncate font-medium hover:underline">
                    {p.name}
                  </a>
                  <span className="shrink-0 text-[11px] text-muted-foreground">#{p.rank}</span>
                </div>
                <div className="tabular text-lg font-semibold text-long">+{fmtCompact(p.pnl)}</div>
                <p className="text-[11px] text-muted-foreground">
                  Week profit · vol {fmtCompact(p.volume)} · start at 10%, max $25
                </p>
                <Button size="sm" variant={on ? "outline" : "default"} disabled={on} onClick={() => onCopy(p, 10, 25)} className="mt-auto">
                  {on ? <CheckIcon /> : <CopyIcon />} {on ? "Copying" : "Copy with starter size"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function Leaderboard({ onCopy, following, paused }: Common) {
  const [win, setWin] = useState<Win>("WEEK");
  const rows = useLeaders(win);
  return (
    <section className="rounded-2xl border bg-card p-4" aria-labelledby="lb-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="lb-title" className="flex items-center gap-2 font-semibold">
          <UsersIcon className="size-4 text-brand" /> Top traders
        </h2>
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWin(w)}
              aria-pressed={win === w}
              className={`rounded-md px-2.5 py-1 font-medium ${win === w ? "bg-background text-foreground" : "text-muted-foreground"}`}
            >
              {w === "ALL" ? "All" : w[0] + w.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>
      {!rows ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Leaderboard unavailable right now.</p>
      ) : (
        <ol className="flex flex-col">
          {rows.slice(0, 25).map((l) => (
            <li key={l.wallet} className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/40" data-testid="leader-row">
              <span className={`tabular text-sm font-bold ${l.rank <= 3 ? "text-brand" : "text-muted-foreground"}`}>#{l.rank}</span>
              <div className="min-w-0">
                <a href={`https://polymarket.com/profile/${l.wallet}`} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium hover:underline" title={short(l.wallet)}>
                  {l.name}
                </a>
                <span className="text-[11px] text-muted-foreground">Vol {fmtCompact(l.volume)}</span>
              </div>
              <span className={`tabular text-sm font-semibold ${l.pnl >= 0 ? "text-long" : "text-short"}`}>
                {l.pnl >= 0 ? "+" : "-"}
                {fmtCompact(Math.abs(l.pnl))}
              </span>
              <Button size="sm" variant={following.has(l.wallet) ? "outline" : "default"} disabled={following.has(l.wallet)} onClick={() => onCopy(l)}>
                {following.has(l.wallet) ? "Copying" : paused.has(l.wallet) ? "Resume" : "Copy"}
              </Button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
