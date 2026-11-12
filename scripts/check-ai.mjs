// Sends one tiny request to the configured model provider to confirm the key works.
// Uses the same settings as the app: environment variables first, then .env.local; LLM_* before ZENMUX_*.
// This is a real API call and costs a very small amount. The key is never printed.
// Usage: npm run check-ai
import { existsSync, readFileSync } from "node:fs";

const file = new URL("../.env.local", import.meta.url);
const fromFile = existsSync(file) ? Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/)
  .map(line => line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^["']|["']$/g, "")])) : {};
const env = { ...fromFile, ...process.env };
const read = name => (env[`LLM_${name}`] ?? env[`ZENMUX_${name}`])?.trim() || undefined;

const apiKey = read("API_KEY");
const baseURL = read("BASE_URL") ?? "https://zenmux.ai/api/v1";
const model = read("MODEL") ?? "deepseek/deepseek-v4.1-flash";
if (!apiKey) {
  console.error("No API key found. Run npm run setup, or set LLM_API_KEY in .env.local.");
  process.exit(1);
}
let host;
try { host = new URL(baseURL).host; } catch { console.error(`LLM_BASE_URL is not a valid URL: ${baseURL}`); process.exit(1); }
const zenmux = host === "zenmux.ai" || host.endsWith(".zenmux.ai");

console.log(`Checking ${host}, model ${model} …`);
const started = Date.now();
try {
  const response = await fetch(baseURL.replace(/\/$/, "") + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, max_completion_tokens: 20, messages: [{ role: "user", content: "Reply with the single word OK." }],
      ...(zenmux ? { reasoning: { enabled: false }, thinking: { type: "disabled" } } : {}),
    }),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  const safe = text.split(apiKey).join("[REDACTED]").slice(0, 600);
  // Set exitCode rather than calling process.exit(): exiting while the HTTP connection closes crashes Node on Windows.
  if (!response.ok) {
    console.error(`Failed: HTTP ${response.status}\n${safe}`);
    if (response.status === 401 || response.status === 403) console.error("Key rejected: check that the key is correct and belongs to the same provider as LLM_BASE_URL.");
    if (response.status === 402) console.error("The key works, but the account is out of credit or cannot use this model: top up the account or choose another model.");
    if (response.status === 404) console.error("The URL or model name may be wrong: check LLM_BASE_URL (usually ends in /v1) and LLM_MODEL.");
    process.exitCode = 1;
  } else {
    const reply = JSON.parse(text).choices?.[0]?.message?.content ?? "";
    console.log(`OK: HTTP ${response.status} in ${Date.now() - started} ms, model replied ${JSON.stringify(reply.trim().slice(0, 40))}`);
    console.log("You can now run npm run dev.");
  }
} catch (error) {
  console.error(`The request did not complete: ${error instanceof Error ? error.message : error}`);
  console.error("Check your network, proxy and LLM_BASE_URL.");
  process.exitCode = 1;
}
