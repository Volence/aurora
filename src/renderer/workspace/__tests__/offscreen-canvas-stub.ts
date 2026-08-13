// Node-env stub for OffscreenCanvas. The facet-visibility test imports
// register-facets → layout-facet → MapViewport, and MapViewport creates a
// module-level `new SectionRenderer()` whose field initializer calls
// `new OffscreenCanvas(8, 8).getContext('2d')`. That runs at import time (before
// any test body), so it must exist as a global for the node env to load the
// module graph. Nothing renders, so a no-op 2d context is sufficient. Import
// this FIRST (ESM evaluates imports in source order) so it is installed before
// the component modules load.

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
