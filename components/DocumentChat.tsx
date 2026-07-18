"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState
} from "react";
import type { ChatAnswer } from "@/lib/chat-guardrails";
import type { Analysis } from "@/lib/schema";
import {
  availableChatSuggestions,
  buildAnswerableChatSuggestions,
  markMatchingSuggestionUsed
} from "@/lib/chat-behavior";

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  state?: "answered" | "not_found" | "clarification" | "rejected" | "error";
  evidence?: ChatAnswer["evidence"];
  confidence?: number;
  gapReason?: string | null;
  providerQuestion?: string | null;
};

type RejectedResponse = {
  status: "rejected";
  message: string;
  reasonCode: string;
};

type ClarificationResponse = { status: "clarification"; message: string };

type ErrorResponse = { error?: string };

type DocumentChatProps = {
  file: File;
  documentToken: string;
  documentTokenExpiresAt: string;
  documentType: string;
  analysis: Analysis;
  onProviderQuestion: (question: string) => void;
};

function createMessageId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function isRejectedResponse(value: unknown): value is RejectedResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RejectedResponse>;
  return candidate.status === "rejected" && typeof candidate.message === "string";
}

function isClarificationResponse(value: unknown): value is ClarificationResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ClarificationResponse>;
  return candidate.status === "clarification" && typeof candidate.message === "string";
}

function isChatAnswer(value: unknown): value is ChatAnswer {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ChatAnswer>;
  return (
    (candidate.status === "answered" || candidate.status === "not_found") &&
    typeof candidate.answer === "string" &&
    Array.isArray(candidate.evidence) &&
    Array.isArray(candidate.followUpQuestions) &&
    (candidate.gapReason === null || typeof candidate.gapReason === "string") &&
    (candidate.providerQuestion === null || typeof candidate.providerQuestion === "string")
  );
}

