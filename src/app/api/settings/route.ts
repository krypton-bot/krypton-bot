import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, withApi } from "@/lib/api";
import { getSettings, RiskError, updateSettings, type Settings } from "@/lib/trading";
import { walletInfo } from "@/lib/trading/pm-live";

const Patch = z.object({
  mode: z.enum(["paper", "live"]).optional(),
  maxNotional: z.number().min(1).max(1_000_000).optional(),
  dailyLossLimit: z.number().min(1).max(1_000_000).optional(),
  killSwitch: z.boolean().optional(),
  alertTelegram: z.boolean().optional(),
});

/** Public view of the settings: never the Telegram link code. */
const view = (s: Settings) => ({
  mode: s.mode,
  maxNotional: s.maxNotional,
  dailyLossLimit: s.dailyLossLimit,
  killSwitch: s.killSwitch,
  paperBalance: s.paperBalance,
  alertTelegram: s.alertTelegram,
  telegramLinked: !!s.tgChatId,
});

export const GET = withApi(async () => NextResponse.json({ settings: view(await getSettings()) }));

export const PUT = withApi(async (req) => {
  const patch = Patch.parse(await readJson(req));
  if (patch.mode === "live" && !(await walletInfo()).connected) throw new RiskError("Connect your Polymarket wallet before switching to live trading.");
  return NextResponse.json({ settings: view(await updateSettings(patch)) });
});
