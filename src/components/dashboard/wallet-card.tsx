"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRoundIcon, WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { SettingsCard as Card } from "./settings-card";

type Wallet = { connected: false; error?: string } | { connected: true; signer: string; wallet: string; source: "env" | "saved" };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Connect your own Polymarket wallet for live copy trading. The key is stored encrypted on this machine only. */
export function WalletCard({ onChange, onDisconnected }: { onChange: (connected: boolean) => void; onDisconnected: () => void }) {
  const [w, setW] = useState<Wallet | null>(null);
  const [pk, setPk] = useState("");
  const [funder, setFunder] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Wallet>("/api/wallet")
      .then((d) => {
        setW(d);
        onChange(d.connected);
      })
      .catch(() => setW({ connected: false }));
  }, [onChange]);
  useEffect(load, [load]);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await api<Wallet>("/api/wallet", { method: "PUT", body: JSON.stringify({ privateKey: pk.trim(), funder: funder.trim() }) });
      setPk(""); // the key leaves the page the moment it is saved
      setFunder("");
      setW(d);
      onChange(d.connected);
      toast.success("Wallet connected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm("Remove the saved key from this machine? Live mode switches back to paper.")) return;
    try {
      const d = await api<Wallet>("/api/wallet", { method: "DELETE" });
      setW(d);
      onChange(d.connected);
      onDisconnected();
      toast.success("Wallet removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove");
    }
  }

  return (
    <Card title="Polymarket wallet" hint="Needed for live trading only. Orders are signed on this machine with your own key. Nothing is sent to us.">
      {w?.connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
          <div className="flex items-center gap-3">
            <WalletIcon className="size-5 text-long" />
            <div>
              <div className="text-sm font-medium">Connected</div>
              <div className="font-mono text-xs text-muted-foreground" title={w.wallet}>
                {short(w.wallet)} · key from {w.source === "env" ? "environment (POLYMARKET_PRIVATE_KEY)" : "this machine"}
              </div>
            </div>
          </div>
          {w.source === "saved" && (
            <Button variant="outline" size="sm" onClick={disconnect}>
              Remove key
            </Button>
          )}
        </div>
      ) : (
        <form onSubmit={connect} className="grid gap-3" autoComplete="off">
          {w?.error && <p className="text-sm text-short">{w.error}</p>}
          <label className="grid gap-1.5 text-sm">
            Signer private key
            <Input type="password" name="pm-signer-key" placeholder="0x…" value={pk} onChange={(e) => setPk(e.target.value)} autoComplete="off" spellCheck={false} required />
          </label>
          <label className="grid gap-1.5 text-sm">
            Funder wallet (optional)
            <Input name="pm-funder" placeholder="0x… only if your funds sit in a proxy or Safe wallet" value={funder} onChange={(e) => setFunder(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Use a dedicated wallet that holds only what you are willing to risk. Never your main wallet.</li>
            <li>The key is encrypted with a random key in ./data and never shown again, logged or sent to the browser. Prefer to keep it out of the app? Set POLYMARKET_PRIVATE_KEY in .env instead.</li>
            <li>Polymarket is not available in every country. Check its restricted regions before you trade live.</li>
          </ul>
          <div>
            <Button type="submit" disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(pk.trim())}>
              <KeyRoundIcon /> Connect wallet
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
