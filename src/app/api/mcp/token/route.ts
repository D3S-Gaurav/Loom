import { getRequestSession } from "@/lib/auth";
import { getMcpTokenStatus, issueMcpToken, revokeMcpToken } from "@/lib/mcp/service";
import { hasTrustedOrigin } from "@/lib/http/request";

export const runtime = "nodejs";

function noStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function authenticatedUser(request: Request) {
  const session = await getRequestSession(request);
  return session?.user.id ?? null;
}

export async function GET(request: Request) {
  const userId = await authenticatedUser(request);
  if (!userId) return noStore({ error: "Authentication required." }, { status: 401 });

  const status = await getMcpTokenStatus(userId);
  return noStore({
    ...status,
    createdAt: status.createdAt?.toISOString() ?? null,
    lastUsedAt: status.lastUsedAt?.toISOString() ?? null,
  });
}

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return noStore({ error: "Origin not allowed." }, { status: 403 });
  const userId = await authenticatedUser(request);
  if (!userId) return noStore({ error: "Authentication required." }, { status: 401 });

  const issued = await issueMcpToken(userId);
  return noStore(
    { token: issued.token, prefix: issued.prefix, createdAt: issued.createdAt.toISOString() },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  if (!hasTrustedOrigin(request)) return noStore({ error: "Origin not allowed." }, { status: 403 });
  const userId = await authenticatedUser(request);
  if (!userId) return noStore({ error: "Authentication required." }, { status: 401 });

  await revokeMcpToken(userId);
  return noStore({ ok: true });
}
