import { describe, expect, it } from "vitest";

import {
  DEFAULT_PREFERENCES,
  LIMITS,
  parseModelJson,
  sanitizePreferencePatch,
  validatePreferences,
  validatePreferencesPatch,
} from "../lib/preferences";
import { DESTINATION } from "../lib/types";

describe("preference validation", () => {
  it("accepts the defaults", () => {
    const result = validatePreferences(DEFAULT_PREFERENCES);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(DEFAULT_PREFERENCES);
  });

  it.each([
    ["zero budget", { monthlyBudgetSgd: 0 }],
    ["negative budget", { monthlyBudgetSgd: -10 }],
    ["fractional budget", { monthlyBudgetSgd: 1400.5 }],
    ["zero commute", { maxCommuteMinutes: 0 }],
    ["fractional commute", { maxCommuteMinutes: 45.5 }],
    ["wrong destination", { destination: "Atlantis" }],
    ["wrong room type", { roomType: "entire flat" }],
    ["unknown priority", { priority: "fastest" }],
  ])("rejects %s", (_label, override) => {
    const result = validatePreferences({ ...DEFAULT_PREFERENCES, ...override });
    expect(result.ok).toBe(false);
  });

  it("accepts inclusive numeric boundaries", () => {
    expect(
      validatePreferences({
        ...DEFAULT_PREFERENCES,
        monthlyBudgetSgd: LIMITS.monthlyBudgetSgd.min,
        maxCommuteMinutes: LIMITS.maxCommuteMinutes.max,
      }).ok,
    ).toBe(true);
  });
});

describe("AI patch sanitisation", () => {
  it("accepts valid fields and converts them to internal names", () => {
    const result = sanitizePreferencePatch({
      monthly_budget_sgd: 1600,
      max_commute_minutes: 30,
      room_type: "common room",
      priority: "quieter",
      destination: "nus kent ridge",
    });

    expect(result.patch).toEqual({
      monthlyBudgetSgd: 1600,
      maxCommuteMinutes: 30,
      roomType: "common room",
      priority: "quieter",
      destination: DESTINATION,
    });
    expect(result.acceptedFields).toHaveLength(5);
    expect(result.rejected).toHaveLength(0);
  });

  it("rejects out-of-range values and wrong types", () => {
    const result = sanitizePreferencePatch({
      monthly_budget_sgd: 999999,
      max_commute_minutes: "45",
      room_type: "entire flat",
      priority: "unknown",
      destination: "Atlantis",
    });

    expect(result.acceptedFields).toHaveLength(0);
    expect(result.patch).toEqual({});
    expect(result.rejected).toHaveLength(5);
  });

  it("ignores unknown and sensitive fields", () => {
    const result = sanitizePreferencePatch({
      monthly_budget_sgd: 1400,
      nationality: "Singaporean",
      race: "prefer not to say",
      religion: "none",
      secret_status: "admin",
    });

    expect(result.patch).toEqual({ monthlyBudgetSgd: 1400 });
    expect(result.ignoredFields).toContain("nationality");
    expect(result.ignoredFields).toContain("race");
    expect(result.ignoredFields).toContain("religion");
    expect(result.rejected).toHaveLength(0);
  });

  it("treats null and omitted fields as unknown rather than zero", () => {
    const result = sanitizePreferencePatch({
      monthly_budget_sgd: null,
      max_commute_minutes: undefined,
    });

    expect(result.patch).toEqual({});
    expect(result.acceptedFields).toHaveLength(0);
    expect(result.rejected).toHaveLength(0);
  });

  it("rejects non-object model output", () => {
    const result = sanitizePreferencePatch(["1400", "45"]);
    expect(result.acceptedFields).toHaveLength(0);
    expect(result.rejected[0].field).toBe("response");
  });

  it("rejects an empty object as unusable", () => {
    const result = sanitizePreferencePatch({});
    expect(result.acceptedFields).toHaveLength(0);
  });
});

describe("model JSON extraction", () => {
  it("parses plain JSON", () => {
    expect(parseModelJson('{"monthly_budget_sgd":1400}')).toEqual({
      monthly_budget_sgd: 1400,
    });
  });

  it("parses fenced JSON", () => {
    expect(parseModelJson('```json\n{"monthly_budget_sgd":1400}\n```')).toEqual({
      monthly_budget_sgd: 1400,
    });
  });

  it("extracts the first object from surrounding text", () => {
    expect(parseModelJson('Here is the result: {"priority":"quieter"} hope it helps')).toEqual({
      priority: "quieter",
    });
  });

  it("returns null for invalid JSON", () => {
    expect(parseModelJson("not json at all")).toBeNull();
    expect(parseModelJson("{broken")).toBeNull();
  });
});

describe("client-side API patch validation", () => {
  it("accepts a valid camelCase patch", () => {
    const result = validatePreferencesPatch({
      monthlyBudgetSgd: 1500,
      maxCommuteMinutes: 35,
      priority: "cheaper",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        monthlyBudgetSgd: 1500,
        maxCommuteMinutes: 35,
        priority: "cheaper",
      });
    }
  });

  it("maps a shortened destination name to the supported one and rejects unknown places", () => {
    const result = validatePreferencesPatch({ monthlyBudgetSgd: 1300, destination: "NUS" });
    expect(result).toEqual({ ok: true, value: { monthlyBudgetSgd: 1300, destination: "NUS Kent Ridge" } });
    expect(validatePreferencesPatch({ destination: "SIT" })).toEqual({ ok: true, value: { destination: "SIT Punggol" } });
    expect(validatePreferencesPatch({ destination: "Mars" }).ok).toBe(false);
  });

  it("rejects unexpected keys and out-of-range values", () => {
    const result = validatePreferencesPatch({
      monthlyBudgetSgd: 100,
      unexpected: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((issue) => issue.field)).toContain("monthlyBudgetSgd");
      expect(result.errors.map((issue) => issue.field)).toContain("unexpected");
    }
  });
});
