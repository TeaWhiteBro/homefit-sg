import type { Area } from "./types";

export interface RentQuote { areaId: string; rentSgd: number }
export type RentVerdict = "much_lower" | "lower" | "close" | "higher" | "much_higher";
export interface RentCheck {
  areaId: string; areaName: string; quotedSgd: number; referenceSgd: number;
  differencePct: number; verdict: RentVerdict;
}

export const RENT_VERDICT_LABELS: Record<RentVerdict, string> = {
  much_lower: "Well below the demo reference",
  lower: "Slightly below the demo reference",
  close: "Close to the demo reference",
  higher: "Slightly above the demo reference",
  much_higher: "Well above the demo reference",
};

/**
 * Compares a user-quoted common-room rent with the area's demo reference rent.
 * Thresholds are deliberately coarse because the reference is a single demo estimate.
 */
export function checkRent(quote: RentQuote, areas: Area[]): RentCheck | null {
  const area = areas.find(item => item.area_id === quote.areaId);
  if (!area || !Number.isInteger(quote.rentSgd) || quote.rentSgd < 100 || quote.rentSgd > 20000) return null;
  const differencePct = Math.round((quote.rentSgd - area.monthly_rent_sgd) / area.monthly_rent_sgd * 100);
  const verdict: RentVerdict = differencePct <= -25 ? "much_lower" : differencePct <= -10 ? "lower"
    : differencePct < 10 ? "close" : differencePct < 25 ? "higher" : "much_higher";
  return {
    areaId: area.area_id, areaName: area.name, quotedSgd: quote.rentSgd,
    referenceSgd: area.monthly_rent_sgd, differencePct, verdict,
  };
}

export function describeDifference(check: RentCheck): string {
  if (check.differencePct === 0) return "same as the demo reference";
  return `${Math.abs(check.differencePct)}% ${check.differencePct > 0 ? "above" : "below"} the demo reference`;
}
