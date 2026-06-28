// Pure camera for pixel/map viewports. `x,y` = world-space coords of the
// viewport's top-left corner; `zoom` = device px per world unit. Mirrors the
// anchored-zoom math viewStore.setZoom already uses, so the Map's navigation is
// preserved when it migrates onto this.
export interface Camera { x: number; y: number; zoom: number; }
export interface ZoomBounds { min: number; max: number; }

export function clampZoom(z: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, z));
}
export function screenToWorld(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: cam.x + sx / cam.zoom, y: cam.y + sy / cam.zoom };
}
export function worldToScreen(cam: Camera, wx: number, wy: number): { x: number; y: number } {
  return { x: (wx - cam.x) * cam.zoom, y: (wy - cam.y) * cam.zoom };
}
export function pan(cam: Camera, dxScreen: number, dyScreen: number): Camera {
  return { x: cam.x - dxScreen / cam.zoom, y: cam.y - dyScreen / cam.zoom, zoom: cam.zoom };
}
export function zoomAtPoint(cam: Camera, sx: number, sy: number, newZoomRaw: number, b: ZoomBounds): Camera {
  const zoom = clampZoom(newZoomRaw, b.min, b.max);
  const w = screenToWorld(cam, sx, sy);
  return { x: w.x - sx / zoom, y: w.y - sy / zoom, zoom };
}
export function fit(content: { width: number; height: number }, viewport: { width: number; height: number }, opts?: { padding?: number; max?: number }): Camera {
  const pad = opts?.padding ?? 0;
  const z = Math.min((viewport.width - pad) / content.width, (viewport.height - pad) / content.height);
  const zoom = opts?.max ? Math.min(z, opts.max) : z;
  return { x: -((viewport.width - content.width * zoom) / 2) / zoom, y: -((viewport.height - content.height * zoom) / 2) / zoom, zoom };
}
export function zoomToSelection(rect: { x: number; y: number; w: number; h: number }, viewport: { width: number; height: number }, opts?: { max?: number; padding?: number }): Camera {
  const fitted = fit({ width: rect.w, height: rect.h }, viewport, opts);
  return { x: rect.x + fitted.x, y: rect.y + fitted.y, zoom: fitted.zoom };
}
export function clampPan(cam: Camera, bounds: { minX: number; minY: number; maxX: number; maxY: number }): Camera {
  return { ...cam, x: Math.max(bounds.minX, Math.min(bounds.maxX, cam.x)), y: Math.max(bounds.minY, Math.min(bounds.maxY, cam.y)) };
}
