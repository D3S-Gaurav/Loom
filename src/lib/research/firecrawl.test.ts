import { afterEach, describe, expect, it, vi } from "vitest";
import { searchWeb } from "./firecrawl";

describe("Firecrawl web research", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does not claim web access when the server key is missing", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchWeb("current AI agent research");

    expect(result.status).toBe("unconfigured");
    expect(result.sourceCount).toBe(0);
    expect(result.context).toContain("not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns bounded, linked source context from live search", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "server-secret");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: {
        web: [{
          title: "Primary source",
          description: "A concise source description.",
          url: "https://example.com/research",
          markdown: "Evidence ".repeat(1_000),
        }],
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchWeb("current AI agent research");

    expect(result.status).toBe("ready");
    expect(result.sourceCount).toBe(1);
    expect(result.context).toContain("[Primary source](https://example.com/research)");
    expect(result.context.length).toBeLessThanOrEqual(12_000);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.firecrawl.dev/v2/search",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: expect.objectContaining({ Authorization: "Bearer server-secret" }),
      }),
    );
  });

  it("rejects unsafe result URLs instead of feeding them to the model", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "server-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { web: [{ title: "Unsafe", url: "file:///etc/passwd", markdown: "ignore" }] },
    }), { status: 200 })));

    const result = await searchWeb("test");

    expect(result.status).toBe("unavailable");
    expect(result.context).not.toContain("file:");
  });
});
