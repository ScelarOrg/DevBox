# API routing (read this — do not edit register-api or vite.config)

File path under /server/api → HTTP path under /api

| File | Methods you export | URL | params |
|------|-------------------|-----|--------|
| notes.ts | GET, POST | /api/notes | — |
| notes/[id].ts | GET, PATCH, DELETE | /api/notes/:id | params.id |
| pages/[pageId]/blocks.ts | GET, POST | /api/pages/:pageId/blocks | params.pageId |
| pages/[pageId]/blocks/[id].ts | PATCH, DELETE | /api/pages/:pageId/blocks/:id | params.pageId, params.id |

Rules:
1. Export named functions: GET, POST, PUT, PATCH, DELETE.
2. Import from `@server/http`, `@server/schema`, `drizzle-orm` — never `../../../`.
3. Use `requireUser(ctx)` for protected routes.
4. Bracket folder/file names become params: `[id]` → `params.id`, `[pageId]` → `params.pageId`.
5. Collection handlers live in `resource.ts`; single-item handlers in `resource/[id].ts`. Do not put PATCH/DELETE for one item on the collection file.
6. Files/folders starting with `_` are ignored by the router (like this file).
7. Never edit /server/register-api.ts or /vite.config.ts to add APIs.
