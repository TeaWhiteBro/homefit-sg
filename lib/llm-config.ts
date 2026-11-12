/**
 * The single place where the server learns which model provider to call.
 * Each developer supplies their own key in .env.local (see .env.example or run `npm run setup`).
 * LLM_* is the current naming; ZENMUX_* is still read so older local setups keep working.
 */
export const DEFAULT_BASE_URL = "https://zenmux.ai/api/v1";
export const DEFAULT_MODEL = "deepseek/deepseek-v4.1-flash";

export interface LlmConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  /** Host only, safe to show in health checks and logs. */
  host: string;
  /**
   * ZenMux accepts `reasoning` / `thinking` switches to turn off DeepSeek's reasoning output; that is the only
   * setup these were verified on. Other OpenAI-compatible providers may reject unknown fields, so they are omitted.
   */
  disableReasoning: boolean;
  /** LLM_MAX_TOKENS: completion budget for every call. Unset keeps the app's own 2000 / 1600. */
  maxTokens?: number;
  /**
   * LLM_EXTRA_BODY: provider-specific request fields as a JSON object, sent with every call.
   * MiniMax-M3.1-Flash always thinks and counts thinking against the budget, so the AWS deployment uses
   * {"reasoning_effort":"low"} with LLM_MAX_TOKENS=4000 to keep replies from being cut off.
   */
  extraBody?: Record<string, unknown>;
}

type Env = Record<string, string | undefined>;

function read(env: Env, name: string): string | undefined {
  const value = env[`LLM_${name}`] ?? env[`ZENMUX_${name}`];
  return value?.trim() || undefined;
}

function readMaxTokens(env: Env): number | undefined {
  const value = Number(read(env, "MAX_TOKENS"));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

/** Ignores anything that is not a JSON object, so a typo cannot break every chat request. */
function readExtraBody(env: Env): Record<string, unknown> | undefined {
  const raw = read(env, "EXTRA_BODY");
  if (!raw) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

export function getLlmConfig(env: Env = process.env): LlmConfig | null {
  const apiKey = read(env, "API_KEY");
  if (!apiKey) return null;
  const baseURL = read(env, "BASE_URL") ?? DEFAULT_BASE_URL;
  let host: string;
  try { host = new URL(baseURL).host; } catch { return null; }
  return {
    apiKey, baseURL, host,
    model: read(env, "MODEL") ?? DEFAULT_MODEL,
    disableReasoning: host === "zenmux.ai" || host.endsWith(".zenmux.ai"),
    maxTokens: readMaxTokens(env),
    extraBody: readExtraBody(env),
  };
}
