const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const workspaceRoot = path.resolve(__dirname, "..");

function loadTypeScript(relativePath, mocks = {}) {
  const filename = path.join(workspaceRoot, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filename
  }).outputText;
  const loadedModule = new Module(filename, module);
  loadedModule.filename = filename;
  loadedModule.paths = Module._nodeModulePaths(path.dirname(filename));
  const defaultRequire = loadedModule.require.bind(loadedModule);
  loadedModule.require = request =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : defaultRequire(request);
  loadedModule._compile(output, filename);
  return loadedModule.exports;
}

const behavior = loadTypeScript("lib/chat-behavior.ts");
const documentTypes = loadTypeScript("lib/document-types.ts");
const schema = loadTypeScript("lib/schema.ts", {
  "@/lib/document-types": documentTypes
});
const guardrails = loadTypeScript("lib/chat-guardrails.ts", {
  "@/lib/schema": schema
});

test("provider questions are cleaned and deduplicated case-insensitively", () => {
  const questions = behavior.mergeProviderQuestions(
    ["Which third parties receive my data?"],
    [
      "  which   third parties receive my data  ",
      "Which third parties receive my data?",
      "How long is my data retained?"
    ]
  );

  assert.deepEqual(questions, [
    "Which third parties receive my data?",
    "How long is my data retained?"
  ]);
});

test("a missing chat answer is appended immediately without duplicating existing questions", () => {
  const initial = ["Who is the policy provider?"];
  const updated = behavior.addProviderQuestion(
    initial,
    "What safeguards protect international transfers?"
  );
  const duplicateAttempt = behavior.addProviderQuestion(
    updated,
    "what safeguards protect international transfers"
  );

  assert.equal(updated.length, 2);
  assert.deepEqual(duplicateAttempt, updated);
});

test("starting a new document creates a fresh provider-question list", () => {
  const previousDocument = ["What is the retention period?"];
  const nextDocument = behavior.mergeProviderQuestions([], [
    "Who can terminate this agreement?",
    "Who can terminate this agreement?"
  ]);

  assert.deepEqual(previousDocument, ["What is the retention period?"]);
  assert.deepEqual(nextDocument, ["Who can terminate this agreement?"]);
});

test("chat suggestions come only from answerable analysis sections", () => {
  const suggestions = behavior.buildAnswerableChatSuggestions({
    riskAreas: [{}],
    importantPoints: [{}],
    actionItems: [{}]
  });

  assert.deepEqual(suggestions, [
    "Why did the analysis assign this risk score?",
    "Explain the most important risk area identified in the analysis.",
    "Summarize the most important points identified in the analysis."
  ]);
  assert.equal(suggestions.some(question => /provider|third parties|safeguards/i.test(question)), false);
});

test("used suggestions never reappear as successive suggestions are asked", () => {
  const suggestions = [
    "Why did the analysis assign this risk score?",
    "Explain the most important risk area identified in the analysis.",
    "Summarize the most important points identified in the analysis."
  ];
  let used = [];

  used = behavior.markMatchingSuggestionUsed(used, suggestions[0], suggestions);
  assert.deepEqual(
    behavior.availableChatSuggestions(suggestions, used),
    suggestions.slice(1)
  );

  used = behavior.markMatchingSuggestionUsed(used, suggestions[1], suggestions);
  assert.deepEqual(
    behavior.availableChatSuggestions(suggestions, used),
    suggestions.slice(2)
  );

  used = behavior.markMatchingSuggestionUsed(used, suggestions[2], suggestions);
  assert.deepEqual(behavior.availableChatSuggestions(suggestions, used), []);
});

test("typing a suggestion manually consumes it after normalized comparison", () => {
  const suggestions = ["Why did the analysis assign this risk score?"];
  const used = behavior.markMatchingSuggestionUsed(
    [],
    "  WHY did the analysis   assign this risk score. ",
    suggestions
  );

  assert.deepEqual(behavior.availableChatSuggestions(suggestions, used), []);
});

test("failed requests remain retryable and clearing restores every suggestion", () => {
  const suggestions = [
    "Why did the analysis assign this risk score?",
    "Explain the suggested actions in the analysis."
  ];
  const usedBeforeFailedRequest = [];

  assert.deepEqual(
    behavior.availableChatSuggestions(suggestions, usedBeforeFailedRequest),
    suggestions
  );

  const usedAfterSuccess = behavior.markMatchingSuggestionUsed(
    usedBeforeFailedRequest,
    suggestions[0],
    suggestions
  );
  assert.deepEqual(
    behavior.availableChatSuggestions(suggestions, usedAfterSuccess),
    [suggestions[1]]
  );
  assert.deepEqual(behavior.availableChatSuggestions(suggestions, []), suggestions);
});

test("answered chat responses require evidence and cannot create provider questions", () => {
  const valid = guardrails.chatAnswerSchema.safeParse({
    status: "answered",
    answer: "The policy permits international transfers.",
    evidence: [{ page: 2, excerpt: "We may transfer your information..." }],
    confidence: 85,
    followUpQuestions: [],
    gapReason: null,
    providerQuestion: null
  });
  const invalid = guardrails.chatAnswerSchema.safeParse({
    status: "answered",
    answer: "The policy permits international transfers.",
    evidence: [{ page: 2, excerpt: "We may transfer your information..." }],
    confidence: 85,
    followUpQuestions: [],
    gapReason: "This should not be present.",
    providerQuestion: "What safeguards are used?"
  });

  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});

test("model-generated follow-ups are rejected so only verified UI suggestions are shown", () => {
  const result = guardrails.chatAnswerSchema.safeParse({
    status: "answered",
    answer: "The policy permits international transfers.",
    evidence: [{ page: 2, excerpt: "We may transfer your information..." }],
    confidence: 85,
    followUpQuestions: ["What safeguards protect international transfers?"],
    gapReason: null,
    providerQuestion: null
  });

  assert.equal(result.success, false);
});

test("missing-information responses require a reason and provider question", () => {
  const valid = guardrails.chatAnswerSchema.safeParse({
    status: "not_found",
    answer: "The policy does not identify safeguards for international transfers, so the provider should clarify them.",
    evidence: [],
    confidence: 35,
    followUpQuestions: [],
    gapReason: "Without the safeguards, readers cannot understand how transferred data is protected.",
    providerQuestion: "What safeguards protect personal data during international transfers?"
  });
  const missingProviderQuestion = guardrails.chatAnswerSchema.safeParse({
    status: "not_found",
    answer: "The policy does not state this.",
    evidence: [],
    confidence: 35,
    followUpQuestions: [],
    gapReason: null,
    providerQuestion: null
  });
  const misleadingFollowUp = guardrails.chatAnswerSchema.safeParse({
    status: "not_found",
    answer: "The policy does not identify the safeguards.",
    evidence: [],
    confidence: 35,
    followUpQuestions: ["What safeguards protect international transfers?"],
    gapReason: "The protections cannot be evaluated.",
    providerQuestion: "What safeguards protect international transfers?"
  });

  assert.equal(valid.success, true);
  assert.equal(missingProviderQuestion.success, false);
  assert.equal(misleadingFollowUp.success, false);
});
