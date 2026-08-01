// Node.js assert polyfill


/* ------------------------------------------------------------------ */
/*  AssertionError                                                     */
/* ------------------------------------------------------------------ */

export interface AssertionError extends Error {
  actual: unknown;
  expected: unknown;
  operator: string;
  generatedMessage: boolean;
  code: string;
}

interface AssertionErrorConstructor {
  new (info: {
    message?: string;
    actual?: unknown;
    expected?: unknown;
    operator?: string;
    stackStartFn?: Function;
  }): AssertionError;
  (this: any, info: {
    message?: string;
    actual?: unknown;
    expected?: unknown;
    operator?: string;
    stackStartFn?: Function;
  }): void;
  prototype: any;
}

export const AssertionError = function AssertionError(this: any, info: {
  message?: string;
  actual?: unknown;
  expected?: unknown;
  operator?: string;
  stackStartFn?: Function;
}) {
  if (!this) return;
  const text =
    info.message ??
    `${formatValue(info.actual)} ${info.operator ?? '=='} ${formatValue(info.expected)}`;
  Error.call(this, text);
  this.message = text;
  this.name = 'AssertionError';
  this.actual = info.actual;
  this.expected = info.expected;
  this.operator = info.operator ?? '';
  this.generatedMessage = !info.message;
  this.code = 'ERR_ASSERTION';
  if (Error.captureStackTrace && info.stackStartFn) {
    Error.captureStackTrace(this, info.stackStartFn);
  }
} as unknown as AssertionErrorConstructor;

Object.setPrototypeOf(AssertionError.prototype, Error.prototype);

function formatValue(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

/* ------------------------------------------------------------------ */
/*  Deep comparison engine                                             */
/* ------------------------------------------------------------------ */

function deepMatch(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a !== typeof b) return false;

  // NaN
  if (typeof a === 'number' && Number.isNaN(a) && Number.isNaN(b as number)) return true;

  // Dates
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();

  // RegExp
  if (a instanceof RegExp && b instanceof RegExp)
    return a.source === b.source && a.flags === b.flags;

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepMatch(a[i], b[i])) return false;
    return true;
  }

  // Typed arrays
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // Map
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !deepMatch(v, b.get(k))) return false;
    return true;
  }

  // Set
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const v of a) {
      if (!b.has(v)) {
        let found = false;
        for (const bv of b) { if (deepMatch(v, bv)) { found = true; break; } }
        if (!found) return false;
      }
    }
    return true;
  }

  // Plain objects
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepMatch((a as any)[k], (b as any)[k])) return false;
    }
    return true;
  }

  return false;
}

/* ------------------------------------------------------------------ */
/*  Throw helper                                                       */
/* ------------------------------------------------------------------ */

function raiseIf(cond: boolean, info: ConstructorParameters<typeof AssertionError>[0], msg?: string | Error): void {
  if (!cond) return;
  if (msg instanceof Error) throw msg;
  if (msg !== undefined) info.message = msg;
  throw new AssertionError(info);
}

/* ------------------------------------------------------------------ */
/*  Main assert function                                               */
/* ------------------------------------------------------------------ */

function assert(value: unknown, message?: string | Error): asserts value {
  raiseIf(!value, { actual: value, expected: true, operator: '==', stackStartFn: assert }, message ?? 'Value is falsy');
}

/* ---- ok ---- */

assert.ok = function ok(value: unknown, message?: string | Error): asserts value {
  raiseIf(!value, { actual: value, expected: true, operator: '==', stackStartFn: ok }, message ?? 'Value is falsy');
};

/* ---- equal / notEqual (loose) ---- */

assert.equal = function equal(actual: unknown, expected: unknown, message?: string | Error): void {
  raiseIf(actual != expected, { actual, expected, operator: '==', stackStartFn: equal }, message);
};

assert.notEqual = function notEqual(actual: unknown, expected: unknown, message?: string | Error): void {
  raiseIf(actual == expected, { actual, expected, operator: '!=', stackStartFn: notEqual }, message);
};

/* ---- strictEqual / notStrictEqual ---- */

assert.strictEqual = function strictEqual(actual: unknown, expected: unknown, message?: string | Error): void {
  raiseIf(actual !== expected, { actual, expected, operator: '===', stackStartFn: strictEqual }, message);
};

assert.notStrictEqual = function notStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void {
  raiseIf(actual === expected, { actual, expected, operator: '!==', stackStartFn: notStrictEqual }, message);
};

/* ---- deepEqual / deepStrictEqual ---- */

assert.deepEqual = function deepEqual<T>(actual: T, expected: T, message?: string | Error): void {
  raiseIf(!deepMatch(actual, expected), { actual, expected, operator: 'deepEqual', stackStartFn: deepEqual }, message);
};

