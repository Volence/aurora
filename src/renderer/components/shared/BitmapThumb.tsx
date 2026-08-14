import React, { useEffect, useRef } from 'react';

/**
 * Draws an already-rendered bitmap into a fixed square, aspect-preserved and
 * centred, never upscaled past 1:1. Store-free by construction — the caller owns
 * resolving the bitmap — so it can serve any engine's thumbnail slot. Classic's
 * object rows use `classic/ObjectThumb` instead, because those resolve their art
 * asynchronously through the classic level doc.
 */
export default function BitmapThumb({
  bitmap, size = 28,
}: {
  bitmap: ImageBitmap | null | undefined;
  size?: number;
}): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    // width === 0 ⇒ the bitmap was closed out from under us between publish and
    // draw; drawing a detached source throws, so skip it.
    if (!bitmap || bitmap.width === 0 || bitmap.height === 0) return;
    ctx.imageSmoothingEnabled = false;
    const scale = Math.min(size / bitmap.width, size / bitmap.height, 1);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  }, [bitmap, size]);
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      style={{ width: size, height: size, imageRendering: 'pixelated', display: 'block' }}
    />
  );
}
