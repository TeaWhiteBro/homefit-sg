import { validatePreferencesPatch } from "./preferences";
import { checkRent, type RentCheck } from "./rent-check";
import type { RiskId } from "./risks";
import type { ContractReview } from "./contract-review";
import type { Area, Preferences, RecommendationResult } from "./types";
/** Long enough for a pasted tenancy agreement. */
export const MAX_MESSAGE_CHARS = 12000;
export interface ConversationTurn { role: "user" | "assistant"; content: string }
export interface ConversationState { preferences: Preferences; confirmed: string[] }
/** A rent the user saw for an area. areaId is "unlisted" when the area is outside the demo data. */
export interface PlanQuote { areaId: string; rentSgd: number; roomType: "common room" | "other" | "unknown" }
export interface ConversationPlan {
  patch: Partial<Preferences>; panel: "none" | "recommendations" | "comparison"; focus: string;
  quote: PlanQuote | null; risk: boolean;
}
export interface ConversationReply {
  reply: string; state: ConversationState;
  panel: "none" | "recommendations" | "comparison"; result?: RecommendationResult;
  rentCheck?: RentCheck; risks?: RiskId[]; contractReview?: ContractReview;
}
export function parseConversationRequest(value: unknown):
  | { ok: true; turns: ConversationTurn[] }
  | { ok: false; message: string } {
  if (!value || typeof value !== "object") return { ok: false, message: "Invalid request." };
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > 40)
    return { ok: false, message: "Send between 1 and 40 conversation messages." };
  const turns: ConversationTurn[] = [];
  for (const item of input.messages) {
    if (!item || typeof item !== "object" || !["user", "assistant"].includes(item.role) ||
      typeof item.content !== "string" || !item.content.trim() || item.content.length > MAX_MESSAGE_CHARS)
      return { ok: false, message: "Invalid conversation message." };
    turns.push({ role: item.role, content: item.content.trim() });
  }
  if (turns.at(-1)?.role !== "user" || turns.reduce((sum, item) => sum + item.content.length, 0) > 30000)
    return { ok: false, message: "Conversation is too long or does not end with your message." };
  return { ok: true, turns };
}
export function sanitizeConversationPlan(input: unknown): ConversationPlan | null {
  if (!input || typeof input !== "object") return null;
  const data = input as Record<string, unknown>;
  const patch = validatePreferencesPatch(data.patch);
  if (!patch.ok || typeof data.focus !== "string" || data.focus.length > 2000 ||
    !["none", "recommendations", "comparison"].includes(String(data.panel))) return null;
  return {
    patch: patch.value, panel: data.panel as ConversationPlan["panel"], focus: data.focus,
    quote: sanitizeQuote(data.quote), risk: data.risk === true,
  };
}
/** Rent is only compared like-for-like: a known demo area and an explicit common room. */
export function assessQuote(quote: PlanQuote | null, areas: Area[]): {
  rentCheck: RentCheck | null; quoteIssue?: "unlisted_area" | "not_comparable" | "room_type_unclear";
} {
  if (!quote) return { rentCheck: null };
  if (quote.roomType === "other") return { rentCheck: null, quoteIssue: "not_comparable" };
  const known = quote.areaId !== "unlisted" && areas.some(area => area.area_id === quote.areaId);
  if (!known) return { rentCheck: null, quoteIssue: "unlisted_area" };
  if (quote.roomType === "unknown") return { rentCheck: null, quoteIssue: "room_type_unclear" };
  return { rentCheck: checkRent(quote, areas) };
}
/** A malformed quote is dropped rather than failing the turn; without it no rent comparison is shown. */
function sanitizeQuote(input: unknown): PlanQuote | null {
  if (!input || typeof input !== "object") return null;
  const quote = input as Record<string, unknown>;
  if (typeof quote.areaId !== "string" || !/^[a-z-]{2,40}$/.test(quote.areaId)) return null;
  if (typeof quote.rentSgd !== "number" || !Number.isInteger(quote.rentSgd) || quote.rentSgd < 100 || quote.rentSgd > 20000) return null;
  const roomType = ["common room", "other", "unknown"].includes(String(quote.roomType)) ? quote.roomType as PlanQuote["roomType"] : "unknown";
  return { areaId: quote.areaId, rentSgd: quote.rentSgd, roomType };
}
export function canShowRecommendations(state: ConversationState) {
  return ["monthlyBudgetSgd", "destination", "maxCommuteMinutes", "roomType"].every(key => state.confirmed.includes(key));
}
