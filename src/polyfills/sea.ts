// stub - not available in browser


/* ------------------------------------------------------------------ */
/*  API                                                                */
/* ------------------------------------------------------------------ */

export function isSea(): boolean {
  return false;
}

export function getAsset(_key: string): never {
  throw new Error("Single Executable Applications (SEA) are not supported in the browser");
}

export function getAssetAsBlob(_key: string): never {
  throw new Error("Single Executable Applications (SEA) are not supported in the browser");
}

export function getRawAsset(_key: string): never {
  throw new Error("Single Executable Applications (SEA) are not supported in the browser");
}

/* ------------------------------------------------------------------ */
/*  Default export                                                     */
/* ------------------------------------------------------------------ */

export default {
  isSea,
  getAsset,
  getAssetAsBlob,
  getRawAsset,
};
