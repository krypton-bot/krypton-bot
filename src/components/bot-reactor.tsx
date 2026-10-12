"use client";

import { useEffect, useState } from "react";
import { BrainIcon, ChartNoAxesCombinedIcon, CopyIcon, NewspaperIcon, ShieldCheckIcon, VoteIcon } from "lucide-react";
import { BotFace } from "@/components/bot-face";
import { AnimatedWord } from "@/components/logo";

/**
 * Krypton Bot "reactor": the bot face in the core, energy rings spinning around it and six agent nodes
 * (perps, markets, copy, decisions, risk, news) that light up with a beam when that part of the bot is working.
 * Pure SVG + CSS transforms (globals.css "reactor-*"), so it stays smooth on phones and honours reduced motion.
 */
export type ReactorNode = "perps" | "markets" | "copy" | "decide" | "risk" | "news";

export const REACTOR_NODES: { key: ReactorNode; label: string; color: string; Icon: typeof BrainIcon }[] = [
  { key: "perps", label: "Perps", color: "#b6ff3b", Icon: ChartNoAxesCombinedIcon },
  { key: "markets", label: "Markets", color: "#38bdf8", Icon: VoteIcon },
  { key: "copy", label: "Copy trade", color: "#e879f9", Icon: CopyIcon },
  { key: "decide", label: "Decisions", color: "#f59e0b", Icon: BrainIcon },
  { key: "risk", label: "Risk guard", color: "#34d399", Icon: ShieldCheckIcon },
  { key: "news", label: "News & X", color: "#f472b6", Icon: NewspaperIcon },
];
// Six nodes around the core, none straight above it (the name sits there).
const ANGLE = [-60, 0, 60, 120, 180, 240];
const pos = (i: number, r: number) => {
  const a = (ANGLE[i] * Math.PI) / 180;
  // rounded so server and browser print the same string (float noise caused a hydration mismatch)
  return { x: +(50 + r * Math.cos(a)).toFixed(2), y: +(50 + r * Math.sin(a)).toFixed(2) };
};

/** Which node a tool call belongs to, so live activity lights the right part of the reactor. */
export function nodeFor(tool: string): ReactorNode | null {
  if (/recordDecision|getDecisionHistory/.test(tool)) return "decide";
  if (/Outcome|Market|getEvent|listMarkets|getPmBook/.test(tool)) return "markets";
  if (/Trader|Copy|topTraders|recommend/.test(tool)) return "copy";
  if (/setProtection|getLimits|getPortfolio|cancel|kill/i.test(tool)) return "risk";
  if (/webSearch|fetchPage|searchX|getMovers/.test(tool)) return "news";
  if (/Order|Position|Ticker|Book|Candles|Perps|Instruments|Leverage/.test(tool)) return "perps";
  return null;
}

type Props = {
  /** Nodes that are working right now. */
  active?: ReactorNode[];
  /** Demo mode: walk through the nodes on its own (landing, loading). */
  cycle?: boolean;
  /** Faster rings: the bot is busy. */
  fast?: boolean;
  /** Node labels next to the icons (hide on tiny sizes). */
  labels?: boolean;
  /** Animated "Krypton" name above the face. */
  name?: boolean;
  className?: string;
};

export function BotReactor({ active = [], cycle = false, fast = false, labels = true, name = true, className = "size-80" }: Props) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!cycle) return;
    const t = setInterval(() => setStep((s) => s + 1), 750);
    return () => clearInterval(t);
  }, [cycle]);
  const lit: ReactorNode[] = cycle ? [REACTOR_NODES[step % 6].key, REACTOR_NODES[(step + 3) % 6].key, ...(step % 4 === 0 ? (["decide"] as const) : [])] : active;
  const on = new Set(lit);
  const busy = fast || cycle || on.size > 0;
  const working = REACTOR_NODES.filter((n) => on.has(n.key)).map((n) => n.label);

  return (
    <div className={`relative ${busy ? "reactor-fast" : ""} ${className}`} role="img" aria-label={`Krypton Bot${working.length ? `: ${working.join(", ")}` : ""}`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="reactor-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#b6ff3b" />
            <stop offset="0.35" stopColor="#38bdf8" />
            <stop offset="0.7" stopColor="#e879f9" />
            <stop offset="1" stopColor="#f59e0b" />
          </linearGradient>
          <radialGradient id="reactor-core-grad">
            <stop offset="0" stopColor="#b6ff3b" stopOpacity="0.35" />
            <stop offset="1" stopColor="#b6ff3b" stopOpacity="0" />
          </radialGradient>
          <filter id="reactor-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>
        <circle cx="50" cy="50" r="30" fill="url(#reactor-core-grad)" className="reactor-core" />
        {REACTOR_NODES.map((n, i) => {
          if (!on.has(n.key)) return null;
          const p = pos(i, 42);
          return <line key={n.key} x1="50" y1="50" x2={p.x} y2={p.y} stroke={n.color} strokeWidth="0.8" strokeLinecap="round" className="reactor-beam" opacity="0.9" />;
        })}
        <g className="reactor-ring reactor-spin-a">
          <circle cx="50" cy="50" r="33" fill="none" stroke="url(#reactor-grad)" strokeWidth="2.4" strokeDasharray="22 6 4 6" filter="url(#reactor-glow)" opacity="0.9" />
          <circle cx="50" cy="50" r="33" fill="none" stroke="url(#reactor-grad)" strokeWidth="1.2" strokeDasharray="22 6 4 6" />
          <circle cx="50" cy="17" r="1.4" fill="#fff" />
        </g>
        <g className="reactor-ring reactor-spin-b">
          <circle cx="50" cy="50" r="26" fill="none" stroke="#b6ff3b" strokeOpacity="0.5" strokeWidth="0.6" strokeDasharray="1 3" />
          <circle cx="76" cy="50" r="1" fill="#38bdf8" />
        </g>
        <g className="reactor-ring reactor-spin-c">
          <circle cx="50" cy="50" r="40" fill="none" stroke="url(#reactor-grad)" strokeOpacity="0.35" strokeWidth="0.5" strokeDasharray="40 20" />
          <circle cx="10" cy="50" r="0.9" fill="#e879f9" />
          <circle cx="90" cy="50" r="0.9" fill="#f59e0b" />
        </g>
      </svg>

      <div className="absolute inset-0 grid place-items-center">
        <div className="flex w-[34%] flex-col items-center gap-1">
          {name && <AnimatedWord text="KRYPTON" className="font-mono text-[11px] font-bold tracking-[0.3em] text-brand sm:text-sm" />}
          <BotFace className="w-[62%] drop-shadow-[0_0_14px_var(--color-brand)]" active={busy} />
        </div>
      </div>

      {REACTOR_NODES.map((n, i) => {
        const p = pos(i, 42);
        const isOn = on.has(n.key);
        return (
          <div key={n.key} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%`, ["--node" as string]: n.color }}>
            <div
              className={`flex items-center gap-1 rounded-full border bg-background/85 px-1.5 py-1 backdrop-blur transition-all duration-300 ${isOn ? "reactor-node-on scale-110" : "opacity-60"}`}
              style={{ borderColor: isOn ? n.color : undefined, color: isOn ? n.color : undefined }}
            >
              <n.Icon className="size-3.5 shrink-0" aria-hidden />
              {labels && <span className="pr-0.5 text-[10px] font-semibold whitespace-nowrap">{n.label}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
