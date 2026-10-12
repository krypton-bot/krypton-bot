"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckIcon, ChevronRightIcon, LockIcon } from "lucide-react";
import { BotReactor } from "@/components/bot-reactor";
import { api, type Portfolio } from "@/lib/api-client";
import { describeCopy } from "@/lib/copy/describe";
import { fmtUsd } from "@/lib/format";
import { CLOUD_FEATURES, CLOUD_URL } from "@/lib/site";
import { useCopyEvents } from "@/lib/use-copy-events";

type Settings = { mode: "paper" | "live"; telegramLinked: boolean; maxNotional: number; killSwitch: boolean };
type Follow = { id: number; active: boolean };

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="text-xs tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className={`tabular mt-1 text-2xl font-semibold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}
const tone = (n: number | undefined) => (!n || Math.abs(n) < 0.005 ? "" : n > 0 ? "text-long" : "text-short");

export function Overview() {
  const [pf, setPf] = useState<Portfolio | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [follows, setFollows] = useState<Follow[] | null>(null);
  const events = useCopyEvents();

  useEffect(() => {
    const load = () => {
      api<Portfolio>("/api/portfolio").then(setPf).catch(() => {});
      api<{ follows: Follow[] }>("/api/copy/follows").then((d) => setFollows(d.follows)).catch(() => {});
    };
    api<{ settings: Settings }>("/api/settings").then((d) => setS(d.settings)).catch(() => {});
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  const running = follows?.filter((f) => f.active).length ?? 0;
  const steps: [string, string, boolean, string][] = [
    ["Start a copy bot", "Pick a trader from the leaderboard. Paper mode is on, so nothing is at risk.", (follows?.length ?? 0) > 0, "/dashboard/copy"],
    ["Check your risk limits", `Per-order cap is $${s?.maxNotional ?? "…"}. Adjust it and the daily loss stop in Settings.`, false, "/dashboard/settings"],
    ["Get alerts on Telegram", "Optional. A message for every copied trade, from a bot you own.", !!s?.telegramLinked, "/dashboard/settings"],
    ["Go live when you trust it", "Optional. Connect your own wallet and flip the mode switch.", s?.mode === "live", "/dashboard/settings"],
  ];

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6">
      <section className="flex flex-wrap items-center gap-6 rounded-2xl border bg-gradient-to-br from-brand/10 via-card to-card p-5">
        <BotReactor cycle={running > 0} fast={running > 0} labels={false} name={false} className="size-28 shrink-0 sm:size-32" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold">{running ? `${running} copy bot${running > 1 ? "s" : ""} watching the market` : "Ready when you are"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {running
              ? "Every buy and sell from the traders you follow is mirrored while this app is running."
              : "Copy the best Polymarket traders automatically. Start in paper mode, go live when you are confident."}
          </p>
          <Link href="/dashboard/copy" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-brand-foreground hover:brightness-110">
            {running ? "Open copy trade" : "Pick a trader"} <ChevronRightIcon className="size-4" />
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={pf?.mode === "live" ? "Positions value" : "Balance"} value={pf ? fmtUsd(pf.value + (pf.cash ?? 0)) : "…"} />
        <Stat label="Open P/L" value={pf ? fmtUsd(pf.upnl) : "…"} tone={tone(pf?.upnl)} />
        <Stat label="Realized P/L" value={pf ? fmtUsd(pf.realized) : "…"} tone={tone(pf?.realized)} />
        <Stat label="Copy bots running" value={follows ? String(running) : "…"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5" aria-labelledby="start-title">
          <h2 id="start-title" className="font-semibold">
            Get started
          </h2>
          <ol className="mt-3 flex flex-col gap-2">
            {steps.map(([title, body, done, href]) => (
              <li key={title}>
                <Link href={href} className="flex gap-3 rounded-xl border p-3 transition-colors hover:border-brand/50">
                  <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${done ? "bg-brand text-black" : "border text-transparent"}`}>
                    <CheckIcon className="size-3" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="block text-xs text-muted-foreground">{body}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-2xl border bg-card p-5" aria-labelledby="act-title">
          <h2 id="act-title" className="font-semibold">
            Recent bot activity
          </h2>
          {events.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nothing yet. Copied trades show up here the moment they happen.</p>
          ) : (
            <ol className="mt-3 flex max-h-80 flex-col gap-2 overflow-y-auto">
              {events.slice(0, 20).map((e) => (
                <li key={e.id} className="flex gap-2 text-sm">
                  <span className={`mt-2 size-1.5 shrink-0 rounded-full ${e.ok ? "bg-long" : "bg-short"}`} />
                  <span className={`min-w-0 flex-1 ${e.ok ? "" : "text-short"}`}>{describeCopy(e)}</span>
                  <time className="shrink-0 text-xs text-muted-foreground">{new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section aria-labelledby="cloud-title">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="cloud-title" className="font-semibold">
            More in Krypton.Bot Cloud
          </h2>
          <Link href="/dashboard/cloud" className="text-xs text-muted-foreground hover:text-foreground">
            See what is different →
          </Link>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CLOUD_FEATURES.map((f) => (
            <li key={f.title}>
              <a
                href={CLOUD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-full flex-col gap-1 rounded-xl border border-dashed bg-card/50 p-3 transition-colors hover:border-brand/60"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground group-hover:text-foreground">
                  <f.icon className="size-4" aria-hidden /> {f.title}
                  <LockIcon className="ml-auto size-3.5" aria-label="Locked" />
                </span>
                <span className="text-xs text-muted-foreground">{f.blurb}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
