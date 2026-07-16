declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfData { text: string; numpages: number; }
  function pdf(dataBuffer: Buffer): Promise<PdfData>;
  export default pdf;
}
