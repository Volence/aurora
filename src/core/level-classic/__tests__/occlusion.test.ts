// The occlusion compositor's per-pixel decision: sprite piece priority × plane
// tile priority × map pixel transparency → who owns the pixel.
//
// VDP layer order (back → front): B-low, A-low, sprite-LOW, B-high, A-high,
// sprite-HIGH. In the editor's single-displayed-plane view that collapses to:
// a high-priority plane tile's OPAQUE pixel renders in front of a low-priority
// sprite pixel, and nothing else about the plane ever beats a sprite — a
// transparent (color 0) map pixel renders nothing, and a HIGH sprite piece
// outranks even a high plane tile.
//
// The real-data half derives its inputs by SEARCH over GHZ act 1 (the owner's
// screenshot case: a monitor behind GHZ tree leaves) — mask from
// chunkPriorityMask, map opacity from renderChunk, sprite pixels from the same
// resolved render path the app uses. No hardcoded coordinates.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { occlusionWinner } from '../occlusion';
import { chunkPriorityMask, CHUNK_TILES } from '../priority-mask';
import { renderChunk } from '../render';
import { renderResolvedObjectFrame, objectFrameRect } from '../object-sprite';
import { resolveObjectArt } from '../../project/profiles/s1-object-art';
import { resolveEffectiveObjectArt } from '../../project/profiles/object-subtype-rules';
import { layoutCellAt } from '../../../renderer/components/classic/viewport-math';
import { s1Adapter } from '../../project/s1';
import type { FileAccess } from '../../project/adapter';

const S1DIR = '/home/volence/sonic_hacks/s1disasm';
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = `${S1DIR} is absent — this machine has no s1disasm checkout, so these rows measure nothing`;
const S1_PRESENT = fs.existsSync(S1DIR);

describe('occlusionWinner truth table', () => {
  it('high plane tile + opaque map pixel occludes a LOW sprite pixel', () => {
    expect(occlusionWinner(false, true, true)).toBe('map');
  });
  it('a HIGH sprite piece is never occluded', () => {
    expect(occlusionWinner(true, true, true)).toBe('sprite');
  });
  it('a low plane tile never occludes, opaque or not', () => {
    expect(occlusionWinner(false, false, true)).toBe('sprite');
    expect(occlusionWinner(false, false, false)).toBe('sprite');
    expect(occlusionWinner(true, false, true)).toBe('sprite');
  });
  it('a transparent map pixel never occludes even on a high tile', () => {
    expect(occlusionWinner(false, true, false)).toBe('sprite');
    expect(occlusionWinner(true, true, false)).toBe('sprite');
  });
});

function realFs(root: string): FileAccess {
  return {
    async exists(rel: string) { return fs.existsSync(path.join(root, rel)); },
    async read(rel: string) { return new Uint8Array(fs.readFileSync(path.join(root, rel))); },
    async list(rel: string) { return fs.readdirSync(path.join(root, rel)); },
  } as FileAccess;
}

describe('decision inputs derived from GHZ act 1 (monitor behind leaves)', { skip: !S1_PRESENT, meta: { skipReason: S1_ABSENT } }, () => {
  it('finds a monitor with occluded AND free pixels, and the rule splits them', async () => {
    const handle = await s1Adapter.open(realFs(S1DIR));
    expect(handle.levels).not.toBeNull();
    const ref = handle.levels!.list().find((r) => r.zone.toLowerCase() === 'ghz' && r.act === 1);
    expect(ref).toBeDefined();
    const doc = await handle.levels!.read(ref!);

    // SEARCH for a monitor ($26) whose sprite rect overlaps both a hi-pri
    // opaque map pixel and a low/transparent position — the owner's screenshot
    // case, found, never assumed.
    const maskCache = new Map<number, Uint8Array | null>();
    const rgbaCache = new Map<number, Uint8ClampedArray>();
    let occludedSeen = 0;
    let freeSeen = 0;
    let hiTransparentSeen = 0;
    for (const obj of doc.objects) {
      if (obj.id !== 0x26) continue;
      const base = resolveObjectArt(obj.id, 'ghz');
      if (!base) continue;
      const { link, pieces } = resolveEffectiveObjectArt(obj.id, 'ghz', obj.subtype, base);
      const artBytes = new Uint8Array(fs.readFileSync(path.join(S1DIR, link.artFile)));
      const mapText = fs.readFileSync(path.join(S1DIR, link.mapAsm), 'utf8');
      const frame = renderResolvedObjectFrame(
        { artSource: link.artSource, compression: link.compression, tileIndexOffset: link.tileIndexOffset, frame: link.frame, pieces },
        mapText, artBytes, null,
      );
      const rect = objectFrameRect(frame, obj.x, obj.y, obj.xflip, obj.yflip);
      for (let py = 0; py < frame.height; py++) {
        for (let px = 0; px < frame.width; px++) {
          const sx = obj.xflip ? frame.width - 1 - px : px;
          const sy = obj.yflip ? frame.height - 1 - py : py;
          const i = sy * frame.width + sx;
          if (frame.indices[i] === 0) continue; // transparent sprite pixel — nothing to decide
          const spriteHi = frame.priMask ? frame.priMask[i] !== 0 : false;
          const wx = Math.round(rect.left) + px;
          const wy = Math.round(rect.top) + py;
          const col = Math.floor(wx / 256), row = Math.floor(wy / 256);
          const cell = layoutCellAt(doc.fg, col, row);
          if (cell === undefined) continue;
          const chunkId = cell & 0x7f;
          if (!maskCache.has(chunkId)) maskCache.set(chunkId, chunkPriorityMask(doc, chunkId));
          const mask = maskCache.get(chunkId);
          const lx = wx - col * 256, ly = wy - row * 256;
          const tileHi = mask ? mask[(ly >> 3) * CHUNK_TILES + (lx >> 3)] !== 0 : false;
          let rgba = rgbaCache.get(chunkId);
          if (!rgba) { rgba = renderChunk(doc, chunkId); rgbaCache.set(chunkId, rgba); }
          const mapOpaque = rgba[(ly * 256 + lx) * 4 + 3] !== 0;
          const winner = occlusionWinner(spriteHi, tileHi, mapOpaque);
          if (tileHi && mapOpaque && !spriteHi) {
            expect(winner).toBe('map');
            occludedSeen++;
          } else {
            expect(winner).toBe('sprite');
            if (tileHi && !mapOpaque) hiTransparentSeen++;
            else freeSeen++;
          }
        }
      }
      if (occludedSeen > 0 && freeSeen > 0 && hiTransparentSeen > 0) break;
    }
    // Anti-vacuous: the act must actually contain all three input classes —
    // occluded pixels (leaves over monitor), free pixels, and hi-pri tiles
    // with transparent pixels (which must NOT erase the sprite).
    expect(occludedSeen).toBeGreaterThan(0);
    expect(freeSeen).toBeGreaterThan(0);
    expect(hiTransparentSeen).toBeGreaterThan(0);
  }, 30000);
});
