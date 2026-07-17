# Deployment Guide

> Production deployment instructions for Clarity AI Document Analyzer.

---

## Table of Contents

- [Overview](#overview)
- [Deployment Checklist](#deployment-checklist)
- [Vercel Deployment (Recommended)](#vercel-deployment-recommended)
- [Self-Hosted Deployment](#self-hosted-deployment)
- [Docker Deployment](#docker-deployment)
- [Production Configuration](#production-configuration)
- [Health Monitoring](#health-monitoring)
- [Scaling Considerations](#scaling-considerations)
- [Rollback Procedures](#rollback-procedures)

---

## Overview

Clarity is a Next.js 14 application designed for single-unit deployment. The entire application (frontend + API routes) deploys as one artifact.

| Aspect | Detail |
|---|---|
| **Runtime** | Node.js (not Edge) |
| **Build System** | Next.js `next build` |
| **Static Assets** | Bundled by Next.js (`.next/static/`) |
| **External Dependencies** | OpenAI API (outbound HTTPS) |
| **Persistent Storage** | None required |
| **Port** | Configurable (default: 3000) |

---

## Deployment Checklist

Before every production deployment, verify:

- [ ] `OPENAI_API_KEY` is set and valid
- [ ] `OPENAI_MODEL` is set to a model your API key can access
- [ ] `DOCUMENT_TOKEN_SECRET` is set (≥ 32 characters, unique per environment)
- [ ] Outbound HTTPS to `api.openai.com` is allowed
- [ ] `npm run build` completes without errors
- [ ] Node.js version ≥ 18 on the production host
- [ ] No `.env` file is committed to version control

---

## Vercel Deployment (Recommended)

Clarity is optimized for Vercel, the native hosting platform for Next.js.

### Steps

1. **Connect Repository**
   - Go to [vercel.com](https://vercel.com) and import your Git repository.
   - Vercel auto-detects the Next.js framework.

2. **Configure Environment Variables**
   - In the Vercel dashboard: **Settings** → **Environment Variables**
   - Add:

     | Name | Value | Environments |
     |---|---|---|
     | `OPENAI_API_KEY` | `sk-...` | Production, Preview |
     | `OPENAI_MODEL` | `gpt-4o-mini` | Production, Preview |
     | `DOCUMENT_TOKEN_SECRET` | `<random-64-char-string>` | Production, Preview |

3. **Deploy**
   - Push to your main branch, or trigger a manual deploy.
   - Vercel will run `next build` automatically.

4. **Verify**
   - Open the deployment URL.
   - Upload a test document and confirm analysis works.

### Vercel-Specific Notes

- **Serverless Functions:** API routes deploy as serverless functions. The 75-second OpenAI timeout is within Vercel's default function timeout.
- **Rate Limiting:** In-process rate limits do not persist across function invocations on Vercel. Consider Vercel's built-in rate limiting or an external solution.
- **IP Detection:** The `request-guard.ts` uses `X-Vercel-Forwarded-For` for accurate IP detection behind Vercel's proxy.
- **No Edge Runtime:** Both API routes explicitly set `runtime = "nodejs"`.

> **⚠️ Warning:** On Vercel's serverless architecture, rate limits in `request-guard.ts` may not function as expected since each function invocation may run in a different process. For production rate limiting, consider Vercel's native rate limiting features.

---

## Self-Hosted Deployment

### Using Node.js Directly

```bash
# 1. Install dependencies
npm ci --production=false

# 2. Build the production bundle
npm run build

# 3. Start the production server
npm start

# Or with a custom port
PORT=8080 npm start
```

### Using a Process Manager (PM2)

```bash
# Install PM2 globally
npm install -g pm2

# Build the application
npm run build

# Start with PM2
pm2 start npm --name "clarity" -- start

# Save the process list
pm2 save

# Enable startup on boot
pm2 startup
```

### PM2 Ecosystem File

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: "clarity",
    script: "npm",
    args: "start",
    env: {
      NODE_ENV: "production",
      PORT: 3000,
      OPENAI_API_KEY: "sk-...",
      OPENAI_MODEL: "gpt-4o-mini",
      DOCUMENT_TOKEN_SECRET: "your-secret-here"
    },
    instances: 1,
    max_memory_restart: "512M",
    log_date_format: "YYYY-MM-DD HH:mm:ss"
  }]
};
```

> **📝 Note:** Running multiple instances (`instances: "max"`) will cause rate limits to be per-instance rather than global. Each instance maintains its own in-memory rate limiter.

---

## Docker Deployment

> **📝 Note:** The current repository does not include a Dockerfile. Below is a recommended configuration based on the project's requirements.

### Dockerfile

```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy only necessary files
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
```

> **⚠️ Note:** To use standalone output, add `output: "standalone"` to `next.config.mjs`:
> ```javascript
> const nextConfig = {
>   output: "standalone",
>   // ... existing config
> };
> ```

### Docker Compose

```yaml
version: "3.9"

services:
  clarity:
    build: .
    ports:
      - "3000:3000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OPENAI_MODEL=${OPENAI_MODEL:-gpt-4o-mini}
      - DOCUMENT_TOKEN_SECRET=${DOCUMENT_TOKEN_SECRET}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Build and Run

```bash
# Build the image
docker build -t clarity .

# Run with environment variables
docker run -d \
  --name clarity \
  -p 3000:3000 \
  -e OPENAI_API_KEY=sk-... \
  -e OPENAI_MODEL=gpt-4o-mini \
  -e DOCUMENT_TOKEN_SECRET=your-secret \
  clarity
```

---

## Production Configuration

### Security Headers

The following security headers are automatically applied in production via `next.config.mjs`:

| Header | Production Value |
|---|---|
| Content-Security-Policy | Strict CSP with `upgrade-insecure-requests` |
| Referrer-Policy | `no-referrer` |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` |
| Cross-Origin-Opener-Policy | `same-origin` |
| Permissions-Policy | Denies all sensitive APIs |
| X-Powered-By | Suppressed |

### Production vs Development Differences

| Aspect | Development | Production |
|---|---|---|
| CSP `script-src` | Includes `'unsafe-eval'` | `'self' 'unsafe-inline'` only |
| CSP `connect-src` | Allows `ws: http: https:` | `'self'` only |
| Debug logging | `console.debug` active | Suppressed |
| Source maps | Generated | Disabled |
| `upgrade-insecure-requests` | Omitted | Included |

### Reverse Proxy (Nginx)

If deploying behind Nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name clarity.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # For file uploads up to 16 MB
        client_max_body_size 16m;

        # Timeout for AI processing
        proxy_read_timeout 120s;
    }
}
```

---

## Health Monitoring

The current application does not expose a dedicated health check endpoint.

### Recommended Health Check

Monitor the application by requesting the root page:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```

Expected: `200 OK`

### Log Monitoring

Server errors are logged to stdout/stderr:
- `console.error` — Analysis and chat failures (always active)
- `console.debug` — AI response debugging (development only)

«TODO: A dedicated `/api/health` endpoint is not present. Developer input required for production monitoring integrations.»

---

## Scaling Considerations

| Aspect | Current | Recommendation |
|---|---|---|
| **Instances** | Single process | Multiple instances (with external rate limiter) |
| **Rate Limiting** | In-memory per-process | Redis-based shared rate limiter |
| **Sessions** | Stateless tokens | No change needed |
| **AI Calls** | Direct to OpenAI | Consider queue or retry layer |
| **File Processing** | In-memory buffers | Monitor memory with 15 MB max uploads |
| **CDN** | None | Use Vercel/Cloudflare CDN for static assets |

> **💡 Tip:** Each analysis request makes 2 OpenAI API calls, and each chat request makes 2 OpenAI API calls. Plan your OpenAI API rate limits accordingly.

---

## Rollback Procedures

### Vercel

1. Go to **Deployments** in the Vercel dashboard.
2. Find the previous working deployment.
3. Click **•••** → **Promote to Production**.

### Self-Hosted

```bash
# If using Git-based deploys
git checkout <previous-tag>
npm ci
npm run build
pm2 restart clarity

# Or keep the previous build artifact
cp -r .next .next.backup
```

### Docker

```bash
# Tag versions before deploying
docker tag clarity:latest clarity:v1.0.0-backup

# Roll back to previous image
docker stop clarity
docker run -d --name clarity clarity:v1.0.0-backup
```

---

**Next:** [CONFIGURATION.md](CONFIGURATION.md) — Complete environment and runtime configuration reference.
