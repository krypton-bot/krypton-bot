"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLinkIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";
import { SettingsCard as Card } from "./settings-card";
import type { Settings } from "./settings-form";

type Status = { hasToken: boolean; bot: string | null; linked: boolean; alerts: boolean };

/** Copy-trade alerts through your own Telegram bot (create one with @BotFather). */
export function TelegramCard({ settings, onChange }: { settings: Settings; onChange: () => void }) {
  const [t, setT] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Status>("/api/telegram").then(setT).catch(() => setT({ hasToken: false, bot: null, linked: false, alerts: true }));
  }, []);
  useEffect(load, [load]);

  async function run<R>(f: () => Promise<R>, ok?: string) {
    setBusy(true);
    try {
      const r = await f();
      if (ok) toast.success(ok);
      return r;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const saveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = await run(() => api<Status>("/api/telegram", { method: "PUT", body: JSON.stringify({ token: token.trim() }) }), "Bot token saved");
    if (d) {
      setT(d);
      setToken("");
    }
  };
  const connect = async () => {
    const d = await run(() => api<{ url: string }>("/api/telegram", { method: "POST", body: JSON.stringify({ action: "link" }) }));
    if (d) {
      window.open(d.url, "_blank", "noopener,noreferrer");
      toast.message("Press Start in Telegram, then come back here.");
      const poll = setInterval(() => {
        api<Status>("/api/telegram").then((s) => {
          if (s.linked) {
            clearInterval(poll);
            setT(s);
            onChange();
            toast.success("Telegram connected");
          }
        });
      }, 3000);
      setTimeout(() => clearInterval(poll), 120_000);
    }
  };
  const test = () => run(() => api("/api/telegram", { method: "POST", body: JSON.stringify({ action: "test" }) }), "Test message sent");
  const remove = async () => {
    if (!confirm("Remove the bot token and disconnect Telegram?")) return;
    const d = await run(() => api<Status>("/api/telegram", { method: "DELETE" }), "Telegram removed");
    if (d) {
      setT(d);
      onChange();
    }
  };
  const toggle = async (v: boolean) => {
    await run(() => api("/api/settings", { method: "PUT", body: JSON.stringify({ alertTelegram: v }) }), v ? "Alerts on" : "Alerts off");
    onChange();
  };

  return (
    <Card title="Telegram alerts" hint="Get a message every time a copy bot trades or fails. Uses a bot you own, so nobody else sees your trades.">
      {!t ? (
        <div className="h-16 animate-pulse rounded-xl bg-muted/40" />
      ) : !t.hasToken ? (
        <form onSubmit={saveToken} className="grid gap-3" autoComplete="off">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Open{" "}
              <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-foreground underline">
                @BotFather <ExternalLinkIcon className="size-3" />
              </a>{" "}
              and send /newbot.
            </li>
            <li>Paste the token it gives you here.</li>
          </ol>
          <div className="flex gap-2">
            <Input type="password" name="tg-token" placeholder="123456789:AA…" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} aria-label="Telegram bot token" />
            <Button type="submit" disabled={busy || token.trim().length < 10}>
              Save token
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
            <div>
              <div className="text-sm font-medium">{t.linked ? "Connected" : "Bot ready"}</div>
              <div className="text-xs text-muted-foreground">{t.bot ? `@${t.bot}` : "Token saved, but Telegram did not answer. Check it and save again."}</div>
            </div>
            <div className="flex gap-2">
              {!t.linked && (
                <Button size="sm" onClick={connect} disabled={busy || !t.bot}>
                  <SendIcon /> Connect Telegram
                </Button>
              )}
              {t.linked && (
                <Button size="sm" variant="outline" onClick={test} disabled={busy}>
                  Send test
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>
                Remove
              </Button>
            </div>
          </div>
          {t.linked && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm">Alert me on every copy trade</span>
              <Switch checked={settings.alertTelegram} label="Telegram alerts" disabled={busy} onChange={toggle} />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
