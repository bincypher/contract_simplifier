import { NextResponse } from "next/server";
import { z } from "zod";
import { analysisSchema } from "@/lib/schema";
import { generatePdfReport, reportBaseName } from "@/lib/report-export";
import {
  RequestGuardError,
  enforceContentLength,
  enforceRateLimit,
  enforceSameOrigin
} from "@/lib/request-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  analysis: analysisSchema,
  fileName: z.string().trim().min(1).max(180).optional()
});

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    enforceContentLength(request, 250_000);
    enforceRateLimit(request, "report-export", 20, 10 * 60 * 1000);

    const payload = requestSchema.parse(await request.json());
    const bytes = await generatePdfReport(payload.analysis, payload.fileName);
    const responseBody = Uint8Array.from(bytes).buffer;

    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${reportBaseName(payload.fileName)}.pdf"`,
        "Cache-Control": "no-store"
      }
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
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "The report data is invalid." }, { status: 400 });
    }
    console.error("PDF report export failed:", error);
    return NextResponse.json({ error: "The PDF report could not be generated." }, { status: 500 });
  }
}
