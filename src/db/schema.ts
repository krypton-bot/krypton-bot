import { boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Single local user: every row carries this id. Kept as a column so the schema matches the cloud edition.
export const LOCAL_USER = "local";
const userId = () => text("user_id").notNull().default(LOCAL_USER);

/** Trading mode, risk limits and Telegram link. One row, created on first read. */
export const userSettings = pgTable("user_settings", {
  userId: userId().primaryKey(),
  mode: text("mode", { enum: ["paper", "live"] }).notNull().default("paper"),
  maxNotional: doublePrecision("max_notional").notNull().default(500), // per-order cap, USD
  dailyLossLimit: doublePrecision("daily_loss_limit").notNull().default(100), // new buys blocked once today's realized P/L reaches minus this
  killSwitch: boolean("kill_switch").notNull().default(false),
  paperBalance: doublePrecision("paper_balance").notNull().default(10_000),
  alertTelegram: boolean("alert_telegram").notNull().default(true),
  tgChatId: text("tg_chat_id"),
  tgLinkCode: text("tg_link_code"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Local key/value store (Telegram bot token, encrypted). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  encrypted: boolean("encrypted").notNull().default(false),
});

/** Your own Polymarket signer key, AES-256-GCM encrypted with the local data key. Never sent to the browser. */
export const pmSessions = pgTable("pm_sessions", {
  userId: userId().primaryKey(),
  signer: text("signer").notNull(), // public address of the key
  encrypted: text("encrypted").notNull(),
  wallet: text("wallet").notNull(), // funder wallet that holds the funds (defaults to the signer address)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Paper positions in prediction markets (one row per outcome token). Cash is userSettings.paperBalance. */
export const pmPositions = pgTable(
  "pm_positions",
  {
    userId: userId(),
    tokenId: text("token_id").notNull(),
    title: text("title").notNull(),
    outcome: text("outcome").notNull(),
    slug: text("slug"),
    shares: doublePrecision("shares").notNull(),
    avgPrice: doublePrecision("avg_price").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tokenId] })],
);

/** Every copied fill, paper or live. copiedTx dedupes copy trades. */
export const pmTrades = pgTable(
  "pm_trades",
  {
    id: serial("id").primaryKey(),
    userId: userId(),
    mode: text("mode", { enum: ["paper", "live"] }).notNull(),
    tokenId: text("token_id").notNull(),
    title: text("title").notNull(),
    outcome: text("outcome").notNull(),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    price: doublePrecision("price").notNull(),
    shares: doublePrecision("shares").notNull(),
    pnl: doublePrecision("pnl").notNull().default(0),
    source: text("source", { enum: ["manual", "copy"] }).notNull(),
    copiedFrom: text("copied_from"),
    copiedTx: text("copied_tx"),
    copyDetectMs: integer("copy_detect_ms"), // leader fill to us seeing it
    copyExecMs: integer("copy_exec_ms"), // us seeing it to the copy filled
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("pm_trades_user_idx").on(t.userId, t.createdAt), uniqueIndex("pm_trades_copy_uq").on(t.userId, t.copiedTx)],
);

/** Traders you copy: pct of the leader trade size, capped per trade. Only trades after lastSeenTs are mirrored. */
export const copyFollows = pgTable(
  "copy_follows",
  {
    id: serial("id").primaryKey(),
    userId: userId(),
    wallet: text("wallet").notNull(),
    label: text("label"),
    pct: doublePrecision("pct").notNull().default(10),
    maxUsd: doublePrecision("max_usd").notNull().default(50),
    active: boolean("active").notNull().default(true),
    lastSeenTs: integer("last_seen_ts").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("copy_follows_uq").on(t.userId, t.wallet)],
);

/** What the copy bots did (and why they skipped), shown in the activity feed. */
export const copyEvents = pgTable(
  "copy_events",
  {
    id: serial("id").primaryKey(),
    userId: userId(),
    runId: text("run_id").notNull(),
    name: text("name").notNull(), // buyOutcome | sellOutcome
    input: jsonb("input"),
    output: jsonb("output"),
    ok: boolean("ok").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("copy_events_user_idx").on(t.userId, t.createdAt)],
);
