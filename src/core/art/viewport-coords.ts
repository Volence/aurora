/**
 * Pure canvas-local → pixel coordinate mapping for the shared PixelViewport.
 * `localX/localY` are pointer coords relative to the canvas top-left (clientX -
 * rect.left, etc.); returns the integer pixel under the cursor, or null if it
 * falls outside the buffer. Kept pure so it is unit-testable without a DOM.
 */
export function pixelAt(
  localX: number, localY: number, zoom: number, width: number, height: number,
  repeat?: { tilesX: number; tilesY: number },
): { x: number; y: number } | null {
  // In repeat-preview, the editable doc is the CENTER tile of a tilesX×tilesY grid;
  // shift the origin to it (clicks in the faint surrounding copies fall out of bounds).
  const offX = repeat ? Math.floor(repeat.tilesX / 2) * width * zoom : 0;
  const offY = repeat ? Math.floor(repeat.tilesY / 2) * height * zoom : 0;
  const x = Math.floor((localX - offX) / zoom);
  const y = Math.floor((localY - offY) / zoom);
  if (x < 0 || x >= width || y < 0 || y >= height) return null;
  return { x, y };
}
