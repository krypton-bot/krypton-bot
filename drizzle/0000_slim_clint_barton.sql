CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"encrypted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copy_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text DEFAULT 'local' NOT NULL,
	"run_id" text NOT NULL,
	"name" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"ok" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copy_follows" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text DEFAULT 'local' NOT NULL,
	"wallet" text NOT NULL,
	"label" text,
	"pct" double precision DEFAULT 10 NOT NULL,
	"max_usd" double precision DEFAULT 50 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_seen_ts" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm_positions" (
	"user_id" text DEFAULT 'local' NOT NULL,
	"token_id" text NOT NULL,
	"title" text NOT NULL,
	"outcome" text NOT NULL,
	"slug" text,
	"shares" double precision NOT NULL,
	"avg_price" double precision NOT NULL,
	CONSTRAINT "pm_positions_user_id_token_id_pk" PRIMARY KEY("user_id","token_id")
);
--> statement-breakpoint
CREATE TABLE "pm_sessions" (
	"user_id" text PRIMARY KEY DEFAULT 'local' NOT NULL,
	"signer" text NOT NULL,
	"encrypted" text NOT NULL,
	"wallet" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm_trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text DEFAULT 'local' NOT NULL,
	"mode" text NOT NULL,
	"token_id" text NOT NULL,
	"title" text NOT NULL,
	"outcome" text NOT NULL,
	"side" text NOT NULL,
	"price" double precision NOT NULL,
	"shares" double precision NOT NULL,
	"pnl" double precision DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"copied_from" text,
	"copied_tx" text,
	"copy_detect_ms" integer,
	"copy_exec_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY DEFAULT 'local' NOT NULL,
	"mode" text DEFAULT 'paper' NOT NULL,
	"max_notional" double precision DEFAULT 500 NOT NULL,
	"daily_loss_limit" double precision DEFAULT 100 NOT NULL,
	"kill_switch" boolean DEFAULT false NOT NULL,
	"paper_balance" double precision DEFAULT 10000 NOT NULL,
	"alert_telegram" boolean DEFAULT true NOT NULL,
	"tg_chat_id" text,
	"tg_link_code" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "copy_events_user_idx" ON "copy_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "copy_follows_uq" ON "copy_follows" USING btree ("user_id","wallet");--> statement-breakpoint
CREATE INDEX "pm_trades_user_idx" ON "pm_trades" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pm_trades_copy_uq" ON "pm_trades" USING btree ("user_id","copied_tx");