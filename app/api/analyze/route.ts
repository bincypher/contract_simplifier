import OpenAI from "openai";
import pdf from "pdf-parse/lib/pdf-parse.js";
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
import { z } from "zod";

export const runtime = "nodejs";
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_CHARS = 120_000;
const MAX_CLASSIFICATION_CHARS = 40_000;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.type !== "application/pdf") return NextResponse.json({ error: "Upload a PDF file." }, { status: 400 });
    if (file.size === 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "PDF must be between 1 byte and 15 MB." }, { status: 400 });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Server is missing OPENAI_API_KEY." }, { status: 500 });

    const data = await pdf(Buffer.from(await file.arrayBuffer()));
    const extractedText = data.text.replace(/\s+/g, " ").trim();
    if (extractedText.length < 40) return NextResponse.json({ error: "No readable text was found. This may be a scanned PDF; OCR is required." }, { status: 422 });

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
        { role: "user", content: extractedText.slice(0, MAX_CLASSIFICATION_CHARS) }
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
      messages: [{ role: "system", content: ANALYSIS_INSTRUCTIONS }, { role: "user", content: extractedText.slice(0, MAX_CHARS) }]
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("The model returned no analysis.");
    const analysis = analysisSchema.parse(JSON.parse(raw));
    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Analysis failed", error);
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      return NextResponse.json({ error: "The analysis service did not respond in time. Please try again shortly." }, { status: 504 });
    }
    if (error instanceof OpenAI.APIConnectionError) {
      return NextResponse.json({ error: "The server cannot reach the analysis service. Verify outbound access to api.openai.com and try again." }, { status: 503 });
    }
    if (error instanceof z.ZodError) {
      console.error("Model response did not match the analysis schema", error.issues);
      return NextResponse.json({ error: "The analysis service returned an invalid response. Please try again." }, { status: 502 });
    }
    const message = error instanceof Error && error.message.includes("JSON") ? "Analysis could not be validated. Please try again." : "We could not analyze this document. Please try a different PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
