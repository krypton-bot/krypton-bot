import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { LOCAL_USER } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";

// Copy-trade alerts through YOUR OWN Telegram bot (create one with @BotFather). The token stays in ./data, encrypted.
const API = "https://api.telegram.org";
const POLL_S = 30;
const TOKEN_KEY = "telegram.botToken";
export const TOKEN_FORMAT = /^\d{6,12}:[A-Za-z0-9_-]{30,50}$/;

type Update = { update_id: number; message?: { chat: { id: number }; text?: string } };

export async function getToken(): Promise<string | null> {
  const env = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (env) return env;
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, TOKEN_KEY));
  if (!row) return null;
  try {
    return decrypt(row.value, TOKEN_KEY);
  } catch {
    return null; // data key changed: treat as unset
  }
}

async function call<T>(method: string, body: Record<string, unknown>, token?: string): Promise<T> {
  const t = token ?? (await getToken());
  if (!t) throw new Error("Telegram bot token is not set.");
  const r = await fetch(`${API}/bot${t}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout((POLL_S + 10) * 1000),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  // The error text never includes the token (Telegram does not echo it), and we never log the URL.
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description ?? r.status}`);
  return j.result as T;
}

let me: { token: string; username: string } | null = null;

/** The bot username for the t.me link; null when no bot is configured or the token is rejected. */
export async function botUsername(): Promise<string | null> {
  const token = await getToken();
  if (!token) return null;
  if (me?.token !== token) {
    try {
      me = { token, username: (await call<{ username: string }>("getMe", {}, token)).username };
    } catch {
      return null;
    }
  }
  return me.username;
}

/** Check a token with Telegram, then store it encrypted. Returns the bot username. */
export async function saveToken(token: string) {
  if (!TOKEN_FORMAT.test(token)) throw new Error("That does not look like a bot token (123456:ABC...). Copy it from @BotFather.");
  const { username } = await call<{ username: string }>("getMe", {}, token);
  const value = encrypt(token, TOKEN_KEY);
  await db.insert(schema.appSettings).values({ key: TOKEN_KEY, value, encrypted: true }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value, encrypted: true } });
  me = { token, username };
  return username;
}

/** Forget the token and unlink the chat. */
export async function clearTelegram() {
  me = null;
  await db.delete(schema.appSettings).where(eq(schema.appSettings.key, TOKEN_KEY));
  await db.update(schema.userSettings).set({ tgChatId: null, tgLinkCode: null }).where(eq(schema.userSettings.userId, LOCAL_USER));
}

/** Plain-text message. Never throws: an alert outage must not break trading. */
export async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  try {
    await call("sendMessage", { chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true });
    return true;
  } catch (e) {
    console.error("[telegram]", e instanceof Error ? e.message : "send failed");
    return false;
  }
}

/** One-time code the user sends to the bot through t.me/<bot>?start=<code>. */
export async function linkCode() {
  const code = randomBytes(12).toString("base64url");
  await db.update(schema.userSettings).set({ tgLinkCode: code }).where(eq(schema.userSettings.userId, LOCAL_USER));
  return code;
}

async function handle(u: Update) {
  const chat = u.message?.chat.id;
  const text = u.message?.text?.trim() ?? "";
  if (!chat) return;
  const code = text.match(/^\/start\s+([\w-]{8,64})$/)?.[1];
  if (code) {
    const [row] = await db
      .update(schema.userSettings)
      .set({ tgChatId: String(chat), tgLinkCode: null, alertTelegram: true })
      .where(eq(schema.userSettings.tgLinkCode, code))
      .returning({ userId: schema.userSettings.userId });
    await sendTelegram(
      String(chat),
      row ? "Connected. Krypton Bot Light will message you here when a copy bot trades. Send /stop to disconnect." : "This link has expired. Open Settings in Krypton Bot Light and tap Connect again.",
    );
    return;
  }
  if (text === "/stop") {
    await db.update(schema.userSettings).set({ tgChatId: null }).where(eq(schema.userSettings.tgChatId, String(chat)));
    await sendTelegram(String(chat), "Disconnected. You will not get copy-trade alerts here any more.");
    return;
  }
  await sendTelegram(String(chat), "Krypton Bot Light sends copy-trade alerts here. Connect from Settings in the app.");
}

/**
 * Long-polls your bot for /start <code> and /stop. Runs once per server and idles while no token is set.
 * getUpdates polling needs no public webhook URL, which suits a local app.
 */
export function startTelegram() {
  const g = globalThis as unknown as { tgStarted?: boolean };
  if (g.tgStarted) return;
  g.tgStarted = true;
  let offset = 0;
  const loop = async () => {
    for (;;) {
      try {
        if (!(await getToken())) {
          await new Promise((r) => setTimeout(r, 15_000));
          continue;
        }
        const updates = await call<Update[]>("getUpdates", { offset, timeout: POLL_S, allowed_updates: ["message"] });
        for (const u of updates) {
          offset = u.update_id + 1;
          await handle(u).catch((e) => console.error("[telegram] update", e instanceof Error ? e.message : "failed"));
        }
      } catch (e) {
        console.error("[telegram] poll", e instanceof Error ? e.message : "failed");
        await new Promise((r) => setTimeout(r, 15_000));
      }
    }
  };
  void loop();
}
