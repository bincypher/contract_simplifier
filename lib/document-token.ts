import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { SUPPORTED_DOCUMENT_TYPES } from "@/lib/document-types";

const TOKEN_VERSION = 1;
const TOKEN_TTL_SECONDS = 30 * 60;
const CLOCK_SKEW_SECONDS = 60;

const tokenPayloadSchema = z.object({
  version: z.literal(TOKEN_VERSION),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  documentType: z.enum(SUPPORTED_DOCUMENT_TYPES),
  eligibilityConfidence: z.number().min(0).max(100),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive()
}).strict();

export type DocumentTokenPayload = z.infer<typeof tokenPayloadSchema>;

export class DocumentTokenError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "DocumentTokenError";
  }
}

function signingKey() {
  const dedicatedSecret = process.env.DOCUMENT_TOKEN_SECRET;
  if (dedicatedSecret && dedicatedSecret.length < 32) {
    throw new DocumentTokenError("DOCUMENT_TOKEN_SECRET must contain at least 32 characters.", 503);
  }
  const secret = dedicatedSecret || process.env.OPENAI_API_KEY;
  if (!secret) {
    throw new DocumentTokenError("The document session service is not configured.", 503);
  }
  return createHash("sha256")
    .update("clarity-document-token-v1\0")
    .update(secret)
    .digest();
}

export function assertDocumentTokenConfigured() {
  signingKey();
}

function signature(encodedPayload: string) {
  return createHmac("sha256", signingKey()).update(encodedPayload).digest("base64url");
}

function signaturesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createDocumentToken(input: {
  fingerprint: string;
  documentType: DocumentTokenPayload["documentType"];
  eligibilityConfidence: number;
}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = tokenPayloadSchema.parse({
    version: TOKEN_VERSION,
    ...input,
    issuedAt,
    expiresAt: issuedAt + TOKEN_TTL_SECONDS
  });
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    token: `${encodedPayload}.${signature(encodedPayload)}`,
    expiresAt: new Date(payload.expiresAt * 1000).toISOString()
  };
}

export function verifyDocumentToken(token: string) {
  if (token.length > 2048) {
    throw new DocumentTokenError("The document session token is invalid.", 401);
  }
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1] || !signaturesMatch(signature(parts[0]), parts[1])) {
    throw new DocumentTokenError("The document session token is invalid.", 401);
  }

  try {
    const payload = tokenPayloadSchema.parse(JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")));
    const now = Math.floor(Date.now() / 1000);
    if (payload.issuedAt > now + CLOCK_SKEW_SECONDS || payload.expiresAt <= now) {
      throw new DocumentTokenError("The document session has expired. Analyze the document again.", 401);
    }
    if (payload.expiresAt - payload.issuedAt !== TOKEN_TTL_SECONDS) {
      throw new DocumentTokenError("The document session token is invalid.", 401);
    }
    return payload;
  } catch (error) {
    if (error instanceof DocumentTokenError) throw error;
    throw new DocumentTokenError("The document session token is invalid.", 401);
  }
}

export function fingerprintsMatch(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
