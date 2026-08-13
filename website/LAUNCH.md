# Documentation launch checklist

The website is intentionally private until the owner reviews the local production build and explicitly approves publication.

Do not enable GitHub Pages or run `.github/workflows/docs-pages.yml` before that approval.

## Before approval

- Run `pnpm run docs:check` under Node.js 22.12 or newer.
- Run `pnpm run docs:test` and review the Playwright report and production screenshots.
- Confirm the landing page, documentation search, generated API source links, reduced terminal demo, mobile layout, light/dark modes, and reduced motion.
- Confirm the current runtime and preview-origin changes have been committed so generated source links target the intended revision.

## Sponsors launch gate

- Confirm `https://github.com/sponsors/R1ck404` is an approved, active GitHub Sponsors profile.
- Confirm the monthly tiers are active: $5 Supporter, $25 Backer, and $100 Company sponsor.
- Confirm GitHub's custom one-time amount is enabled.
- Confirm no tier promises an SLA, priority issues, private support, or early repository access.
- Only then add `.github/FUNDING.yml` and the root package `funding` field.
- Do not add an empty sponsor logo wall.

## After explicit approval

1. Update the root package `homepage` to `https://r1ck404.github.io/Nodepod/`.
2. Add the verified GitHub Sponsors funding metadata.
3. Enable GitHub Pages with GitHub Actions as its source.
4. Manually run the Documentation Pages workflow.
5. Verify the canonical site, docs search, API pages, terminal demo, metadata, and sponsor links.
6. Update GitHub About to the canonical URL and describe Nodepod as source-available under MIT + Commons Clause.
7. Follow up with an automatic deployment trigger limited to website, docs, API source, and dependency changes on `main`.
