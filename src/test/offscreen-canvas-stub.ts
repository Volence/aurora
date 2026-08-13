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
