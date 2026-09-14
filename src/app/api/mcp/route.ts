import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateMcpToken } from "@/lib/mcp/service";
import { createLoomMcpServer } from "@/lib/mcp/server";
import { readBodyBytes, requestErrorResponse } from "@/lib/http/request";

export const runtime = "nodejs";

function readBearerToken(request: Request) {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

function unauthorized() {
  return Response.json(
    { error: "A valid Loom MCP bearer token is required." },
    {
      status: 401,
      headers: {
        "cache-control": "no-store",
        "www-authenticate": 'Bearer realm="Loom MCP"',
      },
    },
  );
}

async function handleMcp(request: Request) {
  const token = readBearerToken(request);
  if (!token) return unauthorized();

  const account = await authenticateMcpToken(token);
  if (!account) return unauthorized();

  let boundedRequest = request;
  if (request.method === "POST") {
    try {
      const body = await readBodyBytes(request, 256 * 1024);
      boundedRequest = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
        signal: request.signal,
      });
    } catch (error) {
      const response = requestErrorResponse(error);
      if (response) return response;
      return Response.json({ error: "Invalid MCP request." }, { status: 400 });
    }
  }

  const publicUrl = new URL(process.env.APP_URL ?? request.url);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    allowedHosts: [publicUrl.host],
    allowedOrigins: [publicUrl.origin],
    enableDnsRebindingProtection: true,
  });
  const server = createLoomMcpServer(account.userId);
  await server.connect(transport);
  try {
    return await transport.handleRequest(boundedRequest);
  } catch (error) {
    console.error("MCP request failed", error);
    return Response.json({ error: "MCP request failed." }, { status: 400 });
  }
}

export const GET = handleMcp;
export const POST = handleMcp;
export const DELETE = handleMcp;
