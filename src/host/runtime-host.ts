import type { RuntimeHost } from "./types";

let _host: RuntimeHost | null = null;
let _defaultFactory: (() => RuntimeHost) | null = null;

/** Used by browser-host to register itself without a static cycle into worker bundles. */
export function registerDefaultHostFactory(factory: () => RuntimeHost): void {
  _defaultFactory = factory;
}

/** Install a runtime host (browser default, or Node via `@scelar/nodepod/headless`). */
export function setRuntimeHost(host: RuntimeHost): void {
  _host = host;
}

export function getRuntimeHost(): RuntimeHost {
  if (!_host) {
    if (!_defaultFactory) {
      throw new Error(
        "[Nodepod] No RuntimeHost registered. Import @scelar/nodepod or @scelar/nodepod/headless.",
      );
    }
    _host = _defaultFactory();
  }
  return _host;
}

/** Reset to the default browser host (tests). */
export function resetRuntimeHost(): void {
  _host?.disposeGlobalResources?.();
  _host = null;
}
