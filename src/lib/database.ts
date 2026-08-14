import { Pool } from "pg";

const globalForDatabase = globalThis as unknown as { loomPgPool?: Pool };

/** Shared PostgreSQL adapter for identity and billing repositories. */
export const database =
  globalForDatabase.loomPgPool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://loom:loom@localhost:5432/loom",
    max: Number(process.env.AUTH_DB_POOL_SIZE ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.loomPgPool = database;
}

export async function pingDatabase() {
  await database.query("select 1");
}
