import { s4CollisionAdapter } from '../../core/collision/adapters/s4-collision-adapter';
import type { CollisionProfileSet } from '../../core/collision/collision-model';

async function readBin(basePath: string, rel: string): Promise<Uint8Array> {
  return new Uint8Array(await window.api.readBinaryFile(basePath, rel));
}

/**
 * Load the engine's four collision tables from `basePath/relDir` and decode them
 * via the s4 adapter. Returns null on any missing/unreadable table so the overlay
 * degrades gracefully (the view falls back to flat cell fills) rather than crashing.
 */
export async function loadCollisionProfiles(basePath: string, relDir: string): Promise<CollisionProfileSet | null> {
  const dir = relDir.endsWith('/') ? relDir : `${relDir}/`;
  // The palette shows the fixed BASE BANK (the imported S&K vocabulary), not the
  // sparse interned runtime tables the bake writes to `${dir}*.bin`. Prefer the
  // base bank; fall back to the flat tables (pre-flag builds / if base absent).
  for (const sub of [`${dir}base/`, dir]) {
    try {
      const [heightmaps, angles, solidity] = await Promise.all([
        readBin(basePath, `${sub}heightmaps.bin`),
        readBin(basePath, `${sub}angles.bin`),
        readBin(basePath, `${sub}solidity.bin`),
      ]);
      return s4CollisionAdapter.decodeProfiles({ heightmaps, angles, solidity });
    } catch {
      // try the next location
    }
  }
  return null;
}
