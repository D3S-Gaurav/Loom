import { createHash, randomBytes } from "node:crypto";
import {
  consumeMcpToken,
  findMcpTokenStatus,
  revokeStoredMcpToken,
  saveMcpToken,
} from "./repository";

const TOKEN_LABEL = "loom_mcp_";
const TOKEN_PATTERN = /^loom_mcp_[A-Za-z0-9_-]{43}$/;
const DISPLAY_PREFIX_LENGTH = TOKEN_LABEL.length + 6;

export interface IssuedMcpToken {
  /** Only returned at issuance. Loom does not persist the raw token. */
  token: string;
  prefix: string;
  createdAt: Date;
}

export interface McpTokenStatus {
  configured: boolean;
  prefix: string | null;
  createdAt: Date | null;
  lastUsedAt: Date | null;
}

export function hashMcpToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function generateMcpToken() {
  return `${TOKEN_LABEL}${randomBytes(32).toString("base64url")}`;
}

export async function issueMcpToken(userId: string): Promise<IssuedMcpToken> {
  const token = generateMcpToken();
  const prefix = token.slice(0, DISPLAY_PREFIX_LENGTH);
  const status = await saveMcpToken(userId, hashMcpToken(token), prefix);
  return { token, prefix: status.prefix, createdAt: status.createdAt };
}

export async function getMcpTokenStatus(userId: string): Promise<McpTokenStatus> {
  const status = await findMcpTokenStatus(userId);
  if (!status || status.revokedAt) {
    return { configured: false, prefix: null, createdAt: null, lastUsedAt: null };
  }
  return {
    configured: true,
    prefix: status.prefix,
    createdAt: status.createdAt,
    lastUsedAt: status.lastUsedAt,
  };
}

export function revokeMcpToken(userId: string) {
  return revokeStoredMcpToken(userId);
}

export async function authenticateMcpToken(token: string) {
  if (!TOKEN_PATTERN.test(token)) return null;
  const userId = await consumeMcpToken(hashMcpToken(token));
  return userId ? { userId } : null;
}
