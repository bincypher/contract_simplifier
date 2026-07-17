import { createHash } from "node:crypto";

type RateLimitEntry = { count: number; resetAt: number };

declare global {
  // eslint-disable-next-line no-var
  var clarityRateLimits: Map<string, RateLimitEntry> | undefined;
}

const rateLimits = globalThis.clarityRateLimits ?? new Map<string, RateLimitEntry>();
globalThis.clarityRateLimits = rateLimits;

export class RequestGuardError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = "RequestGuardError";
  }
}

export function enforceSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const expectedHost =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      requestUrl.host;
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const expectedProtocol = forwardedProtocol ? `${forwardedProtocol}:` : requestUrl.protocol;
    if (originUrl.host === expectedHost && originUrl.protocol === expectedProtocol) return;
  } catch {
    // Malformed origins are rejected below.
  }
  throw new RequestGuardError("Cross-origin requests are not allowed.", 403);
}

export function enforceContentLength(request: Request, maxBytes: number) {
  const value = request.headers.get("content-length");
  if (!value) return;
  const contentLength = Number(value);
  if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
    throw new RequestGuardError("The request size is invalid.", 400);
  }
  if (contentLength > maxBytes) {
    throw new RequestGuardError("The request body is too large.", 413);
  }
}

function clientKey(request: Request, scope: string) {
  const forwarded = request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for");
  const address = forwarded?.split(",")[0]?.trim() || "local";
  return createHash("sha256").update(`${scope}:${address}`).digest("hex");
}

export function enforceRateLimit(request: Request, scope: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (rateLimits.size > 5_000) {
    for (const [key, entry] of rateLimits) {
      if (entry.resetAt <= now) rateLimits.delete(key);
    }
  }

  const key = clientKey(request, scope);
  const current = rateLimits.get(key);
  if (!current || current.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (current.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    throw new RequestGuardError("Too many requests. Please wait before trying again.", 429, retryAfter);
  }
  current.count += 1;
}
