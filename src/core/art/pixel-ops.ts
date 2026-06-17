// Pure pixel-buffer operations for the art composer. Buffers hold 4bpp
// palette indices (0-15); all ops return new buffers, never mutate input.

export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8Array; // row-major, values 0-15
}

export function createBuffer(width: number, height: number): PixelBuffer {
  return { width, height, data: new Uint8Array(width * height) };
}

function clone(buf: PixelBuffer): PixelBuffer {
  return { width: buf.width, height: buf.height, data: new Uint8Array(buf.data) };
}

export function floodFill(buf: PixelBuffer, x: number, y: number, value: number): PixelBuffer {
  const out = clone(buf);
  // Bounds guard: a seed at x === width would otherwise wrap (row-major
  // indexing) into the first pixel of the next row and fill from there.
  if (x < 0 || x >= buf.width || y < 0 || y >= buf.height) return out;
  const { width, height, data } = out;
  const target = data[y * width + x];
  if (target === value) return out;
  const stack: number[] = [y * width + x];
  while (stack.length) {
    const idx = stack.pop()!;
    if (data[idx] !== target) continue;
    data[idx] = value;
    const cx = idx % width;
    if (cx > 0) stack.push(idx - 1);
    if (cx < width - 1) stack.push(idx + 1);
    if (idx >= width) stack.push(idx - width);
    if (idx < width * (height - 1)) stack.push(idx + width);
  }
  return out;
}

export function drawLine(
  buf: PixelBuffer, x0: number, y0: number, x1: number, y1: number, value: number,
): PixelBuffer {
  const out = clone(buf);
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, cx = x0, cy = y0;
  for (;;) {
    if (cx >= 0 && cx < out.width && cy >= 0 && cy < out.height) {
      out.data[cy * out.width + cx] = value;
    }
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; cx += sx; }
    if (e2 <= dx) { err += dx; cy += sy; }
  }
  return out;
}

export function drawRect(
  buf: PixelBuffer, x: number, y: number, w: number, h: number,
  value: number, filled: boolean,
): PixelBuffer {
  const out = clone(buf);
  for (let ry = y; ry < y + h; ry++) {
    for (let rx = x; rx < x + w; rx++) {
      if (rx < 0 || rx >= out.width || ry < 0 || ry >= out.height) continue;
      const edge = rx === x || rx === x + w - 1 || ry === y || ry === y + h - 1;
      if (filled || edge) out.data[ry * out.width + rx] = value;
    }
  }
  return out;
}

export function flipH(buf: PixelBuffer): PixelBuffer {
  const out = createBuffer(buf.width, buf.height);
  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      out.data[y * buf.width + x] = buf.data[y * buf.width + (buf.width - 1 - x)];
    }
  }
  return out;
}

export function flipV(buf: PixelBuffer): PixelBuffer {
  const out = createBuffer(buf.width, buf.height);
  for (let y = 0; y < buf.height; y++) {
    out.data.set(buf.data.subarray((buf.height - 1 - y) * buf.width, (buf.height - y) * buf.width), y * buf.width);
  }
  return out;
}

/** Clockwise 90°. Square buffers only. */
export function rotate90(buf: PixelBuffer): PixelBuffer {
  if (buf.width !== buf.height) throw new Error('rotate90 requires a square buffer');
  const n = buf.width;
  const out = createBuffer(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      out.data[x * n + (n - 1 - y)] = buf.data[y * n + x];
    }
  }
  return out;
}

export function wrapShift(buf: PixelBuffer, dx: number, dy: number): PixelBuffer {
  const out = createBuffer(buf.width, buf.height);
  const w = buf.width, h = buf.height;
  const ox = ((dx % w) + w) % w, oy = ((dy % h) + h) % h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out.data[((y + oy) % h) * w + ((x + ox) % w)] = buf.data[y * w + x];
    }
  }
  return out;
}

export type DitherPattern = 'checker' | 'sparse25' | 'sparse75';

/** Which of two values lands on (x,y) for a dither pattern. */
export function ditherValue(
  pattern: DitherPattern, x: number, y: number, a: number, b: number,
): number {
  switch (pattern) {
    case 'checker': return (x + y) % 2 === 0 ? a : b;
    case 'sparse25': return x % 2 === 0 && y % 2 === 0 ? a : b;
    case 'sparse75': return x % 2 === 0 && y % 2 === 0 ? b : a;
  }
}

/**
 * Pixel-perfect rule: true if `b` is the redundant middle pixel of an L-corner
 * between `a` and `c` (a and c diagonally adjacent; b orthogonally adjacent to
 * both). Such a `b` should be dropped from a freehand stroke to avoid the
 * doubled-corner "jaggies" that make pixel art look amateur.
 */
export function isLCorner(
  a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number },
): boolean {
  return Math.abs(c.x - a.x) === 1 && Math.abs(c.y - a.y) === 1
    && (b.x === a.x || b.x === c.x) && (b.y === a.y || b.y === c.y);
}

export type MirrorMode = 'h' | 'v' | 'both';

/** All points a symmetric stroke at (x,y) touches, deduped. */
export function mirrorPoints(
  width: number, height: number, x: number, y: number, mode: MirrorMode,
): Array<{ x: number; y: number }> {
  const pts = [{ x, y }];
  if (mode === 'h' || mode === 'both') pts.push({ x: width - 1 - x, y });
  if (mode === 'v' || mode === 'both') pts.push({ x, y: height - 1 - y });
  if (mode === 'both') pts.push({ x: width - 1 - x, y: height - 1 - y });
  const seen = new Set<number>();
  return pts.filter(p => {
    const key = p.y * width + p.x;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
