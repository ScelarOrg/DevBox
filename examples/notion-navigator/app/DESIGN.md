# Design system

## Product
- Subject / audience / one job: Personal knowledge workspace for writers, students, and PMs who live in docs. One job: capture and organize thoughts in nested pages and lightweight databases without friction.
- Theme: both (dark default, light toggle) — Notion ships both; faithful clone requires it. Dark default matches `<html class="dark">`.

## Palette
Map named roles to CSS variables in `/src/index.css`. Faithful Notion monochrome canvas.

| Role | Hex | Token / usage |
|------|-----|---------------|
| canvas (background) | `#191919` dark / `#ffffff` light | `--background` — page canvas |
| surface (card) | `#202020` dark / `#f7f7f5` light | `--card`, `--sidebar` |
| ink (foreground) | `#e1e1e1` dark / `#37352f` light | `--foreground` — primary text |
| ink-muted | `#9b9a97` dark / `#787774` light | `--muted-foreground` |
| accent (link/active) | `#2383e2` | `--color-accent-blue` — Notion blue, used sparingly |
| line (border) | `#2e2e2e` dark / `#ebebea` light | `--border` |

Additional Notion-typical select/status colors (used by database properties):
`gray`, `brown`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `red`

## Typography
- Display + body: Inter (system fallback) — Notion's neutrality comes from a single quiet sans
- Mono: Geist Mono — for code blocks
- Scale: default Tailwind scale; headings gain weight not a new face

## Layout & shape
- Spacing: Tailwind 4px-based scale
- Radius: `--radius` small (0.25rem for UI chrome), up to 0.5rem for cards
- Layout: fixed sidebar (240px, collapsible to icon rail) + fluid canvas with max-width ~720px
- Signature element: the **inline slash menu** — compact floating command palette at caret with categorized block inserts and fuzzy search

## Component patterns
- coss primitives from `/src/components/ui/`
- Semantic tokens only: `bg-background`, `text-foreground`, `border-border`
- App chrome is whisper-quiet; Notion aesthetic = almost no visible borders
- Complete interaction states: hover, focus, disabled, empty, error, loading

## Banned
- Indigo/purple gradient SaaS look
- Warm cream + terracotta + serif editorial default
- Near-black + acid-green accent default
- Identical feature-card grids + pill badge spam
- Decorative 01 / 02 / 03 markers
- Arbitrary color utilities (`text-blue-500`, `bg-indigo-*`)
