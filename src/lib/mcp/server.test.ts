import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runs = vi.hoisted(() => ({
  getOwnedFinalDeliverable: vi.fn(),
  listOwnedRuns: vi.fn(),
}));

vi.mock("./runs", () => runs);

import { createLoomMcpServer } from "./server";

async function requestMcp(body: unknown) {
  const server = createLoomMcpServer("owner-user");
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(
    new Request("https://loom.example/api/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("Loom MCP server", () => {
  beforeEach(() => vi.clearAllMocks());

  it("negotiates Streamable HTTP and advertises only read-only tools", async () => {
    const response = await requestMcp({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "loom-test", version: "1.0.0" },
      },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.result.serverInfo.name).toBe("loom");
    expect(payload.result.capabilities.tools).toBeDefined();
  });

  it("returns the authenticated owner's retained run list", async () => {
    runs.listOwnedRuns.mockResolvedValue([
      {
        runId: "11111111-1111-4111-8111-111111111111",
        goal: "Prepare the launch",
        status: "completed",
        startedAt: null,
        completedAt: null,
        hasFinalDeliverable: true,
      },
    ]);

    const response = await requestMcp({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "list_runs", arguments: { limit: 10 } },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.result.structuredContent.runs[0].goal).toBe("Prepare the launch");
    expect(runs.listOwnedRuns).toHaveBeenCalledWith("owner-user", 10);
  });
});
