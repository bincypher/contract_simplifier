declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfData { text: string; numpages: number; }
  interface PdfPageData {
    pageIndex?: number;
    getTextContent(options?: Record<string, unknown>): Promise<{
      items: Array<{ str?: string; hasEOL?: boolean }>;
    }>;
  }
  interface PdfOptions {
    pagerender?: (pageData: PdfPageData) => Promise<string>;
  }
  function pdf(dataBuffer: Buffer, options?: PdfOptions): Promise<PdfData>;
  export default pdf;
}
