import "server-only";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

/** Where everything lives on disk: the database and the local encryption key. Override with DATA_DIR. */
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR) : path.join(/*turbopackIgnore: true*/ process.cwd(), "data");

type Db = PgliteDatabase<typeof schema>;
type G = { kbDb?: Db; kbReady?: Promise<void> };
const g = globalThis as unknown as G;

/**
 * An embedded database has exactly one owner process: two writers corrupt it. Refuse to start a second one with a
 * clear message, and take over a lock left behind by a crashed process.
 */
function lock() {
  const file = path.join(/*turbopackIgnore: true*/ DATA_DIR, ".lock");
  if (existsSync(file)) {
    const pid = Number(readFileSync(file, "utf8"));
    let alive = false;
    try {
      alive = pid > 0 && pid !== process.pid && (process.kill(pid, 0), true);
    } catch {
      alive = false;
    }
    if (alive) throw new Error(`Another Krypton Bot Light (process ${pid}) is already using ${DATA_DIR}. Stop it first, or set DATA_DIR to a different folder.`);
  }
  writeFileSync(file, String(process.pid));
  process.on("exit", () => {
    try {
      if (Number(readFileSync(file, "utf8")) === process.pid) unlinkSync(file);
    } catch {}
  });
}

// Opened on first use, never at import: `next build` imports every route in parallel workers, and an embedded
// database must have exactly one owner process.
function open(): Db {
  if (!g.kbDb) {
    mkdirSync(/*turbopackIgnore: true*/ DATA_DIR, { recursive: true });
    lock();
    // Embedded Postgres (WASM) in ./data/pg: no server, no Docker, no connection string.
    g.kbDb = drizzle(new PGlite(path.join(/*turbopackIgnore: true*/ DATA_DIR, "pg")), { schema });
  }
  return g.kbDb;
}

export const db: Db = new Proxy({} as Db, {
  get: (_t, k) => {
    const real = open();
    const v = Reflect.get(real, k);
    return typeof v === "function" ? v.bind(real) : v;
  },
});
export { schema };

/** Resolves once migrations have run. Await it before the first query (the API wrapper and the engine do). */
export function ready(): Promise<void> {
  g.kbReady ??= migrate(open(), { migrationsFolder: path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle") }).catch((e) => {
    g.kbReady = undefined; // let the next call retry
    throw e;
  });
  return g.kbReady;
}
