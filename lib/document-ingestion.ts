import { createHash } from "node:crypto";
import pdf from "pdf-parse/lib/pdf-parse.js";

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_PAGES = 100;
export const MAX_IMAGE_PIXELS = 25_000_000;
export const MAX_IMAGE_DIMENSION = 10_000;

const MIN_READABLE_TEXT_CHARS = 40;
const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

type VerifiedFileType = "pdf" | "jpeg" | "png" | "webp";

export type IngestedDocument =
  | {
      kind: "text";
      mimeType: "application/pdf";
      fileName: string;
      fingerprint: string;
      text: string;
      pageCount: number;
    }
  | {
      kind: "pdf";
      mimeType: "application/pdf";
      fileName: string;
      fingerprint: string;
      dataUrl: string;
      pageCount: number;
    }
  | {
      kind: "image";
      mimeType: "image/jpeg" | "image/png" | "image/webp";
      fileName: string;
      fingerprint: string;
      dataUrl: string;
      width: number;
      height: number;
    };

export class DocumentIngestionError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "DocumentIngestionError";
  }
}

function safeFileName(name: string) {
  return name
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 150) || "document";
}

function startsWith(buffer: Buffer, signature: number[]) {
  return signature.every((byte, index) => buffer[index] === byte);
}

function detectFileType(buffer: Buffer): VerifiedFileType | null {
  const pdfHeaderOffset = buffer.subarray(0, 1024).indexOf("%PDF-");
  if (pdfHeaderOffset >= 0) return "pdf";
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function expectedFileType(mimeType: string): VerifiedFileType | null {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/jpeg") return "jpeg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return null;
}

function pngDimensions(buffer: Buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);

function jpegDimensions(buffer: Buffer) {
  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) return null;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return null;
    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (segmentLength < 7) return null;
      return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
    }
    offset += segmentLength;
  }
  return null;
}

function readUInt24LE(buffer: Buffer, offset: number) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function webpDimensions(buffer: Buffer) {
  if (buffer.length < 30) return null;
  const chunkType = buffer.toString("ascii", 12, 16);
  if (chunkType === "VP8X") {
    return { width: readUInt24LE(buffer, 24) + 1, height: readUInt24LE(buffer, 27) + 1 };
  }
  if (chunkType === "VP8 " && buffer.length >= 30 && startsWith(buffer.subarray(23), [0x9d, 0x01, 0x2a])) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunkType === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    const b1 = buffer[21];
    const b2 = buffer[22];
    const b3 = buffer[23];
    const b4 = buffer[24];
    return {
      width: 1 + (((b2 & 0x3f) << 8) | b1),
      height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6))
    };
  }
  return null;
}

function validateImageDimensions(type: Exclude<VerifiedFileType, "pdf">, buffer: Buffer) {
  const hasValidContainerBoundary =
    type === "png" ? buffer.indexOf(Buffer.from("IEND"), 24) >= 0 :
    type === "jpeg" ? buffer.lastIndexOf(Buffer.from([0xff, 0xd9])) >= 2 :
    buffer.length >= 16 && buffer.readUInt32LE(4) + 8 <= buffer.length;

  if (!hasValidContainerBoundary) {
    throw new DocumentIngestionError("The image is truncated or corrupted.", 422);
  }

  const dimensions =
    type === "png" ? pngDimensions(buffer) :
    type === "jpeg" ? jpegDimensions(buffer) :
    webpDimensions(buffer);

  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new DocumentIngestionError("The image is corrupted or uses an unsupported encoding.", 422);
  }
  if (
    dimensions.width > MAX_IMAGE_DIMENSION ||
    dimensions.height > MAX_IMAGE_DIMENSION ||
    dimensions.width * dimensions.height > MAX_IMAGE_PIXELS
  ) {
    throw new DocumentIngestionError(
      "The image dimensions are too large. Use an image no larger than 25 megapixels or 10,000 pixels on either side.",
      422
    );
  }
  return dimensions;
}

async function renderPdfPage(pageData: {
  pageIndex?: number;
  getTextContent(options?: Record<string, unknown>): Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }>;
}) {
  const content = await pageData.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
  let pageText = "";
  for (const item of content.items) {
    if (!item.str) continue;
    pageText += `${item.str}${item.hasEOL ? "\n" : " "}`;
  }
  const pageNumber = typeof pageData.pageIndex === "number" ? pageData.pageIndex + 1 : 1;
  return `[Page ${pageNumber}]\n${pageText.trim()}`;
}

function fingerprint(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function ingestDocument(file: FormDataEntryValue | null): Promise<IngestedDocument> {
  if (!(file instanceof File)) {
    throw new DocumentIngestionError("Upload a PDF, JPG, PNG, or WebP file.", 400);
  }
  if (!SUPPORTED_MIME_TYPES.has(file.type)) {
    throw new DocumentIngestionError("Upload a PDF, JPG, PNG, or WebP file.", 415);
  }
  if (file.size === 0) {
    throw new DocumentIngestionError("The uploaded file is empty.", 400);
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new DocumentIngestionError("The uploaded file exceeds the 15 MB limit.", 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detectedType = detectFileType(buffer);
  const declaredType = expectedFileType(file.type);
  if (!detectedType || detectedType !== declaredType) {
    throw new DocumentIngestionError("The file contents do not match the selected file type.", 415);
  }

  const common = {
    fileName: safeFileName(file.name),
    fingerprint: fingerprint(buffer)
  };

  if (detectedType === "pdf") {
    try {
      const data = await pdf(buffer, { pagerender: renderPdfPage });
      if (data.numpages < 1 || data.numpages > MAX_PDF_PAGES) {
        throw new DocumentIngestionError(`PDFs must contain between 1 and ${MAX_PDF_PAGES} pages.`, 422);
      }
      const text = data.text
        .replace(/[ \t]+/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (text.replace(/\[Page \d+\]/g, "").trim().length < MIN_READABLE_TEXT_CHARS) {
        return {
          kind: "pdf",
          mimeType: "application/pdf",
          ...common,
          dataUrl: `data:application/pdf;base64,${buffer.toString("base64")}`,
          pageCount: data.numpages
        };
      }
      return {
        kind: "text",
        mimeType: "application/pdf",
        ...common,
        text,
        pageCount: data.numpages
      };
    } catch (error) {
      if (error instanceof DocumentIngestionError) throw error;
      throw new DocumentIngestionError("The PDF is corrupted, encrypted, or could not be read.", 422);
    }
  }

  const dimensions = validateImageDimensions(detectedType, buffer);
  const mimeType = file.type as "image/jpeg" | "image/png" | "image/webp";
  return {
    kind: "image",
    mimeType,
    ...common,
    dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
    ...dimensions
  };
}