assert.deepStrictEqual = function deepStrictEqual<T>(actual: T, expected: T, message?: string | Error): void {
  raiseIf(!deepMatch(actual, expected), { actual, expected, operator: 'deepStrictEqual', stackStartFn: deepStrictEqual }, message);
};

assert.notDeepStrictEqual = function notDeepStrictEqual<T>(actual: T, expected: T, message?: string | Error): void {
  raiseIf(deepMatch(actual, expected), { actual, expected, operator: 'notDeepStrictEqual', stackStartFn: notDeepStrictEqual }, message);
};

/* ---- throws ---- */

assert.throws = function throws(
  fn: () => unknown,
  validatorOrMsg?: RegExp | Function | Error | { message?: RegExp | string; code?: string } | string,
  msg?: string
): void {
  let caught = false;
  let thrown: unknown;
  try { fn(); } catch (e) { caught = true; thrown = e; }

  if (!caught) {
    throw new AssertionError({
      message: typeof validatorOrMsg === 'string' ? validatorOrMsg : (msg ?? 'Expected function to throw'),
      operator: 'throws',
      stackStartFn: throws,
    });
  }

  if (validatorOrMsg !== undefined && typeof validatorOrMsg !== 'string') {
    validateThrown(thrown, validatorOrMsg, msg, throws);
  }
};

/* ---- doesNotThrow ---- */

assert.doesNotThrow = function doesNotThrow(
  fn: () => unknown,
  validatorOrMsg?: RegExp | Function | string,
  msg?: string
): void {
  try { fn(); } catch (e) {
    if (validatorOrMsg === undefined || typeof validatorOrMsg === 'string') {
      throw new AssertionError({
        message: typeof validatorOrMsg === 'string' ? validatorOrMsg : (msg ?? 'Unexpected throw'),
        actual: e, operator: 'doesNotThrow', stackStartFn: doesNotThrow,
      });
    }
    if (validatorOrMsg instanceof RegExp) {
      const m = e instanceof Error ? e.message : String(e);
      if (validatorOrMsg.test(m)) {
        throw new AssertionError({ message: msg ?? 'Unexpected matching throw', actual: e, expected: validatorOrMsg, operator: 'doesNotThrow', stackStartFn: doesNotThrow });
      }
    } else if (typeof validatorOrMsg === 'function' && e instanceof (validatorOrMsg as any)) {
      throw new AssertionError({ message: msg ?? 'Unexpected throw of matching type', actual: e, expected: validatorOrMsg, operator: 'doesNotThrow', stackStartFn: doesNotThrow });
    }
  }
};

/* ---- rejects ---- */

assert.rejects = async function rejects(
  asyncFn: Promise<unknown> | (() => Promise<unknown>),
  validatorOrMsg?: RegExp | Function | Error | { message?: RegExp | string; code?: string } | string,
  msg?: string
): Promise<void> {
  const p = typeof asyncFn === 'function' ? asyncFn() : asyncFn;
  let caught = false;
  let thrown: unknown;
  try { await p; } catch (e) { caught = true; thrown = e; }

  if (!caught) {
    throw new AssertionError({
      message: typeof validatorOrMsg === 'string' ? validatorOrMsg : (msg ?? 'Expected rejection'),
      operator: 'rejects', stackStartFn: rejects,
    });
  }

  if (validatorOrMsg !== undefined && typeof validatorOrMsg !== 'string') {
    validateThrown(thrown, validatorOrMsg, msg, rejects);
  }
};

/* ---- doesNotReject ---- */

assert.doesNotReject = async function doesNotReject(
  asyncFn: Promise<unknown> | (() => Promise<unknown>),
  validatorOrMsg?: RegExp | Function | string,
  msg?: string
): Promise<void> {
  const p = typeof asyncFn === 'function' ? asyncFn() : asyncFn;
  try { await p; } catch (e) {
    if (validatorOrMsg === undefined || typeof validatorOrMsg === 'string') {
      throw new AssertionError({
        message: typeof validatorOrMsg === 'string' ? validatorOrMsg : (msg ?? 'Unexpected rejection'),
        actual: e, operator: 'doesNotReject', stackStartFn: doesNotReject,
      });
    }
    if (validatorOrMsg instanceof RegExp) {
      const m = e instanceof Error ? e.message : String(e);
      if (validatorOrMsg.test(m)) {
        throw new AssertionError({ message: msg ?? 'Unexpected matching rejection', actual: e, expected: validatorOrMsg, operator: 'doesNotReject', stackStartFn: doesNotReject });
      }
    } else if (typeof validatorOrMsg === 'function' && e instanceof (validatorOrMsg as any)) {
      throw new AssertionError({ message: msg ?? 'Unexpected rejection of matching type', actual: e, expected: validatorOrMsg, operator: 'doesNotReject', stackStartFn: doesNotReject });
    }
  }
};

