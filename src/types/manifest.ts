export interface PackageManifest {
  name?: string;
  version?: string;
  main?: string;
  module?: string;
  browser?: string | Record<string, string | false>;
  types?: string;
  exports?: Record<string, unknown> | string;
  imports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  bin?: string | Record<string, string>;
  [key: string]: unknown;
}
