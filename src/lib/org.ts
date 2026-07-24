import { getDb, isDbConfigured } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { Organization } from "@/lib/db/schema";

export const DEMO_ORG_SLUG = "ventureos";

/**
 * Resolves the active organization. This is a single-tenant demo resolution:
 * we return the seeded demo org (or the first org that exists). Returns null if
 * the database isn't configured or has no organizations yet, so pages can render
 * a friendly setup state instead of crashing.
 */
export async function getCurrentOrg(): Promise<Organization | null> {
  if (!isDbConfigured()) return null;
  try {
    const db = getDb();
    const bySlug = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, DEMO_ORG_SLUG))
      .limit(1);
    if (bySlug[0]) return bySlug[0];

    const first = await db.select().from(organizations).limit(1);
    return first[0] ?? null;
  } catch (err) {
    console.error("getCurrentOrg failed:", err);
    return null;
  }
}

/** Throwing variant for API routes / server actions that require an org. */
export async function requireOrg(): Promise<Organization> {
  const org = await getCurrentOrg();
  if (!org) {
    throw new Error(
      "No organization found. Configure DATABASE_URL and run `npm run db:seed`."
    );
  }
  return org;
}
