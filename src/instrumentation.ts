// Runs once when the Node server boots: migrate the embedded database, then start the copy engine and Telegram link poller.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ready } = await import("./db");
  await ready();
  await (await import("./lib/copy/engine")).startCopyEngine(); // live Polymarket trades -> copy bots
  (await import("./lib/telegram")).startTelegram(); // /start <code> links your Telegram chat
}
