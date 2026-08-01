// TTY polyfill - always reports non-TTY in browser


// always false in browser
export function isatty(_fd: number): boolean {
  return false;
}

export interface ReadStream {
  isTTY: boolean;
  isRaw: boolean;
  setRawMode(_mode: boolean): this;
}

export const ReadStream = function ReadStream(this: any) {
  if (!this) return;
  this.isTTY = false;
  this.isRaw = false;
} as unknown as { new(): ReadStream; prototype: any };

ReadStream.prototype.setRawMode = function setRawMode(_mode: boolean) {
  this.isRaw = _mode;
  return this;
};

export interface WriteStream {
  isTTY: boolean;
  columns: number;
  rows: number;
  getColorDepth(): number;
  hasColors(count?: number): boolean;
  getWindowSize(): [number, number];
  clearLine(_dir: number, _cb?: () => void): boolean;
  clearScreenDown(_cb?: () => void): boolean;
  cursorTo(_x: number, _y?: number | (() => void), _cb?: () => void): boolean;
  moveCursor(_dx: number, _dy: number, _cb?: () => void): boolean;
}

export const WriteStream = function WriteStream(this: any) {
  if (!this) return;
  this.isTTY = false;
  this.columns = 120;
  this.rows = 40;
} as unknown as { new(): WriteStream; prototype: any };

WriteStream.prototype.getColorDepth = function getColorDepth(): number {
  // Non-TTY streams do not advertise color (Node returns 1)
  return this.isTTY ? 8 : 1;
};
WriteStream.prototype.hasColors = function hasColors(count?: number): boolean {
  if (!this.isTTY) return false;
  return (count ?? 1) <= 256;
};
WriteStream.prototype.getWindowSize = function getWindowSize(): [number, number] {
  return [this.columns, this.rows];
};
WriteStream.prototype.clearLine = function clearLine(_dir: number, _cb?: () => void): boolean {
  _cb?.();
  return true;
};
WriteStream.prototype.clearScreenDown = function clearScreenDown(_cb?: () => void): boolean {
  _cb?.();
  return true;
};
WriteStream.prototype.cursorTo = function cursorTo(_x: number, _y?: number | (() => void), _cb?: () => void): boolean {
  if (typeof _y === "function") _y();
  else _cb?.();
  return true;
};
WriteStream.prototype.moveCursor = function moveCursor(_dx: number, _dy: number, _cb?: () => void): boolean {
  _cb?.();
  return true;
};

export default { isatty, ReadStream, WriteStream };
