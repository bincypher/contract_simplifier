# API Reference

> Complete API documentation for Clarity's server-side endpoints.

---

## Table of Contents

- [Overview](#overview)
- [Common Behavior](#common-behavior)
- [POST /api/analyze](#post-apianalyze)
- [POST /api/chat](#post-apichat)
- [Error Responses](#error-responses)
- [Rate Limiting](#rate-limiting)
- [Response Schemas](#response-schemas)

---

## Overview

Clarity exposes two REST-like API endpoints via Next.js App Router:

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/analyze` | Analyze an uploaded document | Same-origin |
| `POST` | `/api/chat` | Ask a question about an analyzed document | Same-origin + Document Token |

Both endpoints:
- Accept `multipart/form-data` requests
- Return `application/json` responses
- Use `Cache-Control: no-store, max-age=0`
- Run on the **Node.js runtime** (not Edge)
- Are configured with `dynamic = "force-dynamic"`

---

## Common Behavior

### Request Validation

Every request passes through three guards before processing:

1. **Same-Origin Check** — The `Origin` header (if present) must match the server's host and protocol.
2. **Content-Length Check** — Maximum request body size is **16 MB**.
3. **Rate Limiting** — Per-IP, per-endpoint limits (see [Rate Limiting](#rate-limiting)).

### Response Format

All responses use JSON. Successful responses return the data object directly. Error responses return:

```json
{
  "error": "Human-readable error message"
}
```

---

## POST /api/analyze

Uploads a document and returns a comprehensive AI-powered analysis.

### Request

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | `File` | **Yes** | The document file (PDF, JPG, PNG, or WebP) |

**Content-Type:** `multipart/form-data`

**Accepted file types:**
- `application/pdf` — PDF documents (1–100 pages)
- `image/jpeg` — JPEG images
- `image/png` — PNG images
- `image/webp` — WebP images

**Size limit:** 15 MB per file

### Example Request

```bash
curl -X POST http://localhost:3000/api/analyze \
  -F "file=@/path/to/contract.pdf"
```

### Successful Response (200)

```json
{
  "documentType": "Employment Contract",
  "confidence": 92,
  "summary": "A standard employment agreement between...",
  "documentPurpose": "Establishes the terms of employment...",
  "riskScore": 45,
  "riskLevel": "Medium",
  "pros": [
    {
      "title": "Health insurance coverage",
      "reason": "The employer provides comprehensive group health insurance."
    }
  ],
  "cons": [
    {
      "title": "Broad non-compete clause",
      "reason": "Restricts employment in the same industry for 24 months."
    }
  ],
  "riskAreas": [
    {
      "title": "Non-compete restriction",
      "severity": "High",
      "reason": "The 24-month restriction may limit future career options.",
      "recommendation": "Ask whether the non-compete can be narrowed geographically or by duration."
    }
  ],
  "importantPoints": [
    {
      "title": "Probation period",
      "reason": "A 6-month probation period applies with different termination terms."
    }
  ],
  "painPoints": [],
  "missingInformation": [
    {
      "field": "Bonus structure",
      "whyImportant": "The agreement references a bonus but does not define calculation criteria."
    }
  ],
  "questionsToAsk": [
    "Can the non-compete clause be limited to direct competitors only?",
    "What are the specific bonus calculation criteria?"
  ],
  "actionItems": [
    "Request clarification on the bonus structure before signing.",
    "Consult a qualified employment lawyer about the non-compete terms."
  ],
  "documentToken": "eyJ2ZXJza...<base64url>...hYx4Fg",
  "documentTokenExpiresAt": "2026-07-17T11:07:36.000Z"
}
```

### Response Fields

| Field | Type | Description |
|---|---|---|
| `documentType` | `string` | Classified document type (see [Supported Types](#supported-document-types)) |
| `confidence` | `number` | AI confidence in classification (0–100) |
| `summary` | `string \| null` | Plain-English summary (max ~120 words) |
| `documentPurpose` | `string \| null` | The document's stated purpose |
| `riskScore` | `number` | Overall risk score (0–100) |
| `riskLevel` | `"Low" \| "Medium" \| "High"` | Risk classification |
| `pros` | `Finding[]` | Document-supported favorable terms |
| `cons` | `Finding[]` | Document-supported unfavorable terms |
| `riskAreas` | `RiskArea[]` | Specific risk areas with severity and recommendations |
| `importantPoints` | `Finding[]` | Key points from the document |
| `painPoints` | `Finding[]` | Pain points identified |
| `missingInformation` | `MissingInfo[]` | Information absent from the document |
| `questionsToAsk` | `string[]` | Suggested questions before signing |
| `actionItems` | `string[]` | Recommended next steps |
| `documentToken` | `string` | HMAC-signed session token for chat endpoint |
| `documentTokenExpiresAt` | `string` | ISO 8601 token expiration timestamp |

### Error Responses

| Status | Condition |
|---|---|
| `400` | Missing or invalid file, empty upload |
| `403` | Cross-origin request |
| `413` | File exceeds 15 MB or request exceeds 16 MB |
| `415` | Unsupported file type or MIME/content mismatch |
| `422` | Unsupported document type, corrupted file, or validation failure |
| `429` | Rate limit exceeded (10 requests per 10 minutes) |
| `500` | Internal analysis error |
| `502` | AI response failed schema validation |
| `503` | Missing API key or cannot connect to OpenAI |
| `504` | OpenAI API timed out (75-second limit) |

---

## POST /api/chat

Asks a document-specific question and returns a grounded answer with evidence.

### Request

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | `File` | **Yes** | The same document file used during analysis |
| `documentToken` | `string` | **Yes** | Token received from the `/api/analyze` response |
| `question` | `string` | **Yes** | The question to ask (2–500 characters) |
| `history` | `string` | No | JSON-encoded conversation history (max 6 messages) |

**Content-Type:** `multipart/form-data`

### Example Request

```bash
curl -X POST http://localhost:3000/api/chat \
  -F "file=@/path/to/contract.pdf" \
  -F "documentToken=eyJ2ZXJza..." \
  -F "question=What happens if I resign early?" \
  -F 'history=[{"role":"user","content":"What are the key obligations?"},{"role":"assistant","content":"The key obligations include..."}]'
```

### Successful Response — Answered (200)

```json
{
  "status": "answered",
  "answer": "According to the employment agreement, if you resign before completing the probation period, you must provide 15 days written notice...",
  "evidence": [
    {
      "page": 3,
      "excerpt": "The Employee may terminate this agreement by providing fifteen (15) days written notice..."
    },
    {
      "page": 5,
      "excerpt": "Early termination during the probation period shall not attract any penalty..."
    }
  ],
  "confidence": 87,
  "followUpQuestions": [
    "Is there a different notice period after probation?",
    "Are there any financial penalties for early resignation?"
  ]
}
```

### Successful Response — Not Found (200)

```json
{
  "status": "not_found",
  "answer": "This information is not stated in the uploaded document.",
  "evidence": [],
  "confidence": 15,
  "followUpQuestions": [
    "Would you like to ask about a different clause?"
  ]
}
```

### Rejected Response (200)

When the question is deemed outside the document scope:

```json
{
  "status": "rejected",
  "message": "I can only answer questions about the uploaded document. No document-based answer was generated.",
  "reasonCode": "unrelated"
}
```

**Reason Codes:**

| Code | Meaning |
|---|---|
| `related` | Question is document-related (passes gate) |
| `unrelated` | Question is not about the document |
| `prompt_injection` | Detected prompt injection attempt |
| `secret_request` | Asked for system internals / secrets |
| `outside_legal_advice` | Requested legal conclusions |
| `unclear` | Ambiguous question declined |
| `blocked` | Generic block reason |

### Chat Response Fields

| Field | Type | Description |
|---|---|---|
| `status` | `"answered" \| "not_found"` | Whether an answer was found in the document |
| `answer` | `string` | The AI-generated answer (max 1600 chars) |
| `evidence` | `Evidence[]` | Document excerpts supporting the answer (max 4) |
| `confidence` | `number` | AI confidence in the answer (0–100) |
| `followUpQuestions` | `string[]` | Suggested follow-up questions (max 3) |

### Evidence Object

| Field | Type | Description |
|---|---|---|
| `page` | `number \| null` | Page number (null if not determinable) |
| `excerpt` | `string` | Verbatim excerpt from the document (max 240 chars) |

### Error Responses

| Status | Condition |
|---|---|
| `400` | Missing fields, invalid question (< 2 or > 500 chars), invalid history |
| `401` | Invalid, expired, or mismatched document token |
| `403` | Cross-origin request |
| `413` | Request body too large |
| `415` | Unsupported file type |
| `422` | File validation failure |
| `429` | Rate limit exceeded (30 requests per 10 minutes) |
| `500` | Internal chat error |
| `502` | AI response failed schema validation |
| `503` | Missing API key or OpenAI unreachable |
| `504` | OpenAI API timed out |

---

## Rate Limiting

| Endpoint | Limit | Window | Scope |
|---|---|---|---|
| `/api/analyze` | 10 requests | 10 minutes | Per IP address |
| `/api/chat` | 30 requests | 10 minutes | Per IP address |

When exceeded, the API returns:
- **Status:** `429 Too Many Requests`
- **Header:** `Retry-After: <seconds>`
- **Body:** `{ "error": "Too many requests. Please wait before trying again." }`

IP is determined from `X-Vercel-Forwarded-For` → `X-Forwarded-For` → `"local"`. Rate limit counters are stored in-process memory and are hashed with SHA-256 for privacy.

> **⚠️ Note:** Rate limits reset on server restart and are not shared across multiple server instances.

---

## Response Schemas

### Supported Document Types

```typescript
const SUPPORTED_DOCUMENT_TYPES = [
  "Insurance Policy",
  "Employment Contract",
  "Rental Agreement",
  "NDA",
  "Service Agreement",
  "Vendor Contract",
  "Purchase Order",
  "Privacy Policy",
  "Terms & Conditions",
  "Loan Agreement",
  "Legal Notice",
  "Other Legal or Policy Document"
] as const;
```

### Finding Object

```typescript
{
  title: string | null,    // Finding title
  reason: string | null    // Explanation (max ~40 words)
}
```

### RiskArea Object

```typescript
{
  title: string | null,
  severity: "Low" | "Medium" | "High",
  reason: string | null,
  recommendation: string | null
}
```

### MissingInfo Object

```typescript
{
  field: string | null,        // What is missing
  whyImportant: string | null  // Why it matters
}
```

---

**Next:** [DATABASE.md](DATABASE.md) — Data structures and schema documentation.
