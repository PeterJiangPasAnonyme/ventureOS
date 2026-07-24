import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Lazily-initialised Drizzle client.
 *
 * We avoid creating the postgres connection at module-import time so that
 * `next build` (which imports route/page modules for static analysis) does not
 * require a live DATABASE_URL. The connection is only opened on first query.
 */

type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __sql?: ReturnType<typeof postgres>;
  __db?: DB;
};

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function createDb(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to your .env file (see .env.example)."
    );
  }
  const sql =
    globalForDb.__sql ??
    postgres(url, {
      max: 5,
      prepare: false,
      idle_timeout: 20,
    });
  if (process.env.NODE_ENV !== "production") globalForDb.__sql = sql;
  return drizzle(sql, { schema });
}

/**
 * Access the database. Throws a helpful error if DATABASE_URL is missing.
 */
export function getDb(): DB {
  if (globalForDb.__db) return globalForDb.__db;
  const db = createDb();
  if (process.env.NODE_ENV !== "production") globalForDb.__db = db;
  return db;
}

// Convenience proxy so callers can `import { db } from "@/lib/db"` and use it
// like a normal drizzle instance; the underlying connection is still lazy.
export const db = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (real as any)[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
