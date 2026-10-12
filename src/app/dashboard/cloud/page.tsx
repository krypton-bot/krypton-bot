import type { Metadata } from "next";
import { CheckIcon, ExternalLinkIcon, LockIcon, MinusIcon } from "lucide-react";
import { BotFace } from "@/components/bot-face";
import { CLOUD_FEATURES, CLOUD_URL } from "@/lib/site";

export const metadata: Metadata = { title: "Krypton.Bot Cloud" };

const ROWS: [string, boolean, boolean][] = [
  ["Copy trading: leaderboard, trader stats, live feed", true, true],
  ["Paper and live trading, your own wallet", true, true],
  ["Risk limits, kill switch, Telegram alerts", true, true],
  ["Runs on your machine, data stays local", true, false],
  ["Always on: bots keep copying when your laptop is closed", false, true],
  ["AI-researched trader picks and Krypton Bot AI agent", false, true],
  ["Autopilot and Decision Maker", false, true],
  ["Prediction markets and perps trading", false, true],
  ["MCP server and analytics", false, true],
];

const Mark = ({ on }: { on: boolean }) =>
  on ? <CheckIcon className="mx-auto size-4 text-long" aria-label="Included" /> : <MinusIcon className="mx-auto size-4 text-muted-foreground/60" aria-label="Not included" />;

/** The locked-state page: what the cloud edition adds, said plainly. One call to action. */
export default function Page() {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-8">
      <section className="flex flex-wrap items-center gap-5 rounded-2xl border bg-gradient-to-br from-brand/15 via-card to-card p-6">
        <BotFace className="bot-bob size-16 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold">Unlock in Krypton.Bot Cloud</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Light does copy trading well and stays free. Cloud adds the AI agent, autopilot and markets, and runs for you around the clock, so you do not have to keep a machine awake.
          </p>
        </div>
        <a href={CLOUD_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground hover:brightness-110">
          Visit krypton.bot <ExternalLinkIcon className="size-4" aria-hidden />
        </a>
      </section>

      <section aria-labelledby="locked-title">
        <h2 id="locked-title" className="mb-3 font-semibold">
          What is locked here
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {CLOUD_FEATURES.map((f) => (
            <li key={f.title} className="flex gap-3 rounded-xl border bg-card p-4">
              <f.icon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {f.title} <LockIcon className="size-3 text-muted-foreground" aria-label="Locked in Light" />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{f.blurb}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="cmp-title">
        <h2 id="cmp-title" className="mb-3 font-semibold">
          Light vs Cloud
        </h2>
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Feature</th>
                <th className="px-4 py-3 font-medium">Light (free)</th>
                <th className="px-4 py-3 font-medium">Cloud</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, light, cloud]) => (
                <tr key={label} className="border-b last:border-0">
                  <td className="px-4 py-2.5">{label}</td>
                  <td className="px-4 py-2.5 text-center">
                    <Mark on={light} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Mark on={cloud} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Light is MIT licensed and will keep working on its own. Not financial advice. Trading involves risk of loss.</p>
      </section>
    </div>
  );
}
