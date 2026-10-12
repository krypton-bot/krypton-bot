import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, withApi } from "@/lib/api";
import { botUsername, clearTelegram, getToken, linkCode, saveToken, sendTelegram } from "@/lib/telegram";
import { getSettings, RiskError } from "@/lib/trading";

async function status() {
  const s = await getSettings();
  const hasToken = !!(await getToken());
  return { hasToken, bot: hasToken ? await botUsername() : null, linked: !!s.tgChatId, alerts: s.alertTelegram };
}

export const GET = withApi(async () => NextResponse.json(await status()));

/** Save your own bot token (from @BotFather). Checked with Telegram, stored encrypted, never returned. */
export const PUT = withApi(async (req) => {
  const { token } = z.object({ token: z.string().trim().min(10).max(80) }).parse(await readJson(req));
  try {
    await saveToken(token);
  } catch (e) {
    throw new RiskError(e instanceof Error ? e.message : "Telegram rejected that token.");
  }
  return NextResponse.json(await status());
});

/** action "link": one-time t.me link that connects a chat. action "test": send a test message. */
export const POST = withApi(async (req) => {
  const { action } = z.object({ action: z.enum(["link", "test"]) }).parse(await readJson(req));
  if (action === "link") {
    const bot = await botUsername();
    if (!bot) throw new RiskError("Save a valid bot token first.");
    return NextResponse.json({ url: `https://t.me/${bot}?start=${await linkCode()}` });
  }
  const s = await getSettings();
  if (!s.tgChatId) throw new RiskError("Connect Telegram first.");
  if (!(await sendTelegram(s.tgChatId, "Krypton Bot Light: alerts are working."))) throw new RiskError("Telegram did not accept the message. Check the bot token.");
  return NextResponse.json({ ok: true });
});

export const DELETE = withApi(async () => {
  await clearTelegram();
  return NextResponse.json(await status());
});