export function DocumentChat({
  file,
  documentToken,
  documentTokenExpiresAt,
  documentType,
  analysis,
  onProviderQuestion
}: DocumentChatProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [usedSuggestionKeys, setUsedSuggestionKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const activeRequest = useRef<AbortController | null>(null);

  const suggestions = buildAnswerableChatSuggestions(analysis);
  const remainingSuggestions = availableChatSuggestions(suggestions, usedSuggestionKeys);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, loading]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  const addAssistantError = (content: string) => {
    setMessages(current => [
      ...current,
      { id: createMessageId(), role: "assistant", content, state: "error" }
    ]);
  };

  const askQuestion = async (requestedQuestion: string) => {
    const trimmedQuestion = requestedQuestion.replace(/\s+/g, " ").trim();
    if (loading || activeRequest.current || trimmedQuestion.length < 2 || trimmedQuestion.length > 500) return;
    if (new Date(documentTokenExpiresAt).getTime() <= Date.now()) {
      addAssistantError("This document session has expired. Analyze the document again to continue.");
      return;
    }

    const history = messages
      .filter(message => message.state !== "error")
      .slice(-6)
      .map(message => ({
        role: message.role,
        content: message.content.slice(0, 800)
      }));
    const userMessage: DisplayMessage = {
      id: createMessageId(),
      role: "user",
      content: trimmedQuestion
    };
    setMessages(current => [...current, userMessage]);
    setQuestion("");
    setLoading(true);

    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 90_000);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("documentToken", documentToken);
      form.append("question", trimmedQuestion);
      form.append("history", JSON.stringify(history));
      form.append("analysis", JSON.stringify(analysis));

      const response = await fetch("/api/chat", {
        method: "POST",
        body: form,
        signal: controller.signal
      });
      const responseText = await response.text();
      let body: unknown;
      try {
        body = JSON.parse(responseText);
      } catch {
        throw new Error(`The chat service returned an unexpected response (${response.status}).`);
      }

      if (!response.ok) {
        const errorBody = body as ErrorResponse;
        throw new Error(errorBody.error || "The document question could not be answered.");
      }

      if (isRejectedResponse(body)) {
        setMessages(current => [
          ...current,
          {
            id: createMessageId(),
            role: "assistant",
            content: body.message,
            state: "rejected"
          }
        ]);
        return;
      }
      if (isClarificationResponse(body)) {
        setMessages(current => [
          ...current,
          { id: createMessageId(), role: "assistant", content: body.message, state: "clarification" }
        ]);
        return;
      }
      if (!isChatAnswer(body)) {
        throw new Error("The chat service returned an invalid answer.");
      }
      if (body.status === "not_found" && body.providerQuestion) {
        onProviderQuestion(body.providerQuestion);
      }
      setUsedSuggestionKeys(current =>
        markMatchingSuggestionUsed(current, trimmedQuestion, suggestions)
      );

      setMessages(current => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          content: body.answer,
          state: body.status,
          evidence: body.evidence,
          confidence: body.confidence,
          gapReason: body.gapReason,
          providerQuestion: body.providerQuestion
        }
      ]);
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "The document question timed out. Please try again."
          : error instanceof Error
            ? error.message
            : "The document question could not be answered.";
      addAssistantError(message);
    } finally {
      window.clearTimeout(timeout);
      activeRequest.current = null;
      setLoading(false);
    }
  };

  const submitQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void askQuestion(question);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!loading && question.trim().length >= 2) void askQuestion(question);
    }
  };

  return (
    <section className="document-chat" aria-labelledby="document-chat-title">
      <div className="chat-header">
        <div>
          <p className="eyebrow">GROUNDED DOCUMENT Q&amp;A</p>
          <h2 id="document-chat-title">Ask Clarity about this document.</h2>
          <p>
            Ask about <strong>{file.name}</strong> or any finding in its generated analysis.
          </p>
        </div>
        <div className="chat-status">
          <span><i /> Guardrails active</span>
          <small>{documentType}</small>
        </div>
      </div>

      <div className="chat-shell">
        <div className="chat-messages" role="log" aria-live="polite" aria-busy={loading} aria-label="Document conversation">
          {messages.length === 0 && (
            <div className="chat-welcome">
              <span>✦</span>
              <h3>Ask about the document or its analysis</h3>
              <p>I can explain the risk score, findings, action items, and document terms. If a question is unclear, I will ask what you mean.</p>
              <div className="chat-suggestions">
                {suggestions.map(suggestion => (
                  <button
                    type="button"
                    key={suggestion}
                    onClick={() => void askQuestion(suggestion)}
                    disabled={loading}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(message => (
            <article
              className={`chat-message ${message.role} ${message.state || ""}`}
              key={message.id}
            >
              <div className="message-label">
                <span>{message.role === "user" ? "You" : "Clarity"}</span>
                {message.state === "rejected" && <b>Outside document scope</b>}
                {message.state === "clarification" && <b>Clarification needed</b>}
                {message.state === "not_found" && <b>Policy clarification needed</b>}
                {message.state === "error" && <b>Could not complete</b>}
                {message.state === "answered" && message.confidence !== undefined && (
                  <b>{message.confidence}% grounded confidence</b>
                )}
              </div>
              <p className="message-content">{message.content}</p>

              {message.state === "not_found" && message.gapReason && message.providerQuestion && (
                <div className="chat-gap">
                  <div>
                    <strong>Why this matters</strong>
                    <p>{message.gapReason}</p>
                  </div>
                  <aside>
                    <strong>Added to questions for the policy provider</strong>
                    <p>{message.providerQuestion}</p>
                  </aside>
                </div>
              )}

              {!!message.evidence?.length && (
                <div className="chat-evidence">
                  <strong>Document evidence</strong>
                  {message.evidence.map((evidence, index) => (
                    <blockquote key={`${message.id}-evidence-${index}`}>
                      <span>{evidence.page ? `Page ${evidence.page}` : "Document"}</span>
                      {evidence.excerpt}
                    </blockquote>
                  ))}
                </div>
              )}

            </article>
          ))}

          {!loading && messages.length > 0 && remainingSuggestions.length > 0 && (
            <div className="chat-followups" aria-label="Suggested follow-up questions">
              {remainingSuggestions.map(suggestion => (
                <button
                  type="button"
                  key={suggestion}
                  onClick={() => void askQuestion(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {!loading && messages.length > 0 && remainingSuggestions.length === 0 && (
            <p className="chat-suggestions-note">
              You can ask anything else about the document or its analysis.
            </p>
          )}

          {loading && (
            <div className="chat-thinking" aria-label="Clarity is checking the document">
              <span className="spinner" /> Checking the document and its evidence…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form className="chat-composer" onSubmit={submitQuestion}>
          <label htmlFor="document-question">Ask about this document or its analysis</label>
          <textarea
            id="document-question"
            value={question}
            maxLength={500}
            rows={3}
            placeholder="For example: Why did this analysis assign a high risk score?"
            onChange={event => setQuestion(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-describedby="document-question-help"
            disabled={loading}
          />
          <div className="chat-composer-actions">
            <span id="document-question-help">{question.length}/500 · Enter to send · Shift+Enter for a new line</span>
            {messages.length > 0 && (
              <button
                type="button"
                className="chat-clear"
                onClick={() => {
                  setMessages([]);
                  setUsedSuggestionKeys([]);
                }}
                disabled={loading}
              >
                Clear chat
              </button>
            )}
            <button
              type="submit"
              className="chat-send"
              disabled={loading || question.trim().length < 2}
            >
              {loading ? "Checking…" : "Ask Clarity →"}
            </button>
          </div>
        </form>
      </div>
      <p className="chat-disclaimer">
        Clarity explains the uploaded document and its generated analysis but does not provide legal advice. Verify important decisions with a qualified professional.
      </p>
    </section>
  );
}
