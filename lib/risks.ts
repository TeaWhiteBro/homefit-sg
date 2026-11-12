import type { RentCheck } from "./rent-check";

/** General renting precautions. They are checklists to verify, not judgements about a specific listing. */
export const RISK_ITEMS = [
  { id: "view_first", title: "View before you pay", detail: "Don’t transfer a deposit or advance rent until you have viewed the room in person or by live video and confirmed who the landlord or agent is." },
  { id: "too_cheap", title: "Ask more when a price looks too low", detail: "A listing far below the area reference may be fake or come with hidden conditions. Confirm the exact address, view it, and ask about every fee." },
  { id: "agent_check", title: "Check the agent", detail: "If you rent through an agent, look up their name and registration number in the public register of Singapore’s Council for Estate Agencies (CEA)." },
  { id: "landlord_check", title: "Confirm they can rent it out", detail: "If the person is subletting, make sure the owner knows and agrees. Renting out rooms in an HDB flat must follow HDB’s rules, so ask them to explain." },
  { id: "contract_terms", title: "Put key terms in the contract", detail: "Deposit amount and refund conditions, early termination, whether utilities and Wi-Fi are included, who handles repairs, and rules on cooking and visitors." },
  { id: "pay_safely", title: "Keep a record of payments", detail: "Pay by bank transfer where possible and keep receipts and chat records; avoid large cash payments without proof." },
] as const;

export type RiskId = (typeof RISK_ITEMS)[number]["id"];
const GENERAL: RiskId[] = ["view_first", "agent_check", "landlord_check", "contract_terms", "pay_safely"];

export function isRiskId(value: unknown): value is RiskId {
  return RISK_ITEMS.some(item => item.id === value);
}

/** Chooses which reminders accompany a reply. Order is stable and follows RISK_ITEMS. */
export function selectRisks(input: { rentCheck?: RentCheck | null; askedAboutRisk?: boolean; recommending?: boolean }): RiskId[] {
  const ids = new Set<RiskId>();
  if (input.rentCheck?.verdict === "much_lower") ["too_cheap", "view_first", "pay_safely"].forEach(id => ids.add(id as RiskId));
  if (input.askedAboutRisk || input.recommending) GENERAL.forEach(id => ids.add(id));
  return RISK_ITEMS.map(item => item.id).filter(id => ids.has(id));
}
