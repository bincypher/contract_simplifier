import { z } from "zod";
const text = z.string().nullable();
const item = z.object({ title: text, reason: text });
export const analysisSchema = z.object({
  documentType: z.enum(["Insurance Policy", "Employment Contract", "Rental Agreement", "NDA", "Privacy Policy", "Terms & Conditions", "Loan Agreement", "Legal Notice", "Other"]), confidence: z.number().min(0).max(100), summary: text, documentPurpose: text,
  riskScore: z.number().min(0).max(100), riskLevel: z.enum(["Low", "Medium", "High"]), pros: z.array(item), cons: z.array(item),
  riskAreas: z.array(z.object({ title: text, severity: z.enum(["Low", "Medium", "High"]), reason: text, recommendation: text })), importantPoints: z.array(item), painPoints: z.array(item),
  missingInformation: z.array(z.object({ field: text, whyImportant: text })), questionsToAsk: z.array(text), actionItems: z.array(text)
});
export type Analysis = z.infer<typeof analysisSchema>;
