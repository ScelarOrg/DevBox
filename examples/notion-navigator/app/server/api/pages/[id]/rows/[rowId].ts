import { and, eq } from "drizzle-orm";
import { requireUser, type ApiContext } from "@server/http";
import { pages, dbRows } from "@server/schema";

/** PATCH /api/pages/:id/rows/:rowId */
export async function PATCH(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (!user) return;

  const { id, rowId } = ctx.params;

  // Verify database ownership
  const [db] = await ctx.db
    .select({ id: pages.id, type: pages.type })
    .from(pages)
    .where(and(eq(pages.id, id), eq(pages.ownerId, user.id)))
    .limit(1);

  if (!db || db.type !== "database") {
    ctx.json({ error: "Database not found" }, 404);
    return;
  }

  const [existing] = await ctx.db
    .select()
    .from(dbRows)
    .where(and(eq(dbRows.id, rowId), eq(dbRows.databaseId, id)))
    .limit(1);

  if (!existing) {
    ctx.json({ error: "Row not found" }, 404);
    return;
  }

  const body = await ctx.readJson<{
    title?: string;
    properties?: string;
    sortOrder?: number;
  }>();

  const next: Record<string, unknown> = { updatedAt: new Date() };
  if (body?.title !== undefined) next.title = body.title;
  if (body?.properties !== undefined) next.properties = body.properties;
  if (body?.sortOrder !== undefined) next.sortOrder = body.sortOrder;

  await ctx.db
    .update(dbRows)
    .set(next)
    .where(and(eq(dbRows.id, rowId), eq(dbRows.databaseId, id)));

  const [updated] = await ctx.db
    .select()
    .from(dbRows)
    .where(eq(dbRows.id, rowId))
    .limit(1);

  ctx.json({ row: updated });
}

/** DELETE /api/pages/:id/rows/:rowId */
export async function DELETE(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (!user) return;

  const { id, rowId } = ctx.params;

  // Verify database ownership
  const [db] = await ctx.db
    .select({ id: pages.id, type: pages.type })
    .from(pages)
    .where(and(eq(pages.id, id), eq(pages.ownerId, user.id)))
    .limit(1);

  if (!db || db.type !== "database") {
    ctx.json({ error: "Database not found" }, 404);
    return;
  }

  const [existing] = await ctx.db
    .select({ id: dbRows.id })
    .from(dbRows)
    .where(and(eq(dbRows.id, rowId), eq(dbRows.databaseId, id)))
    .limit(1);

  if (!existing) {
    ctx.json({ error: "Row not found" }, 404);
    return;
  }

  await ctx.db.delete(dbRows).where(eq(dbRows.id, rowId));
  ctx.json({ ok: true });
}
