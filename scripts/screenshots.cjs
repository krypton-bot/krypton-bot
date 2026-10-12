// Drives the running app with Playwright: creates a paper copy bot from the leaderboard, checks it runs,
// checks the locked menu items, and saves screenshots to docs/screenshots.
//
//   npm run dev                      (in one terminal)
//   npx playwright install chromium  (once, if you do not have a browser)
//   node scripts/screenshots.cjs     (needs the `playwright` package: npm i -D playwright, or a global install + NODE_PATH)
//
// Env: BASE_URL (default http://127.0.0.1:3000), WAIT_BOT_MS (how long to wait for the first copied trade, default 240000).
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const OUT = path.join(__dirname, "..", "docs", "screenshots");
const WAIT_BOT_MS = Number(process.env.WAIT_BOT_MS || 240_000);
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, colorScheme: "dark" });
  // the logo letters drop in on load; let that finish so the shots are clean
  const shot = async (name, opts = {}) => (await page.waitForTimeout(1800), page.screenshot({ path: path.join(OUT, name), ...opts }));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Start from a clean paper account so the run is repeatable.
  await page.goto(`${BASE}/dashboard`);
  const state = await page.evaluate(async () => {
    const follows = (await (await fetch("/api/copy/follows")).json()).follows;
    for (const f of follows) await fetch("/api/copy/follows", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: f.id }) });
    await fetch("/api/settings/paper-reset", { method: "POST" });
    return follows.length;
  });
  console.log(`cleaned ${state} old bots`);

  // 1. Overview opens straight away (no login, no landing page).
  check("root redirects to the dashboard", (await page.goto(BASE)).url().endsWith("/dashboard"));
  await page.getByRole("heading", { name: /Ready when you are/ }).waitFor();
  await page.waitForTimeout(1200);
  await shot("01-dashboard.png");

  // 2. Locked menu items link to krypton.bot.
  const locked = await page.$$eval('a[aria-label$="(locked, opens krypton.bot)"]', (as) => as.map((a) => ({ label: a.getAttribute("aria-label"), href: a.href, target: a.target })));
  check("seven locked items in the sidebar", locked.length === 7, locked.map((l) => l.label.split(" (")[0]).join(", "));
  check("every locked item links to https://krypton.bot", locked.length > 0 && locked.every((l) => l.href === "https://krypton.bot/" && l.target === "_blank"));

  // 3. Copy page: picks and leaderboard.
  await page.goto(`${BASE}/dashboard/copy`);
  await page.locator('[data-testid="leader-row"]').first().waitFor({ timeout: 30_000 });
  await page.locator('[data-testid="copy-pick"]').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await shot("02-copy-picks-leaderboard.png");

  // 4. Pick the most active trader of the day from the leaderboard, so a copied trade shows up soon.
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await page.locator('[data-testid="leader-row"]').first().waitFor();
  const best = await page.evaluate(async () => {
    const rows = (await (await fetch("/api/copy/leaders?window=DAY")).json()).leaders.slice(0, 12);
    const stats = await Promise.all(
      rows.map(async (r) => {
        const p = (await (await fetch(`/api/copy/trader?wallet=${r.wallet}`)).json()).profile;
        return { name: r.name, wallet: r.wallet, perDay: p?.tradesPerDay ?? 0, hoursAgo: p?.lastTradeHoursAgo ?? 999 };
      }),
    );
    stats.sort((a, b) => a.hoursAgo - b.hoursAgo || b.perDay - a.perDay);
    return stats[0];
  });
  console.log(`most active top trader: ${best.name} (${best.perDay}/day, last trade ${best.hoursAgo}h ago)`);
  const row = page.locator('[data-testid="leader-row"]', { hasText: best.name }).first();
  await row.scrollIntoViewIfNeeded();
  await row.getByRole("button", { name: "Copy" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByText("Win rate").waitFor({ timeout: 30_000 });
  await shot("03-copy-dialog.png");
  const lastId = await page.evaluate(async () => Math.max(0, ...(await (await fetch("/api/copy/events")).json()).events.map((e) => e.id)));
  await page.getByRole("button", { name: /Start copy bot/ }).click();

  // 5. The bot shows up as running.
  const bot = page.locator('[data-testid="copy-bot"]').first();
  await bot.waitFor({ timeout: 15_000 });
  check("copy bot appears in Your copy bots", (await bot.innerText()).includes(best.name));
  check("copy bot is running", /running/.test(await bot.innerText()));
  check("header badge says Paper mode", await page.getByText("Paper mode").first().isVisible());
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("04-copy-bot-created.png");

  // 6. Wait for the engine to mirror a real trade from that trader (paper fill against the live order book).
  console.log(`waiting up to ${Math.round(WAIT_BOT_MS / 1000)}s for ${best.name} to trade...`);
  // A new event (id above the ones that existed before the bot started) proves this bot copied a trade.
  let fresh = null;
  for (const until = Date.now() + WAIT_BOT_MS; !fresh && Date.now() < until; ) {
    const evs = await page.evaluate(async () => (await (await fetch("/api/copy/events")).json()).events);
    fresh = evs.find((e) => e.id > lastId) ?? null;
    if (!fresh) await page.waitForTimeout(2000);
  }
  check("copy engine mirrored a live trade", !!fresh, fresh ? `${fresh.name} ok=${fresh.ok} ${JSON.stringify(fresh.output).slice(0, 110)}` : "no trade from the leader in the wait window");
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot("05-copy-bot-running.png");
  const pf = await page.evaluate(async () => (await fetch("/api/portfolio")).json());
  console.log(`open paper positions: ${pf.positions.length}, cash ${pf.cash.toFixed(2)}`);

  // 7. Bot dock, cloud page, settings.
  await page.getByRole("button", { name: /Open bot panel/ }).click();
  await page.waitForTimeout(500);
  await shot("06-bot-dock.png");
  await page.keyboard.press("Escape");
  await page.goto(`${BASE}/dashboard/cloud`);
  await page.getByRole("heading", { name: "Unlock in Krypton.Bot Cloud" }).first().waitFor();
  await page.waitForTimeout(500);
  await shot("07-locked-cloud.png");
  await page.goto(`${BASE}/dashboard/settings`);
  await page.getByText("Risk limits").first().waitFor();
  await page.waitForTimeout(500);
  await shot("08-settings.png", { fullPage: true });

  check("no uncaught page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
