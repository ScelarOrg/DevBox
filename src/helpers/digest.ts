// DJB2 hash for cache keys
export function quickDigest(input: string): string {
  let accumulator = 0;
  for (let i = 0; i < input.length; i++) {
    accumulator = ((accumulator << 5) - accumulator) + input.charCodeAt(i);
    accumulator |= 0;
  }
  return accumulator.toString(36);
}
