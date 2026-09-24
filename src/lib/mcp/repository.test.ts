import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());

vi.mock("../database", () => ({ database: { query } }));

import {
  consumeMcpToken,
  findMcpTokenStatus,
  revokeStoredMcpToken,
  saveMcpToken,
} from "./repository";

describe("MCP token repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rotates only the row owned by the supplied user", async () => {
    const createdAt = new Date("2026-07-18T12:00:00Z");
    query.mockResolvedValue({
      rows: [
        {
          token_prefix: "loom_mcp_abc123",
          created_at: createdAt,
          last_used_at: null,
          revoked_at: null,
        },
      ],
    });

    await saveMcpToken("user-a", "a".repeat(64), "loom_mcp_abc123");

    expect(query.mock.calls[0][0]).toMatch(/on conflict \(user_id\) do update/);
    expect(query.mock.calls[0][1]).toEqual([
      "user-a",
      "a".repeat(64),
      "loom_mcp_abc123",
    ]);
  });

  it("scopes status and revocation by owner user ID", async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rowCount: 1 });

    await findMcpTokenStatus("user-a");
    await revokeStoredMcpToken("user-a");

    expect(query.mock.calls[0][0]).toMatch(/where user_id = \$1/);
    expect(query.mock.calls[0][1]).toEqual(["user-a"]);
    expect(query.mock.calls[1][0]).toMatch(/where user_id = \$1/);
    expect(query.mock.calls[1][1]).toEqual(["user-a"]);
  });

  it("atomically records use and returns only the matching active token owner", async () => {
    query.mockResolvedValue({ rows: [{ user_id: "owner-user" }] });

    await expect(consumeMcpToken("b".repeat(64))).resolves.toBe("owner-user");
    expect(query.mock.calls[0][0]).toMatch(/set last_used_at = now\(\)/);
    expect(query.mock.calls[0][0]).toMatch(/where token_hash = \$1/);
    expect(query.mock.calls[0][0]).toMatch(/and revoked_at is null/);
    expect(query.mock.calls[0][1]).toEqual(["b".repeat(64)]);
  });
});
