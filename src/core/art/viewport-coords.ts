/**
 * Pure canvas-local → pixel coordinate mapping for the shared PixelViewport.
 * `localX/localY` are pointer coords relative to the canvas top-left (clientX -
 * rect.left, etc.); returns the integer pixel under the cursor, or null if it
 * falls outside the buffer. Kept pure so it is unit-testable without a DOM.
 */
export function pixelAt(localX: number, localY: number, zoom: number, width: number, height: number): { x: number; y: number } | null {
  const x = Math.floor(localX / zoom);
  const y = Math.floor(localY / zoom);
  if (x < 0 || x >= width || y < 0 || y >= height) return null;
  return { x, y };
}
