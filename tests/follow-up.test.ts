import { describe, expect, it } from "vitest";
import { AREAS } from "../lib/areas";
import { DESTINATIONS } from "../lib/types";
import { findDestination, normalizeDestination } from "../lib/destinations";
import { DEFAULT_PREFERENCES, validatePreferences } from "../lib/preferences";
import { recommend } from "../lib/recommend";

describe("destination coverage and conversational follow-ups", () => {
  it("provides distinct, explicit estimates for every supported route", () => {
    expect(AREAS.length).toBeGreaterThanOrEqual(40);
    expect(DESTINATIONS).toHaveLength(10);
    for (const area of AREAS) {
      for (const destination of DESTINATIONS) expect(area.commute_estimates?.[destination]?.minutes).toBeGreaterThan(0);
    }
    for (const destination of DESTINATIONS) {
      expect(validatePreferences({ ...DEFAULT_PREFERENCES, destination }).ok).toBe(true);
      const result = recommend({ ...DEFAULT_PREFERENCES, destination }, AREAS);
      expect(result.evaluations).toHaveLength(AREAS.length);
      for (const evaluation of result.evaluations) {
        expect(evaluation.area.destination).toBe(destination);
        expect(evaluation.area.commute_minutes).toBe(evaluation.area.commute_estimates?.[destination]?.minutes);
      }
    }
    expect(recommend(DEFAULT_PREFERENCES, AREAS).candidates.map(item => item.area.area_id))
      .not.toEqual(recommend({ ...DEFAULT_PREFERENCES, destination: "NTU" }, AREAS).candidates.map(item => item.area.area_id));
  });
  it("recognises the island-wide destinations by common names", () => {
    expect(normalizeDestination("SIT")).toBe("SIT Punggol");
    expect(normalizeDestination("sit punggol")).toBe("SIT Punggol");
    expect(findDestination("I want to sit somewhere quiet")).toBeUndefined();
    expect(normalizeDestination("One North")).toBe("one-north");
    expect(normalizeDestination("Fusionopolis")).toBe("one-north");
    expect(normalizeDestination("sutd")).toBe("SUTD");
    expect(normalizeDestination("Jurong East")).toBe("Jurong Lake District");
    expect(normalizeDestination("changi airport")).toBe("Changi Airport");
    expect(normalizeDestination("Changi Business Park")).toBe("Changi Business Park");
  });
  it("does not reuse a NUS journey when another destination lacks an estimate", () => {
    const area = { ...AREAS[0], commute_estimates: undefined };
    expect(recommend({ ...DEFAULT_PREFERENCES, destination: "NTU" }, [area]).matchesCount).toBe(0);
  });
});
