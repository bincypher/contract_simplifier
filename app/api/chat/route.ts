import OpenAI from "openai";
import type { ChatCompletionUserMessageParam } from "openai/resources/chat/completions";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CHAT_ANSWER_INSTRUCTIONS,
  CHAT_REJECTION_MESSAGE,
  CHAT_RELEVANCE_INSTRUCTIONS,
  ChatRequestError,
  chatAnswerJsonSchema,
  chatAnswerSchema,
  chatRelevanceJsonSchema,
  chatRelevanceSchema,
  hasProhibitedQuestionIntent,
  parseChatRequest,
  type ChatHistory
} from "@/lib/chat-guardrails";
import {
  DocumentIngestionError,
  ingestDocument,
  type IngestedDocument
} from "@/lib/document-ingestion";
import {
  DocumentTokenError,
  fingerprintsMatch,
  verifyDocumentToken,
  type DocumentTokenPayload
} from "@/lib/document-token";
import {
  enforceContentLength,
  enforceRateLimit,
  enforceSameOrigin,
  RequestGuardError
} from "@/lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DOCUMENT_CHARS = 120_000;
const MIN_RELEVANCE_CONFIDENCE = 70;

function conversationContext(question: string, history: ChatHistory, token: DocumentTokenPayload) {
  return [
    `Approved document type: ${token.documentType}`,
    `Untrusted conversation history: ${JSON.stringify(history)}`,
    `Untrusted current question: ${JSON.stringify(question)}`
  ].join("\n");
}

function documentQuestionContent(
  document: IngestedDocument,
  question: string,
  history: ChatHistory,
  token: DocumentTokenPayload
): ChatCompletionUserMessageParam["content"] {
  const context = conversationContext(question, history, token);
  if (document.kind === "text") {
    return `${context}\n\n<untrusted_document_content>\n${document.text.slice(0, MAX_DOCUMENT_CHARS)}\n</untrusted_document_content>`;
  }
  return [
    {
      type: "text",
      text: `${context}\n\nThe untrusted uploaded document is the image supplied below. Read only clearly visible content.`
    },
    { type: "image_url", image_url: { url: document.dataUrl, detail: "high" } }
  ];
}

function rejectedResponse(reasonCode: string = "blocked") {
  return NextResponse.json({
    status: "rejected",
    message: CHAT_REJECTION_MESSAGE,
    reasonCode
  });
}

function guardErrorResponse(error: RequestGuardError) {
  return NextResponse.json(
    { error: error.message },
    {
      status: error.status,
      headers: error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined
    }
  );
}

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    enforceContentLength(request, 16 * 1024 * 1024);
    enforceRateLimit(request, "chat", 30, 10 * 60 * 1000);

    const form = await request.formData();
    const chatRequest = parseChatRequest(form);
    const token = verifyDocumentToken(chatRequest.documentToken);
    const document = await ingestDocument(form.get("file"));
    if (!fingerprintsMatch(document.fingerprint, token.fingerprint)) {
      throw new DocumentTokenError(
        "The uploaded document does not match this document session. Analyze it again.",
        401
      );
    }

    if (hasProhibitedQuestionIntent(chatRequest.question)) {
      return rejectedResponse("prompt_injection");
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "The chat service is not configured." }, { status: 503 });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 75_000,
      maxRetries: 1
    });
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const content = documentQuestionContent(
      document,
      chatRequest.question,
      chatRequest.history,
      token
    );

    const relevanceCompletion = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 180,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "document_question_relevance",
          strict: true,
          schema: chatRelevanceJsonSchema
        }
      },
      messages: [
        { role: "system", content: CHAT_RELEVANCE_INSTRUCTIONS },
        { role: "user", content }
      ]
    });
    const rawRelevance = relevanceCompletion.choices[0]?.message?.content;
    if (!rawRelevance) throw new Error("The model returned no relevance decision.");
    const relevance = chatRelevanceSchema.parse(JSON.parse(rawRelevance));
    if (
      !relevance.isDocumentRelated ||
      relevance.category === "unsupported" ||
      relevance.reasonCode !== "related" ||
      relevance.confidence < MIN_RELEVANCE_CONFIDENCE
    ) {
      return rejectedResponse(relevance.reasonCode);
    }

    const answerCompletion = await client.chat.completions.create({
      model,
      temperature: 0.1,
      max_tokens: 900,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "grounded_document_answer",
          strict: true,
          schema: chatAnswerJsonSchema
        }
      },
      messages: [
        { role: "system", content: CHAT_ANSWER_INSTRUCTIONS },
        { role: "user", content }
      ]
    });
    const rawAnswer = answerCompletion.choices[0]?.message?.content;
    if (!rawAnswer) throw new Error("The model returned no document answer.");
    return NextResponse.json(chatAnswerSchema.parse(JSON.parse(rawAnswer)));
  } catch (error) {
    if (error instanceof RequestGuardError) return guardErrorResponse(error);
    if (error instanceof ChatRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof DocumentIngestionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof DocumentTokenError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      return NextResponse.json({ error: "The chat service did not respond in time. Please try again." }, { status: 504 });
    }
    if (error instanceof OpenAI.APIConnectionError) {
      return NextResponse.json({ error: "The server cannot reach the chat service. Please try again shortly." }, { status: 503 });
    }
    if (error instanceof z.ZodError) {
      console.error("Chat model response failed schema validation", error.issues.map(issue => issue.path.join(".")));
      return NextResponse.json({ error: "The chat service returned an invalid response. Please try again." }, { status: 502 });
    }
    console.error("Chat failed", error instanceof Error ? error.name : "UnknownError");
    const message = error instanceof Error && error.message.includes("JSON")
      ? "The chat response could not be validated. Please try again."
      : "We could not answer this document question. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

