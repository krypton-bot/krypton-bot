"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcwIcon, ShieldAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";
import { SettingsCard as Card } from "./settings-card";
import { TelegramCard } from "./telegram-card";
import { WalletCard } from "./wallet-card";

export type Settings = {
  mode: "paper" | "live";
  maxNotional: number;
  dailyLossLimit: number;
  killSwitch: boolean;
  paperBalance: number;
  alertTelegram: boolean;
  telegramLinked: boolean;
};

/** The only settings a copy trader needs: mode, risk limits, wallet and alerts. */
export function SettingsForm() {
  const router = useRouter();
  const [s, setS] = useState<Settings | null>(null);
  const [walletOk, setWalletOk] = useState(false);
  const [max, setMax] = useState("");
  const [loss, setLoss] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ settings: Settings }>("/api/settings")
      .then((d) => {
        setS(d.settings);
        setMax(String(d.settings.maxNotional));
        setLoss(String(d.settings.dailyLossLimit));
      })
      .catch((e) => toast.error(e.message));
  }, []);
  useEffect(load, [load]);

  async function save(patch: Partial<Settings>, msg: string) {
    setBusy(true);
    try {
      const d = await api<{ settings: Settings }>("/api/settings", { method: "PUT", body: JSON.stringify(patch) });
      setS(d.settings);
      toast.success(msg);
      router.refresh(); // header badge shows the mode
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function setMode(mode: "paper" | "live") {
    if (mode === s?.mode) return;
    if (mode === "live" && !confirm("Switch to LIVE trading? Copy bots will place real orders from your wallet with real money.")) return;
    await save({ mode }, mode === "live" ? "Live trading on" : "Paper mode on");
  }

  async function resetPaper() {
    if (!confirm("Reset the paper account to $10,000? Paper positions, paper trades and the activity feed are deleted. Copy bots and live data are not touched.")) return;
    try {
      await api("/api/settings/paper-reset", { method: "POST" });
      toast.success("Paper account reset");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    }
  }

  if (!s) return <div className="h-64 animate-pulse rounded-2xl bg-muted/40" aria-label="Loading settings" />;
  const limitsValid = +max >= 1 && +loss >= 1;
  const limitsDirty = +max !== s.maxNotional || +loss !== s.dailyLossLimit;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <Card title="Trading mode" hint="Paper simulates fills against the live Polymarket order book with fake cash. Live sends real orders from your own wallet.">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm" role="group" aria-label="Trading mode">
            {(["paper", "live"] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={busy}
                onClick={() => setMode(m)}
                aria-pressed={s.mode === m}
                className={`rounded-md px-4 py-1.5 font-medium ${s.mode === m ? (m === "live" ? "bg-short/20 text-short" : "bg-background text-foreground") : "text-muted-foreground"}`}
              >
                {m === "paper" ? "Paper" : "Live"}
              </button>
            ))}
          </div>
          {s.mode === "paper" && (
            <Button variant="outline" size="sm" onClick={resetPaper}>
              <RotateCcwIcon /> Reset paper account
            </Button>
          )}
        </div>
        {s.mode === "live" && !walletOk && (
          <p className="mt-3 flex items-center gap-2 text-sm text-short">
            <ShieldAlertIcon className="size-4" /> Live mode is on but no wallet is connected. Connect one below or switch back to paper.
          </p>
        )}
      </Card>

      <Card title="Risk limits" hint="Checked before every copied buy, in paper and live. Sells are never blocked, so you can always get out.">
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            Max per order ($)
            <Input type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} />
            <span className="text-xs text-muted-foreground">A copied buy above this is refused.</span>
          </label>
          <label className="grid gap-1.5 text-sm">
            Daily loss stop ($)
            <Input type="number" min={1} value={loss} onChange={(e) => setLoss(e.target.value)} />
            <span className="text-xs text-muted-foreground">New buys pause for the day once realized loss reaches this. Resets 00:00 UTC.</span>
          </label>
        </div>
        <Button className="mt-4" disabled={busy || !limitsValid || !limitsDirty} onClick={() => save({ maxNotional: +max, dailyLossLimit: +loss }, "Limits saved")}>
          Save limits
        </Button>
        <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border p-3">
          <div>
            <div className="text-sm font-medium">Kill switch</div>
            <div className="text-xs text-muted-foreground">Stops every copy bot from opening new positions. Sells still go through.</div>
          </div>
          <Switch checked={s.killSwitch} disabled={busy} label="Kill switch" onChange={(v) => save({ killSwitch: v }, v ? "Kill switch on" : "Kill switch off")} />
        </div>
      </Card>

      <WalletCard onChange={setWalletOk} onDisconnected={load} />
      <TelegramCard settings={s} onChange={load} />
    </div>
  );
}
