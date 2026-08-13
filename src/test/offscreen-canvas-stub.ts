// Global vitest setup (registered in vitest.config's setupFiles): a node-env
// stub for OffscreenCanvas. Renderer modules construct canvases at import time —
// e.g. MapViewport's module-level `new SectionRenderer()`, whose field
// initializer calls `new OffscreenCanvas(8, 8).getContext('2d')` — so any test
// that imports such a module (facet-visibility and the Task 11/12 facet tests)
// evaluates that before its body runs. The default node env has no
// OffscreenCanvas, so it must exist as a global. Nothing renders in these tests,
// so a no-op 2d context suffices. Guarded so it only DEFINES a missing global —
// it never overrides a real (jsdom/browser) OffscreenCanvas, leaving every
// existing test's behavior unchanged.

// ImageData is likewise absent from the node env. TileRenderer.renderTile and
// SectionRenderer's compose staging buffer both construct one, so a plain data
// holder (which is all ImageData is) lets those run under vitest. Same guard:
// it only DEFINES a missing global, never overrides a real browser one.
if (typeof (globalThis as { ImageData?: unknown }).ImageData === 'undefined') {
  class ImageDataStub {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(a: Uint8ClampedArray | number, b: number, c?: number) {
      if (typeof a === 'number') {
        this.width = a;
        this.height = b;
        this.data = new Uint8ClampedArray(a * b * 4);
      } else {
        this.data = a;
        this.width = b;
        this.height = c ?? a.length / 4 / b;
      }
    }
  }
  (globalThis as { ImageData?: unknown }).ImageData = ImageDataStub;
}

if (typeof (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas === 'undefined') {
  const noopCtx = new Proxy({}, { get: () => () => undefined });
  class OffscreenCanvasStub {
    width: number;
    height: number;
    constructor(width: number, height: number) { this.width = width; this.height = height; }
    getContext(): unknown { return noopCtx; }
  }
  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = OffscreenCanvasStub;
}
