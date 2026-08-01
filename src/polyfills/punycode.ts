// Punycode/IDNA encoding for internationalized domain names (deprecated but still required by some packages)


const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
const DELIMITER = "-";

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  let d = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
  d += Math.floor(d / numPoints);
  let k = 0;
  while (d > ((BASE - TMIN) * TMAX) >> 1) {
    d = Math.floor(d / (BASE - TMIN));
    k += BASE;
  }
  return Math.floor(k + ((BASE - TMIN + 1) * d) / (d + SKEW));
}

function basicToDigit(cp: number): number {
  if (cp - 48 < 10) return cp - 22;
  if (cp - 65 < 26) return cp - 65;
  if (cp - 97 < 26) return cp - 97;
  return BASE;
}

function digitToBasic(digit: number, flag: boolean): number {
  return digit + 22 + 75 * (digit < 26 ? 1 : 0) - ((flag ? 1 : 0) << 5);
}

export function decode(input: string): string {
  const output: number[] = [];
  let i = 0;
  let n = INITIAL_N;
  let bias = INITIAL_BIAS;

  let basic = input.lastIndexOf(DELIMITER);
  if (basic < 0) basic = 0;

  for (let j = 0; j < basic; ++j) {
    output.push(input.charCodeAt(j));
  }

  let index = basic > 0 ? basic + 1 : 0;

  while (index < input.length) {
    const oldi = i;
    let w = 1;
    let k = BASE;

    while (true) {
      if (index >= input.length) throw new RangeError("Invalid input");
      const digit = basicToDigit(input.charCodeAt(index++));
      if (digit >= BASE) throw new RangeError("Invalid input");
      if (digit > Math.floor((0x7fffffff - i) / w)) throw new RangeError("Overflow");
      i += digit * w;
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
      if (digit < t) break;
      if (w > Math.floor(0x7fffffff / (BASE - t))) throw new RangeError("Overflow");
      w *= BASE - t;
      k += BASE;
    }

    const out = output.length + 1;
    bias = adapt(i - oldi, out, oldi === 0);
    if (Math.floor(i / out) > 0x7fffffff - n) throw new RangeError("Overflow");
    n += Math.floor(i / out);
    i %= out;
    output.splice(i++, 0, n);
  }

  return String.fromCodePoint(...output);
}

export function encode(input: string): string {
  const output: string[] = [];
  const inputCodes = Array.from(input).map((c) => c.codePointAt(0)!);
  let n = INITIAL_N;
  let delta = 0;
  let bias = INITIAL_BIAS;

  for (const cp of inputCodes) {
    if (cp < 0x80) output.push(String.fromCharCode(cp));
  }

  let h = output.length;
  const b = h;
  if (b > 0) output.push(DELIMITER);

  while (h < inputCodes.length) {
    let m = 0x7fffffff;
    for (const cp of inputCodes) {
      if (cp >= n && cp < m) m = cp;
    }

    if (m - n > Math.floor((0x7fffffff - delta) / (h + 1)))
      throw new RangeError("Overflow");
    delta += (m - n) * (h + 1);
    n = m;

    for (const cp of inputCodes) {
      if (cp < n && ++delta > 0x7fffffff) throw new RangeError("Overflow");
      if (cp === n) {
        let q = delta;
        let k = BASE;
        while (true) {
          const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
          if (q < t) break;
          output.push(String.fromCharCode(digitToBasic(t + ((q - t) % (BASE - t)), false)));
          q = Math.floor((q - t) / (BASE - t));
          k += BASE;
        }
        output.push(String.fromCharCode(digitToBasic(q, false)));
        bias = adapt(delta, h + 1, h === b);
        delta = 0;
        ++h;
      }
    }

    ++delta;
    ++n;
  }

  return output.join("");
}

export function toUnicode(domain: string): string {
  return domain
    .split(".")
    .map((label) =>
      label.startsWith("xn--") ? decode(label.slice(4)) : label,
    )
    .join(".");
}

export function toASCII(domain: string): string {
  return domain
    .split(".")
    .map((label) => {
      if (/[^\x00-\x7E]/.test(label)) {
        return "xn--" + encode(label);
      }
      return label;
    })
    .join(".");
}

export const ucs2 = {
  decode: (str: string): number[] => Array.from(str).map((c) => c.codePointAt(0)!),
  encode: (codePoints: number[]): string => String.fromCodePoint(...codePoints),
};

export const version = "2.3.1";

export default { decode, encode, toUnicode, toASCII, ucs2, version };
