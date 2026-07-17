"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import type { AnalysisResponse } from "@/lib/schema";
import { DocumentChat } from "@/components/DocumentChat";

const valid = (value: string | null) => value || "Not specified in the document.";
const ACCEPTED_FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function Section({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) {
  return <section className="section"><div className="section-heading"><h2>{title}</h2>{count !== undefined && <span>{count}</span>}</div>{children}</section>;
}
function ItemList({ items, empty = "No actionable findings identified." }: { items: { title: string | null; reason: string | null }[]; empty?: string }) {
  if (!items.length) return <p className="empty">{empty}</p>;
  return <div className="item-list">{items.map((item, index) => <article className="item" key={`${item.title}-${index}`}><h3>{valid(item.title)}</h3><p>{valid(item.reason)}</p></article>)}</div>;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null); const [result, setResult] = useState<AnalysisResponse | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false); const input = useRef<HTMLInputElement>(null);
  const choose = (candidate?: File) => { setError(""); setResult(null); if (!candidate) return; if (!ACCEPTED_FILE_TYPES.has(candidate.type)) return setError("Please choose a PDF, JPG, PNG, or WebP document."); if (candidate.size > 15 * 1024 * 1024) return setError("This file exceeds the 15 MB limit."); setFile(candidate); };
  const upload = async () => { if (!file) return; setLoading(true); setError(""); const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 90_000); try { const form = new FormData(); form.append("file", file); const response = await fetch("/api/analyze", { method: "POST", body: form, signal: controller.signal }); const responseText = await response.text(); let body: AnalysisResponse | { error?: string }; try { body = JSON.parse(responseText); } catch { throw new Error(`The analysis service returned an unexpected response (${response.status}). Check the server terminal for the underlying error.`); } if (!response.ok) throw new Error("error" in body ? body.error || "Analysis failed." : "Analysis failed."); setResult(body as AnalysisResponse); } catch (e) { setError(e instanceof DOMException && e.name === "AbortError" ? "Analysis timed out after 90 seconds. Please try again shortly." : e instanceof Error ? e.message : "Analysis failed."); } finally { window.clearTimeout(timeout); setLoading(false); } };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); choose(event.dataTransfer.files[0]); };
  const a = result;
  return <main>
    <nav><a className="brand" href="#top"><i>✦</i> Clarity</a><span>AI DOCUMENT ANALYZER</span><a className="privacy" href="#privacy">Privacy first</a></nav>
    <header id="top"><p className="eyebrow">DOCUMENT INTELLIGENCE, MINUS THE JARGON</p><h1>See what your<br /><em>document</em> is really saying.</h1><p className="lede">Upload a policy, agreement, or contract for a concise, evidence-based review of its obligations, risks, and open questions.</p></header>
    <section className="upload-wrap"><div className={`dropzone ${file ? "selected" : ""}`} onDragOver={e => e.preventDefault()} onDrop={onDrop} onClick={() => input.current?.click()}><input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(e: ChangeEvent<HTMLInputElement>) => choose(e.target.files?.[0])} /><div className="file-icon">⌁</div><div><h2>{file ? file.name : "Drop your document here"}</h2><p>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Ready for analysis` : "or click to browse · PDF, JPG, PNG, or WebP · maximum 15 MB"}</p></div>{file && <button className="clear" onClick={e => { e.stopPropagation(); setFile(null); setResult(null); }}>×</button>}</div>
      <button className="analyze" disabled={!file || loading} onClick={upload}>{loading ? <><span className="spinner" /> Analyzing document</> : "Analyze document →"}</button>
      {error && <p className="error" role="alert">{error}</p>}<p className="disclaimer">Clarity explains what appears in your document. It does not provide legal advice.</p></section>
    {a && <div className="report" aria-live="polite"><div className="report-meta"><span>ANALYSIS COMPLETE</span><span>{file?.name}</span></div><section className="overview"><div><p className="eyebrow">{a.documentType} · {a.confidence}% CONFIDENCE</p><h2>{valid(a.documentPurpose)}</h2><p className="summary">{valid(a.summary)}</p></div><div className={`score ${a.riskLevel.toLowerCase()}`}><strong>{a.riskScore}</strong><span>/100</span><p>{a.riskLevel} risk</p></div></section>
      <div className="grid"><Section title="Key points" count={a.importantPoints.length}><ItemList items={a.importantPoints} /></Section><Section title="Points in your favor" count={a.pros.length}><ItemList items={a.pros} empty="No clear protections identified." /></Section></div>
      <Section title="Risk areas" count={a.riskAreas.length}>{a.riskAreas.length ? <div className="risk-list">{a.riskAreas.map((risk, index) => <article className="risk" key={`${risk.title}-${index}`}><div><span className={`badge ${risk.severity.toLowerCase()}`}>{risk.severity}</span><h3>{valid(risk.title)}</h3></div><p>{valid(risk.reason)}</p><aside><b>Suggested next step</b>{valid(risk.recommendation)}</aside></article>)}</div> : <p className="empty">No specific risk areas identified.</p>}</Section>
      <div className="grid"><Section title="Potential drawbacks" count={a.cons.length}><ItemList items={a.cons} /></Section><Section title="Information to clarify" count={a.missingInformation.length}>{a.missingInformation.length ? <div className="item-list">{a.missingInformation.map((item, index) => <article className="item" key={`${item.field}-${index}`}><h3>{valid(item.field)}</h3><p>{valid(item.whyImportant)}</p></article>)}</div> : <p className="empty">No missing information identified.</p>}</Section></div>
      <div className="grid"><Section title="Questions to ask" count={a.questionsToAsk.length}>{a.questionsToAsk.length ? <ol className="questions">{a.questionsToAsk.map((q, i) => <li key={i}>{valid(q)}</li>)}</ol> : <p className="empty">No questions generated.</p>}</Section><Section title="Suggested actions" count={a.actionItems.length}>{a.actionItems.length ? <ol className="questions">{a.actionItems.map((q, i) => <li key={i}>{valid(q)}</li>)}</ol> : <p className="empty">No actions generated.</p>}</Section></div>
    </div>}
    {a && file && <DocumentChat file={file} documentToken={a.documentToken} documentTokenExpiresAt={a.documentTokenExpiresAt} documentType={a.documentType} suggestedQuestions={a.questionsToAsk.filter((question): question is string => Boolean(question)).slice(0, 3)} />}
    <footer id="privacy"><span>✦ Clarity</span><p>Your uploaded file is used only to produce this analysis.</p></footer>
  </main>;
}
