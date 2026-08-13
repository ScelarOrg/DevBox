---
title: Security model
description: Understand Nodepod's trust boundaries and limits before running user-controlled code.
sidebar:
  order: 3
---

Nodepod is **not a hardened security sandbox**. It is a runtime built on browser isolation primitives. Your application remains responsible for deciding which code, packages, network destinations, files, and capabilities a session can access.

## Trust boundaries

- A Nodepod process runs in browser workers, but shares the browser profile, origin policies, and resource limits of the host environment.
- The service worker and preview bridge route virtual HTTP traffic. They must be scoped and hosted deliberately.
- Preview origins reduce cookie and service-worker overlap with the host application, but do not make malicious code safe.
- `allowedFetchDomains: null` permits package/runtime fetches to every domain and should be a conscious product decision.
- Files and snapshots are client-side data. Do not seed credentials, signing keys, backend tokens, or private source that a visitor should not read.
- User-provided code can consume CPU, memory, storage, and network capacity. Apply product-level limits and provide a termination path.

## Recommended posture

Use a dedicated preview origin, a narrow fetch allowlist, a restrictive Content Security Policy compatible with your chosen Nodepod features, short-lived credentials outside the runtime, and explicit teardown on navigation. Review dependency code and keep Nodepod current.

If your threat model requires strong isolation from an adversarial tenant, use a hardened server-side sandbox or virtual machine designed and audited for that purpose.