/* ---- fail ---- */

assert.fail = function fail(
  msgOrActual?: string | unknown,
  expected?: unknown,
  message?: string,
  operator?: string
): never {
  if (arguments.length <= 1) {
    throw new AssertionError({
      message: typeof msgOrActual === 'string' ? msgOrActual : 'Failed',
      stackStartFn: fail,
    });
  }
  throw new AssertionError({
    message,
    actual: msgOrActual,
    expected,
    operator: operator ?? 'fail',
    stackStartFn: fail,
  });
};

/* ---- match / doesNotMatch ---- */

assert.match = function match(str: string, re: RegExp, message?: string | Error): void {
  raiseIf(!re.test(str), { actual: str, expected: re, operator: 'match', stackStartFn: match }, message);
};

assert.doesNotMatch = function doesNotMatch(str: string, re: RegExp, message?: string | Error): void {
  raiseIf(re.test(str), { actual: str, expected: re, operator: 'doesNotMatch', stackStartFn: doesNotMatch }, message);
};

/* ---- ifError ---- */

assert.ifError = function ifError(value: unknown): void {
  if (value === null || value === undefined) return;
  if (value instanceof Error) throw value;
  throw new AssertionError({
    message: `ifError received unwanted value: ${value}`,
    actual: value,
    expected: null,
    operator: 'ifError',
    stackStartFn: ifError,
  });
};

/* ---- metadata ---- */

assert.AssertionError = AssertionError;

/** Node's `assert.strict` namespace: loose names map to strict operators. */
const strictAssert = function strictAssert(
  value: unknown,
  message?: string | Error,
): asserts value {
  assert.ok(value, message);
} as any;

strictAssert.ok = assert.ok;
strictAssert.equal = assert.strictEqual;
strictAssert.notEqual = assert.notStrictEqual;
strictAssert.strictEqual = assert.strictEqual;
strictAssert.notStrictEqual = assert.notStrictEqual;
strictAssert.deepEqual = assert.deepStrictEqual;
strictAssert.notDeepEqual = assert.notDeepStrictEqual;
strictAssert.deepStrictEqual = assert.deepStrictEqual;
strictAssert.notDeepStrictEqual = assert.notDeepStrictEqual;
strictAssert.throws = assert.throws;
strictAssert.doesNotThrow = assert.doesNotThrow;
strictAssert.rejects = assert.rejects;
strictAssert.doesNotReject = assert.doesNotReject;
strictAssert.match = assert.match;
strictAssert.doesNotMatch = assert.doesNotMatch;
strictAssert.ifError = assert.ifError;
strictAssert.fail = assert.fail;
strictAssert.AssertionError = AssertionError;
strictAssert.strict = strictAssert;

assert.strict = strictAssert;

/* ------------------------------------------------------------------ */
/*  Internal: validate a thrown/rejected value                         */
/* ------------------------------------------------------------------ */

function validateThrown(
  thrown: unknown,
  validator: RegExp | Function | Error | { message?: RegExp | string; code?: string },
  msg: string | undefined,
  caller: Function
): void {
  if (validator instanceof RegExp) {
    const text = thrown instanceof Error ? thrown.message : String(thrown);
    if (!validator.test(text)) {
      throw new AssertionError({ message: msg ?? 'Error message did not match', actual: thrown, expected: validator, operator: 'throws', stackStartFn: caller });
    }
  } else if (typeof validator === 'function') {
    if (!(thrown instanceof (validator as any))) {
      throw new AssertionError({ message: msg ?? 'Error type mismatch', actual: thrown, expected: validator, operator: 'throws', stackStartFn: caller });
    }
  } else if (typeof validator === 'object') {
    const spec = validator as { message?: RegExp | string; code?: string };
    const err = thrown as Error & { code?: string };
    if (spec.message !== undefined) {
      const errMsg = err.message ?? String(thrown);
      if (spec.message instanceof RegExp) {
        if (!spec.message.test(errMsg))
          throw new AssertionError({ message: msg ?? 'Error message mismatch', actual: errMsg, expected: spec.message, operator: 'throws', stackStartFn: caller });
      } else if (errMsg !== spec.message) {
        throw new AssertionError({ message: msg ?? 'Error message mismatch', actual: errMsg, expected: spec.message, operator: 'throws', stackStartFn: caller });
      }
    }
    if (spec.code !== undefined && err.code !== spec.code) {
      throw new AssertionError({ message: msg ?? 'Error code mismatch', actual: err.code, expected: spec.code, operator: 'throws', stackStartFn: caller });
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Exports                                                            */
/* ------------------------------------------------------------------ */

export default assert;
export { assert };
