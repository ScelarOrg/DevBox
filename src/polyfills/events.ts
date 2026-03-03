// EventEmitter polyfill -- uses a function constructor (not a class) so that
// EventEmitter.call(this) and Object.create(EventEmitter.prototype) work.
// ES6 classes forbid calling without `new`, which breaks tons of npm packages.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventHandler = (...args: any[]) => void;

const DEFAULT_CEILING = 10;

// VFS->chokidar HMR bridge: chokidar's async fs.watch() setup chain doesn't
// complete in browser, so we detect FSWatchers by _watched Map and bridge
// VFS file changes directly to the watcher.
const _vfsBridged = new WeakSet<object>();
let _vfsBridgeCleanups: (() => void)[] = [];

function _bridgeVfsToWatcher(watcher: EventEmitter): void {
  const vol = (globalThis as any).__nodepodVolume;
  if (!vol || typeof vol.onGlobalChange !== 'function') {
    return;
  }

  // debounce per-path to avoid cascading reloads from multiple VFS writes
  const pending = new Map<string, { event: string; timer: ReturnType<typeof setTimeout> }>();
  const DEBOUNCE_MS = 50;

  const cleanup = vol.onGlobalChange((path: string, event: string) => {
    if (path.includes('/node_modules/') || path.includes('/.cache/')) {
      return;
    }

    const existing = pending.get(path);
    if (existing) clearTimeout(existing.timer);

    pending.set(path, {
      event,
      timer: setTimeout(() => {
        pending.delete(path);
        if (event === 'change') {
          watcher.emit('change', path);
        } else if (event === 'add') {
          watcher.emit('add', path);
        } else if (event === 'unlink') {
          watcher.emit('unlink', path);
        }
      }, DEBOUNCE_MS),
    });
  });
  _vfsBridgeCleanups.push(cleanup);
}

// lazily init the listener map (handles Object.create() bypassing constructor)
function _reg(self: any): Map<string, EventHandler[]> {
  if (!self._registry) self._registry = new Map<string, EventHandler[]>();
  return self._registry;
}

function _ensureSlot(self: any, name: string): EventHandler[] {
  const reg = _reg(self);
  let slot = reg.get(name);
  if (!slot) {
    slot = [];
    reg.set(name, slot);
  }
  return slot;
}

export interface EventEmitter {
  _registry: Map<string, EventHandler[]>;
  _ceiling: number;
  addListener(name: string, handler: EventHandler): this;
  on(name: string, handler: EventHandler): this;
  once(name: string, handler: EventHandler): this;
  removeListener(name: string, handler: EventHandler): this;
  off(name: string, handler: EventHandler): this;
  removeAllListeners(name?: string): this;
  emit(name: string, ...payload: unknown[]): boolean;
  listeners(name: string): EventHandler[];
  rawListeners(name: string): EventHandler[];
  listenerCount(name: string): number;
  eventNames(): string[];
  setMaxListeners(limit: number): this;
  getMaxListeners(): number;
  prependListener(name: string, handler: EventHandler): this;
  prependOnceListener(name: string, handler: EventHandler): this;
}

export interface EventEmitterConstructor {
  new(): EventEmitter;
  (): void;
  prototype: EventEmitter;
  EventEmitter: EventEmitterConstructor;
  listenerCount(target: EventEmitter, name: string): number;
  once(target: EventEmitter, name: string): Promise<unknown[]>;
  on(target: EventEmitter, name: string): AsyncIterable<unknown[]>;
  getEventListeners(target: EventEmitter, name: string): EventHandler[];
}

export const EventEmitter = function EventEmitter(this: any) {
  // guard against double-init (e.g. super() + EventEmitter.call(this))
  if (this && !this._registry) {
    this._registry = new Map<string, EventHandler[]>();
  }
  if (this && this._ceiling === undefined) {
    this._ceiling = DEFAULT_CEILING;
  }
} as unknown as EventEmitterConstructor;

EventEmitter.prototype.addListener = function addListener(name: string, handler: EventHandler): any {
  const slot = _ensureSlot(this, name);
  slot.push(handler);

  // VFS->chokidar HMR bridge: detect FSWatcher by _watched Map
  if (name === 'change' && !_vfsBridged.has(this) && (this as any)._watched instanceof Map) {
    _vfsBridged.add(this);
    _bridgeVfsToWatcher(this as any);
  }

  return this;
};

// on and addListener must be the SAME function reference -- if one calls the other,
// subclass overrides cause infinite recursion
EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function once(name: string, handler: EventHandler): any {
  const self = this;
  const wrapper: EventHandler = function (this: any, ...payload: unknown[]) {
    self.removeListener(name, wrapper);
    handler.apply(self, payload);
  };
  // use _ensureSlot directly, not addListener, to avoid recursion
  const slot = _ensureSlot(this, name);
  slot.push(wrapper);
  return this;
};

