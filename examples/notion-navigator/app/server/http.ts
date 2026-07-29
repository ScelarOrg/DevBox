import type { IncomingMessage, ServerResponse } from "node:http";
import type { Db } from "@server/db";
import type { Auth } from "@server/auth";

export type ApiUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
};

export type ApiSession = {
  user: ApiUser;
  session: Record<string, unknown>;
} | null;

export type ApiContext = {
  req: IncomingMessage;
  res: ServerResponse;
  db: Db;
  auth: Auth;
  session: ApiSession;
  params: Record<string, string>;
  json: (data: unknown, status?: number) => void;
  readJson: <T = unknown>() => Promise<T>;
};

export type ApiHandler = (ctx: ApiContext) => void | Promise<void>;

export function sendJson(
  res: ServerResponse,
  data: unknown,
  status = 200,
): void {
  const body = JSON.stringify(data);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(body);
}

export async function readBodyJson<T = unknown>(
  req: IncomingMessage,
): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return null as T;
  return JSON.parse(raw) as T;
}

/** Returns the signed-in user, or sends 401 and returns null. */
export function requireUser(ctx: ApiContext): ApiUser | null {
  if (!ctx.session?.user) {
    ctx.json({ error: "Unauthorized" }, 401);
    return null;
  }
  return ctx.session.user;
}
