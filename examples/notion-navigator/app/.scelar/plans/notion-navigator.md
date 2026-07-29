# Notion-Navigator

A faithful Notion clone: account-based personal workspace with a sidebar tree of nested pages, a Notion-style block editor (slash menu, drag-to-reorder, blocks), and Notion-style databases with table + board views, properties, and filters. Auth-backed with cloud sync via Better Auth + Drizzle + file-based `/server/api` routes.

## Architecture & Stack

- **Auth & persistence (locked):** Build runs `setup_auth` first with `email:true` (sign-up, email verification, password reset). Scaffold adds Better Auth + Drizzle (getDb on node:sqlite) + `/api/auth` + file-based `/server/api` routes.
- **Data model:** Drizzle schema in `schema.ts` + `ensure-schema.ts`; CRUD routes copy the `/server/api/notes.ts` + `notes/[id].ts` pattern (nested resources as `resource/[parentId]/child.ts`).
- **Block editor:** `@blocknote/core` + `@blocknote/react`. ProseMirror-based Notion-style editor shipping a built-in slash menu, drag-handle side menu, and a JSON block schema (`Block[]`) we persist as a text column. Integrate thinly first (mount `BlockNoteView`), then wire persistence + custom slash items. We skip the `@blocknote/mantine` styling package and theme the editor via CSS targeting `.bn-*` classes mapped to our tokens.
- **Drag-drop for sidebar tree:** `@dnd-kit/core` + `@dnd-kit/sortable` for reordering/nesting pages in the sidebar.

## Data Model (schema.ts)

```
pages
  id            text pk
  ownerId       text not null  -> users.id  (Better Auth user)
  parentId      text nullable  -> pages.id  (null = top-level in workspace)
  type          text not null default 'page'   -- 'page' | 'database'
  title         text not null default ''
  icon          text            -- emoji
  cover         text            -- image url or null
  content       text not null default '[]'    -- JSON BlockNote Block[] (page) ; '[]' (database)
  sortOrder     integer not null default 0
  trashedAt     integer nullable               -- soft-delete; null = live
  createdAt     integer not null
  updatedAt     integer not null

db_properties   (only rows where pages.type='database')
  id            text pk
  databaseId    text not null -> pages.id (type='database')
  name          text not null
  type          text not null  -- 'text'|'number'|'select'|'multi_select'|'checkbox'|'date'|'status'
  options       text not null default '{}' -- JSON {id,label,color}[] for select/multi/status
  sortOrder     integer not null default 0

db_rows
  id            text pk
  databaseId    text not null -> pages.id (type='database')
  title         text not null default ''
  properties    text not null default '{}' -- JSON {propertyId: value}
  sortOrder     integer not null default 0
  createdAt     integer not null
  updatedAt     integer not null
```

Indexes: `pages(ownerId, parentId, trashedAt)`, `db_properties(databaseId)`, `db_rows(databaseId)`.

## Server API routes

Copy the notes pattern (`/server/api/notes.ts` + `notes/[id].ts`).

- `GET    /server/api/pages` — list current user's pages. Query `?parentId=<id|root>&trashed=true|false`. Returns flat array (client builds tree). 401 if no session.
- `POST   /server/api/pages` — create. Body `{parentId?, type, title?, icon?}`. Sets `sortOrder` to max sibling +1.
- `GET    /server/api/pages/[id]` — get one (own page) including, for databases, its `db_properties` and `db_rows`.
- `PATCH  /server/api/pages/[id]` — update `title`, `icon`, `cover`, `content` (page), `parentId`/`sortOrder` (move/reorder/nest). For databases, also upsert `db_properties` (array in body).
- `DELETE /server/api/pages/[id]` — soft delete: set `trashedAt`. Restoring via PATCH `trashedAt=null`. Hard delete when already trashed.
- `POST   /server/api/pages/[id]/rows` — create a `db_row` (sortOrder max+1).
- `PATCH  /server/api/pages/[id]/rows/[rowId]` — update `title`, `properties`, `sortOrder`.
- `DELETE /server/api/pages/[id]/rows/[rowId]` — hard delete row.

Every route asserts `page.ownerId === session.user.id` (and parent ownership on create/move); 403 otherwise.

## Routes & Pages (react-router 8 data mode)

- `/login`, `/signup` — auth forms (Better Auth client: `createAuthClient` from `/api/auth`).
- `/` — redirect to `/workspace` (RequireAuth).
- `/workspace` — `WorkspaceLayout`: sidebar page tree + top bar (workspace title, search button, new-page button, user menu). Index redirect to first top-level page (or an empty-state offering "Create your first page").
- `/workspace/page/:pageId` — `PageEditor`. Loads page + children. BlockNote editor bound to `page.content`. Breadcrumb of ancestors. Sub-page chips / children list at bottom. Page header: icon picker (emoji), title (contentEditable), cover toggle.
- `/workspace/database/:pageId` — `DatabaseView`. Tabs: Table | Board. Properties as columns; inline editable cells. Add-row, add-property, property-type menu, row open-as-page (a database row can also be opened as a page detail dialog). Board view groups by a `status`/`select` property with drag-between columns (dnd-kit).
- `/workspace/search` — command-palette search over titles (uses `command` primitive); navigates to matches.
- `/trash` — list trashed pages, restore / delete-forever.
- `RequireAuth` wrapper gates everything except `/login`/`/signup`; redirects to `/login` when no session.

## Interactions & Edge Cases

