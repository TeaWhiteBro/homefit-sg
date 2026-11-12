import type {
  Area,
  AreaEvaluation,
  Preferences,
  RecommendationResult,
  ScoreDimensions,
  ScoreWeights,
} from "./types";

export const WEIGHTS: Record<Preferences["priority"], ScoreWeights> = {
  balanced: { budget_headroom: 0.3, commute_headroom: 0.3, quiet: 0.2, amenity: 0.2 },
  cheaper: { budget_headroom: 0.5, commute_headroom: 0.2, quiet: 0.15, amenity: 0.15 },
  shorter_commute: { budget_headroom: 0.2, commute_headroom: 0.5, quiet: 0.15, amenity: 0.15 },
  quieter: { budget_headroom: 0.2, commute_headroom: 0.2, quiet: 0.45, amenity: 0.15 },
};

export const MAX_CANDIDATES = 5;   // shown in the recommendation panel; island-wide data often has many matches

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function normalizeRating(score: number): number {
  return clamp01((score - 1) / 4);
}

/**
 * Hard constraints are applied before scoring. A score never overrides a failed constraint.
 * Headroom is normalised against the user's own limit; ratings use the fixed 1..5 demo scale.
 */
export function forDestination(area: Area, destination: Preferences["destination"]): Area | null {
  const estimate = area.commute_estimates?.[destination];
  if (estimate) return { ...area, destination, commute_minutes: estimate.minutes, commute_range_minutes: estimate.range };
  return area.destination === destination ? area : null;
}

export function evaluateArea(original: Area, preferences: Preferences): AreaEvaluation {
  const resolved = forDestination(original, preferences.destination);
  const area = resolved ?? original;
  const matches =
    resolved !== null && area.room_type === preferences.roomType &&
    area.monthly_rent_sgd <= preferences.monthlyBudgetSgd &&
    area.commute_minutes <= preferences.maxCommuteMinutes;

  const dimensions: ScoreDimensions = {
    budget_headroom: clamp01(
      (preferences.monthlyBudgetSgd - area.monthly_rent_sgd) / preferences.monthlyBudgetSgd,
    ),
    commute_headroom: clamp01(
      (preferences.maxCommuteMinutes - area.commute_minutes) / preferences.maxCommuteMinutes,
    ),
    quiet: normalizeRating(area.quiet_score),
    amenity: normalizeRating(area.amenity_score),
  };

  const weights = WEIGHTS[preferences.priority];
  const weighted: ScoreDimensions = {
    budget_headroom: round4(dimensions.budget_headroom * weights.budget_headroom),
    commute_headroom: round4(dimensions.commute_headroom * weights.commute_headroom),
    quiet: round4(dimensions.quiet * weights.quiet),
    amenity: round4(dimensions.amenity * weights.amenity),
  };

  const score = round4(
    weighted.budget_headroom + weighted.commute_headroom + weighted.quiet + weighted.amenity,
  );

  const allReasons: Array<{ key: keyof ScoreDimensions; text: string; contribution: number }> = [
    {
      key: "budget_headroom",
      text: `Rent S$${area.monthly_rent_sgd} leaves S$${preferences.monthlyBudgetSgd - area.monthly_rent_sgd} of your budget.`,
      contribution: weighted.budget_headroom,
    },
    {
      key: "commute_headroom",
      text: `Estimated ${area.commute_minutes}-min one-way commute leaves ${preferences.maxCommuteMinutes - area.commute_minutes} min under your limit.`,
      contribution: weighted.commute_headroom,
    },
    {
      key: "quiet",
      text: `Quiet rating ${area.quiet_score}/5 in the demo data.`,
      contribution: weighted.quiet,
    },
    {
      key: "amenity",
      text: `Amenity rating ${area.amenity_score}/5 in the demo data.`,
      contribution: weighted.amenity,
    },
  ];

  const reasons = allReasons
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2)
    .map((reason) => reason.text);

  return { area, matches, score, dimensions, weighted, reasons };
}

export function recommend(preferences: Preferences, areas: Area[]): RecommendationResult {
  const evaluations = areas
    .filter((area) => forDestination(area, preferences.destination) !== null)
    .map((area) => evaluateArea(area, preferences))
    .sort((a, b) => {
      if (a.matches !== b.matches) return a.matches ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return a.area.area_id.localeCompare(b.area.area_id);
    });

  const matches = evaluations.filter((evaluation) => evaluation.matches);

  return {
    preferences,
    candidates: matches.slice(0, MAX_CANDIDATES),
    matchesCount: matches.length,
    totalCount: areas.length,
    evaluations,
  };
}

export function getCautions(evaluation: AreaEvaluation, preferences: Preferences): string[] {
  const cautions: string[] = [];
  const budgetHeadroom = preferences.monthlyBudgetSgd - evaluation.area.monthly_rent_sgd;
  const commuteHeadroom = preferences.maxCommuteMinutes - evaluation.area.commute_minutes;

  if (evaluation.matches && budgetHeadroom <= 100) {
    cautions.push(`Only S$${budgetHeadroom} of budget headroom.`);
  }
  if (evaluation.matches && commuteHeadroom <= 5) {
    cautions.push(`Only ${commuteHeadroom} min of commute headroom.`);
  }

  return cautions;
}

export function describeMatchCount(result: RecommendationResult): string {
  if (result.matchesCount === 0) {
    return `No areas match both hard constraints (${result.totalCount} areas checked). Nothing was relaxed automatically.`;
  }
  return `${result.matchesCount} of ${result.totalCount} areas match your hard constraints. Showing up to ${Math.min(result.matchesCount, MAX_CANDIDATES)}.`;
}
