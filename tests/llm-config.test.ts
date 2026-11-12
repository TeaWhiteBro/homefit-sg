import { describe, expect, it } from "vitest";
import { DEFAULT_BASE_URL, DEFAULT_MODEL, getLlmConfig } from "../lib/llm-config";

describe("model provider configuration", () => {
  it("is unconfigured without a key, so the chat reports it instead of faking a reply", () => {
    expect(getLlmConfig({})).toBeNull();
    expect(getLlmConfig({ LLM_API_KEY: "   " })).toBeNull();
  });
  it("uses the developer's own key with the verified defaults", () => {
    expect(getLlmConfig({ LLM_API_KEY: "test-key" })).toEqual({
      apiKey: "test-key", baseURL: DEFAULT_BASE_URL, model: DEFAULT_MODEL, host: "zenmux.ai", disableReasoning: true,
    });
  });
  it("prefers LLM_* over the older ZENMUX_* names, field by field", () => {
    const config = getLlmConfig({ LLM_API_KEY: "new", ZENMUX_API_KEY: "old", ZENMUX_MODEL: "old-model" });
    expect(config).toMatchObject({ apiKey: "new", model: "old-model" });
    expect(getLlmConfig({ ZENMUX_API_KEY: "old" })?.apiKey).toBe("old");
  });
  it("only sends ZenMux-specific switches to ZenMux", () => {
    const other = getLlmConfig({ LLM_API_KEY: "k", LLM_BASE_URL: "https://api.example.com/v1", LLM_MODEL: "some-model" });
    expect(other).toMatchObject({ host: "api.example.com", model: "some-model", disableReasoning: false });
  });
  it("reads an optional token budget and extra request fields, ignoring unusable values", () => {
    const minimax = getLlmConfig({
      LLM_API_KEY: "k", LLM_BASE_URL: "https://api.minimaxi.com/v1", LLM_MODEL: "MiniMax-M3.1-Flash",
      LLM_MAX_TOKENS: "4000", LLM_EXTRA_BODY: '{"reasoning_effort":"low"}',
    });
    expect(minimax).toMatchObject({ disableReasoning: false, maxTokens: 4000, extraBody: { reasoning_effort: "low" } });
    for (const bad of [{ LLM_MAX_TOKENS: "lots", LLM_EXTRA_BODY: "{not json" }, { LLM_MAX_TOKENS: "-5", LLM_EXTRA_BODY: "[1]" }]) {
      const config = getLlmConfig({ LLM_API_KEY: "k", ...bad });
      expect(config?.maxTokens).toBeUndefined();
      expect(config?.extraBody).toBeUndefined();
    }
  });
  it("rejects a malformed base URL", () => {
    expect(getLlmConfig({ LLM_API_KEY: "k", LLM_BASE_URL: "not a url" })).toBeNull();
  });
});
