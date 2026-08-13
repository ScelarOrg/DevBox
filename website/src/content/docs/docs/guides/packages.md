---
title: npm packages
description: Install and resolve npm packages inside a Nodepod project.
sidebar:
  order: 2
---

Install a package through the instance package manager:

```ts
await nodepod.packages.install('express');
```

Installs are lazy by default. Nodepod downloads and extracts package contents, then transforms modules on first `require()`. Choose eager conversion when the first execution must absorb less transform latency:

```ts
await nodepod.packages.install('express', undefined, {
  transformModules: 'eager',
});
```

Network installs are subject to CORS, host policy, browser storage limits, and the package's own runtime assumptions. Native Node add-ons do not run directly in the browser. Packages that depend on unsupported operating-system APIs may install successfully and still fail at execution.

Use `allowedFetchDomains` to extend the built-in package fetch allowlist, or `null` only when your product intentionally permits every domain. A broad allowlist changes your application's trust boundary.
