const JSON_CONTENT_TYPE = /^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i;

export class RequestValidationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 413 | 415 | 422 = 400,
  ) {
    super(message);
    this.name = "RequestValidationError";
  }
}

/** Reads a request body without allowing chunked uploads to bypass the size cap. */
export async function readBodyBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new RequestValidationError("Request body is too large.", 413);
    }
  }

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("Request body is too large.");
        throw new RequestValidationError("Request body is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  if (!JSON_CONTENT_TYPE.test(request.headers.get("content-type") ?? "")) {
    throw new RequestValidationError("Content-Type must be application/json.", 415);
  }

  const bytes = await readBodyBytes(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new RequestValidationError("Request body must be valid UTF-8 JSON.");
  }
}

/** Session-cookie mutations must originate from the configured public app origin. */
export function hasTrustedOrigin(request: Request): boolean {
  const configuredUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL;
  const expectedOrigin = new URL(configuredUrl ?? request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) return origin === expectedOrigin;

  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === expectedOrigin;
  } catch {
    return false;
  }
}

export function requestErrorResponse(error: unknown) {
  if (error instanceof RequestValidationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
}
