import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { looksLikeContract, reviewContract } from "../lib/contract-review";
import { MAX_MESSAGE_CHARS, parseConversationRequest } from "../lib/conversation";

const SAMPLE = readFileSync(new URL("./fixtures/sample-tenancy.txt", import.meta.url), "utf8");

describe("contract review checklist", () => {
  it("recognises pasted agreements but not ordinary questions", () => {
    expect(looksLikeContract(SAMPLE)).toBe(true);
    expect(looksLikeContract("Is a S$300 deposit normal for a common room near NUS?")).toBe(false);
    expect(looksLikeContract("I want to live near NUS. ".repeat(20))).toBe(false);
  });

  it("reports which key terms are present and what to ask about the missing ones", () => {
    const review = reviewContract(SAMPLE);
    const status = Object.fromEntries(review.terms.map(term => [term.id, term.status]));
    expect(status).toMatchObject({
      rent: "found", deposit: "found", term: "found", utilities: "found", repairs: "found", house_rules: "found",
      deposit_refund: "missing", early_termination: "missing", stamp_duty: "missing", agent: "missing", handover: "missing",
    });
    expect(review.foundCount).toBe(review.terms.filter(term => term.status === "found").length);
    expect(review.totalCount).toBe(11);
    const missing = review.terms.find(term => term.id === "early_termination")!;
    expect(missing.excerpt).toBeUndefined();
    expect(missing.ask).toMatch(/leave early/);
    expect(review.terms.find(term => term.id === "rent")!.excerpt).toContain("S$1,250");
  });

  it("flags phrases worth a question, with the matching excerpt", () => {
    const flags = reviewContract(SAMPLE).flags.map(flag => flag.id);
    expect(flags).toEqual(expect.arrayContaining(["non_refundable", "entry", "all_repairs", "discretion", "rent_change"]));
    expect(flags).not.toContain("cash");
    const entry = reviewContract(SAMPLE).flags.find(flag => flag.id === "entry")!;
    expect(entry.excerpt).toContain("at any time");
    expect(entry.excerpt.length).toBeLessThanOrEqual(162);
  });

  it("accepts a pasted contract up to the message limit", () => {
    const ok = parseConversationRequest({ messages: [{ role: "user", content: "x".repeat(MAX_MESSAGE_CHARS) }] });
    const tooLong = parseConversationRequest({ messages: [{ role: "user", content: "x".repeat(MAX_MESSAGE_CHARS + 1) }] });
    expect(ok.ok).toBe(true);
    expect(tooLong.ok).toBe(false);
  });
});
