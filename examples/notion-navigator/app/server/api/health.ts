import type { ApiContext } from "@server/http";

/** GET /api/health — public ping */
export async function GET({ json }: ApiContext) {
  json({ ok: true });
}
