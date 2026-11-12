// Interactive setup: asks for your own model API key and writes it to .env.local (git-ignored).
// Usage: npm run setup
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const FILE = new URL("../.env.local", import.meta.url);
const DEFAULTS = { LLM_BASE_URL: "https://zenmux.ai/api/v1", LLM_MODEL: "deepseek/deepseek-v4.1-flash" };

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
// An async iterator buffers lines, so pasted or piped answers are not lost between questions.
const lines = rl[Symbol.asyncIterator]();
let muted = false;
// Hide typed characters while the key is being entered.
rl._writeToOutput = text => { if (!muted) process.stdout.write(text); };
async function ask(question, { secret = false } = {}) {
  process.stdout.write(question);
  muted = secret && Boolean(process.stdin.isTTY);
  const { value = "" } = await lines.next();
  if (muted) process.stdout.write("\n");
  muted = false;
  return value.trim();
}

const existing = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
const current = Object.fromEntries(existing.split(/\r?\n/).map(line => line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/)).filter(Boolean).map(m => [m[1], m[2]]));

console.log("Configure the model provider for the chat assistant (written only to .env.local, which git ignores). Press Enter to accept the value in brackets.\n");
const baseUrl = await ask(`API base URL (${current.LLM_BASE_URL || DEFAULTS.LLM_BASE_URL}): `) || current.LLM_BASE_URL || DEFAULTS.LLM_BASE_URL;
const model = await ask(`Model (${current.LLM_MODEL || DEFAULTS.LLM_MODEL}): `) || current.LLM_MODEL || DEFAULTS.LLM_MODEL;
const hasKey = Boolean(current.LLM_API_KEY);
const key = await ask(hasKey ? "API key (hidden; press Enter to keep the current one): " : "API key (hidden): ", { secret: true }) || current.LLM_API_KEY || "";
rl.close();

try { new URL(baseUrl); } catch { console.error(`\nThe API base URL is not a valid URL: ${baseUrl}`); process.exit(1); }
if (!key) { console.error("\nNo API key entered; .env.local was not changed."); process.exit(1); }

// Replace our three variables and keep any other lines the developer already has.
const values = { LLM_API_KEY: key, LLM_BASE_URL: baseUrl, LLM_MODEL: model };
const kept = existing.split(/\r?\n/).filter(line => line.trim() && !/^\s*LLM_(API_KEY|BASE_URL|MODEL)\s*=/.test(line));
const output = ["# Written by `npm run setup`. Server-only; do not commit.", ...Object.entries(values).map(([k, v]) => `${k}=${v}`), ...kept.filter(line => !line.startsWith("# Written by"))].join("\n") + "\n";
writeFileSync(FILE, output, { mode: 0o600 });

console.log(`\nWrote .env.local (host ${new URL(baseUrl).host}, model ${model}).`);
console.log("Next: run npm run check-ai to confirm the key works, then npm run dev. Restart a running server to pick up the new settings.");
