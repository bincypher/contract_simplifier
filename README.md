# ✦ Clarity — AI Document Analyzer (v1.0.0)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Stack: Next.js 14](https://img.shields.io/badge/Stack-Next.js%2014-blue.svg)](https://nextjs.org/)
[![AI: OpenAI](https://img.shields.io/badge/AI-OpenAI%20API-green.svg)](https://openai.com/)

> **Executive Summary:** Clarity is a production-grade, privacy-first, serverless AI document intelligence platform designed to help users (employees, tenants, startups, freelancers, and small businesses) instantly parse and interrogate complex legal agreements, policies, and contracts. It translates dense legal jargon into plain, actionable English, flags hidden risks with severity scoring, and supports grounded conversational Q&A — all without storing a single byte of user data.

---

## 📖 Table of Contents

- [🚀 Hackathon Spotlight (For Judges)](#-hackathon-spotlight-for-judges)
- [✨ Core Features](#-core-features)
- [🛠️ Technology Stack](#%EF%B8%8F-technology-stack)
- [📐 System Architecture \& Data Lifecycle](#-system-architecture--data-lifecycle)
- [🔒 Security, Privacy \& Threat Mitigation](#-security-privacy--threat-mitigation)
- [💻 Quick Start & CLI Testing](#-quick-start--cli-testing)
- [⚙️ Configuration & Environment](#%EF%B8%8F-configuration--environment)
- [🧪 Testing & Verification](#-testing--verification)
- [📦 Production Deployment & Hardening](#-production-deployment--hardening)
- [⚠️ Limitations & Roadmap](#%EF%B8%8F-limitations--roadmap)
- [❓ FAQ Overview](#-faq-overview)
- [📄 License & Author](#-license--author)

---

## 🚀 Hackathon Spotlight (For Judges)

When judging an AI-powered application, security, validation, and design are paramount. Clarity is engineered with production-ready standards rather than typical "hackathon shortcuts":

1. **Zero-Trust Stateless Architecture**: No databases, file-systems, or persistent storage. High security footprint with near-zero data leakage vector. Files reside in volatile RAM only for the duration of the HTTP request.
2. **Stateless Conversational Context (HMAC)**: A novel session-handling mechanism. Instead of DB lookups, chat authorization is verified on every request using short-lived (30-min TTL) cryptographically signed HMAC-SHA256 tokens tied to the document's SHA-256 fingerprint.
3. **Strict Validation & Deterministic Output**: Fully typed with strict TypeScript and validated at request boundaries via Zod. Uses OpenAI's **Structured Outputs (JSON Schema)** at temperature `0` to enforce rigid structural conformity and prevent AI hallucinations.
4. **Three-Tier AI Security Guardrails**: Custom regex screening, a dedicated AI intent relevance classifier, and strict grounded system prompts completely neutralize prompt injection attacks and out-of-scope queries (e.g., asking for coding help or general knowledge).
5. **Vibrant & Restrained Aesthetics**: Beautifully designed single-page user interface using custom Vanilla CSS (omitting bulky Tailwind utilities for optimized performance), custom typography (DM Sans, DM Mono, Playfair Display), responsive layouts, smooth micro-animations, and dynamic visual indicators (such as HSL-anchored risk meters).

---

## ✨ Core Features

### 1. Document Upload & Intelligent Parsing
- **Supported Formats**: PDF (text-based and image-based/scanned), JPEG, PNG, and WebP up to **15 MB**.
- **Dual Ingestion Engine**: Dynamically extracts text from regular PDFs via `pdf-parse`. For scanned PDFs (no extractable text) or images, the engine automatically falls back to visual processing (OpenAI Vision API).
- **Format Verification**: Validates file integrity, page counts (max 100), dimensions (max 25MP), and checks magic bytes to prevent masquerading attacks.

### 2. Instant Structured Analysis Reports
- **Dynamic Classification**: Auto-classifies documents into 12 distinct categories (NDAs, Rental Agreements, Insurance Policies, etc.) with a confidence score.
- **Visual Risk Score (0-100)**: Highlights the general risk profile (Low, Medium, High) with corresponding color-coded badges.
- **Granular Finding Breakdowns**:
  - **Key Points**: Critical terms summarized under 40 words.
  - **Protections & Pros**: Clauses or terms in favor of the user.
  - **Drawbacks & Cons**: Clauses or terms that could harm the user.
  - **Risk Areas**: Flagged risks categorized by severity (Low/Medium/High) with actionable recommendations.
  - **Missing Info**: What *should* be in the document but is absent (e.g., termination policies or liability floors).
  - **Next Steps & Actions**: Recommended questions to ask and physical actions to take before signing.

### 3. Interactive Contextual Chat Q&A
- **Strict Grounding**: The chatbot is securely bound to the document. It refuses to answer questions not related to the contract or policy.
- **Evidence References**: Every answer returned includes exact quotes (evidence excerpts) and page citations.
- **Follow-up Prompting**: Dynamically generates context-aware follow-up question suggestions to guide user comprehension.
- **Chat Memory**: Retains up to 6 messages of conversational history in local UI state.

---

## 🛠️ Technology Stack

- **Framework**: Next.js 14 (App Router)
- **UI Logic & Rendering**: React 18 & TypeScript (Strict Mode)
- **Aesthetics & Styling**: Custom performant Vanilla CSS (`globals.css` and `chat.css`)
- **JSON Schema Validation**: Zod (Client-side inputs + Server-side payloads + AI outputs)
- **AI Processing Backend**: OpenAI Node CLI SDK (defaulting to `gpt-4o-mini` with structured JSON specifications)
- **PDF Extraction**: `pdf-parse` (Node-native extraction engine)

---

## 🔒 Security, Privacy & Threat Mitigation

### 1. Document Token (HMAC-SHA256 Session Protocol)
To link chat queries with the appropriate document without storing the document, the app creates a cryptographically signed session token:
- **Payload Contents**: Token version, SHA-256 fingerprint of the file, verified document type, issuance timestamp, and expiration timestamp.
- **Expiration Policy (TTL)**: Tokens expire exactly 30 minutes after analysis (plus a 60-second allowance for system clock skew).
- **Comparison**: Verified using timing-safe operations (`crypto.timingSafeEqual`) to mitigate timing attacks.
- **Verification**: On every chat query, the client must re-upload the document and supply the token. The server computes the hash, matches it against the token, and ensures the signature is valid.

### 2. Multi-Layer Guardrails Against Prompt Injections
To block malicious prompts that attempt to leak instructions, API keys, or hijack the LLM:
1. **Tier 1: Pre-AI Regex Checks** — Evaluates inputs for common injection syntax, preventing request execution.
2. **Tier 2: Dedicated Relevance Classification** — A lightweight LLM call classifies the intent of the question. Requests attempting prompt injection, requesting system prompts, or asking for general legal advice are returned with a rejected status code before the core Q&A model is invoked.
3. **Tier 3: Grounded Prompts with Data Tagging** — File text is treated as raw, untrusted payload. The Q&A system instructs the model to only use specific segments and highlights tags for separation, enforcing strict evidence-based constraints.

### 3. Application Hardening
- **HTTP Security Headers**: Implements a strict Content Security Policy (CSP), suppresses Next.js `X-Powered-By` headers, blocks clickjacking via `X-Frame-Options: DENY`, and limits cross-site leaks using `Referrer-Policy: no-referrer`.
- **File Validation**: Blocks uploads over 15MB. Inspects magic bytes to prevent extension spoofing. Limits dimensions (max 25MP, max 10,000px on any side) to prevent resource-exhaustion attacks.
- **In-Memory Rate Limiting**: Per-IP limits are tracked in-memory using SHA-256 hashed IP addresses (preserving user anonymity). Limits are set to **10 requests per 10 minutes** for analysis, and **30 requests per 10 minutes** for chat.

---

## 💻 Quick Start & CLI Testing

### Prerequisites
- Node.js >= 18
- NPM, Yarn, or PNPM

### 1. Installation & Environment Configuration
Clone the repository and install dependencies:
```bash
git clone <your-repository-url>
cd contract_simplifier
npm install
```

Create a `.env.local` file in the root directory (never commit this to version control):
```env
OPENAI_API_KEY=your_actual_openai_api_key
OPENAI_MODEL=gpt-4o-mini
DOCUMENT_TOKEN_SECRET=generate_a_random_32_character_signing_key_here
```

### 2. Running Locally
Start the Next.js development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser. Drag in a PDF or contract image, wait for the instant report, and engage with the Q&A panel!

---

### 3. CLI Testing & Endpoint Verification
Clarity's API endpoints are fully testable using CLI utilities. Use the following commands to perform auditing and testing verify the endpoints operate correctly:

#### Step A: Analyze a Document
Post a contract file to `/api/analyze` to receive the Zod-validated report structure and the required `documentToken`:
```bash
curl -X POST http://localhost:3000/api/analyze \
  -F "file=@./docs/fixtures/sample-contract.pdf"
```

*Expected JSON Response excerpt:*
```json
{
  "documentType": "NDA",
  "confidence": 95,
  "summary": "This is a mutual non-disclosure agreement protecting proprietary information...",
  "riskScore": 42,
  "riskLevel": "Medium",
  "pros": [...],
  "cons": [...],
  "riskAreas": [...],
  "documentToken": "eyJ2ZXJzaW9uIjoxLCJmaW5nZXJwcmludCI6Ii4uLiIsImV4cGlyZXNBdCI6MTc4OTk5OTk5OX0.abc123HMACSignature...",
  "documentTokenExpiresAt": "2026-07-18T13:19:14.000Z"
}
```

#### Step B: Chat Q&A
Pass the document, the `documentToken` returned under Step A, and your inquiry. Notice that document text validation matches hashes on the server:
```bash
curl -X POST http://localhost:3000/api/chat \
  -F "file=@./docs/fixtures/sample-contract.pdf" \
  -F "documentToken=eyJ2ZXJzaW9uIjoxLCJmaW5nZXJwcmludCI6Ii4uLiIsImV4cGlyZXNBdCI6MTc4OTk5OTk5OX0.abc123HMACSignature..." \
  -F "question=What is the governing law of this contract?"
```

*Expected JSON Response:*
```json
{
  "status": "answered",
  "answer": "The contract is governed by the laws of the State of Delaware.",
  "evidence": [
    {
      "page": 3,
      "excerpt": "This agreement shall be governed and interpreted under the laws of Delaware."
    }
  ],
  "confidence": 98,
  "followUpQuestions": [
    "Are there any arbitration clauses mentioned?",
    "Where will hearings take place?"
  ]
}
```

---

## ⚙️ Configuration & Environment

| Environment Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | **Yes** | *None* | Your OpenAI API secret key. |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | The model used for classification, analysis, and Q&A. Must support structured output. |
| `DOCUMENT_TOKEN_SECRET` | No | *Derived* | Key used for signing session HMACs (min 32 chars). If left empty, it derives a domain-separated key from your `OPENAI_API_KEY`. |
| `NODE_ENV` | No | `development` | Runtime environment. Set to `production` in host panel. Controls strict CSP, suppressions, and debug loops. |

---

## 🧪 Testing & Verification

For comprehensive quality assurance, the testing protocol divides verification pathways into:

1. **Unit Verification**: Covers core functions — `lib/document-ingestion.ts` (boundary sizes, type safety), `lib/document-token.ts` (HMAC signatures, expiry math), `lib/chat-guardrails.ts` (prompt injection regex checks), and `lib/eligibility.ts` (classification rules).
2. **Integration Verification**: Verifies routing handlers, response payload structure, and rate-limit responses (ensuring the `Retry-After` header is correctly computed).
3. **LLM Schema Enforcement**: Employs Mock JSON files mimicking OpenAI response bodies, validating Zod parsing edge cases.
4. **Performance Targets**: Focuses on completing Analysis flows in under **30 seconds** and Q&A responses in under **15 seconds**.

---

## 📦 Production Deployment

### 1. Vercel Deployment (Recommended)
Clarity is fully optimized for Vercel. 
- Ensure that you configure the environment variables `OPENAI_API_KEY` and `DOCUMENT_TOKEN_SECRET` in the Vercel project dashboard.
- **Execution Limits**: The default Vercel serverless function execution limit is 15 seconds on Hobby plans. Since document parsing and OpenAI structured responses can take longer, a Pro/Enterprise account allows shifting execution limits up to 90 seconds.

---

## ⚠️ Limitations & Roadmap

### Current Limitations
1. **Stateless Refresh Loss**: Refreshing the page discards the client-side state, which includes analysis findings and chat threads.
2. **Text Formats**: The system currently does not support DOCX or TXT files (only PDF and images).
3. **OCR Scope**: Document ingestion falls back to visual LLM evaluation for scanned documents; there is no local OCR computation layer.
4. **Volume Limits**: Contracts with text exceeding 120,000 characters (approx. 45-50 pages) are truncated.

### Future Roadmap
- **User Accounts & Persistence**: Introduce OAuth2 providers and encrypted PostgreSQL database tables (e.g., via Supabase) to persist past document summaries and chat history.
- **Exporting Options**: Generates download links for PDF and Word (`.docx`) analysis reports.
- **Version Diff Analysis**: Compares revisions of two similar contracts and flags changes in liability, payment structures, or auto-renewals.
- **Multi-language OCR**: Full operational supports for multi-language document loading and analysis.

---


## 📄 License & Author

Distributed under the **MIT License**. See `LICENSE` for details.

- **Author**: Binayak Bidyasagar & Rakesh Sahoo
- **Version**: 1.0.0
- **Product**: Clarity — AI Document Analyzer
- **Copyright**: © 2026 Binayak Bidyasagar & Rakesh Sahoo. All rights reserved.

---

