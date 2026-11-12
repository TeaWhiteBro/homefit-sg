"use client";

import { useEffect, useRef, useState } from "react";
import ComparisonDialog from "./ComparisonDialog";
import { DESTINATIONS, type Area, type DatasetMetadata, type RecommendationResult } from "@/lib/types";
import { MAX_MESSAGE_CHARS, type ConversationReply, type ConversationState, type ConversationTurn } from "@/lib/conversation";
import type { ContractReview } from "@/lib/contract-review";
import { formatSgd } from "@/lib/format";
import { describeDifference, RENT_VERDICT_LABELS, type RentCheck } from "@/lib/rent-check";
import { RISK_ITEMS, type RiskId } from "@/lib/risks";

interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  result?: RecommendationResult;
  panel?: ConversationReply["panel"];
  rentCheck?: RentCheck;
  risks?: RiskId[];
  contractReview?: ContractReview;
}

function RiskList({ ids }: { ids: RiskId[] }) {
  return <ul className="risk-list">
    {RISK_ITEMS.filter(item => ids.includes(item.id)).map(item => <li key={item.id}><strong>{item.title}</strong><span>{item.detail}</span></li>)}
  </ul>;
}

function RentCheckPanel({ check }: { check: RentCheck }) {
  return <div className="conversation-artifact rent-check">
    <details>
      <summary><span>Rent check</span><small>{check.areaName} {formatSgd(check.quotedSgd)}, {describeDifference(check)}</small></summary>
      <div className="artifact-content">
        <dl className="rent-check-rows">
          <div><dt>Price you saw</dt><dd>{formatSgd(check.quotedSgd)} / month</dd></div>
          <div><dt>{check.areaName} demo reference</dt><dd>{formatSgd(check.referenceSgd)} / month</dd></div>
          <div><dt>Result</dt><dd>{RENT_VERDICT_LABELS[check.verdict]} ({check.differencePct > 0 ? "+" : ""}{check.differencePct}%)</dd></div>
        </dl>
        <p className="artifact-context">The reference is a course demo estimate for rough comparison only, not market data. Real rents also depend on room size, floor level and whether utilities and Wi-Fi are included, so compare several listings in the same area.</p>
      </div>
    </details>
  </div>;
}
function ContractReviewPanel({ review }: { review: ContractReview }) {
  const flags = review.flags.length;
  return <div className="conversation-artifact contract-review">
    <details>
      <summary><span>Contract check</span><small>{review.foundCount} of {review.totalCount} key terms found{flags ? ` · ${flags} ${flags === 1 ? "phrase" : "phrases"} to ask about` : ""}</small></summary>
      <div className="artifact-content">
        <ul className="risk-list contract-terms">
          {review.terms.map(term => <li key={term.id} className={term.status}>
            <strong><span aria-hidden="true">{term.status === "found" ? "✓ " : "? "}</span>{term.title}<span className="sr-only">{term.status === "found" ? " (found)" : " (not found)"}</span></strong>
            <span>{term.status === "found" ? term.excerpt : term.ask}</span>
          </li>)}
        </ul>
        {flags ? <div className="artifact-risks"><h3>Phrases worth asking about</h3>
          <ul className="risk-list">{review.flags.map(flag => <li key={flag.id}><strong>{flag.title}</strong><span>“{flag.excerpt}” {flag.detail}</span></li>)}</ul>
        </div> : null}
        <p className="artifact-context">This is an automatic keyword checklist, not legal advice. It cannot tell whether a clause is fair or enforceable. Ask for anything unclear to be explained in writing before you sign.</p>
      </div>
    </details>
  </div>;
}
const CONTRACT_PROMPT = "Please review this tenancy agreement:\n\n";
const EXAMPLES = [
  { label: "New to Singapore", text: "I’m a new NUS student with a budget of around S$1,300. I’d like to live close to campus. Any suggestions?" },
  { label: "Balance rent and commute", text: "I work at Raffles Place and want a good balance between rent and commute." },
  { label: "Studying outside the city", text: "I’m starting at SIT in Punggol next month. Where could I live for about S$1,100?" },
];
const matches = (count: number) => `${count} ${count === 1 ? "match" : "matches"}`;
export default function ChatAdvisor({ areas, meta }: { areas: Area[]; meta: DatasetMetadata }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failedTurns, setFailedTurns] = useState<ConversationTurn[] | null>(null);
  const [state, setState] = useState<ConversationState | null>(null);
  const [selection, setSelection] = useState<{ result: RecommendationResult; ids: string[] } | null>(null);
  const [comparison, setComparison] = useState<{ result: RecommendationResult; ids: string[] } | null>(null);
  const request = useRef<AbortController | null>(null);
  const counter = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy, error]);
  useEffect(() => {
    if (textarea.current) {
      textarea.current.style.height = "auto";
      textarea.current.style.height = Math.min(180, textarea.current.scrollHeight) + "px";
    }
  }, [input]);

  async function run(turns: ConversationTurn[]) {
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(""); setFailedTurns(null);
    const timer = window.setTimeout(() => controller.abort(), 55000);
    try {
      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: turns }), signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || typeof data.reply !== "string" || !data.state)
        throw new Error(data.error || "The reply didn’t finish. Please try again.");
      if (request.current !== controller) return;
      const replyId = ++counter.current;
      setMessages(current => [...current, {
        id: replyId, role: "assistant", text: data.reply,
        panel: data.panel, result: data.result, rentCheck: data.rentCheck, risks: data.risks, contractReview: data.contractReview,
      }]);
      setState(data.state);
      setSelection(null);
    } catch (failure) {
      if (request.current !== controller) return;
      setError(controller.signal.aborted ? "This reply was stopped. You can retry, or rephrase and continue." :
        failure instanceof Error ? failure.message : "Connection failed. Please try again.");
      setFailedTurns(turns);
    } finally {
      window.clearTimeout(timer);
      if (request.current === controller) { setBusy(false); request.current = null; }
    }
  }
  function send(text = input) {
    const value = text.trim();
    if (!value || busy) return;
    const history = messages.map(message => ({ role: message.role, content: message.text }));
    if (history.length >= 39) { setError("This conversation is getting long. Start a new chat to continue; this one stays on the page."); return; }
    setInput("");
    const nextId = ++counter.current;
    setMessages(current => [...current, { id: nextId, role: "user", text: value }]);
    void run([...history, { role: "user", content: value }]);
  }
  function reset() {
    request.current?.abort(); request.current = null;
    setMessages([]); setState(null); setInput(""); setError("");
    setFailedTurns(null); setBusy(false); setSelection(null); setComparison(null);
    textarea.current?.focus();
  }
  function toggle(result: RecommendationResult, id: string) {
    setSelection(current => {
      const ids = current?.result === result ? current.ids : [];
      return { result, ids: ids.includes(id) ? ids.filter(item => item !== id) : ids.length < 3 ? [...ids, id] : ids };
    });
  }
  const confirmed = state?.confirmed ?? [];
  const lastAssistant = messages.filter(message => message.role === "assistant").at(-1)?.id;

  return <div className="conversation-app">
    <header className="conversation-header">
      <a className="conversation-brand" href="/" aria-label="HomeFit SG home">
        <svg width="25" height="25" viewBox="0 0 32 32" aria-hidden="true"><path d="M5 27V11L16 5l11 6v16M11 27V17h10v10M5 11l11 6 11-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
        <span>HomeFit SG <span className="brand-sub">Singapore rental advisor</span></span>
      </a>
      <div className="conversation-tools">
        {state && confirmed.length ? <details className="context-disclosure">
          <summary>Your needs so far</summary>
          <div className="context-popover">
            <strong>What you’ve told me</strong>
            {confirmed.includes("destination") ? <p>Destination: {state.preferences.destination}</p> : null}
            {confirmed.includes("monthlyBudgetSgd") ? <p>Budget: {formatSgd(state.preferences.monthlyBudgetSgd)} / month</p> : null}
            {confirmed.includes("maxCommuteMinutes") ? <p>Max commute: {state.preferences.maxCommuteMinutes} min</p> : null}
            {confirmed.includes("roomType") ? <p>Room type: common room</p> : null}
            <small>To change anything, just tell me. Nothing counts as your requirement until you confirm it.</small>
          </div>
        </details> : null}
        <button type="button" className="new-conversation" onClick={reset}>New chat <span aria-hidden="true">↗</span></button>
      </div>
    </header>

    <main className={"conversation-main " + (messages.length ? "has-conversation" : "")}>
      {!messages.length ? <section className="conversation-welcome" aria-label="Start a rental conversation">
        <div className="welcome-symbol" aria-hidden="true">⌂</div>
        <h1>Find a place in Singapore that fits your life.</h1>
        <p>Start from your daily routine and we’ll work out where to live together.<br />No fixed budget yet, or new to the island? That’s fine.</p>
        <div className="conversation-examples">
          {EXAMPLES.map(example => <button key={example.text} type="button" onClick={() => send(example.text)}>
            <span>{example.label}</span>
            <small>{example.text}</small><span className="example-arrow" aria-hidden="true">↗</span>
          </button>)}
        </div>
      </section> : <section className="conversation-thread" aria-label="Rental conversation">
        <h1 className="sr-only">Rental conversation</h1>
        {messages.map(message => <article key={message.id} className={"conversation-message " + message.role} aria-label={message.role === "user" ? "You" : "Rental advisor"}>
          {message.role === "assistant" ? <span className="assistant-signature" aria-hidden="true">⌂</span> : null}
          <div className="conversation-message-content">
            <div className="conversation-prose">{message.text}</div>
            {message.rentCheck ? <RentCheckPanel check={message.rentCheck} /> : null}
            {message.contractReview ? <ContractReviewPanel review={message.contractReview} /> : null}
            {message.result && message.panel !== "none" ? <div className="conversation-artifact">
              <details>
                <summary><span>{message.panel === "comparison" ? "Open area comparison" : "See recommended areas"}</span><small>{matches(message.result.matchesCount)} · demo estimates</small><span aria-hidden="true">↗</span></summary>
                <div className="artifact-content">
                  <p className="artifact-context">Conditions for this reply: {message.result.preferences.destination} · {formatSgd(message.result.preferences.monthlyBudgetSgd)}/month · ≤ {message.result.preferences.maxCommuteMinutes} min.{message.result.matchesCount > message.result.candidates.length ? ` Showing the top ${message.result.candidates.length} of ${matches(message.result.matchesCount)}.` : ""} Prices and commute times are unverified demo estimates.</p>
                  {message.id !== lastAssistant ? <p className="artifact-context">This is an earlier snapshot; your conditions may have changed since.</p> : null}
                  {message.result.matchesCount ? message.result.candidates.map(({ area }) => <div key={area.area_id} className="conversation-area">
                    <div><strong>{area.name}</strong><p>{formatSgd(area.monthly_rent_sgd)}/month · about {area.commute_minutes} min</p><small>{area.tradeoff}</small></div>
                    <label><input type="checkbox"
                      checked={selection !== null && selection.result === message.result && selection.ids.includes(area.area_id)}
                      disabled={selection !== null && selection.result === message.result && selection.ids.length >= 3 && !selection.ids.includes(area.area_id)}
                      onChange={() => toggle(message.result!, area.area_id)} /> Compare</label>
                  </div>) : <p>No area meets both your budget and your commute limit yet. Let’s talk about which one has more room to move.</p>}
                  <div className="artifact-actions">
                    <button type="button" disabled={selection?.result !== message.result || selection.ids.length < 2}
                      onClick={() => selection && setComparison(selection)}>Compare selected areas</button>
                    <button type="button" disabled={busy} onClick={() => send("Please compare these areas in detail: budget, commute and lifestyle trade-offs.")}>Talk me through these</button>
                  </div>
                  {message.risks?.length ? <div className="artifact-risks"><h3>Worth checking before you sign</h3><RiskList ids={message.risks} /></div> : null}
                </div>
              </details>
            </div> : message.risks?.length ? <div className="conversation-artifact">
              <details>
                <summary><span>Things to check before renting</span><small>{message.risks.length} {message.risks.length === 1 ? "reminder" : "reminders"}</small></summary>
                <div className="artifact-content"><RiskList ids={message.risks} /><p className="artifact-context">These are general reminders, not a judgement about any specific listing.</p></div>
              </details>
            </div> : null}
          </div>
        </article>)}
        {busy ? <div className="conversation-thinking" role="status"><span className="thinking-dot" />Thinking about what you need…</div> : null}
        {error ? <div className="conversation-error" role="alert"><p>{error}</p>{failedTurns ? <button type="button" onClick={() => void run(failedTurns)} disabled={busy}>Retry this message</button> : null}</div> : null}
        <div ref={bottom} />
      </section>}
    </main>

    <div className="conversation-composer-wrap">
      <form className="conversation-composer" onSubmit={event => { event.preventDefault(); send(); }}>
        <label htmlFor="conversation-input" className="sr-only">Tell me about your rental needs</label>
        <textarea id="conversation-input" ref={textarea} value={input} rows={1} maxLength={MAX_MESSAGE_CHARS}
          placeholder={messages.length ? "Keep chatting, or ask me why…" : "For example: I’m a new NUS student with a budget of about S$1,300…"}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => { if (event.nativeEvent.isComposing) return; if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} />
        <div className="composer-tools"><span>Not sure about something? We can work it out together. <button type="button" className="composer-link"
            onClick={() => {
              const next = input.trim() ? input : CONTRACT_PROMPT;
              setInput(next);
              requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(next.length, next.length); });
            }}>Review a contract</button></span>
          {busy ? <button type="button" className="send-circle" onClick={() => request.current?.abort()} aria-label="Stop reply">■</button> :
            <button type="submit" className="send-circle" disabled={!input.trim()} aria-label="Send message">↑</button>}
        </div>
      </form>
      <div className="conversation-footnote">Course prototype · area data are demo estimates, not live listings <details><summary>Coverage</summary><p>{areas.length} areas across Singapore. Destinations: {DESTINATIONS.join(", ")}. Common rooms only. Source: {meta.source}.</p></details></div>
    </div>
    {comparison ? <ComparisonDialog selected={comparison.result.evaluations.filter(item => comparison.ids.includes(item.area.area_id))}
      preferences={comparison.result.preferences} onClose={() => setComparison(null)} onClear={() => { setComparison(null); setSelection(null); }} /> : null}
  </div>;
}
