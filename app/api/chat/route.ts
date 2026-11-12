import { parseConversationRequest } from "@/lib/conversation";
import { converse } from "@/lib/conversation-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > 50000) return json({ error: "Your message is too long. Please shorten it and try again." }, 413);
  let input: unknown;
  try { input = JSON.parse(body); } catch { return json({ error: "The request format is invalid." }, 400); }
  const parsed = parseConversationRequest(input);
  if (!parsed.ok) return json({ error: parsed.message }, 400);
  try { return json(await converse(parsed.turns, request.signal)); }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = typeof error === "object" && error && "status" in error ? error.status : undefined;
    if (message === "AI_NOT_CONFIGURED") return json({ error: "AI is not connected yet. Run npm run setup to add your own API key (or set LLM_API_KEY in .env.local), then restart the server.", code: message }, 503);
    if (status === 401 || status === 403) return json({ error: "The AI service rejected the API key. Check that LLM_API_KEY and LLM_BASE_URL in .env.local match; npm run check-ai can help.", code: "AI_AUTH_FAILED" }, 502);
    if (status === 402) return json({ error: "The AI account is out of credit or cannot use this model. Top up the account for this API key, or switch to another key or model in .env.local.", code: "AI_NO_CREDIT" }, 502);
    if (status === 429) return json({ error: "The AI is busy right now. Please try again shortly; your conversation is kept.", code: "RATE_LIMITED" }, 429);
    if (message === "MODEL_INVALID_OUTPUT") return json({ error: "The AI reply was incomplete. Please try again; your conversation is kept.", code: message }, 502);
    return json({ error: "Couldn’t finish the reply. Please try again; your conversation is kept.", code: "MODEL_UNAVAILABLE" }, 502);
  }
}
