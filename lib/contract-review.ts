/**
 * Keyword checklist for a tenancy agreement the user pastes into the chat.
 * It only reports which key terms are mentioned and which phrases deserve a question.
 * It cannot judge whether a clause is fair, standard or legally valid.
 */
export type ContractTermId =
  | "rent" | "deposit" | "deposit_refund" | "term" | "early_termination"
  | "utilities" | "repairs" | "house_rules" | "agent" | "stamp_duty" | "handover";

export interface ContractTerm {
  id: ContractTermId;
  title: string;
  status: "found" | "missing";
  /** Short excerpt around the first match, when found. */
  excerpt?: string;
  /** What to ask when the term is missing. */
  ask: string;
}

export interface ContractFlag { id: string; title: string; detail: string; excerpt: string }

export interface ContractReview { terms: ContractTerm[]; flags: ContractFlag[]; foundCount: number; totalCount: number }

const TERMS: { id: ContractTermId; title: string; pattern: RegExp; ask: string }[] = [
  { id: "rent", title: "Monthly rent and when it is due",
    pattern: /\brent(?:al)?\b[^.\n]{0,80}(?:S\$|SGD|\$)\s?\d|(?:S\$|SGD|\$)\s?\d[\d,]*[^.\n]{0,40}\b(?:per month|a month|monthly)\b/i,
    ask: "Ask for the monthly rent, the due date and how to pay to be written in." },
  { id: "deposit", title: "Security deposit amount",
    pattern: /\b(?:security )?deposit\b/i,
    ask: "Ask how much the deposit is and get the amount in writing." },
  { id: "deposit_refund", title: "When and how the deposit is returned",
    pattern: /\bdeposit\b[^.]{0,200}\b(?:refund(?:ed)?|return(?:ed)?|repaid)\b|\b(?:refund(?:ed)?|return(?:ed)?)\b[^.]{0,200}\bdeposit\b/i,
    ask: "Ask when the deposit is returned after you move out and what can be deducted." },
  { id: "term", title: "Lease period and start date",
    pattern: /\b(?:term|period|duration) of (?:the |this )?(?:tenancy|lease|licen[cs]e|agreement)\b|\bcommenc(?:e|es|ing|ement)\b|\b(?:\d{1,2}|six|twelve|twenty[- ]four)\s*(?:\(\d{1,2}\)\s*)?months?\b[^.\n]{0,60}\b(?:tenancy|lease|term|from)\b/i,
    ask: "Ask for the exact start and end dates of the lease." },
  { id: "early_termination", title: "Ending the lease early (notice, diplomatic clause)",
    pattern: /\bdiplomatic clause\b|\bearly termination\b|\bterminat(?:e|ion)\b[^.]{0,120}\bnotice\b|\bnotice\b[^.]{0,120}\bterminat(?:e|ion)\b/i,
    ask: "Ask what happens if you need to leave early and how much notice is required." },
  { id: "utilities", title: "Utilities, Wi-Fi and air-con",
    pattern: /\butilit(?:y|ies)\b|\belectricity\b|\bwi-?fi\b|\binternet\b|\bair-?con\b/i,
    ask: "Ask whether utilities, Wi-Fi and air-con use are included in the rent or paid separately." },
  { id: "repairs", title: "Repairs and maintenance",
    pattern: /\brepairs?\b|\bmaintenance\b|\bwear and tear\b/i,
    ask: "Ask who pays for repairs, and whether there is a cap on what you pay." },
  { id: "house_rules", title: "House rules (cooking, visitors, pets)",
    pattern: /\bcook(?:ing)?\b|\bvisitors?\b|\bguests?\b|\bovernight\b|\bpets?\b|\bsmok(?:e|ing)\b/i,
    ask: "Ask about cooking, visitors, overnight guests and pets before you sign." },
  { id: "agent", title: "Agent and commission (if an agent is involved)",
    pattern: /\bagen(?:t|cy)\b|\bcommission\b/i,
    ask: "If an agent is involved, ask who pays the commission and check the agent's registration." },
  { id: "stamp_duty", title: "Stamp duty",
    pattern: /\bstamp(?:ing| duty)\b/i,
    ask: "Ask who pays the stamp duty on the agreement, if it applies." },
  { id: "handover", title: "Condition and inventory at move-in",
    pattern: /\binventory\b|\bhand(?:ing)?[- ]?over\b|\bmove[- ]in\b|\bcondition of the (?:room|premises|unit)\b/i,
    ask: "Ask for an inventory list and take dated photos of the room when you move in." },
];

