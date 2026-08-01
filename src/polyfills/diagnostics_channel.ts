// stub - minimal diagnostics_channel for compatibility


export interface DiagChannel {
  name: string;
  readonly hasSubscribers: boolean;
  subscribe(handler: (message: unknown, name: string) => void): void;
  unsubscribe(handler: (message: unknown, name: string) => void): boolean;
  publish(message: unknown): void;
}

export const DiagChannel = function DiagChannel(this: any, name: string) {
  if (!this) return;
  this.name = name;
  this._listeners = [];
} as unknown as { new(name: string): DiagChannel; prototype: any };

Object.defineProperty(DiagChannel.prototype, 'hasSubscribers', {
  get(this: any) { return this._listeners.length > 0; },
  configurable: true,
});

DiagChannel.prototype.subscribe = function subscribe(handler: (message: unknown, name: string) => void): void {
  this._listeners.push(handler);
};

DiagChannel.prototype.unsubscribe = function unsubscribe(handler: (message: unknown, name: string) => void): boolean {
  const idx = this._listeners.indexOf(handler);
  if (idx === -1) return false;
  this._listeners.splice(idx, 1);
  return true;
};

DiagChannel.prototype.publish = function publish(this: any, message: unknown): void {
  for (const handler of this._listeners) {
    try {
      handler(message, this.name);
    } catch {
      /* swallow */
    }
  }
};

const channels = new Map<string, DiagChannel>();

export function channel(name: string): DiagChannel {
  if (!channels.has(name)) channels.set(name, new DiagChannel(name));
  return channels.get(name)!;
}

export function hasSubscribers(name: string): boolean {
  return channels.get(name)?.hasSubscribers ?? false;
}

export function subscribe(
  name: string,
  handler: (message: unknown, name: string) => void,
): void {
  channel(name).subscribe(handler);
}

export function unsubscribe(
  name: string,
  handler: (message: unknown, name: string) => void,
): boolean {
  return channels.get(name)?.unsubscribe(handler) ?? false;
}

export { DiagChannel as Channel };

// ---------------------------------------------------------------------------
// TracingChannel — Node's higher-level trace API built on five sub-channels.
// Real implementation (no AsyncLocalStorage / async_hooks needed). Semantics
// match node:diagnostics_channel's TracingChannel for publish/subscribe and
// for the three trace helpers (traceSync, tracePromise, traceCallback).
// ---------------------------------------------------------------------------

export interface TracingChannelSubscribers {
  start?: (message: unknown, name: string) => void;
  end?: (message: unknown, name: string) => void;
  asyncStart?: (message: unknown, name: string) => void;
  asyncEnd?: (message: unknown, name: string) => void;
  error?: (message: unknown, name: string) => void;
}

export interface TracingChannelChannels {
  start: DiagChannel;
  end: DiagChannel;
  asyncStart: DiagChannel;
  asyncEnd: DiagChannel;
  error: DiagChannel;
}

const TRACING_CHANNEL_EVENTS = ['start', 'end', 'asyncStart', 'asyncEnd', 'error'] as const;

export class TracingChannel implements TracingChannelChannels {
  start: DiagChannel;
  end: DiagChannel;
  asyncStart: DiagChannel;
  asyncEnd: DiagChannel;
  error: DiagChannel;

  constructor(nameOrChannels: string | TracingChannelChannels) {
    if (typeof nameOrChannels === 'string') {
      const name = nameOrChannels;
      this.start = channel(`tracing:${name}:start`);
      this.end = channel(`tracing:${name}:end`);
      this.asyncStart = channel(`tracing:${name}:asyncStart`);
      this.asyncEnd = channel(`tracing:${name}:asyncEnd`);
      this.error = channel(`tracing:${name}:error`);
    } else if (nameOrChannels && typeof nameOrChannels === 'object') {
      for (const evt of TRACING_CHANNEL_EVENTS) {
        const ch = (nameOrChannels as TracingChannelChannels)[evt];
        if (!ch || typeof (ch as DiagChannel).publish !== 'function') {
          throw new TypeError(
            `tracingChannel: channels.${evt} must be a Channel instance`,
          );
        }
      }
      this.start = nameOrChannels.start;
      this.end = nameOrChannels.end;
      this.asyncStart = nameOrChannels.asyncStart;
      this.asyncEnd = nameOrChannels.asyncEnd;
      this.error = nameOrChannels.error;
    } else {
      throw new TypeError(
        'tracingChannel: argument must be a string name or an object of 5 Channel instances',
      );
    }
  }

