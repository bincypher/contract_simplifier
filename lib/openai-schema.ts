const nullableText = { type: ["string", "null"] } as const;
const finding = {
  type: "object",
  additionalProperties: false,
  required: ["title", "reason"],
  properties: { title: nullableText, reason: nullableText }
} as const;

export const analysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["documentType", "confidence", "summary", "documentPurpose", "riskScore", "riskLevel", "pros", "cons", "riskAreas", "importantPoints", "painPoints", "missingInformation", "questionsToAsk", "actionItems"],
  properties: {
    documentType: { type: "string", enum: ["Insurance Policy", "Employment Contract", "Rental Agreement", "NDA", "Privacy Policy", "Terms & Conditions", "Loan Agreement", "Legal Notice", "Other"] },
    confidence: { type: "number", minimum: 0, maximum: 100 },
    summary: nullableText,
    documentPurpose: nullableText,
    riskScore: { type: "number", minimum: 0, maximum: 100 },
    riskLevel: { type: "string", enum: ["Low", "Medium", "High"] },
    pros: { type: "array", items: finding },
    cons: { type: "array", items: finding },
    riskAreas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "severity", "reason", "recommendation"],
        properties: { title: nullableText, severity: { type: "string", enum: ["Low", "Medium", "High"] }, reason: nullableText, recommendation: nullableText }
      }
    },
    importantPoints: { type: "array", items: finding },
    painPoints: { type: "array", items: finding },
    missingInformation: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "whyImportant"],
        properties: { field: nullableText, whyImportant: nullableText }
      }
    },
    questionsToAsk: { type: "array", items: { type: "string" } },
    actionItems: { type: "array", items: { type: "string" } }
  }
} as const;
