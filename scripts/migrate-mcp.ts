import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function migrate() {
  const { database } = await import("../src/lib/database");
  const migrationLock = await database.connect();
  try {
    await migrationLock.query("select pg_advisory_lock(hashtext($1))", [
      "loom:release-migrations",
    ]);
    await database.query(`
      create table if not exists mcp_access_token (
        user_id text primary key references "user" (id) on delete cascade,
        token_hash char(64) not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
        token_prefix varchar(17) not null,
        created_at timestamptz not null default now(),
        last_used_at timestamptz,
        revoked_at timestamptz
      );
    `);
    console.log("MCP access-token migration is up to date.");
  } finally {
    await migrationLock
      .query("select pg_advisory_unlock(hashtext($1))", ["loom:release-migrations"])
      .catch(() => undefined);
    migrationLock.release();
    await database.end();
  }
}

migrate().catch((error) => {
  console.error("MCP access-token migration failed:", error);
  process.exitCode = 1;
});