- **Block editor:** typing `/` opens slash menu (built-in). Enter creates a new block; backspace at block start merges. Drag handle (left hover grip) reorders blocks; changes serialize `content` and PATCH (debounced, e.g. 800ms). Unsaved indicator in top bar; explicit save on blur.
- **Sidebar tree:** expand/collapse per node (persist open-state in localStorage keyed by user). `+` on hover adds a child page. Drag page to reparent/reorder (dnd-kit); optimistic PATCH `parentId`/`sortOrder`. Prevent dropping a page into its own descendant (cycle check client-side, server re-validates ownership).
- **Databases:** add property via `+` column header with type menu (select/multi/status open an options editor popover). Filters bar: property = value (equals/contains) for table; board picks one group-by property. Empty database shows "Add your first property" + "Add row".
- **Auth/empty states:** no pages → friendly empty workspace ("Start writing"). 404 page-not-found handled by RouteError. Server 401 mid-session → redirect to `/login`.
- **Optimistic UI with toast rollback** on save/parent-move failure.

## Design direction

- **Subject & audience:** personal knowledge workspace for writers, students, and PMs who live in docs. **One job:** capture and organize thoughts in nested pages and lightweight databases without friction.
- **Theme:** both (dark default, light toggle) — Notion ships both and faithful clone requires it. Justification: Notion's identity is the calm, near-monochrome canvas; we default dark (matches `<html class="dark">`) and expose a light theme via CSS variable swap.
- **Palette (mapped to CSS vars in index.css):**
  - `--canvas` / `bg-background` — page canvas: light `#ffffff`, dark `#191919`
  - `--surface` / `bg-card` — sidebar & chrome: light `#f7f7f5`, dark `#202020`
  - `--ink` / `text-foreground` — primary text: light `#37352f`, dark `#e1e1e1`
  - `--ink-muted` / `text-muted-foreground` — secondary text: light `#787774`, dark `#9b9a97`
  - `--accent` — links / active row: `#2383e2` (Notion blue), used sparingly
  - `--line` / `border-border` — hairlines: light `#ebebea`, dark `#2e2e2e`
- **Type:** display + body both **Inter** (system stack fallback) — Notion's neutrality comes from a single quiet sans; headings gain weight, not a new face. **Geist Mono** for code blocks.
- **Layout:** left fixed sidebar (240px, collapsible to icons) + fluid canvas with max-width ~720px for prose comfort; top breadcrumb rail; block editor centered.
- **Signature element:** the **inline slash menu** — a compact command-style floating menu appearing at the caret with categorized block inserts and fuzzy search; this is the Notion interaction and we make it the signature.
- **3 AI-slop patterns to avoid:** (1) indigo/purple gradient SaaS hero — Notion is monochrome, not chromatic; (2) identical feature-card grid landing pages — this is an app, no marketing grid; (3) decorative 01/02/03 numbered markers and pill-spam chrome — Notion chrome is whisper-quiet.

## Definition of Done

- User can sign up, verify email, sign in, sign out, reset password.
- Workspace shows a sidebar tree; create/rename/icon/cover/delete/restore pages; nest via drag-drop (with cycle prevention); reorder siblings.
- Page editor: paragraph, h1–h3, bullet/numbered/todo list, toggle, quote, code, callout blocks via slash menu; drag-reorder blocks; edits persist (debounced) to the DB and reload on refresh.
- Database page: create properties (text/number/select/multi/checkbox/date/status), edit cells inline, table view with filters, board view grouped by a select/status property with drag-between columns, add/delete rows.
- Search finds pages by title; trash page restore + delete-forever work.
- Both light & dark themes render correctly; all states (empty, loading, error, 403/401) handled with real copy.

## Implementation Todos

- [ ] **auth-scaffold** Run `setup_auth` with `email:true`; verify `/api/auth` + Drizzle `getDb` + `/server/api` pattern exist.
- [ ] **schema** Add `pages`, `db_properties`, `db_rows` tables to `schema.ts` + `ensure-schema.ts` with indexes and ownership FKs.
- [ ] **pages-api** Implement `/server/api/pages.ts` (list/create) + `pages/[id].ts` (get/patch/soft-delete) copying the notes pattern; enforce `ownerId === session.user.id`.
- [ ] **rows-api** Implement `/server/api/pages/[id]/rows.ts` + `rows/[rowId].ts` for database rows; guard database ownership.
- [ ] **blocknote-install** Add `@blocknote/core` `@blocknote/react`; mount `BlockNoteView` in a throwaway route to confirm it compiles/renders before deepening.
- [ ] **dndkit-install** Add `@dnd-kit/core` `@dnd-kit/sortable` for sidebar tree + board view reordering.
- [ ] **auth-pages** Build `/login`, `/signup` with Better Auth client (`createAuthClient`); add `RequireAuth` wrapper and redirect `/` → `/workspace`.
- [ ] **workspace-layout** Build `WorkspaceLayout`: sidebar (page tree with expand/collapse, new-page, drag reparent/reorder with cycle guard), top bar (search, new, user menu, theme toggle), breadcrumb.
- [ ] **page-editor** Build `PageEditor`: icon/title/cover header; BlockNote editor bound to `page.content`; debounced PATCH save; unsaved indicator; sub-page children list.
- [ ] **database-table** Build `DatabaseView` table tab: property columns, add/edit property popover (type + options), inline cells, filters bar, add/delete rows.
- [ ] **database-board** Build board tab: group by a select/status property, dnd-kit drag-between columns, empty-column states.
- [ ] **search-trash** Add command-palette search page and `/trash` (restore / delete-forever).
- [ ] **design-doc** Fill `/DESIGN.md` from Design direction; map palette into `/src/index.css` tokens; ensure light/dark swap and BlockNote `.bn-*` theming align to tokens.
- [ ] **theme-polish** Verify light/dark across all surfaces; complete loading/empty/error/403-401 states with real copy; reduced-motion respected.