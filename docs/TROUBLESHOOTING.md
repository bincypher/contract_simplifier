# Troubleshooting

> Common issues, diagnostic procedures, and solutions for Clarity.

---

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Installation Issues](#installation-issues)
- [Startup Issues](#startup-issues)
- [Document Upload Issues](#document-upload-issues)
- [Analysis Issues](#analysis-issues)
- [Chat Issues](#chat-issues)
- [OpenAI API Issues](#openai-api-issues)
- [Security & Access Issues](#security--access-issues)
- [Performance Issues](#performance-issues)
- [Build & Deployment Issues](#build--deployment-issues)
- [Debug Mode](#debug-mode)

---

## Quick Diagnostics

### Diagnostic Checklist

| Check | Command / Action | Expected |
|---|---|---|
| Node.js version | `node --version` | ≥ 18.x |
| npm version | `npm --version` | ≥ 9.x |
| Dependencies installed | `ls node_modules/next` | Directory exists |
| `.env` file exists | `cat .env` (or `type .env` on Windows) | Contains `OPENAI_API_KEY` |
| API key format | Check key starts with `sk-` | Valid prefix |
| Dev server running | `curl http://localhost:3000` | HTTP 200 |
| API accessible | `curl -X POST http://localhost:3000/api/analyze` | HTTP 400 (no file) |
| Outbound connectivity | `curl -I https://api.openai.com` | HTTP 200 or 403 |

---

## Installation Issues

### `npm install` fails with dependency resolution errors

**Symptom:**
```
npm ERR! ERESOLVE unable to resolve dependency tree
```

**Solution:**
```bash
npm install --legacy-peer-deps
```

### `npm install` hangs or times out

**Symptom:** Installation appears stuck.

**Solutions:**
1. Clear npm cache: `npm cache clean --force`
2. Delete `node_modules` and `package-lock.json`, then reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```
3. Check network connectivity and proxy settings.

### TypeScript errors during `npm run build`

**Symptom:** Type errors during build.

**Solution:** Ensure correct TypeScript and type definition versions:
```bash
npm install --save-dev typescript@5.9.3 @types/node@20.19.43 @types/react@18.3.31
```

---

## Startup Issues

### Port 3000 already in use

**Symptom:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:**
```bash
# Use a different port
npx next dev -p 3001

# Or find and kill the process using port 3000
# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS/Linux:
lsof -ti:3000 | xargs kill
```

### "The analysis service is not configured"

**Symptom:** HTTP 503 when uploading a document.

**Cause:** `OPENAI_API_KEY` is not set or is empty.

**Solution:**
1. Verify `.env` file exists in the project root.
2. Ensure `OPENAI_API_KEY=sk-...` is set (without quotes around the value).
3. Restart the development server after editing `.env`.

### "The document session service is not configured"

**Symptom:** HTTP 503 after eligibility check passes.

**Cause:** Neither `DOCUMENT_TOKEN_SECRET` nor `OPENAI_API_KEY` is set.

**Solution:** Ensure at least `OPENAI_API_KEY` is set. Optionally set `DOCUMENT_TOKEN_SECRET`.

### "DOCUMENT_TOKEN_SECRET must contain at least 32 characters"

**Symptom:** HTTP 503 error.

**Cause:** `DOCUMENT_TOKEN_SECRET` is set but shorter than 32 characters.

**Solution:** Generate a proper secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

---

## Document Upload Issues

### "Please choose a PDF, JPG, PNG, or WebP document"

**Symptom:** Client-side error when selecting a file.

**Cause:** Unsupported file format. Only `.pdf`, `.jpg`, `.jpeg`, `.png`, and `.webp` files are accepted.

**Solution:** Convert the document to a supported format. Note that `.docx`, `.txt`, and other text formats are **not supported** in the current version.

### "This file exceeds the 15 MB limit"

**Symptom:** Client-side error.

**Solution:** Reduce the file size below 15 MB. For PDFs, try:
- Removing unnecessary pages
- Compressing images within the PDF
- Using a PDF compression tool

### "The file contents do not match the selected file type"

**Symptom:** HTTP 415 after upload.

**Cause:** The file's binary content (magic bytes) doesn't match its declared MIME type. This happens when:
- A file is renamed with a wrong extension
- The file is corrupted
- The file type is spoofed

**Solution:** Ensure the file is a genuine PDF, JPEG, PNG, or WebP file.

### "The image is truncated or corrupted"

**Symptom:** HTTP 422 after uploading an image.

**Cause:** The image file is incomplete or corrupted.

**Solution:** Re-download or re-export the image from its source application.

### "The image dimensions are too large"

**Symptom:** HTTP 422 after uploading an image.

**Cause:** The image exceeds 25 megapixels or 10,000 pixels on either side.

**Solution:** Resize the image to smaller dimensions before uploading.

### "PDFs must contain between 1 and 100 pages"

**Symptom:** HTTP 422 after uploading a PDF.

**Solution:** Split the PDF into sections of 100 pages or fewer.

### "The PDF is corrupted, encrypted, or could not be read"

**Symptom:** HTTP 422 after uploading a PDF.

**Causes:**
- Password-protected PDF
- Corrupted PDF file
- PDF with non-standard encoding

**Solution:**
- Remove password protection from the PDF
- Try re-saving it from a PDF editor
- If scanned, try converting pages to images and uploading individually

---

## Analysis Issues

### "This document is not a supported policy, agreement, or contract"

**Symptom:** HTTP 422 with this specific message.

**Cause:** The eligibility classifier determined the document is not a legal/policy document (e.g., it's a textbook, resume, marketing material, or generic document).

**Solution:** Only upload legal documents, contracts, agreements, policies, or similar legally-oriented documents.

### "The analysis service returned an invalid response"

**Symptom:** HTTP 502 error.

**Cause:** The AI model returned a response that doesn't match the expected JSON schema.

**Solutions:**
1. Try the analysis again (AI responses can vary).
2. Check the terminal for schema validation errors:
   ```
   Model response failed schema validation ["riskScore", "confidence"]
   ```
3. If persistent, try a different `OPENAI_MODEL`.

### "Analysis timed out after 90 seconds"

**Symptom:** Client-side timeout error.

**Cause:** The document may be very large, or the OpenAI API is experiencing high latency.

**Solutions:**
1. Try again after a short wait.
2. Upload a shorter version of the document.
3. Check [OpenAI Status](https://status.openai.com/) for API issues.

---

## Chat Issues

### "This document session has expired"

**Symptom:** Error when trying to ask a question.

**Cause:** The document token has a 30-minute TTL. If more than 30 minutes have passed since analysis, the session expires.

**Solution:** Analyze the document again by clicking "Analyze document →" to generate a new session token.

### "I can only answer questions about the uploaded document"

**Symptom:** Chat returns a rejected response.

**Cause:** The question was classified as:
- Not related to the document
- A general knowledge question
- A prompt injection attempt
- A request for legal advice
- A request for system internals

**Solution:** Rephrase the question to focus specifically on the content of the uploaded document.

### "The uploaded document does not match this document session"

**Symptom:** HTTP 401 error during chat.

**Cause:** The document file was modified between the analysis and chat request, changing its SHA-256 fingerprint.

**Solution:** Analyze the document again with the current file.

### Chat is slow

**Cause:** Each chat request makes 2 sequential OpenAI API calls (relevance check + answer generation).

**Solutions:**
1. Check your OpenAI API tier and rate limits.
2. Consider using a faster model if available.
3. Check [OpenAI Status](https://status.openai.com/).

---

## OpenAI API Issues

### "The server cannot reach the analysis service"

**Symptom:** HTTP 503 error.

**Cause:** The server cannot establish a connection to `api.openai.com`.

**Solutions:**
1. Check outbound internet connectivity from the server.
2. Verify firewall rules allow HTTPS (443) to `api.openai.com`.
3. Check if a proxy configuration is needed.

### "The analysis service did not respond in time"

**Symptom:** HTTP 504 error.

**Cause:** OpenAI API took longer than the 75-second timeout.

**Solutions:**
1. Try again.
2. Check [OpenAI Status](https://status.openai.com/).
3. Try a different model (`gpt-4o-mini` is typically faster).

### OpenAI rate limit errors

**Symptom:** HTTP 500 with OpenAI error in server logs.

**Cause:** Your OpenAI API key has hit its usage limits.

**Solutions:**
1. Check your OpenAI dashboard for rate limit status.
2. Upgrade your API plan or wait for the limit to reset.
3. Reduce request frequency.

---

## Security & Access Issues

### "Cross-origin requests are not allowed"

**Symptom:** HTTP 403 error.

**Cause:** The request's `Origin` header doesn't match the server's host.

**Solutions:**
1. Access the application from the correct host (e.g., `http://localhost:3000`).
2. If behind a reverse proxy, ensure `X-Forwarded-Host` and `X-Forwarded-Proto` headers are set correctly.

### "Too many requests. Please wait before trying again."

**Symptom:** HTTP 429 with `Retry-After` header.

**Cause:** Rate limit exceeded (10/10min for analyze, 30/10min for chat).

**Solution:** Wait for the duration specified in the `Retry-After` header, then try again.

### "The request body is too large"

**Symptom:** HTTP 413 error.

**Cause:** The total request body exceeds the 16 MB server limit.

**Solution:** Reduce the file size below 15 MB.

---

## Performance Issues

### High memory usage

**Cause:** Large file uploads are buffered entirely in memory.

**Mitigation:**
- The 15 MB file limit bounds maximum memory per request.
- Monitor memory usage if handling concurrent requests.
- Restart the server if memory usage grows (rate limit map may accumulate).

### Slow first request

**Cause:** Node.js JIT compilation and module loading on the first request.

**Mitigation:** This is expected behavior. Subsequent requests will be faster.

---

## Build & Deployment Issues

### Build fails with "Module not found"

**Solution:**
```bash
rm -rf node_modules .next
npm install
npm run build
```

### Production build uses different CSP

**Expected behavior:** Production builds include `upgrade-insecure-requests` and exclude `unsafe-eval` from `script-src`. This is intentional.

---

## Debug Mode

### Enable Debug Logging

In development (`NODE_ENV !== "production"`), the chat route automatically outputs debug information:

```
[chat] rawRelevance: {"isDocumentRelated":true, ...}
[chat] parsed relevance: {"isDocumentRelated":true, ...}
[chat] rawAnswer: {"status":"answered", ...}
[chat] parsed answer: {"status":"answered", ...}
```

These appear in the terminal running `npm run dev`.

### Inspect API Responses

Use browser developer tools:
1. Open **Network** tab.
2. Filter by `api/analyze` or `api/chat`.
3. Inspect **Response** tab for the JSON payload.
4. Check **Response Headers** for `Retry-After` (if rate limited).

---

**Next:** [CONTRIBUTING.md](CONTRIBUTING.md) — Contribution guidelines and code standards.
