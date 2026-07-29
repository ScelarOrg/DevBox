import { desc, eq, and, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { requireUser, type ApiContext } from "@server/http";
import { pages, dbRows } from "@server/schema";

/** GET /api/pages/:id/rows — list rows for a database */
export async function GET(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (!user) return;

  const id = ctx.params.id;

  // Verify ownership of database
  const [db] = await ctx.db
    .select({ id: pages.id, type: pages.type })
    .from(pages)
    .where(and(eq(pages.id, id), eq(pages.ownerId, user.id)))
    .limit(1);

  if (!db || db.type !== "database") {
    ctx.json({ error: "Database not found" }, 404);
    return;
  }

  const rows = await ctx.db
    .select()
    .from(dbRows)
    .where(eq(dbRows.databaseId, id))
    .orderBy(dbRows.sortOrder);

  ctx.json({ rows });
}

/** POST /api/pages/:id/rows — create a row */
export async function POST(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (!user) return;

  const id = ctx.params.id;

  // Verify ownership
  const [db] = await ctx.db
    .select({ id: pages.id, type: pages.type })
    .from(pages)
    .where(and(eq(pages.id, id), eq(pages.ownerId, user.id)))
    .limit(1);

  if (!db || db.type !== "database") {
    ctx.json({ error: "Database not found" }, 404);
    return;
  }

  const body = await ctx.readJson<{
    title?: string;
    properties?: string;
  }>();

  // Get max sortOrder
  const [maxRow] = await ctx.db
    .select({ maxSort: sql<number>`COALESCE(MAX(${dbRows.sortOrder}), 0)` })
    .from(dbRows)
    .where(eq(dbRows.databaseId, id));

  const now = new Date();
  const row = {
    id: randomUUID(),
    databaseId: id,
    title: body?.title?.trim() ?? "Untitled",
    properties: body?.properties ?? "{}",
    sortOrder: (maxRow?.maxSort ?? 0) + 1,
    createdAt: now,
    updatedAt: now,
  };

  await ctx.db.insert(dbRows).values(row);
  ctx.json({ row }, 201);
}
