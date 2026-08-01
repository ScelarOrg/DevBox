// Framework-agnostic handlers for serving /__sw__.js.
//
// serveSW() returns a Fetch Response (Hono, Bun, Cloudflare, Next route
// handlers, Node 20+). serveSWNode() returns a Buffer + header map for
// Express / Fastify / bare http.

import { Buffer } from "node:buffer";
import { readServiceWorkerSource } from "./shared/read-sw";
import { swResponseHeaders, DEFAULT_SW_PATH } from "./shared/headers";

export { DEFAULT_SW_PATH };

export async function getServiceWorkerSource(): Promise<string> {
  return readServiceWorkerSource(import.meta.url);
}

/**
 * Fetch-API handler. The caller is responsible for only routing the SW
 * path here, so we don't bother looking at the request.
 *
 * @example
 *   // Hono
 *   app.get('/__sw__.js', () => serveSW())
 *
 *   // Next.js app/__sw__.js/route.ts
 *   export async function GET() { return serveSW() }
 */
export async function serveSW(_req?: Request): Promise<Response> {
  const body = await getServiceWorkerSource();
  return new Response(body, {
    status: 200,
    headers: swResponseHeaders(),
  });
}

export interface NodeServeSWResult {
  body: Buffer;
  headers: Record<string, string>;
  /** Same as headers["Content-Type"], just exposed inline for convenience. */
  contentType: string;
}

/**
 * Node-native handler for Express / Fastify / bare http.createServer.
 *
 * @example
 *   app.get('/__sw__.js', async (_req, res) => {
 *     const { body, headers } = await serveSWNode();
 *     for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
 *     res.status(200).send(body);
 *   });
 */
export async function serveSWNode(): Promise<NodeServeSWResult> {
  const source = await getServiceWorkerSource();
  const headers = swResponseHeaders();
  return {
    body: Buffer.from(source, "utf8"),
    headers,
    contentType: headers["Content-Type"],
  };
}
