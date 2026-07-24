import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireOrg } from "@/lib/org";
import { runAgent } from "@/lib/ai/orchestrator";
import { copilotTypeEnum } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  input: z.string().min(1).max(4000),
  copilotType: z.enum(copilotTypeEnum.enumValues).default("general"),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  let org;
  try {
    org = await requireOrg();
  } catch (err) {
    const message = err instanceof Error ? err.message : "No organization";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const session = await auth();
  const googleAccessToken = session?.accessToken;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runAgent({
          org,
          copilotType: parsed.copilotType,
          input: parsed.input,
          googleAccessToken,
        })) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Agent failed";
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "error", message }) + "\n")
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