const FLAGS: { id: string; title: string; detail: string; pattern: RegExp }[] = [
  { id: "non_refundable", title: "Non-refundable payment", pattern: /\bnon[- ]?refundable\b/i,
    detail: "Ask exactly which payment is non-refundable and why." },
  { id: "forfeit", title: "Deposit can be forfeited", pattern: /\bforfeit(?:ed|ure)?\b/i,
    detail: "Check the conditions for losing the deposit; they should be specific." },
  { id: "cash", title: "Cash payment", pattern: /\bcash only\b|\bin cash\b|\bcash payment\b/i,
    detail: "Prefer bank transfer and keep receipts for every payment." },
  { id: "pay_before_viewing", title: "Payment before viewing", pattern: /\b(?:before|prior to|without)\s+(?:any\s+)?(?:viewing|inspection|seeing the (?:room|unit|premises))\b/i,
    detail: "Do not pay before you have viewed the room and confirmed who the landlord is." },
  { id: "discretion", title: "One-sided decision", pattern: /\b(?:sole|absolute) discretion\b/i,
    detail: "One party can decide alone here; ask what limits apply." },
  { id: "entry", title: "Entry without notice", pattern: /\b(?:enter|access|inspect)\b[^.]{0,80}\b(?:at any time|without (?:prior )?notice)\b/i,
    detail: "Ask how much notice you will get before anyone enters your room." },
  { id: "all_repairs", title: "Tenant pays all repairs", pattern: /\btenant\b[^.]{0,80}\b(?:all|any and all) (?:repairs|costs of repair)\b/i,
    detail: "Ask whether there is a cap on repair costs you have to pay." },
  { id: "rent_change", title: "Rent can change during the lease", pattern: /\b(?:increase|revise|raise|adjust)\b[^.]{0,40}\brent\b|\brent\b[^.]{0,40}\b(?:increase|revis|adjust)/i,
    detail: "Check when and by how much the rent can change." },
  { id: "auto_renew", title: "Automatic renewal", pattern: /\bautomatic(?:ally)? renew|\bauto[- ]renew/i,
    detail: "Check how to stop the lease from renewing if you want to leave." },
];

const CONTRACT_WORDS = [
  /\btenan(?:t|cy|ts)\b/i, /\blandlord\b/i, /\bagreement\b/i, /\bdeposit\b/i, /\bclause\b/i,
  /\blicen[cs]e[e]?\b/i, /\blease\b/i, /\bshall\b/i, /\bpremises\b/i, /\bterminat(?:e|ion)\b/i,
];

/** True when a message looks like pasted contract text rather than a chat question. */
export function looksLikeContract(text: string): boolean {
  if (text.length < 200) return false;
  return CONTRACT_WORDS.filter(pattern => pattern.test(text)).length >= 4;
}

/** The sentence (or line) around a match, trimmed to about 160 characters. */
function excerptAround(text: string, index: number, length: number): string {
  const from = Math.max(0, index - 100);
  const head = text.slice(from, index);
  const cut = Math.max(head.lastIndexOf("\n"), head.lastIndexOf(". ") + 1);
  const start = cut > 0 ? from + cut + 1 : from;
  const stop = text.slice(index + length).search(/\.\s|\n/);
  const end = stop >= 0 ? index + length + stop + 1 : text.length;
  const sentence = text.slice(start, end).replace(/\s+/g, " ").trim();
  const snippet = sentence.length > 160 ? sentence.slice(0, 159) + "…" : sentence;
  return (cut <= 0 && from > 0 ? "…" : "") + snippet;
}

/** Excerpt for the first match that is a real sentence, skipping clause headings such as "3. Deposit." */
function findExcerpt(text: string, pattern: RegExp): string | undefined {
  let first: string | undefined;
  for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags + "g"))) {
    const excerpt = excerptAround(text, match.index, match[0].length);
    if (excerpt.length >= 25) return excerpt;
    first ??= excerpt;
  }
  return first;
}

export function reviewContract(text: string): ContractReview {
  const terms: ContractTerm[] = TERMS.map(({ id, title, pattern, ask }) => {
    const excerpt = findExcerpt(text, pattern);
    return excerpt ? { id, title, status: "found", excerpt, ask } : { id, title, status: "missing", ask };
  });
  const flags: ContractFlag[] = [];
  for (const { id, title, detail, pattern } of FLAGS) {
    const excerpt = findExcerpt(text, pattern);
    if (excerpt) flags.push({ id, title, detail, excerpt });
  }
  const foundCount = terms.filter(term => term.status === "found").length;
  return { terms, flags, foundCount, totalCount: terms.length };
}
