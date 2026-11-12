import { getLlmConfig } from "@/lib/llm-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  const config = getLlmConfig();
  return Response.json(
    {
      ok: true,
      service: "homefit-sg",
      version: "0.1.0",
      aiConfigured: config !== null,
      // Host and model only; the key itself is never returned.
      ...(config ? { aiProvider: config.host, aiModel: config.model } : {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
