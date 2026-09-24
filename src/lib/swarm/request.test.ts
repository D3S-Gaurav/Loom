import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAttachmentContext,
  parseGitHubRepositoryUrl,
  parseSwarmRequest,
} from "./request";

afterEach(() => vi.unstubAllGlobals());

describe("swarm request validation", () => {
  it("bounds goals, modes, attachment counts, and text bytes", () => {
    expect(parseSwarmRequest({ goal: "Build a launch plan" })).toMatchObject({
      mode: "auto",
      attachments: [],
    });
    expect(() => parseSwarmRequest({ goal: "Build", mode: "turbo" })).toThrow("Invalid option");
    expect(() =>
      parseSwarmRequest({
        goal: "Build a launch plan",
        attachments: Array.from({ length: 5 }, (_, index) => ({
          kind: "text",
          name: `file-${index}.txt`,
          mediaType: "text/plain",
          content: "ok",
        })),
      }),
    ).toThrow();
    expect(() =>
      parseSwarmRequest({
        goal: "Build a launch plan",
        attachments: [
          { kind: "text", name: "large.txt", mediaType: "text/plain", content: "x".repeat(33 * 1024) },
        ],
      }),
    ).toThrow("32 KiB");
  });

  it("accepts only exact GitHub owner/repository URLs", () => {
    expect(parseGitHubRepositoryUrl("https://github.com/openai/openai-node")).toEqual({
      owner: "openai",
      repository: "openai-node",
    });
    for (const url of [
      "http://github.com/openai/openai-node",
      "https://evil.example/openai/openai-node",
      "https://github.com.evil.example/openai/openai-node",
      "https://github.com/openai/openai-node/issues",
      "https://github.com/openai/openai-node?tab=readme",
      "https://user@github.com/openai/openai-node",
    ]) {
      expect(parseGitHubRepositoryUrl(url)).toBeNull();
    }
  });

  it("fetches only constructed GitHub API URLs and bounds the supplied context", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ full_name: "openai/openai-node", description: "SDK", language: "TypeScript" })),
      )
      .mockResolvedValueOnce(new Response("# README"));
    vi.stubGlobal("fetch", fetchMock);

    const context = await buildAttachmentContext(
      [{ kind: "github", name: "openai-node", url: "https://github.com/openai/openai-node" }],
      new AbortController().signal,
    );

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/repos/openai/openai-node",
      "https://api.github.com/repos/openai/openai-node/readme",
    ]);
    expect(context).toContain("BEGIN UNTRUSTED ATTACHMENT CONTEXT");
    expect(context).toContain("# README");
  });

  it("fails clearly instead of pretending image vision is available", async () => {
    await expect(
      buildAttachmentContext(
        [{ kind: "image", name: "screen.png", mediaType: "image/png", dataUrl: "data:image/png;base64,YQ==" }],
        new AbortController().signal,
      ),
    ).rejects.toThrow("Image analysis is not enabled");
  });

  it("uses only the image analyzer description as planner context", async () => {
    const analyze = vi.fn().mockResolvedValue("A dashboard with three healthy services.");
    const dataUrl = "data:image/png;base64,YQ==";

    const context = await buildAttachmentContext(
      [{ kind: "image", name: "health.png", mediaType: "image/png", dataUrl }],
      new AbortController().signal,
      analyze,
    );

    expect(analyze).toHaveBeenCalledOnce();
    expect(context).toContain("A dashboard with three healthy services.");
    expect(context).not.toContain(dataUrl);
  });
});
