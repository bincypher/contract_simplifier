# Configuration Reference

> Complete environment variable and runtime configuration documentation for Clarity.

---

## Table of Contents

- [Environment Variables](#environment-variables)
- [Next.js Configuration](#nextjs-configuration)
- [TypeScript Configuration](#typescript-configuration)
- [Security Headers](#security-headers)
- [Rate Limit Configuration](#rate-limit-configuration)
- [Document Processing Limits](#document-processing-limits)
- [Token Configuration](#token-configuration)
- [AI Model Configuration](#ai-model-configuration)
- [Client-Side Configuration](#client-side-configuration)

---

## Environment Variables

All runtime configuration is managed through environment variables defined in a `.env` file (or platform-specific settings for production deployments).

### Variable Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | **Yes** | — | OpenAI API key (begins with `sk-`). Used for all AI operations. |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model identifier. Must support chat completions and structured output (`response_format: json_schema`). |
| `DOCUMENT_TOKEN_SECRET` | Recommended | Derived from `OPENAI_API_KEY` | Secret for HMAC-SHA256 signing of document session tokens. Must be ≥ 32 characters when explicitly set. |
| `NODE_ENV` | No | `development` | Node.js environment. Set to `production` for production deployments. Controls CSP strictness and debug logging. |
| `PORT` | No | `3000` | Server port (standard Next.js behavior). |

### `.env.example` Template

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini

# Recommended: generate a random value with at least 32 characters.
# If omitted, the server derives a domain-separated signing key from OPENAI_API_KEY.
DOCUMENT_TOKEN_SECRET=replace_with_a_long_random_secret
```

### Security Notes

> **⚠️ Warning:** The `.env` file must never be committed to version control. The `.gitignore` already excludes `.env`, `.env.local`, and `.env.*`.

> **⚠️ Warning:** When `DOCUMENT_TOKEN_SECRET` is not set, the signing key is derived from `OPENAI_API_KEY` using domain-separated SHA-256 (`clarity-document-token-v1\0` + key). Changing the API key will invalidate all active document session tokens.

---

## Next.js Configuration

All Next.js configuration is in `next.config.mjs`:

```javascript
const nextConfig = {
  poweredByHeader: false,              // Suppress X-Powered-By header
  productionBrowserSourceMaps: false,  // No source maps in production
  async headers() { /* ... */ }        // Security headers (see below)
};
```

### Key Settings

| Setting | Value | Purpose |
|---|---|---|
| `poweredByHeader` | `false` | Prevents the `X-Powered-By: Next.js` header |
| `productionBrowserSourceMaps` | `false` | Prevents source map exposure in production |
| `runtime` (API routes) | `"nodejs"` | Forces Node.js runtime (required for `pdf-parse`, `crypto`) |
| `dynamic` (API routes) | `"force-dynamic"` | Disables route response caching |

---

## TypeScript Configuration

Defined in `tsconfig.json`:

| Option | Value | Purpose |
|---|---|---|
| `target` | `es2022` | Modern JavaScript output target |
| `module` | `esnext` | ESModule output |
| `moduleResolution` | `bundler` | Next.js bundler resolution strategy |
| `strict` | `true` | Full TypeScript strict mode |
| `jsx` | `preserve` | JSX handled by Next.js |
| `incremental` | `true` | Faster rebuilds |
| `baseUrl` | `.` | Root path for imports |
| `paths.@/*` | `./*` | Path alias: `@/lib/schema` → `./lib/schema` |

---

## Security Headers

Configured in `next.config.mjs` and applied to all routes (`/(.*)`):

### Content Security Policy

| Directive | Development | Production |
|---|---|---|
| `default-src` | `'self'` | `'self'` |
| `base-uri` | `'self'` | `'self'` |
| `form-action` | `'self'` | `'self'` |
| `frame-ancestors` | `'none'` | `'none'` |
| `object-src` | `'none'` | `'none'` |
| `img-src` | `'self' data: blob:` | `'self' data: blob:` |
| `font-src` | `'self' data: https://fonts.gstatic.com` | `'self' data: https://fonts.gstatic.com` |
| `style-src` | `'self' 'unsafe-inline' https://fonts.googleapis.com` | `'self' 'unsafe-inline' https://fonts.googleapis.com` |
| `script-src` | `'self' 'unsafe-inline' 'unsafe-eval'` | `'self' 'unsafe-inline'` |
| `connect-src` | `'self' ws: http: https:` | `'self'` |
| `upgrade-insecure-requests` | Not included | **Included** |

### Other Headers

| Header | Value |
|---|---|
| `Referrer-Policy` | `no-referrer` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |

### API-Specific Headers

Applied to `/api/:path*`:

| Header | Value |
|---|---|
| `Cache-Control` | `no-store, max-age=0` |

---

## Rate Limit Configuration

Hardcoded in the API route handlers:

| Endpoint | Scope | Max Requests | Window | Source File |
|---|---|---|---|---|
| `/api/analyze` | Per IP | 10 | 10 minutes | `app/api/analyze/route.ts` |
| `/api/chat` | Per IP | 30 | 10 minutes | `app/api/chat/route.ts` |

### Implementation Details

- **Storage:** In-process `Map<string, RateLimitEntry>` (global singleton via `globalThis`)
- **Key derivation:** `SHA-256(scope + ":" + client_ip)`
- **IP extraction:** `X-Vercel-Forwarded-For` → `X-Forwarded-For` → `"local"`
- **Cleanup:** Eviction triggered when map exceeds 5,000 entries
- **Response:** HTTP 429 with `Retry-After` header (seconds until window reset)

> **📝 Note:** Rate limits are stored in-process memory. They reset on server restart and are not shared across multiple server instances.

---

## Document Processing Limits

Hardcoded constants in `lib/document-ingestion.ts` and API routes:

| Limit | Value | Where Applied |
|---|---|---|
| Max file size | 15 MB (15,728,640 bytes) | Client + Server |
| Max request body | 16 MB | Server (content-length check) |
| Max PDF pages | 100 | Server (PDF parsing) |
| Max image pixels | 25,000,000 (25 MP) | Server (dimension check) |
| Max image dimension | 10,000 px (per side) | Server (dimension check) |
| Min readable text | 40 characters | PDF text vs. image classification |
| Max document chars (analysis) | 120,000 | Text truncation before AI |
| Max eligibility chars | 40,000 | Text truncation for classification |
| Max question length | 500 characters | Client + Server |
| Min question length | 2 characters | Client + Server |
| Max history messages | 6 | Server (Zod validation) |
| Max history entry length | 800 characters/message | Server (Zod validation) |
| Max history payload | 8,000 characters | Server (raw string check) |

---

## Token Configuration

Hardcoded constants in `lib/document-token.ts`:

| Parameter | Value |
|---|---|
| Token version | `1` |
| TTL | 1800 seconds (30 minutes) |
| Clock skew tolerance | 60 seconds |
| Signing algorithm | HMAC-SHA256 |
| Key derivation | `SHA-256("clarity-document-token-v1\0" + secret)` |
| Token format | `<base64url-payload>.<base64url-signature>` |
| Fingerprint format | `[a-f0-9]{64}` (SHA-256 hex) |
| Max token length | 2048 characters |
| Min token length | 20 characters |

---

## AI Model Configuration

| Parameter | Endpoint | Value |
|---|---|---|
| Model | Both | `process.env.OPENAI_MODEL \|\| "gpt-4o-mini"` |
| Timeout | Both | 75,000 ms |
| Max retries | Both | 1 |
| Temperature (classification) | analyze, chat | 0 |
| Temperature (generation) | analyze, chat | 0.1 |
| Max tokens (eligibility) | analyze | 150 |
| Max tokens (analysis) | analyze | 2,500 |
| Max tokens (relevance) | chat | 180 |
| Max tokens (answer) | chat | 900 |
| Response format | All | Strict JSON Schema |

### Compatible Models

The application requires a model that supports:
- Chat completions API
- `response_format: { type: "json_schema" }` (structured output)
- Vision input (for image documents and scanned PDFs)

Verified compatible models:
- `gpt-4o-mini` (default)
- `gpt-4o`
- `gpt-4-turbo`

---

## Client-Side Configuration

Hardcoded in `app/page.tsx` and `components/DocumentChat.tsx`:

| Parameter | Value | Component |
|---|---|---|
| Accepted file types | PDF, JPEG, PNG, WebP | `page.tsx` |
| Max file size | 15 MB | `page.tsx` |
| Upload timeout | 90 seconds | `page.tsx` |
| Chat timeout | 90 seconds | `DocumentChat.tsx` |
| Max question length | 500 characters | `DocumentChat.tsx` |
| Min question length | 2 characters | `DocumentChat.tsx` |
| Max displayed suggestions | 3 | `DocumentChat.tsx` |
| Max chat history (sent) | 6 messages | `DocumentChat.tsx` |
| History content truncation | 800 chars/message | `DocumentChat.tsx` |

---

**Next:** [SECURITY.md](SECURITY.md) — Security architecture and threat mitigation analysis.
