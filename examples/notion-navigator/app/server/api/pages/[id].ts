import { and, eq } from "drizzle-orm";
import { requireUser, type ApiContext } from "@server/http";
import { pages, dbProperties, dbRows } from "@server/schema";

/** GET /api/pages/:id */
export async function GET(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (!user) return;

  const id = ctx.params.id;
  const [row] = await ctx.db
    .select()
    .from(pages)
    .where(and(eq(pages.id, id), eq(pages.ownerId, user.id)))
    .limit(1);

  if (!row) {
    ctx.json({ error: "Not found" }, 404);
    return;
  }

  // If database page, also fetch properties and rows
  if (row.type === "database") {
    const [properties, rows] = await Promise.all([
      ctx.db
        .select()
        .from(dbProperties)
        .where(eq(dbProperties.databaseId, id))
        .orderBy(dbProperties.sortOrder),
      ctx.db
        .select()
        .from(dbRows)
        .where(eq(dbRows.databaseId, id))
        .orderBy(dbRows.sortOrder),
    ]);
    ctx.json({ page: row, properties, rows });
  } else {
    ctx.json({ page: row });
  }
}

/** PATCH /api/pages/:id */
export async function PATCH(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (!user) return;

  const id = ctx.params.id;
  const body = await ctx.readJson<{
    title?: string;
    icon?: string;
    cover?: string | null;
    content?: string;
    parentId?: string | null;
    sortOrder?: number;
    trashedAt?: null;
    properties?: Array<{
      id: string;
      name: string;
      type: string;
      options: string;
      sortOrder: number;
    }>;
  }>();

  const [existing] = await ctx.db
    .select()
    .from(pages)
    .where(and(eq(pages.id, id), eq(pages.ownerId, user.id)))
    .limit(1);

  if (!existing) {
    ctx.json({ error: "Not found" }, 404);
    return;
  }

  // Validate new parent if moving
  if (body?.parentId !== undefined && body.parentId !== existing.parentId) {
    if (body.parentId) {
      // Check parent exists and belongs to same user
      const [parent] = await ctx.db
        .select({ id: pages.id, ownerId: pages.ownerId })
        .from(pages)
        .where(eq(pages.id, body.parentId))
        .limit(1);

      if (!parent || parent.ownerId !== user.id) {
        ctx.json({ error: "Invalid parent" }, 400);
        return;
      }

      // Cycle check: prevent dropping page into its own descendant
      const isDescendant = await checkDescendant(ctx, id, body.parentId, user.id);
      if (isDescendant) {
        ctx.json({ error: "Cannot move page into its own descendant" }, 400);
        return;
      }
    }
  }

  const next: Record<string, unknown> = { updatedAt: new Date() };
  if (body?.title !== undefined) next.title = body.title;
  if (body?.icon !== undefined) next.icon = body.icon;
  if (body?.cover !== undefined) next.cover = body.cover;
  if (body?.content !== undefined) next.content = body.content;
  if (body?.parentId !== undefined) next.parentId = body.parentId;
  if (body?.sortOrder !== undefined) next.sortOrder = body.sortOrder;
  if (body?.trashedAt === null) next.trashedAt = null; // restore from trash

  await ctx.db
    .update(pages)
    .set(next)
    .where(and(eq(pages.id, id), eq(pages.ownerId, user.id)));

  // Upsert database properties if provided
  if (body?.properties && existing.type === "database") {
    for (const prop of body.properties) {
      const [existingProp] = await ctx.db
        .select()
        .from(dbProperties)
        .where(eq(dbProperties.id, prop.id))
        .limit(1);

      if (existingProp) {
        await ctx.db
          .update(dbProperties)
          .set({ name: prop.name, type: prop.type, options: prop.options, sortOrder: prop.sortOrder })
          .where(eq(dbProperties.id, prop.id));
      } else {
        await ctx.db.insert(dbProperties).values({
          id: prop.id,
          databaseId: id,
          name: prop.name,
          type: prop.type,
          options: prop.options,
          sortOrder: prop.sortOrder,
        });
      }
    }
  }

  const [updated] = await ctx.db
    .select()
    .from(pages)
    .where(eq(pages.id, id))
    .limit(1);

  ctx.json({ page: updated });
}

/** DELETE /api/pages/:id — soft delete (sets trashedAt) */
export async function DELETE(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (!user) return;

  const id = ctx.params.id;
  const [existing] = await ctx.db
    .select()
    .from(pages)
    .where(and(eq(pages.id, id), eq(pages.ownerId, user.id)))
    .limit(1);

  if (!existing) {
    ctx.json({ error: "Not found" }, 404);
    return;
  }

  if (existing.trashedAt) {
    // Already trashed — hard delete
    await ctx.db.delete(pages).where(eq(pages.id, id));
  } else {
    // Soft delete
    await ctx.db
      .update(pages)
      .set({ trashedAt: new Date() })
      .where(eq(pages.id, id));
  }

  ctx.json({ ok: true });
}

/** Check if targetId is a descendant of sourceId (cycle prevention) */
async function checkDescendant(
  ctx: ApiContext,
  sourceId: string,
  targetId: string,
  ownerId: string,
): Promise<boolean> {
  let currentId: string | null = targetId;
  let depth = 0;
  while (currentId && depth < 20) {
    if (currentId === sourceId) return true;
    const [row] = await ctx.db
      .select({ parentId: pages.parentId })
      .from(pages)
      .where(eq(pages.id, currentId))
      .limit(1);
    currentId = row?.parentId ?? null;
    depth++;
  }
  return false;
}
