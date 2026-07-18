type SuggestionAnalysis = {
  riskAreas: readonly unknown[];
  importantPoints: readonly unknown[];
  actionItems: readonly unknown[];
};

function cleanQuestion(question: string) {
  return question.replace(/\s+/g, " ").trim();
}

export function questionComparisonKey(question: string) {
  return cleanQuestion(question)
    .toLocaleLowerCase()
    .replace(/[.!?]+$/, "");
}

export function mergeProviderQuestions(
  current: readonly string[],
  incoming: readonly (string | null | undefined)[]
) {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const candidate of [...current, ...incoming]) {
    if (typeof candidate !== "string") continue;
    const question = cleanQuestion(candidate);
    const key = questionComparisonKey(question);
    if (question.length < 2 || !key || seen.has(key)) continue;
    seen.add(key);
    merged.push(question);
  }

  return merged;
}

export function addProviderQuestion(current: readonly string[], question: string) {
  return mergeProviderQuestions(current, [question]);
}

export function buildAnswerableChatSuggestions(analysis: SuggestionAnalysis) {
  const suggestions = ["Why did the analysis assign this risk score?"];

  if (analysis.riskAreas.length > 0) {
    suggestions.push("Explain the most important risk area identified in the analysis.");
  }
  if (analysis.importantPoints.length > 0) {
    suggestions.push("Summarize the most important points identified in the analysis.");
  }
  if (analysis.actionItems.length > 0) {
    suggestions.push("Explain the suggested actions in the analysis.");
  }

  if (suggestions.length < 3) {
    suggestions.push("What is the main purpose of this document?");
  }

  return suggestions.slice(0, 3);
}

export function availableChatSuggestions(
  suggestions: readonly string[],
  usedSuggestionKeys: readonly string[]
) {
  const used = new Set(usedSuggestionKeys);
  return suggestions.filter(suggestion => !used.has(questionComparisonKey(suggestion)));
}

export function markMatchingSuggestionUsed(
  usedSuggestionKeys: readonly string[],
  askedQuestion: string,
  suggestions: readonly string[]
) {
  const askedKey = questionComparisonKey(askedQuestion);
  const matchesSuggestion = suggestions.some(
    suggestion => questionComparisonKey(suggestion) === askedKey
  );
  if (!matchesSuggestion || usedSuggestionKeys.includes(askedKey)) {
    return [...usedSuggestionKeys];
  }
  return [...usedSuggestionKeys, askedKey];
}