EventEmitter.prototype.removeListener = function removeListener(name: string, handler: EventHandler): any {
  const slot = _reg(this).get(name);
  if (slot) {
    const pos = slot.indexOf(handler);
    if (pos !== -1) {
      slot.splice(pos, 1);
    }
  }
  return this;
};

EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

EventEmitter.prototype.removeAllListeners = function removeAllListeners(name?: string): any {
  if (name !== undefined) {
    _reg(this).delete(name);
  } else {
    _reg(this).clear();
  }
  return this;
};

EventEmitter.prototype.emit = function emit(name: string, ...payload: unknown[]): boolean {
  const slot = _reg(this).get(name);
  if (!slot || slot.length === 0) {
    if (name === "error") {
      const problem = payload[0];
      if (problem instanceof Error) throw problem;
      throw new Error("Unhandled error event");
    }
    return false;
  }

  // Fast path: single listener — avoid slice() allocation
  if (slot.length === 1) {
    try { slot[0].apply(this, payload); } catch (_) { /* swallow */ }
    return true;
  }

  const snapshot = slot.slice();
  for (const handler of snapshot) {
    try {
      handler.apply(this, payload);
    } catch (fault) {
      /* swallow handler errors */
    }
  }
  return true;
};

EventEmitter.prototype.listeners = function listeners(name: string): EventHandler[] {
  const slot = _reg(this).get(name);
  return slot ? slot.slice() : [];
};

EventEmitter.prototype.rawListeners = function rawListeners(name: string): EventHandler[] {
  return this.listeners(name);
};

EventEmitter.prototype.listenerCount = function listenerCount(name: string): number {
  const slot = _reg(this).get(name);
  return slot ? slot.length : 0;
};

EventEmitter.prototype.eventNames = function eventNames(): string[] {
  return Array.from(_reg(this).keys());
};

EventEmitter.prototype.setMaxListeners = function setMaxListeners(limit: number): any {
  this._ceiling = limit;
  return this;
};

EventEmitter.prototype.getMaxListeners = function getMaxListeners(): number {
  return this._ceiling ?? DEFAULT_CEILING;
};

EventEmitter.prototype.prependListener = function prependListener(name: string, handler: EventHandler): any {
  const slot = _ensureSlot(this, name);
  slot.unshift(handler);
  return this;
};

EventEmitter.prototype.prependOnceListener = function prependOnceListener(name: string, handler: EventHandler): any {
  const self = this;
  const wrapper: EventHandler = function (this: any, ...payload: unknown[]) {
    self.removeListener(name, wrapper);
    handler.apply(self, payload);
  };
  return this.prependListener(name, wrapper);
};

EventEmitter.listenerCount = function (target: EventEmitter, name: string): number {
  return target.listenerCount(name);
};

// supports both `import EventEmitter from 'events'` and `import { EventEmitter }`
const moduleFacade = EventEmitter as EventEmitterConstructor & {
  EventEmitter: EventEmitterConstructor;
  once: (target: EventEmitter, name: string) => Promise<unknown[]>;
  on: (target: EventEmitter, name: string) => AsyncIterable<unknown[]>;
  getEventListeners: (target: EventEmitter, name: string) => EventHandler[];
  listenerCount: (target: EventEmitter, name: string) => number;
};

moduleFacade.EventEmitter = EventEmitter;

moduleFacade.once = async (
  target: EventEmitter,
  name: string,
): Promise<unknown[]> => {
  return new Promise((fulfill, reject) => {
    const onSuccess: EventHandler = (...args: unknown[]) => {
      target.removeListener("error", onFailure);
      fulfill(args);
    };
    const onFailure: EventHandler = (...args: unknown[]) => {
      target.removeListener(name, onSuccess);
      reject(args[0] as Error);
    };
    target.once(name, onSuccess);
    target.once("error", onFailure);
  });
};

moduleFacade.on = (target: EventEmitter, name: string) => {
  const asyncIter = {
    async next() {
      return new Promise<{ value: unknown[]; done: boolean }>((fulfill) => {
        target.once(name, (...args) => fulfill({ value: args, done: false }));
      });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
  return asyncIter as AsyncIterable<unknown[]>;
};

moduleFacade.getEventListeners = (target: EventEmitter, name: string) =>
  target.listeners(name);

moduleFacade.listenerCount = (target: EventEmitter, name: string) =>
  target.listenerCount(name);

export default moduleFacade;
