import { desc, eq, and, isNull, sql, like } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { requireUser, type ApiContext } from "@server/http";
import { pages } from "@server/schema";

/** GET /api/pages — list current user's pages */
export async function GET(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (!user) return;

  const url = new URL(ctx.req.url ?? "/", `http://${ctx.req.headers.host}`);
  const parentId = url.searchParams.get("parentId");
  const trashed = url.searchParams.get("trashed") === "true";
  const search = url.searchParams.get("search");

  const conditions = [eq(pages.ownerId, user.id)];

  if (trashed) {
    conditions.push(sql`${pages.trashedAt} IS NOT NULL`);
  } else {
    conditions.push(isNull(pages.trashedAt));
  }

  // Search by title (when search is provided, ignore parentId to search all)
  if (search && search.trim().length >= 1) {
    conditions.push(like(pages.title, `%${search.trim()}%`));
  } else if (parentId === "root" || parentId === null) {
    conditions.push(isNull(pages.parentId));
  } else if (parentId) {
    conditions.push(eq(pages.parentId, parentId));
  }

  const rows = await ctx.db
    .select()
    .from(pages)
    .where(and(...conditions))
    .orderBy(pages.sortOrder);

  ctx.json({ pages: rows });
}

/** POST /api/pages — create a page { parentId?, type?, title?, icon? } */
export async function POST(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (!user) return;

  const body = await ctx.readJson<{
    parentId?: string | null;
    type?: string;
    title?: string;
    icon?: string;
  }>();

  // Validate parent if provided
  if (body?.parentId) {
    const [parent] = await ctx.db
      .select({ id: pages.id, ownerId: pages.ownerId })
      .from(pages)
      .where(eq(pages.id, body.parentId))
      .limit(1);

    if (!parent || parent.ownerId !== user.id) {
      ctx.json({ error: "Parent not found" }, 404);
      return;
    }
  }

  // Get max sortOrder among siblings
  const parentCondition = body?.parentId
    ? eq(pages.parentId, body.parentId)
    : isNull(pages.parentId);

  const [maxRow] = await ctx.db
    .select({ maxSort: sql<number>`COALESCE(MAX(${pages.sortOrder}), 0)` })
    .from(pages)
    .where(and(eq(pages.ownerId, user.id), parentCondition, isNull(pages.trashedAt)));

  const now = new Date();
  const row = {
    id: randomUUID(),
    ownerId: user.id,
    parentId: body?.parentId ?? null,
    type: body?.type ?? "page",
    title: body?.title?.trim() ?? "",
    icon: body?.icon ?? null,
    cover: null,
    content: "[]",
    sortOrder: (maxRow?.maxSort ?? 0) + 1,
    trashedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await ctx.db.insert(pages).values(row);
  ctx.json({ page: row }, 201);
}
