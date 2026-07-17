# Installation Guide

> Complete setup instructions for the Clarity AI Document Analyzer.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [System Requirements](#system-requirements)
- [Installation Steps](#installation-steps)
- [Environment Configuration](#environment-configuration)
- [Verification](#verification)
- [Development Setup](#development-setup)
- [Production Build](#production-build)
- [Troubleshooting Installation](#troubleshooting-installation)

---

## Prerequisites

| Requirement | Minimum Version | Notes |
|---|---|---|
| **Node.js** | 18.x | LTS recommended. Verify: `node --version` |
| **npm** | 9.x | Bundled with Node.js. Verify: `npm --version` |
| **OpenAI API Key** | — | Requires access to `gpt-4o-mini` or specified model |
| **Operating System** | Windows / macOS / Linux | Any OS that supports Node.js 18+ |

### Obtaining an OpenAI API Key

1. Visit [platform.openai.com](https://platform.openai.com/).
2. Create an account or sign in.
3. Navigate to **API Keys** → **Create new secret key**.
4. Copy the key (starts with `sk-`). You will need this for the `.env` file.
5. Ensure your account has billing configured and sufficient credits.

> **💡 Tip:** The default model is `gpt-4o-mini`. If you wish to use a different model (e.g., `gpt-4o`, `gpt-4-turbo`), ensure your API key has access to that model.

---

## System Requirements

| Resource | Recommended |
|---|---|
| **RAM** | ≥ 2 GB (4 GB recommended for concurrent requests) |
| **Disk** | ≥ 500 MB (includes `node_modules`) |
| **Network** | Outbound HTTPS to `api.openai.com` |

---

## Installation Steps

### 1. Clone the Repository

```bash
git clone <repository-url>
cd contract_simplifier
```

### 2. Install Dependencies

```bash
npm install
```

This installs the following runtime dependencies:

| Package | Version | Purpose |
|---|---|---|
| `next` | 14.2.35 | React framework with App Router |
| `react` | ^18.3.1 | UI library |
| `react-dom` | ^18.3.1 | React DOM renderer |
| `openai` | ^4.77.0 | OpenAI API client SDK |
| `pdf-parse` | 1.1.1 | PDF text extraction |
| `zod` | ^3.24.1 | Runtime schema validation |

And development dependencies:

| Package | Version | Purpose |
|---|---|---|
| `@types/node` | 20.19.43 | Node.js type definitions |
| `@types/react` | 18.3.31 | React type definitions |
| `@types/react-dom` | ^18.3.1 | React DOM type definitions |
| `typescript` | 5.9.3 | TypeScript compiler |

### 3. Configure Environment Variables

```bash
# Copy the template
cp .env.example .env

# Edit with your preferred editor
# On Windows: notepad .env
# On macOS/Linux: nano .env
```

At minimum, set `OPENAI_API_KEY`:

```env
OPENAI_API_KEY=sk-your-actual-api-key
OPENAI_MODEL=gpt-4o-mini
```

See [CONFIGURATION.md](CONFIGURATION.md) for the complete environment variable reference.

### 4. Start the Development Server

```bash
npm run dev
```

The server starts on `http://localhost:3000` by default.

---

## Environment Configuration

Create a `.env` file in the project root with the following variables:

```env
# Required: Your OpenAI API key
OPENAI_API_KEY=sk-your-api-key-here

# Optional: Override the default model (default: gpt-4o-mini)
OPENAI_MODEL=gpt-4o-mini

# Recommended: A random secret for signing document session tokens (≥ 32 characters)
# If omitted, a key is derived from OPENAI_API_KEY using domain separation.
DOCUMENT_TOKEN_SECRET=replace_with_a_long_random_secret
```

### Generating a Token Secret

```bash
# Linux/macOS
openssl rand -base64 48

# Node.js (any platform)
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# PowerShell (Windows)
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

> **⚠️ Important:** Never commit your `.env` file to version control. The `.gitignore` already excludes it.

---

## Verification

After starting the development server, verify the installation:

### 1. Browser Check

Open `http://localhost:3000` in your browser. You should see the Clarity landing page with the document upload interface.

### 2. API Health Check

```bash
# This should return a 405 (Method Not Allowed) confirming the route exists
curl -X GET http://localhost:3000/api/analyze
```

### 3. Upload Test

1. Open the application in your browser.
2. Upload a sample PDF document (a legal contract, policy, or agreement).
3. Click **"Analyze document →"**.
4. Verify that a structured analysis report appears.

---

## Development Setup

### IDE Configuration

For the best development experience with TypeScript and Next.js:

**Visual Studio Code (recommended):**
- Install the **TypeScript** extension (built-in).
- Install **ESLint** extension.
- The project uses path aliases (`@/*` maps to `./*`), configured in `tsconfig.json`.

### Development Workflow

```bash
# Start dev server with hot reload
npm run dev

# Run linting
npm run lint

# Type-checking is performed by Next.js during build
npm run build
```

### TypeScript Configuration

The project uses `tsconfig.json` with:
- **Target:** ES2022
- **Module:** ESNext with bundler resolution
- **Strict mode:** Enabled
- **Path aliases:** `@/*` → `./*`
- **Incremental builds:** Enabled

---

## Production Build

```bash
# Create optimized production bundle
npm run build

# Start the production server
npm start
```

The production build:
- Compiles TypeScript
- Optimizes and bundles all assets
- Enables production-only security headers (e.g., `upgrade-insecure-requests`)
- Disables browser source maps
- Removes the `X-Powered-By` header

---

## Troubleshooting Installation

### `npm install` fails

```
Error: ERESOLVE unable to resolve dependency tree
```

**Solution:** Try installing with the legacy peer dependency resolution:

```bash
npm install --legacy-peer-deps
```

### Port 3000 already in use

```bash
# Use a different port
npx next dev -p 3001

# Or kill the process on port 3000
# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux:
lsof -ti:3000 | xargs kill
```

### OpenAI API errors on first request

- Verify your API key is correct and has billing configured.
- Ensure outbound HTTPS access to `api.openai.com`.
- Check the terminal for detailed error messages.

### PDF parsing errors

- Ensure the `pdf-parse` package installed correctly. It requires a native Node.js runtime (not Edge).
- Test with a text-based PDF first (not a scanned image PDF).

---

**Next:** [ARCHITECTURE.md](ARCHITECTURE.md) — Learn about the system architecture and component design.
