import OpenAI from "openai";
import type { ChatCompletionUserMessageParam } from "openai/resources/chat/completions";
import { NextResponse } from "next/server";
import { analysisSchema } from "@/lib/schema";
import { ANALYSIS_INSTRUCTIONS } from "@/lib/prompt";
import { analysisJsonSchema } from "@/lib/openai-schema";
import {
  ELIGIBILITY_INSTRUCTIONS,
  eligibilityJsonSchema,
  eligibilitySchema,
  isEligibleDocument,
  UNSUPPORTED_DOCUMENT_MESSAGE
} from "@/lib/eligibility";
import {
  DocumentIngestionError,
  ingestDocument
} from "@/lib/document-ingestion";
import {
  assertDocumentTokenConfigured,
  createDocumentToken,
  DocumentTokenError
} from "@/lib/document-token";
import {
  enforceContentLength,
  enforceRateLimit,
  enforceSameOrigin,
  RequestGuardError
} from "@/lib/request-guard";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_CHARS = 120_000;
const MAX_CLASSIFICATION_CHARS = 40_000;

function imageContent(dataUrl: string): ChatCompletionUserMessageParam["content"] {
  return [
    {
      type: "text",
      text: "The uploaded document is an image. Read only the text and document content that are clearly visible in it."
    },
    { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
  ];
}

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    enforceContentLength(request, 16 * 1024 * 1024);
    enforceRateLimit(request, "analyze", 10, 10 * 60 * 1000);
    const form = await request.formData();
    const document = await ingestDocument(form.get("file"));
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "The analysis service is not configured." }, { status: 503 });
    }
    assertDocumentTokenConfigured();

    let eligibilityContent: ChatCompletionUserMessageParam["content"];
    let analysisContent: ChatCompletionUserMessageParam["content"];
    if (document.kind === "text") {
      eligibilityContent = document.text.slice(0, MAX_CLASSIFICATION_CHARS);
      analysisContent = document.text.slice(0, MAX_CHARS);
    } else {
      eligibilityContent = imageContent(document.dataUrl);
      analysisContent = imageContent(document.dataUrl);
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 75_000,
      maxRetries: 1
    });
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const eligibilityCompletion = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 150,
      response_format: { type: "json_schema", json_schema: { name: "document_eligibility", strict: true, schema: eligibilityJsonSchema } },
      messages: [
        { role: "system", content: ELIGIBILITY_INSTRUCTIONS },
        { role: "user", content: eligibilityContent }
      ]
    });
    const rawEligibility = eligibilityCompletion.choices[0]?.message?.content;
    if (!rawEligibility) throw new Error("The model returned no eligibility decision.");
    const eligibility = eligibilitySchema.parse(JSON.parse(rawEligibility));
    if (!isEligibleDocument(eligibility)) {
      return NextResponse.json({ error: UNSUPPORTED_DOCUMENT_MESSAGE }, { status: 422 });
    }

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.1,
      max_tokens: 2500,
      response_format: { type: "json_schema", json_schema: { name: "document_analysis", strict: true, schema: analysisJsonSchema } },
      messages: [{ role: "system", content: ANALYSIS_INSTRUCTIONS }, { role: "user", content: analysisContent }]
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("The model returned no analysis.");
    const analysis = analysisSchema.parse(JSON.parse(raw));
    const documentSession = createDocumentToken({
      fingerprint: document.fingerprint,
      documentType: analysis.documentType,
      eligibilityConfidence: eligibility.confidence
    });
    return NextResponse.json({
      ...analysis,
      documentToken: documentSession.token,
      documentTokenExpiresAt: documentSession.expiresAt
    });
  } catch (error) {
    if (error instanceof RequestGuardError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined
        }
      );
    }
    if (error instanceof DocumentIngestionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof DocumentTokenError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      return NextResponse.json({ error: "The analysis service did not respond in time. Please try again shortly." }, { status: 504 });
    }
    if (error instanceof OpenAI.APIConnectionError) {
      return NextResponse.json({ error: "The server cannot reach the analysis service. Verify outbound access to api.openai.com and try again." }, { status: 503 });
    }
    if (error instanceof z.ZodError) {
      console.error("Model response failed schema validation", error.issues.map(issue => issue.path.join(".")));
      return NextResponse.json({ error: "The analysis service returned an invalid response. Please try again." }, { status: 502 });
    }
    console.error("Analysis failed", error instanceof Error ? error.name : "UnknownError");
    const message = error instanceof Error && error.message.includes("JSON") ? "Analysis could not be validated. Please try again." : "We could not analyze this document. Please try a different supported file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
