import { describe, expect, it } from "vitest";
import { AREAS } from "../lib/areas";
import { assessQuote, sanitizeConversationPlan } from "../lib/conversation";
import { checkRent, describeDifference } from "../lib/rent-check";
import { selectRisks } from "../lib/risks";

// Clementi's demo reference is S$1,250 per month for a common room.
describe("rent reasonableness check", () => {
  it("compares a quote with the area's demo reference using coarse bands", () => {
    expect(checkRent({ areaId: "clementi", rentSgd: 1250 }, AREAS)).toMatchObject({ referenceSgd: 1250, differencePct: 0, verdict: "close" });
    expect(checkRent({ areaId: "clementi", rentSgd: 1500 }, AREAS)).toMatchObject({ differencePct: 20, verdict: "higher" });
    expect(checkRent({ areaId: "clementi", rentSgd: 1600 }, AREAS)?.verdict).toBe("much_higher");
    expect(checkRent({ areaId: "clementi", rentSgd: 1100 }, AREAS)?.verdict).toBe("lower");
    expect(checkRent({ areaId: "clementi", rentSgd: 800 }, AREAS)?.verdict).toBe("much_lower");
  });
  it("describes the difference in plain words", () => {
    expect(describeDifference(checkRent({ areaId: "clementi", rentSgd: 1500 }, AREAS)!)).toBe("20% above the demo reference");
    expect(describeDifference(checkRent({ areaId: "clementi", rentSgd: 1000 }, AREAS)!)).toBe("20% below the demo reference");
  });
  it("never compares an unknown area or a different room type", () => {
    expect(checkRent({ areaId: "atlantis", rentSgd: 1000 }, AREAS)).toBeNull();
    expect(assessQuote({ areaId: "unlisted", rentSgd: 1000, roomType: "common room" }, AREAS)).toEqual({ rentCheck: null, quoteIssue: "unlisted_area" });
    expect(assessQuote({ areaId: "clementi", rentSgd: 2500, roomType: "other" }, AREAS)).toEqual({ rentCheck: null, quoteIssue: "not_comparable" });
    expect(assessQuote({ areaId: "clementi", rentSgd: 1500, roomType: "unknown" }, AREAS)).toEqual({ rentCheck: null, quoteIssue: "room_type_unclear" });
    expect(assessQuote({ areaId: "clementi", rentSgd: 1500, roomType: "common room" }, AREAS).rentCheck?.verdict).toBe("higher");
    expect(assessQuote(null, AREAS)).toEqual({ rentCheck: null });
  });
  it("drops malformed quotes without failing the plan and never turns a quote into budget", () => {
    const plan = sanitizeConversationPlan({ patch: {}, panel: "none", focus: "", quote: { areaId: "clementi", rentSgd: "1500" }, risk: "yes" });
    expect(plan).toMatchObject({ quote: null, risk: false, patch: {} });
    const valid = sanitizeConversationPlan({ patch: {}, panel: "none", focus: "", quote: { areaId: "clementi", rentSgd: 1500, roomType: "common room" }, risk: true });
    expect(valid).toMatchObject({ quote: { areaId: "clementi", rentSgd: 1500, roomType: "common room" }, risk: true, patch: {} });
    expect(sanitizeConversationPlan({ patch: {}, panel: "none", focus: "", quote: { areaId: "clementi", rentSgd: 1500, roomType: "penthouse" } })?.quote?.roomType).toBe("unknown");
  });
});

describe("risk reminders", () => {
  it("adds nothing to ordinary clarification turns", () => {
    expect(selectRisks({})).toEqual([]);
    expect(selectRisks({ rentCheck: checkRent({ areaId: "clementi", rentSgd: 1300 }, AREAS) })).toEqual([]);
  });
  it("flags unusually low quotes with payment-related reminders", () => {
    expect(selectRisks({ rentCheck: checkRent({ areaId: "clementi", rentSgd: 800 }, AREAS) })).toEqual(["view_first", "too_cheap", "pay_safely"]);
  });
  it("gives the general checklist with recommendations or when asked, in a stable order", () => {
    const general = ["view_first", "agent_check", "landlord_check", "contract_terms", "pay_safely"];
    expect(selectRisks({ recommending: true })).toEqual(general);
    expect(selectRisks({ askedAboutRisk: true })).toEqual(general);
  });
});
