// DO NOT EDIT. Auto-mounts /server/api route files. Add new APIs as new files instead.
// Routing cheat sheet: /server/api/_ROUTING.md
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect } from "vite";
import { getDb } from "@server/db";
import type { Auth } from "@server/auth";
import {
  type ApiHandler,
  type ApiSession,
  readBodyJson,
  sendJson,
} from "@server/http";

type ApiModule = Partial<
  Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS", ApiHandler>
>;

type RouteEntry = {
  pattern: RegExp;
  paramNames: string[];
  methods: ApiModule;
  specificity: number;
};

const METHOD_NAMES = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

/** "./api/todos/[id].ts" → relative "todos/[id]" */
function apiRelativePath(filePath: string): string | null {
  const normalized = filePath.replaceAll("\\", "/");
  const marker = "/api/";
  const idx = normalized.lastIndexOf(marker);
  if (idx === -1) return null;
  let rel = normalized.slice(idx + marker.length);
  if (rel.endsWith(".tsx")) rel = rel.slice(0, -4);
  else if (rel.endsWith(".ts")) rel = rel.slice(0, -3);
  else return null;
  return rel;
}

function compileRoute(filePath: string, mod: ApiModule): RouteEntry | null {
  const rel = apiRelativePath(filePath);
  if (!rel) return null;
  const base = rel.split("/").pop() ?? "";
  if (base.startsWith("_")) return null;

  const paramNames: string[] = [];
  let specificity = 0;
  const parts: string[] = [];

  for (const segment of rel.split("/")) {
    if (segment.startsWith("[") && segment.endsWith("]") && segment.length > 2) {
      paramNames.push(segment.slice(1, -1));
      parts.push("([^/]+)");
      continue;
    }
    // Static segments are path-safe identifiers — no regex metacharacters expected.
    if (!/^[A-Za-z0-9_-]+$/.test(segment)) return null;
    specificity += 1;
    parts.push(segment);
  }

  return {
    pattern: new RegExp("^" + parts.join("/") + "$"),
    paramNames,
    methods: mod,
    specificity,
  };
}

async function resolveSession(
  auth: Auth,
  req: IncomingMessage,
): Promise<ApiSession> {
  const { fromNodeHeaders } = await import("better-auth/node");
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    return (session as ApiSession) ?? null;
  } catch {
    return null;
  }
}

/**
 * Mounts handlers from /server/api (all .ts files) under /api.
 * Keep eager: true. Do not rewrite this file for new routes — add files under /server/api.
 * Dynamic segments: /server/api/notes/[id].ts → /api/notes/:id (params.id).
 */
export async function registerApiRoutes(
  middlewares: Connect.Server,
  auth: Auth,
): Promise<void> {
  // eager: true is required — do not switch to lazy loaders.
  const modules = import.meta.glob<ApiModule>("./api/**/*.ts", { eager: true });
  const routes: RouteEntry[] = [];

  for (const [filePath, mod] of Object.entries(modules)) {
    const entry = compileRoute(filePath, mod);
    if (!entry) continue;
    const hasHandler = METHOD_NAMES.some((m) => typeof entry.methods[m] === "function");
    if (!hasHandler) continue;
    routes.push(entry);
  }

  routes.sort((a, b) => b.specificity - a.specificity);

  middlewares.use(async (req, res, next) => {
    try {
      const rawUrl = req.url || "/";
      const pathname = rawUrl.split("?")[0] || "/";
      if (!pathname.startsWith("/api/") || pathname.startsWith("/api/auth")) {
        next();
        return;
      }

      const pathAfterApi = pathname.slice("/api/".length);
      const method = (req.method || "GET").toUpperCase() as (typeof METHOD_NAMES)[number];

      for (const route of routes) {
        const m = pathAfterApi.match(route.pattern);
        if (!m) continue;
        const handler = route.methods[method];
        if (!handler) {
          sendJson(res as ServerResponse, { error: "Method not allowed" }, 405);
          return;
        }

        const params: Record<string, string> = {};
        route.paramNames.forEach((name, i) => {
          params[name] = decodeURIComponent(m[i + 1] ?? "");
        });

        const session = await resolveSession(auth, req as IncomingMessage);
        const db = getDb();
        await handler({
          req: req as IncomingMessage,
          res: res as ServerResponse,
          db,
          auth,
          session,
          params,
          json: (data, status = 200) => sendJson(res as ServerResponse, data, status),
          readJson: <T = unknown>() => readBodyJson<T>(req as IncomingMessage),
        });
        return;
      }

      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal error";
      if (!(res as ServerResponse).headersSent) {
        sendJson(res as ServerResponse, { error: message }, 500);
      }
    }
  });
}
