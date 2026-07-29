import { and, eq } from "drizzle-orm";
import { requireUser, type ApiContext } from "@server/http";
import { notes } from "@server/schema";

/** GET /api/notes/:id */
export async function GET(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (!user) return;

  const id = ctx.params.id;
  const [row] = await ctx.db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, user.id)))
    .limit(1);

  if (!row) {
    ctx.json({ error: "Not found" }, 404);
    return;
  }
  ctx.json({ note: row });
}

/** PATCH /api/notes/:id — { title?, body? } */
export async function PATCH(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (!user) return;

  const id = ctx.params.id;
  const body = await ctx.readJson<{ title?: string; body?: string }>();
  const [existing] = await ctx.db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, user.id)))
    .limit(1);

  if (!existing) {
    ctx.json({ error: "Not found" }, 404);
    return;
  }

  const title = body?.title?.trim();
  const next = {
    title: title || existing.title,
    body: typeof body?.body === "string" ? body.body : existing.body,
    updatedAt: new Date(),
  };
  await ctx.db
    .update(notes)
    .set(next)
    .where(and(eq(notes.id, id), eq(notes.userId, user.id)));

  ctx.json({ note: { ...existing, ...next } });
}

/** DELETE /api/notes/:id */
export async function DELETE(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (!user) return;

  const id = ctx.params.id;
  const [existing] = await ctx.db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, user.id)))
    .limit(1);

  if (!existing) {
    ctx.json({ error: "Not found" }, 404);
    return;
  }

  await ctx.db
    .delete(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, user.id)));

  ctx.json({ ok: true });
}
