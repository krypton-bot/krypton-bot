"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { ChevronRightIcon, CopyIcon, LockIcon, Settings2Icon } from "lucide-react";
import { BotFace } from "@/components/bot-face";
import { AnimatedWord } from "@/components/logo";
import { useSidebar } from "@/components/ui/sidebar";
import { api } from "@/lib/api-client";
import { describeCopy } from "@/lib/copy/describe";
import { CLOUD_URL } from "@/lib/site";
import { useCopyEvents } from "@/lib/use-copy-events";

type Status = { mode: "paper" | "live"; killSwitch: boolean };
type Follow = { id: number; active: boolean };

const RECENT_MS = 60_000;
const FEED_SIZE = 30;

function Chip({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "muted" }) {
  const color = tone === "good" ? "text-long" : tone === "warn" ? "text-short" : tone === "muted" ? "text-muted-foreground" : "";
  return (
    <div className="min-w-0 rounded-lg bg-muted/50 px-2 py-1">
      <div className="text-[9px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className={`truncate text-xs font-medium ${color}`}>{value}</div>
    </div>
  );
}

/** Read-only chat: the bot narrates every copied trade, skip and failure, newest at the bottom. */
function BotFeed({ open }: { open: boolean }) {
  const events = useCopyEvents();
  const box = useRef<HTMLDivElement>(null);
  const items = events.slice(0, FEED_SIZE).reverse();
  const lastId = items.at(-1)?.id;
  useEffect(() => {
    // Scroll the feed only, never the page; after paint, since the panel was hidden until now.
    const id = requestAnimationFrame(() => box.current && (box.current.scrollTop = box.current.scrollHeight));
    return () => cancelAnimationFrame(id);
  }, [lastId, open]);
  return (
    <div ref={box} className="mt-3 flex max-h-72 min-h-28 flex-col gap-2 overflow-y-auto rounded-xl border bg-background/40 p-2.5" aria-live="polite" aria-label="What your copy bots did">
      {items.length === 0 ? (
        <div className="m-auto max-w-60 py-4 text-center text-xs text-muted-foreground">Nothing to report yet. Start a copy bot and I will post every trade here.</div>
      ) : (
        items.map((e) => (
          <div key={e.id} className="flex items-end gap-1.5">
            <BotFace className="mb-0.5 size-4 shrink-0" animated={false} />
            <div className={`max-w-[88%] rounded-2xl rounded-bl-sm px-2.5 py-1.5 text-xs ${!e.ok ? "bg-short/10 text-short" : "bg-brand/10"}`}>
              <p className="break-words">{describeCopy(e)}</p>
              <time className="mt-0.5 block text-[10px] text-muted-foreground">{new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Krypton Bot itself, in place of the sidebar logo: it bobs and glows while a copy bot works. A click opens one
 * panel with its status and a read-only feed of what it copied.
 */
export function BotDock() {
  const { isMobile } = useSidebar();
  const [s, setS] = useState<Status | null>(null);
  const [follows, setFollows] = useState<Follow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const events = useCopyEvents();

  useEffect(() => {
    const load = () => {
      api<{ settings: Status }>("/api/settings").then((d) => setS(d.settings)).catch(() => {});
      api<{ follows: Follow[] }>("/api/copy/follows").then((d) => setFollows(d.follows)).catch(() => {});
    };
    load();
    const t = setInterval(() => {
      setNow(Date.now());
      load();
    }, 15_000);
    return () => clearInterval(t);
  }, []);

  const running = follows?.filter((f) => f.active).length ?? 0;
  const last = events[0];
  const working = !!last && now - last.ts < RECENT_MS;
  const status = !s || !follows ? "Waking up…" : working ? "Copying…" : running ? `${running} bot${running > 1 ? "s" : ""} watching` : "Ready · tap me";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`Krypton Bot, ${status}. Open bot panel`}
        className="group/bot flex w-full cursor-pointer items-center gap-3 rounded-xl border border-brand/25 bg-gradient-to-br from-brand/15 to-transparent p-2.5 text-left shadow-sm transition-all outline-none hover:-translate-y-px hover:border-brand/60 hover:shadow-[0_0_24px_-8px_var(--color-brand)] focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-0 data-[popup-open]:border-brand/70"
      >
        <span className="relative grid size-11 shrink-0 place-items-center">
          <span className={`absolute inset-1 rounded-full bg-brand/30 blur-md ${working || running ? "animate-pulse" : ""}`} />
          <BotFace className="bot-bob relative size-10 transition-transform group-hover/bot:scale-110" active={working} />
          <span className={`absolute right-0 bottom-0.5 size-2.5 rounded-full border-2 border-sidebar ${working || running ? "animate-pulse bg-long" : "bg-brand"}`} />
        </span>
        <span className="grid min-w-0 flex-1 leading-tight">
          <AnimatedWord text="Krypton Bot" className="truncate text-sm font-semibold" />
          <span className="truncate text-xs text-muted-foreground">{status}</span>
        </span>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/bot:translate-x-0.5 group-hover/bot:text-brand group-data-[popup-open]/bot:rotate-90" />
      </Popover.Trigger>
      <Popover.Portal keepMounted>
        <Popover.Positioner side={isMobile ? "bottom" : "right"} align="start" sideOffset={12} collisionPadding={12} className="z-50">
          <Popover.Popup className="flex max-h-[calc(100dvh-2rem)] w-96 max-w-[calc(100vw-1.5rem)] origin-(--transform-origin) flex-col overflow-y-auto rounded-2xl border bg-popover p-4 text-popover-foreground shadow-2xl transition-[transform,opacity] duration-200 outline-none data-[closed]:hidden data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <div className="flex items-start gap-3">
              <BotFace className="bot-bob size-11 shrink-0" active={working} />
              <div className="min-w-0 flex-1">
                <Popover.Title className="text-base font-semibold">Hello!</Popover.Title>
                <Popover.Description className="text-sm text-muted-foreground">I am Krypton Bot Light. I copy the traders you pick.</Popover.Description>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <Chip label="Mode" value={s ? (s.mode === "live" ? "Live" : "Paper") : "…"} tone={s?.mode === "live" ? "warn" : undefined} />
              <Chip label="Copy bots" value={follows ? `${running} running` : "…"} tone={running ? "good" : "muted"} />
              <Chip label="Last copy" value={last ? new Date(last.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Never"} tone="muted" />
            </div>
            {s?.killSwitch && <p className="mt-2 rounded-lg bg-short/10 px-2.5 py-1.5 text-xs text-short">Kill switch is on: no new positions will open.</p>}
            <BotFeed open={open} />
            <Link href="/dashboard/copy" className="mt-3 flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted" onClick={() => setOpen(false)}>
              <CopyIcon className="size-4 shrink-0 text-brand" />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-sm font-medium">Copy trade</div>
                <div className="truncate text-[11px] text-muted-foreground">Pick a trader and start a bot</div>
              </div>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </Link>
            <a href={CLOUD_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted">
              <LockIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-sm font-medium">Autopilot and AI agent</div>
                <div className="truncate text-[11px] text-muted-foreground">Unlock in Krypton.Bot Cloud</div>
              </div>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </a>
            <div className="mt-2 border-t pt-2">
              <Link href="/dashboard/settings" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted" onClick={() => setOpen(false)}>
                <Settings2Icon className="size-4 text-muted-foreground" /> Mode, risk limits, wallet and alerts
              </Link>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
