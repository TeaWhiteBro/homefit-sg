import { describe, expect, it } from "vitest";

import { AREAS, DATASET_META } from "../lib/areas";
import { DEFAULT_PREFERENCES } from "../lib/preferences";
import { MAX_CANDIDATES, WEIGHTS, evaluateArea, recommend } from "../lib/recommend";
import { DESTINATION, ROOM_TYPE, type Area, type Preferences } from "../lib/types";

function prefs(overrides: Partial<Preferences> = {}): Preferences {
  return { ...DEFAULT_PREFERENCES, ...overrides };
}

function syntheticArea(id: string, overrides: Partial<Area> = {}): Area {
  return {
    area_id: id,
    name: id,
    monthly_rent_sgd: 1200,
    room_type: ROOM_TYPE,
    currency: "SGD",
    period: "month",
    commute_minutes: 20,
    commute_range_minutes: [15, 25],
    commute_origin: "Synthetic test origin",
    destination: DESTINATION,
    quiet_score: 3,
    amenity_score: 3,
    tradeoff: "Synthetic trade-off.",
    source: "Test fixture",
    as_of: "2026-10-24",
    is_demo: true,
    ...overrides,
  };
}

describe("dataset contract", () => {
  it("provides at least six consistent common-room demo areas", () => {
    expect(AREAS.length).toBeGreaterThanOrEqual(6);
    expect(DATASET_META.is_demo).toBe(true);

    for (const area of AREAS) {
      expect(area.room_type).toBe(ROOM_TYPE);
      expect(area.currency).toBe("SGD");
      expect(area.period).toBe("month");
      expect(area.destination).toBe(DESTINATION);
      expect(area.is_demo).toBe(true);
      expect(area.source.length).toBeGreaterThan(0);
      expect(area.as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(area.commute_range_minutes[0]).toBeLessThanOrEqual(area.commute_minutes);
      expect(area.commute_range_minutes[1]).toBeGreaterThanOrEqual(area.commute_minutes);
    }
  });
});

describe("hard filtering", () => {
  it("returns only areas within both hard limits and at most MAX_CANDIDATES candidates", () => {
    const result = recommend(prefs(), AREAS);

    expect(result.matchesCount).toBe(9);
    expect(result.candidates).toHaveLength(MAX_CANDIDATES);
    expect(result.candidates.some((item) => item.area.area_id === "bukit-batok")).toBe(false);

    for (const evaluation of result.candidates) {
      expect(evaluation.matches).toBe(true);
      expect(evaluation.area.monthly_rent_sgd).toBeLessThanOrEqual(1400);
      expect(evaluation.area.commute_minutes).toBeLessThanOrEqual(45);
    }
  });

  it("treats equality at both constraint boundaries as a match", () => {
    const clementi = AREAS.find((area) => area.area_id === "clementi");
    expect(clementi).toBeDefined();

    const exact = prefs({ monthlyBudgetSgd: 1250, maxCommuteMinutes: 25 });
    const evaluation = evaluateArea(clementi as Area, exact);

    expect(evaluation.matches).toBe(true);
    expect(evaluation.dimensions.budget_headroom).toBe(0);
    expect(evaluation.dimensions.commute_headroom).toBe(0);
    expect(evaluation.score).toBeGreaterThanOrEqual(0);
    expect(evaluation.score).toBeLessThanOrEqual(1);
  });

  it("returns zero results without silently relaxing limits", () => {
    const result = recommend(prefs({ monthlyBudgetSgd: 500, maxCommuteMinutes: 10 }), AREAS);

    expect(result.matchesCount).toBe(0);
    expect(result.candidates).toEqual([]);
    expect(result.evaluations).toHaveLength(AREAS.length);
    expect(result.evaluations.every((item) => item.matches === false)).toBe(true);
  });

  it("never lets a high score override a failed hard constraint", () => {
    const result = recommend(prefs({ maxCommuteMinutes: 45 }), [
      syntheticArea("cheap-but-far", {
        monthly_rent_sgd: 500,
        commute_minutes: 80,
        quiet_score: 5,
        amenity_score: 5,
      }),
    ]);

    expect(result.matchesCount).toBe(0);
    expect(result.candidates).toHaveLength(0);
  });
});

describe("scoring and ordering", () => {
  it("keeps all weights non-negative and summing to one", () => {
    for (const weights of Object.values(WEIGHTS)) {
      const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
      expect(total).toBeCloseTo(1, 10);
      expect(Object.values(weights).every((value) => value >= 0)).toBe(true);
    }
  });

  it("breaks exact score ties by area_id", () => {
    const result = recommend(prefs({ monthlyBudgetSgd: 2000, maxCommuteMinutes: 60 }), [
      syntheticArea("zeta"),
      syntheticArea("alpha"),
      syntheticArea("middle"),
    ]);

    expect(result.candidates.map((item) => item.area.area_id)).toEqual([
      "alpha",
      "middle",
      "zeta",
    ]);
  });

  it("returns identical ordering for identical input", () => {
    const first = recommend(prefs(), AREAS);
    const second = recommend(prefs(), AREAS);

    expect(first.candidates.map((item) => item.area.area_id)).toEqual(
      second.candidates.map((item) => item.area.area_id),
    );
    expect(first.candidates.map((item) => item.score)).toEqual(
      second.candidates.map((item) => item.score),
    );
  });

  it("changes ranking when the priority changes", () => {
    const balanced = recommend(prefs({ priority: "balanced" }), AREAS);
    const quieter = recommend(prefs({ priority: "quieter" }), AREAS);

    expect(balanced.candidates[0].area.area_id).not.toBe(quieter.candidates[0].area.area_id);
    expect(quieter.candidates[0].area.area_id).toBe("dover");
  });

  it("applies a S$200 budget cut and recomputes instead of keeping stale candidates", () => {
    const base = recommend(prefs({ monthlyBudgetSgd: 1400 }), AREAS);
    const reduced = recommend(prefs({ monthlyBudgetSgd: 1200 }), AREAS);

    expect(base.matchesCount).toBe(9);
    expect(reduced.matchesCount).toBe(1);
    expect(reduced.candidates.map((item) => item.area.area_id)).toEqual(["jurong-east"]);
    expect(reduced.candidates.every((item) => item.area.monthly_rent_sgd <= 1200)).toBe(true);
  });

  it("recomputes when the commute limit is tightened", () => {
    const base = recommend(prefs({ maxCommuteMinutes: 45 }), AREAS);
    const tightened = recommend(prefs({ maxCommuteMinutes: 20 }), AREAS);

    expect(base.matchesCount).toBe(9);
    expect(tightened.matchesCount).toBe(2);
    expect(
      tightened.candidates.every((item) => item.area.commute_minutes <= 20),
    ).toBe(true);
  });
});
