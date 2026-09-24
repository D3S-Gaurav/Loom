import { afterEach, describe, expect, it } from "vitest";
import {
  hasTrustedOrigin,
  readBodyBytes,
  readJsonBody,
  RequestValidationError,
} from "./request";

const originalAppUrl = process.env.APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalAppUrl;
});

describe("bounded request parsing", () => {
  it("accepts JSON content types and valid UTF-8", async () => {
    const request = new Request("https://loom.example/api/test", {
      method: "POST",
      headers: { "content-type": "application/problem+json; charset=utf-8" },
      body: JSON.stringify({ goal: "Ship it" }),
    });

    await expect(readJsonBody(request, 1_000)).resolves.toEqual({ goal: "Ship it" });
  });

  it("rejects a declared body larger than the cap before reading it", async () => {
    const request = new Request("https://loom.example/api/test", {
      method: "POST",
      headers: { "content-length": "1001" },
      body: "small",
    });

    await expect(readBodyBytes(request, 1_000)).rejects.toMatchObject({ status: 413 });
  });

  it("caps chunked bodies even without Content-Length", async () => {
    const request = new Request("https://loom.example/api/test", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(700));
          controller.enqueue(new Uint8Array(700));
          controller.close();
        },
      }),
      // Required by Node's Request implementation for streaming request bodies.
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readBodyBytes(request, 1_000)).rejects.toBeInstanceOf(RequestValidationError);
  });

  it("rejects non-JSON media types", async () => {
    const request = new Request("https://loom.example/api/test", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });

    await expect(readJsonBody(request, 1_000)).rejects.toMatchObject({ status: 415 });
  });
});

describe("trusted mutation origins", () => {
  it("accepts the configured origin", () => {
    process.env.APP_URL = "https://loom.example";
    const request = new Request("https://loom.example/api/test", {
      headers: { origin: "https://loom.example" },
    });
    expect(hasTrustedOrigin(request)).toBe(true);
  });

  it("rejects cross-origin and origin-less requests", () => {
    process.env.APP_URL = "https://loom.example";
    expect(
      hasTrustedOrigin(
        new Request("https://loom.example/api/test", {
          headers: { origin: "https://attacker.example" },
        }),
      ),
    ).toBe(false);
    expect(hasTrustedOrigin(new Request("https://loom.example/api/test"))).toBe(false);
  });
});
