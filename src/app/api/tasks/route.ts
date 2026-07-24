import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg } from "@/lib/org";
import { getDb } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  owner: z.string().optional(),
  dueDate: z.string().optional(),
});

export async function GET() {
  const org = await requireOrg();
  const db = getDb();
  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.orgId, org.id))
    .orderBy(desc(tasks.createdAt));
  return NextResponse.json({ tasks: rows });
}

export async function POST(req: NextRequest) {
  const org = await requireOrg();
  const body = createSchema.parse(await req.json());
  const db = getDb();
  const [row] = await db
    .insert(tasks)
    .values({
      orgId: org.id,
      title: body.title,
      description: body.description,
      priority: body.priority ?? "medium",
      owner: body.owner,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      source: "manual",
    })
    .returning();
  return NextResponse.json({ task: row });
}
