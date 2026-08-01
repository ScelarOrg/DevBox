// stub - not available in browser


/* ------------------------------------------------------------------ */
/*  Tracing class                                                      */
/* ------------------------------------------------------------------ */

export interface Tracing {
  readonly categories: string;
  readonly enabled: boolean;
  enable(): void;
  disable(): void;
}

interface TracingConstructor {
  new (categories: string[]): Tracing;
  (this: any, categories: string[]): void;
  prototype: any;
}

export const Tracing = function Tracing(this: any, categories: string[]) {
  if (!this) return;
  this.categories = categories.join(",");
  this.enabled = false;
} as unknown as TracingConstructor;

Tracing.prototype.enable = function enable(): void { };
Tracing.prototype.disable = function disable(): void { };

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

export function createTracing(opts: { categories: string[] }): Tracing {
  return new Tracing(opts.categories);
}

export function getEnabledCategories(): string | undefined {
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Default export                                                     */
/* ------------------------------------------------------------------ */

export default {
  createTracing,
  getEnabledCategories,
  Tracing,
};
