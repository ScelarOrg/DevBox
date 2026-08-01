import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { requireUser, type ApiContext } from "@server/http";
import { notes } from "@server/schema";

/** GET /api/notes — list current user's notes */
export async function GET(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (!user) return;

  const rows = await ctx.db
    .select()
    .from(notes)
    .where(eq(notes.userId, user.id))
    .orderBy(desc(notes.updatedAt));

  ctx.json({ notes: rows });
}

/** POST /api/notes — create a note { title, body? } */
export async function POST(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (!user) return;

  const body = await ctx.readJson<{ title?: string; body?: string }>();
  const title = body?.title?.trim();
  if (!title) {
    ctx.json({ error: "title is required" }, 400);
    return;
  }

  const now = new Date();
  const row = {
    id: randomUUID(),
    userId: user.id,
    title,
    body: body?.body?.trim() ?? "",
    createdAt: now,
    updatedAt: now,
  };
  await ctx.db.insert(notes).values(row);
  ctx.json({ note: row }, 201);
}
