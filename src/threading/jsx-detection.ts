// Keep main-thread and module-worker loader selection identical. The inline
// worker mirrors these expressions because it is emitted as a self-contained
// source string.
const JSX_PATTERNS = [
  /<[A-Z][a-zA-Z0-9.]*[\s/>]/,
  /<\/[a-zA-Z]/,
  /\/>/,
  /<>|<\/>/,
  /React\.createElement\b/,
  /jsx\(|jsxs\(|jsxDEV\(/,
];

export function containsJsx(source: string): boolean {
  return JSX_PATTERNS.some((pattern) => pattern.test(source));
}
