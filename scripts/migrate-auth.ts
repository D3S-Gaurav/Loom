import { getMigrations } from "better-auth/db/migration";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { auth } = await import("../src/lib/auth");
  const { database } = await import("../src/lib/database");
  const migrationLock = await database.connect();

  try {
    // Vercel can start two production builds concurrently. A shared advisory
    // lock serializes every Loom release migration without holding a table.
    await migrationLock.query("select pg_advisory_lock(hashtext($1))", [
      "loom:release-migrations",
    ]);
    const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);

    if (toBeCreated.length === 0 && toBeAdded.length === 0) {
      console.log("Better Auth schema is already up to date.");
    } else {
      console.log(`Creating ${toBeCreated.length} table(s) and adding ${toBeAdded.length} column(s).`);
      await runMigrations();
      console.log("Better Auth migration completed.");
    }
  } finally {
    await migrationLock
      .query("select pg_advisory_unlock(hashtext($1))", ["loom:release-migrations"])
      .catch(() => undefined);
    migrationLock.release();
    await database.end();
  }
}

main().catch((error) => {
  console.error("Better Auth migration failed", error);
  process.exitCode = 1;
});