  get hasSubscribers(): boolean {
    return (
      this.start.hasSubscribers ||
      this.end.hasSubscribers ||
      this.asyncStart.hasSubscribers ||
      this.asyncEnd.hasSubscribers ||
      this.error.hasSubscribers
    );
  }

  subscribe(subscribers: TracingChannelSubscribers): void {
    for (const evt of TRACING_CHANNEL_EVENTS) {
      const handler = subscribers[evt];
      if (typeof handler === 'function') this[evt].subscribe(handler);
    }
  }

  unsubscribe(subscribers: TracingChannelSubscribers): boolean {
    let allRemoved = true;
    for (const evt of TRACING_CHANNEL_EVENTS) {
      const handler = subscribers[evt];
      if (typeof handler === 'function') {
        if (!this[evt].unsubscribe(handler)) allRemoved = false;
      }
    }
    return allRemoved;
  }

  traceSync<R>(
    fn: (...a: unknown[]) => R,
    context: Record<string, unknown> = {},
    thisArg?: unknown,
    ...args: unknown[]
  ): R {
    this.start.publish(context);
    try {
      const result = fn.apply(thisArg, args);
      (context as { result?: unknown }).result = result;
      return result;
    } catch (err) {
      (context as { error?: unknown }).error = err;
      this.error.publish(context);
      throw err;
    } finally {
      this.end.publish(context);
    }
  }

  tracePromise<R>(
    fn: (...a: unknown[]) => Promise<R> | R,
    context: Record<string, unknown> = {},
    thisArg?: unknown,
    ...args: unknown[]
  ): Promise<R> {
    const onFulfilled = (result: R): R => {
      (context as { result?: unknown }).result = result;
      this.asyncStart.publish(context);
      this.asyncEnd.publish(context);
      return result;
    };
    const onRejected = (err: unknown): never => {
      (context as { error?: unknown }).error = err;
      this.error.publish(context);
      this.asyncStart.publish(context);
      this.asyncEnd.publish(context);
      throw err;
    };

    this.start.publish(context);
    try {
      let promise = fn.apply(thisArg, args) as Promise<R> | R;
      if (!(promise instanceof Promise)) promise = Promise.resolve(promise);
      return (promise as Promise<R>).then(onFulfilled, onRejected);
    } catch (err) {
      (context as { error?: unknown }).error = err;
      this.error.publish(context);
      throw err;
    } finally {
      this.end.publish(context);
    }
  }

  traceCallback<R>(
    fn: (...a: unknown[]) => R,
    position: number = -1,
    context: Record<string, unknown> = {},
    thisArg?: unknown,
    ...args: unknown[]
  ): R {
    const idx = position < 0 ? args.length + position : position;
    const callback = args[idx];
    if (typeof callback !== 'function') {
      throw new TypeError('traceCallback: target argument is not a function');
    }
    const self = this;
    function wrappedCallback(this: unknown, err: unknown, res: unknown): unknown {
      if (err) {
        (context as { error?: unknown }).error = err;
        self.error.publish(context);
      } else {
        (context as { result?: unknown }).result = res;
      }
      self.asyncStart.publish(context);
      try {
        return (callback as (...a: unknown[]) => unknown).apply(this, arguments as unknown as unknown[]);
      } finally {
        self.asyncEnd.publish(context);
      }
    }
    args[idx] = wrappedCallback;

    this.start.publish(context);
    try {
      return fn.apply(thisArg, args);
    } catch (err) {
      (context as { error?: unknown }).error = err;
      this.error.publish(context);
      throw err;
    } finally {
      this.end.publish(context);
    }
  }
}

export function tracingChannel(
  nameOrChannels: string | TracingChannelChannels,
): TracingChannel {
  return new TracingChannel(nameOrChannels);
}

export default {
  channel,
  hasSubscribers,
  subscribe,
  unsubscribe,
  tracingChannel,
  Channel: DiagChannel,
  TracingChannel,
};
