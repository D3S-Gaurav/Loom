import { database } from "../database";

interface McpTokenRow {
  token_prefix: string;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
}

export interface McpTokenStatus {
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

function toStatus(row: McpTokenRow): McpTokenStatus {
  return {
    prefix: row.token_prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export async function saveMcpToken(userId: string, tokenHash: string, tokenPrefix: string) {
  const result = await database.query<McpTokenRow>(
    `insert into mcp_access_token (user_id, token_hash, token_prefix)
     values ($1, $2, $3)
     on conflict (user_id) do update set
       token_hash = excluded.token_hash,
       token_prefix = excluded.token_prefix,
       created_at = now(),
       last_used_at = null,
       revoked_at = null
     returning token_prefix, created_at, last_used_at, revoked_at`,
    [userId, tokenHash, tokenPrefix],
  );
  return toStatus(result.rows[0]);
}

export async function findMcpTokenStatus(userId: string) {
  const result = await database.query<McpTokenRow>(
    `select token_prefix, created_at, last_used_at, revoked_at
       from mcp_access_token
      where user_id = $1`,
    [userId],
  );
  return result.rows[0] ? toStatus(result.rows[0]) : null;
}

export async function revokeStoredMcpToken(userId: string) {
  const result = await database.query(
    `update mcp_access_token
        set revoked_at = now()
      where user_id = $1
        and revoked_at is null`,
    [userId],
  );
  return result.rowCount === 1;
}

/** Atomically validates an active token and records its last use. */
export async function consumeMcpToken(tokenHash: string) {
  const result = await database.query<{ user_id: string }>(
    `update mcp_access_token
        set last_used_at = now()
      where token_hash = $1
        and revoked_at is null
      returning user_id`,
    [tokenHash],
  );
  return result.rows[0]?.user_id ?? null;
}
