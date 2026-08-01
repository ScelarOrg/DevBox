// Next.js integration. Two ways in:
//
//   1. App Router route handler (works Next 13 through 16):
//
//        // app/__sw__.js/route.ts
//        export { GET } from '@scelar/nodepod/next';
//
//   2. Composable for users who already have a proxy.ts / middleware.ts:
//
//        // Next 16+ (proxy.ts)                  // Next <=15 (middleware.ts)
//        import { nodepodProxy } from            import { nodepodMiddleware } from
//          '@scelar/nodepod/next';                 '@scelar/nodepod/next';
//
// `nodepodProxy` and `nodepodMiddleware` are the same function under two
// names. Next 16 renamed `middleware.ts` to `proxy.ts`
// (https://nextjs.org/docs/app/getting-started/proxy), but NextRequest /
// NextResponse didn't change, so one implementation covers both.
//
// next/server is imported lazily so this file still parses in bundlers /
// test harnesses that don't have `next` installed.

import type { NextRequest, NextResponse as NextResponseType } from "next/server";
import { readServiceWorkerSource } from "./shared/read-sw";
import { swResponseHeaders, DEFAULT_SW_PATH } from "./shared/headers";

/** Drop-in matcher for `export const config = { matcher: nodepodMatcher }`. */
export const nodepodMatcher = DEFAULT_SW_PATH;

async function buildResponse(): Promise<NextResponseType> {
  const { NextResponse } = await import("next/server");
  const body = await readServiceWorkerSource(import.meta.url);
  return new NextResponse(body, {
    status: 200,
    headers: swResponseHeaders(),
  });
}

/**
 * Route handler for `app/__sw__.js/route.ts`.
 *
 * ```ts
 * export { GET } from '@scelar/nodepod/next';
 * ```
 */
export async function GET(): Promise<NextResponseType> {
  return buildResponse();
}

/**
 * Composable handler for Next 16's `proxy.ts` or Next <=15's `middleware.ts`.
 * Returns a response for the SW path, or `null` so the caller's own logic
 * can take over.
 *
 * Also exported as `nodepodMiddleware` for projects still on Next <=15.
 */
export async function nodepodProxy(
  req: NextRequest,
): Promise<NextResponseType | null> {
  if (req.nextUrl.pathname !== DEFAULT_SW_PATH) return null;
  return buildResponse();
}

/** Alias of {@link nodepodProxy} for Next <=15 (`middleware.ts`). */
export const nodepodMiddleware = nodepodProxy;
