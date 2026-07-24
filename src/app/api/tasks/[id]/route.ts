import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg } from "@/lib/org";
import { getDb } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  title: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const org = await requireOrg();
  const body = patchSchema.parse(await req.json());
  const db = getDb();
  const [row] = await db
    .update(tasks)
    .set(body)
    .where(and(eq(tasks.id, params.id), eq(tasks.orgId, org.id)))
    .returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ task: row });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const org = await requireOrg();
  const db = getDb();
  await db
    .delete(tasks)
    .where(and(eq(tasks.id, params.id), eq(tasks.orgId, org.id)));
  return NextResponse.json({ ok: true });
}
