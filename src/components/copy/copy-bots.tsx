"use client";

import { toast } from "sonner";
import { PauseIcon, PlayIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { short } from "./copy-dialog";

export type Follow = { id: number; wallet: string; label: string | null; pct: number; maxUsd: number; active: boolean };

/** Your copy bots: pause, resume, resize or remove. */
export function MyBots({ follows, reload }: { follows: Follow[]; reload: () => void }) {
  async function patch(id: number, body: Partial<Follow>, msg: string) {
    try {
      await api("/api/copy/follows", { method: "PATCH", body: JSON.stringify({ id, ...body }) });
      toast.success(msg);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }
  async function remove(f: Follow) {
    if (!confirm(`Stop copying ${f.label || short(f.wallet)}? Open positions stay open.`)) return;
    try {
      await api("/api/copy/follows", { method: "DELETE", body: JSON.stringify({ id: f.id }) });
      toast.success("Copy bot removed");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    }
  }
  async function setAll(active: boolean) {
    try {
      for (const f of follows.filter((x) => x.active !== active)) await api("/api/copy/follows", { method: "PATCH", body: JSON.stringify({ id: f.id, active }) });
      toast.success(active ? "All copy bots running" : "All copy bots paused");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
    reload();
  }
  if (!follows.length)
    return <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No copy bots yet. Pick a trader from the leaderboard or the live feed.</p>;
  const running = follows.filter((f) => f.active).length;
  return (
    <>
      {follows.length > 1 && (
        <div className="mb-2 flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" disabled={!running} onClick={() => setAll(false)}>
            <PauseIcon /> Pause all
          </Button>
          <Button size="sm" variant="outline" className="flex-1" disabled={running === follows.length} onClick={() => setAll(true)}>
            <PlayIcon /> Resume all
          </Button>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {follows.map((f) => (
          <li key={f.id} className="rounded-xl border p-3" data-testid="copy-bot">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-medium">
                  <span className={`size-2 shrink-0 rounded-full ${f.active ? "animate-pulse bg-long" : "bg-muted-foreground"}`} />
                  <span className="truncate">{f.label || short(f.wallet)}</span>
                  <span className="rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">{f.active ? "running" : "paused"}</span>
                </div>
                <div className="font-mono text-[11px] text-muted-foreground">{short(f.wallet)}</div>
              </div>
              <div className="flex gap-1">
                <Button size="icon-sm" variant="ghost" onClick={() => patch(f.id, { active: !f.active }, f.active ? "Copy bot paused" : "Copy bot resumed")} aria-label={f.active ? "Pause" : "Resume"}>
                  {f.active ? <PauseIcon /> : <PlayIcon />}
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => remove(f)} aria-label="Remove">
                  <Trash2Icon />
                </Button>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-[11px] text-muted-foreground">
                Size %
                <Input type="number" min={1} max={100} defaultValue={f.pct} className="h-8" onBlur={(e) => +e.target.value !== f.pct && patch(f.id, { pct: +e.target.value }, "Size updated")} />
              </label>
              <label className="grid gap-1 text-[11px] text-muted-foreground">
                Max $ / trade
                <Input type="number" min={1} max={10000} defaultValue={f.maxUsd} className="h-8" onBlur={(e) => +e.target.value !== f.maxUsd && patch(f.id, { maxUsd: +e.target.value }, "Max updated")} />
              </label>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
