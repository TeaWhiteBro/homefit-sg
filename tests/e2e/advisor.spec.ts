import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PREFERENCES } from "../../lib/preferences";
import { AREAS } from "../../lib/areas";
import { recommend } from "../../lib/recommend";
import { readFileSync } from "node:fs";
import { reviewContract } from "../../lib/contract-review";

async function send(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Tell me about your rental needs" }).fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
}
async function mock(page: Page, handler: (body: any) => unknown) {
  await page.route("**/api/chat", route => route.fulfill({ json: handler(route.request().postDataJSON()) }));
}
const state = { preferences: { ...DEFAULT_PREFERENCES, monthlyBudgetSgd: 1300, maxCommuteMinutes: 30 }, confirmed: ["monthlyBudgetSgd", "destination", "maxCommuteMinutes", "roomType"] };

test("minimal welcome has a composer and no dashboard or preference form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Find a place in Singapore that fits your life." })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Tell me about your rental needs" })).toBeVisible();
  await expect(page.locator(".preference-bar,.decision-explorer,.live-panel")).toHaveCount(0);
  await expect(page.locator(".conversation-artifact")).toHaveCount(0);
});

test("vague initial request leads to a real reply, followed by history-aware clarification", async ({ page }) => {
  let received: any[] = [];
  await mock(page, body => {
    received = body.messages;
    return {
      reply: body.messages.length === 1
        ? "Welcome to Singapore! When you say close, do you mean walking to campus, or is 20 to 30 minutes by public transport fine?"
        : "Got it, public transport works. How much do supermarkets and food options nearby matter to you?",
      state: { preferences: { ...DEFAULT_PREFERENCES, monthlyBudgetSgd: 1300 }, confirmed: ["monthlyBudgetSgd", "destination"] },
      panel: "none",
    };
  });
  await page.goto("/");
  await send(page, "I'm a new NUS student, budget around 1300, want to live close to campus");
  await expect(page.getByText(/When you say close/)).toBeVisible();
  await expect(page.locator(".conversation-artifact")).toHaveCount(0);
  await send(page, "Public transport is fine, ideally under 30 minutes");
  await expect(page.getByText(/supermarkets and food options/)).toBeVisible();
  expect(received).toHaveLength(3);
  expect(received[0].content).toContain("1300");
  expect(received[1].role).toBe("assistant");
});

test("recommendation panel is triggered in a reply and opens only on demand", async ({ page }) => {
  await mock(page, () => ({
    reply: "Based on what you confirmed, Clementi and Buona Vista are worth comparing first. The cards below use demo estimates.",
    state, panel: "recommendations", result: recommend(state.preferences, AREAS),
  }));
  await page.goto("/");
  await send(page, "Common room, under 30 minutes, budget 1300, show me options");
  const artifact = page.locator(".conversation-artifact details");
  await expect(artifact).toBeVisible();
  await expect(artifact).not.toHaveAttribute("open", "");
  await artifact.locator("summary").click();
  const boxes = artifact.getByRole("checkbox");
  await boxes.nth(0).check(); await boxes.nth(1).check();
  await artifact.getByRole("button", { name: "Compare selected areas" }).click();
  const dialog = page.getByRole("dialog", { name: "Compare selected areas" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("rowheader", { name: "Monthly rent" })).toBeVisible();
  await expect(dialog).not.toContainText("ranking score");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("rent check and risk reminders appear folded only when the reply carries them", async ({ page }) => {
  await mock(page, () => ({
    reply: "S$800 for a common room in Clementi is well below our demo reference. When a price is this low, view the room and confirm the landlord before paying.",
    state, panel: "none",
    rentCheck: { areaId: "clementi", areaName: "Clementi", quotedSgd: 800, referenceSgd: 1250, differencePct: -36, verdict: "much_lower" },
    risks: ["view_first", "too_cheap", "pay_safely"],
  }));
  await page.goto("/");
  await send(page, "I saw a common room in Clementi for S$800 a month. Is that reasonable?");
  const panels = page.locator(".conversation-artifact details");
  await expect(panels).toHaveCount(2);
  await expect(panels.nth(0).locator("summary")).toContainText("36% below the demo reference");
  await expect(panels.nth(0)).not.toHaveAttribute("open", "");
  await panels.nth(0).locator("summary").click();
  await expect(panels.nth(0)).toContainText("Well below the demo reference");
  await panels.nth(1).locator("summary").click();
  await expect(panels.nth(1).locator(".risk-list li")).toHaveCount(3);
  await expect(panels.nth(1)).toContainText("Ask more when a price looks too low");
});

test("pasted contract gets a folded checklist with missing terms and flagged phrases", async ({ page }) => {
  const contract = readFileSync("tests/fixtures/sample-tenancy.txt", "utf8")   // tests run from the project root;
  let sent = "";
  await mock(page, body => {
    sent = body.messages.at(-1).content;
    return {
      reply: "The agreement covers rent, the deposit and house rules, but it does not say when the deposit is returned. This is a keyword checklist, not legal advice.",
      state, panel: "none", contractReview: reviewContract(contract),
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Review a contract" }).click();
  const box = page.getByRole("textbox", { name: "Tell me about your rental needs" });
  await expect(box).toHaveValue(/^Please review this tenancy agreement:/);
  await expect(box).toBeFocused();
  await box.fill("Please review this tenancy agreement:\n\n" + contract);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/does not say when the deposit is returned/)).toBeVisible();
  expect(sent).toContain("non-refundable");
  const panel = page.locator(".contract-review details");
  await expect(panel.locator("summary")).toContainText("6 of 11 key terms found");
  await expect(panel).not.toHaveAttribute("open", "");
  await panel.locator("summary").click();
  await expect(panel.locator(".contract-terms li.missing")).toHaveCount(5);
  await expect(panel).toContainText("Ask what happens if you need to leave early");
  await expect(panel).toContainText("Phrases worth asking about");
  await expect(panel).toContainText("Non-refundable payment");
  await expect(panel).toContainText("not legal advice");
});

test("failure preserves user input and retry does not duplicate the turn", async ({ page }) => {
  let count = 0;
  await page.route("**/api/chat", route => {
    count++;
    return count === 1
      ? route.fulfill({ status: 502, json: { error: "The service is busy, please retry" } })
      : route.fulfill({ json: { reply: "Let's keep going. Do you care more about commute or convenience?", state, panel: "none" } });
  });
  await page.goto("/");
  await send(page, "I want to rent near NUS");
  await expect(page.locator(".conversation-error")).toContainText("The service is busy");
  await page.getByRole("button", { name: "Retry this message" }).click();
  await expect(page.getByText("Let's keep going. Do you care more about commute or convenience?")).toBeVisible();
  await expect(page.locator(".conversation-message.user")).toHaveCount(1);
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page.locator(".conversation-message")).toHaveCount(0);
});

test("phone and desktop keep page width and composer within viewport", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const box = await page.getByRole("textbox").boundingBox();
  expect(box?.width).toBeGreaterThan(200);
});
