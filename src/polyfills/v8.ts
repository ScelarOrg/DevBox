// stub - not available in browser

export function getHeapStatistics() {
  return {
    total_heap_size: 0,
    total_heap_size_executable: 0,
    total_physical_size: 0,
    total_available_size: 0,
    used_heap_size: 0,
    heap_size_limit: 0,
    malloced_memory: 0,
    peak_malloced_memory: 0,
    does_zap_garbage: 0,
    number_of_native_contexts: 0,
    number_of_detached_contexts: 0,
  };
}

export function getHeapSpaceStatistics(): unknown[] {
  return [];
}

export function getHeapCodeStatistics() {
  return {
    code_and_metadata_size: 0,
    bytecode_and_metadata_size: 0,
    external_script_source_size: 0,
  };
}

export function getHeapSnapshot(): null { return null; }
export function writeHeapSnapshot(): string { return ''; }


export function setFlagsFromString(_flags: string): void {}
export function takeCoverage(): void {}
export function stopCoverage(): void {}

export function cachedDataVersionTag(): number {
  return 0;
}

// serialize/deserialize use JSON as a fallback

export function serialize(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

export function deserialize(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(bytes));
}

export interface Serializer {
  writeHeader(): void;
  writeValue(_v: unknown): void;
  releaseBuffer(): Uint8Array;
}

export const Serializer = function Serializer(this: any) {
  if (!this) return;
} as unknown as { new(): Serializer; prototype: any };

Serializer.prototype.writeHeader = function writeHeader(): void {};
Serializer.prototype.writeValue = function writeValue(_v: unknown): void {};
Serializer.prototype.releaseBuffer = function releaseBuffer(): Uint8Array { return new Uint8Array(0); };

export interface Deserializer {
  readHeader(): boolean;
  readValue(): unknown;
}

export const Deserializer = function Deserializer(this: any, _buf: Uint8Array) {
  if (!this) return;
} as unknown as { new(_buf: Uint8Array): Deserializer; prototype: any };

Deserializer.prototype.readHeader = function readHeader(): boolean { return true; };
Deserializer.prototype.readValue = function readValue(): unknown { return null; };

export interface DefaultSerializer extends Serializer {}

export const DefaultSerializer = function DefaultSerializer(this: any) {
  if (!this) return;
  (Serializer as any).call(this);
} as unknown as { new(): DefaultSerializer; prototype: any };

Object.setPrototypeOf(DefaultSerializer.prototype, Serializer.prototype);

export interface DefaultDeserializer extends Deserializer {}

export const DefaultDeserializer = function DefaultDeserializer(this: any, _buf: Uint8Array) {
  if (!this) return;
  (Deserializer as any).call(this, _buf);
} as unknown as { new(_buf: Uint8Array): DefaultDeserializer; prototype: any };

Object.setPrototypeOf(DefaultDeserializer.prototype, Deserializer.prototype);


export function promiseHooks() {
  return {
    onInit: () => {},
    onSettled: () => {},
    onBefore: () => {},
    onAfter: () => {},
    createHook: () => ({ enable: () => {}, disable: () => {} }),
  };
}


export default {
  getHeapStatistics,
  getHeapSpaceStatistics,
  getHeapCodeStatistics,
  getHeapSnapshot,
  writeHeapSnapshot,
  setFlagsFromString,
  takeCoverage,
  stopCoverage,
  cachedDataVersionTag,
  serialize,
  deserialize,
  Serializer,
  Deserializer,
  DefaultSerializer,
  DefaultDeserializer,
  promiseHooks,
};
