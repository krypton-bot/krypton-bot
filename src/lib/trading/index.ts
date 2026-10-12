import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { LOCAL_USER } from "@/db/schema";

export type Settings = typeof schema.userSettings.$inferSelect;
export const PAPER_START = 10_000;

/** Thrown for anything the user can fix (limits, bad input, no wallet). Its message is safe to show. */
export class RiskError extends Error {}

export async function getSettings(): Promise<Settings> {
  const [row] = await db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, LOCAL_USER));
  if (row) return row;
  await db.insert(schema.userSettings).values({ userId: LOCAL_USER }).onConflictDoNothing();
  return (await db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, LOCAL_USER)))[0];
}

export type SettingsPatch = Partial<Pick<Settings, "mode" | "maxNotional" | "dailyLossLimit" | "killSwitch" | "alertTelegram">>;

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  await getSettings();
  const [row] = await db
    .update(schema.userSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.userSettings.userId, LOCAL_USER))
    .returning();
  return row;
}

/** Wipe the paper account: positions, paper trades, the activity feed and cash back to the starting balance. Copy bots and live trades are untouched. */
export async function resetPaper() {
  await db.transaction(async (tx) => {
    await tx.delete(schema.pmPositions);
    await tx.delete(schema.pmTrades).where(eq(schema.pmTrades.mode, "paper"));
    await tx.delete(schema.copyEvents);
    await tx.update(schema.userSettings).set({ paperBalance: PAPER_START }).where(eq(schema.userSettings.userId, LOCAL_USER));
  });
}
