import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  consumeMcpToken: vi.fn(),
  findMcpTokenStatus: vi.fn(),
  revokeStoredMcpToken: vi.fn(),
  saveMcpToken: vi.fn(),
}));

vi.mock("./repository", () => repository);

import {
  authenticateMcpToken,
  getMcpTokenStatus,
  hashMcpToken,
  issueMcpToken,
  revokeMcpToken,
} from "./service";

describe("MCP access tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a new account token once and persists only its SHA-256 hash", async () => {
    const createdAt = new Date("2026-07-18T12:00:00Z");
    repository.saveMcpToken.mockImplementation(
      async (_userId: string, _hash: string, prefix: string) => ({ prefix, createdAt }),
    );

    const issued = await issueMcpToken("user-a");

    expect(issued.token).toMatch(/^loom_mcp_[A-Za-z0-9_-]{43}$/);
    expect(issued.prefix).toBe(issued.token.slice(0, 17));
    expect(issued.createdAt).toEqual(createdAt);
    expect(repository.saveMcpToken).toHaveBeenCalledWith(
      "user-a",
      createHash("sha256").update(issued.token).digest("hex"),
      issued.prefix,
    );
    expect(repository.saveMcpToken.mock.calls[0]).not.toContain(issued.token);
  });

  it("maps a valid bearer token to its owning user", async () => {
    const token = `loom_mcp_${"a".repeat(43)}`;
    repository.consumeMcpToken.mockResolvedValue("owner-user");

    await expect(authenticateMcpToken(token)).resolves.toEqual({
      userId: "owner-user",
    });
    expect(repository.consumeMcpToken).toHaveBeenCalledWith(hashMcpToken(token));
  });

  it("rejects malformed authorization without querying stored hashes", async () => {
    await expect(authenticateMcpToken("anything")).resolves.toBeNull();
    await expect(authenticateMcpToken("loom_mcp_short")).resolves.toBeNull();
    expect(repository.consumeMcpToken).not.toHaveBeenCalled();
  });

  it("fails closed for unknown or revoked token hashes", async () => {
    const token = `loom_mcp_${"b".repeat(43)}`;
    repository.consumeMcpToken.mockResolvedValue(null);

    await expect(authenticateMcpToken(token)).resolves.toBeNull();
  });

  it("scopes status and revocation operations to the authenticated user ID", async () => {
    repository.findMcpTokenStatus.mockResolvedValue(null);
    repository.revokeStoredMcpToken.mockResolvedValue(true);

    await getMcpTokenStatus("user-a");
    await revokeMcpToken("user-a");

    expect(repository.findMcpTokenStatus).toHaveBeenCalledWith("user-a");
    expect(repository.revokeStoredMcpToken).toHaveBeenCalledWith("user-a");
  });

  it("reports only active token metadata and never the stored hash", async () => {
    const createdAt = new Date("2026-07-18T12:00:00Z");
    repository.findMcpTokenStatus.mockResolvedValue({
      prefix: "loom_mcp_abc123",
      createdAt,
      lastUsedAt: null,
      revokedAt: null,
    });

    await expect(getMcpTokenStatus("user-a")).resolves.toEqual({
      configured: true,
      prefix: "loom_mcp_abc123",
      createdAt,
      lastUsedAt: null,
    });
  });
});
