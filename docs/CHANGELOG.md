# Changelog

> Version history and notable changes for Clarity AI Document Analyzer.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.0.0] — 2026-07-17

### Added

- **Document Upload & Analysis**
  - Drag-and-drop and click-to-browse file upload interface
  - Support for PDF, JPEG, PNG, and WebP files (up to 15 MB)
  - AI-powered structured document analysis via OpenAI API
  - Document eligibility classification (rejects non-legal/non-policy documents)
  - Risk scoring (0–100) with Low/Medium/High classification
  - Key points, pros, cons, and risk area extraction
  - Missing information identification
  - Suggested questions and action items generation
  - Confidence scoring for classification and analysis

- **Grounded Document Q&A**
  - Interactive chat interface for document-specific questions
  - Answers grounded exclusively in uploaded document content
  - Document evidence excerpts with page references
  - Follow-up question suggestions
  - Confidence scoring per answer
  - Conversation history support (up to 6 messages)

- **Security**
  - Content Security Policy (CSP) with production hardening
  - Same-origin enforcement on all API routes
  - Per-IP rate limiting (10/10min analyze, 30/10min chat)
  - Magic-byte file type verification
  - Image dimension and integrity validation
  - HMAC-SHA256 document session tokens (30-minute TTL)
  - Document fingerprinting (SHA-256)
  - Timing-safe token comparison
  - Prompt injection detection (regex + AI relevance classification)
  - Untrusted data tagging in AI prompts
  - Production source map suppression
  - X-Frame-Options, Referrer-Policy, Permissions-Policy headers

- **Document Processing**
  - PDF text extraction via `pdf-parse`
  - Automatic fallback to OpenAI Vision for image-based PDFs
  - Image analysis via OpenAI Vision API
  - Text normalization and whitespace cleanup
  - File name sanitization
  - SHA-256 document fingerprinting

- **Frontend**
  - Responsive single-page layout (desktop + mobile)
  - Custom design system with DM Sans, DM Mono, and Playfair Display typography
  - Animated loading states
  - Error messaging with contextual error types
  - 90-second client-side request timeouts
  - Accessible ARIA attributes and roles

- **Infrastructure**
  - Next.js 14 App Router architecture
  - TypeScript strict mode
  - Zod schema validation for all data boundaries
  - OpenAI Structured Output (JSON Schema) integration
  - Environment-based configuration
  - Production security header differentiation

### Supported Document Types

- Insurance Policy
- Employment Contract
- Rental Agreement
- NDA
- Service Agreement
- Vendor Contract
- Purchase Order
- Privacy Policy
- Terms & Conditions
- Loan Agreement
- Legal Notice
- Other Legal or Policy Document

### Known Limitations

- No persistent storage (analysis results lost on page refresh)
- No user authentication
- No report export functionality
- No DOCX or TXT file support
- In-memory rate limiting (resets on restart, not shared across instances)
- 30-minute document session limit
- 120,000 character document truncation
- No test suite included
- English-only interface and analysis

---

«TODO: Future versions should be documented here as they are released.»

---

**Next:** [LICENSE.md](LICENSE.md) — License information.
