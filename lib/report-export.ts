import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Analysis } from "@/lib/schema";

const FALLBACK = "Not specified in the document.";

type ReportItem = { label: string; detail?: string };
type ReportSection = { title: string; items: ReportItem[] };

function text(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || FALLBACK;
}

function reportSections(analysis: Analysis): ReportSection[] {
  return [
    { title: "Key points", items: analysis.importantPoints.map(item => ({ label: text(item.title), detail: text(item.reason) })) },
    { title: "Points in your favor", items: analysis.pros.map(item => ({ label: text(item.title), detail: text(item.reason) })) },
    { title: "Potential drawbacks", items: analysis.cons.map(item => ({ label: text(item.title), detail: text(item.reason) })) },
    { title: "Pain points", items: analysis.painPoints.map(item => ({ label: text(item.title), detail: text(item.reason) })) },
    {
      title: "Risk areas",
      items: analysis.riskAreas.map(item => ({
        label: `${text(item.title)} (${item.severity} severity)`,
        detail: `${text(item.reason)} Suggested next step: ${text(item.recommendation)}`
      }))
    },
    {
      title: "Information to clarify",
      items: analysis.missingInformation.map(item => ({ label: text(item.field), detail: text(item.whyImportant) }))
    },
    { title: "Questions to ask the policy provider", items: analysis.questionsToAsk.map(item => ({ label: text(item) })) },
    { title: "Suggested actions", items: analysis.actionItems.map(item => ({ label: text(item) })) }
  ];
}

export function reportBaseName(fileName?: string) {
  const source = (fileName || "document").replace(/\.[^.]+$/, "");
  const safe = source
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/[ _]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return `clarity-analysis-${safe || "document"}`;
}

function pdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\x7E]/g, "?");
}

function wrap(value: string, font: PDFFont, size: number, maxWidth: number) {
  const words = pdfText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [FALLBACK];
}

export async function generatePdfReport(analysis: Analysis, fileName?: string) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 72;
  const contentWidth = pageWidth - margin * 2;
  let page: PDFPage;
  let y: number;

  const addPage = () => {
    page = document.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };
  const ensure = (height: number) => {
    if (y - height < margin) addPage();
  };
  const drawLines = (value: string, options?: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; gap?: number }) => {
    const font = options?.font || regular;
    const size = options?.size || 10.5;
    const indent = options?.indent || 0;
    const lineHeight = size * 1.35;
    const lines = wrap(value, font, size, contentWidth - indent);
    ensure(lines.length * lineHeight + (options?.gap || 0));
    for (const line of lines) {
      page.drawText(line, { x: margin + indent, y, size, font, color: options?.color || rgb(0.16, 0.2, 0.19) });
      y -= lineHeight;
    }
    y -= options?.gap || 0;
  };
  const heading = (value: string) => {
    ensure(34);
    y -= 8;
    drawLines(value, { font: bold, size: 13, color: rgb(0.16, 0.35, 0.3), gap: 7 });
  };
  const item = ({ label, detail }: ReportItem) => {
    ensure(34);
    page.drawCircle({ x: margin + 3, y: y + 3, size: 1.8, color: rgb(0.83, 0.37, 0.21) });
    drawLines(label, { font: bold, size: 10.5, indent: 13, gap: detail ? 2 : 6 });
    if (detail) drawLines(detail, { size: 9.5, color: rgb(0.36, 0.41, 0.39), indent: 13, gap: 7 });
  };

  addPage();
  drawLines("CLARITY ANALYSIS REPORT", { font: bold, size: 17, color: rgb(0.09, 0.25, 0.21), gap: 7 });
  drawLines(fileName || "Uploaded document", { size: 10, color: rgb(0.4, 0.44, 0.42), gap: 20 });
  drawLines(`${analysis.documentType}  |  ${analysis.confidence}% confidence  |  ${analysis.riskScore}/100 ${analysis.riskLevel} risk`, { font: bold, size: 10, color: rgb(0.16, 0.35, 0.3), gap: 12 });
  drawLines(text(analysis.documentPurpose), { font: bold, size: 14, gap: 7 });
  drawLines(text(analysis.summary), { size: 10.5, color: rgb(0.32, 0.38, 0.35), gap: 10 });

  for (const section of reportSections(analysis)) {
    heading(section.title);
    if (section.items.length) section.items.forEach(item);
    else drawLines("No findings identified.", { size: 9.5, color: rgb(0.46, 0.51, 0.49), gap: 7 });
  }

  const pages = document.getPages();
  pages.forEach((currentPage, index) => {
    const label = `Clarity  |  Page ${index + 1} of ${pages.length}`;
    currentPage.drawText(label, { x: margin, y: 36, size: 8, font: regular, color: rgb(0.42, 0.46, 0.44) });
  });
  document.setTitle(`Clarity analysis - ${fileName || "document"}`);
  document.setAuthor("Clarity");
  document.setSubject("Document analysis report");
  return document.save();
}
