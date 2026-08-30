// The REAL openDiscoveredSet against the real s1disasm files, window.api
// stubbed onto fs — integration-grade for the open-path honesty guarantees:
//
//  1. Save-back capture (updated by the uncompressed/DPLC save-back parcel):
//     Sonic (DPLC, uncompressed) now CAPTURES an in-place target carrying its
//     compression + per-frame DPLC lists (the delta writer's inputs). Spring
//     (per-frame art swap) still opens EDIT/EXPORT-ONLY — s1ArtSource stays
//     null — and a save attempt refuses with the SPECIFIC recorded reason
//     (saveBackRefusal), not the generic line. The positive control (Signpost,
//     plain non-DPLC Nemesis) still captures a target, so the capture was
//     neither broken nor over-widened.
//
//  2. SPRING FRAMES 3-5 (render-bugs parcel): the frameSources slice makes the
//     sideways frames draw Nem_VSpring — asserted by HAND-DERIVED pixels (the
//     frame-3 body cell equals the decoded vertical tile 0), plus an
//     anti-vacuous diff against the same open WITHOUT the slice.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { openDiscoveredSet, saveSpriteArt } from '../export-sprite';
import type { DiscoveredSpriteSet } from '../../../../core/import/sprite-discovery';
import { useSpriteStore } from '../../../state/spriteStore';
import { useToastStore } from '../../../state/toastStore';
import { parseTiles } from '../../../../core/formats/tiles';
import { compressionFor } from '../../../../core/compress';
import { referenceCheckout, referenceCheckoutReason, referencePath } from '../../../../../test/support/fixture-tree';

const S1DIR = referencePath('s1disasm');
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = referenceCheckoutReason('s1disasm');

// window.api over fs (read-only: s1disasm must never be written by a test).
function stubWindowApi(): () => void {
  const g = globalThis as unknown as { window?: unknown };
  const prev = g.window;
  g.window = {
    api: {
      readBinaryFile: async (base: string, rel: string): Promise<ArrayBuffer> => {
        const b = fs.readFileSync(path.join(base, rel));
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      },
      fileMtime: async (base: string, rel: string): Promise<number | null> =>
        fs.statSync(path.join(base, rel)).mtimeMs,
    },
  };
  return () => { g.window = prev; };
}

let restoreApi: () => void;
beforeEach(() => {
  restoreApi = stubWindowApi();
  useSpriteStore.getState().closeAll();
  useToastStore.setState({ toasts: [] });
});
afterEach(() => {
  restoreApi();
  useSpriteStore.getState().closeAll();
});

const lastToast = () => useToastStore.getState().toasts.at(-1)?.message ?? '';

// The exact sets editObjectArtCheckout builds for these rows (asserted in
// edit-art-handoff.test.ts) — spelled out here so this file exercises the OPEN,
// not the row lookup.
const SONIC_SET: DiscoveredSpriteSet = {
  name: 'Sonic', game: 's1',
  mappings: '_maps/Sonic.asm', art: 'artunc/Sonic.unc',
  dplc: '_maps/Sonic - Dynamic Gfx Script.asm',
};
const SPRING_SET: DiscoveredSpriteSet = {
  name: 'Spring', game: 's1',
  mappings: '_maps/Springs.asm', art: 'artnem/Spring Horizontal.nem',
  frameSources: [{ firstFrame: 3, lastFrame: 5, art: 'artnem/Spring Vertical.nem', compression: 'nemesis' }],
};

describe('openDiscoveredSet — Sonic DPLC open captures a save-back target', { skip: !referenceCheckout('s1disasm'), meta: { skipReason: S1_ABSENT } }, () => {
  it('opens 88 frames and captures an in-place target carrying compression + DPLC lists', async () => {
    const ok = await openDiscoveredSet(S1DIR, SONIC_SET, 'uncompressed');
    expect(ok).toBe(true);

    const s = useSpriteStore.getState();
    expect(s.frames).toHaveLength(88);
    // Frame 1 (MS_Stand) renders substantially — a recognizable sprite, not blank.
    const nonblank = s.frames[1].data.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0);
    expect(nonblank).toBeGreaterThan(400);

    // Save-back parcel: Sonic now captures a DPLC-aware in-place target — the
    // delta writer's inputs ride on the source, and no refusal is recorded.
    expect(s.saveBackRefusal).toBeNull();
    expect(s.s1ArtSource).not.toBeNull();
    const src = s.s1ArtSource!;
    expect(src.relPath).toBe('artunc/Sonic.unc');
    expect(src.compression).toBe('uncompressed');
    expect(src.frameCount).toBe(88);
    // DPLC lists are per-frame and 1:1 with mappings (derived from the files
    // via the same parse the open used — 88 entries, first frame non-empty).
    expect(src.dplc).toHaveLength(88);
    expect(src.dplc![1].length).toBeGreaterThan(0);
    // The decoded pool matches the .unc byte count (41,248 / 32 = 1,289 tiles —
    // derived from the file, not asserted as a constant).
    const uncBytes = fs.statSync(path.join(S1DIR, 'artunc/Sonic.unc')).size;
    expect(uncBytes % 32).toBe(0);
    expect(src.originalTiles).toHaveLength(uncBytes / 32);
  });

  it('animations stay ABSENT — the sonani dialect is not parsed (honest empty timeline)', async () => {
    await openDiscoveredSet(S1DIR, SONIC_SET, 'uncompressed');
    expect(useSpriteStore.getState().characterAnims).toEqual([]);
    expect(useSpriteStore.getState().steps).toEqual([]);
  });
});

describe('openDiscoveredSet — Spring per-frame art swap', { skip: !referenceCheckout('s1disasm'), meta: { skipReason: S1_ABSENT } }, () => {
  it('frames 3-5 draw Nem_VSpring (hand-derived pixels); frames 0-2 keep Nem_HSpring; save refuses honestly', async () => {
    // Control open: the OLD single-pool behavior (no frameSources).
    await openDiscoveredSet(S1DIR, { ...SPRING_SET, frameSources: undefined }, 'nemesis');
    const oldFrames = useSpriteStore.getState().frames.map((f) => f.data.slice());
    // s1ArtSource captured for the control (plain nemesis non-DPLC row shape).
    expect(useSpriteStore.getState().s1ArtSource).not.toBeNull();

    // The fixed open.
    const ok = await openDiscoveredSet(S1DIR, SPRING_SET, 'nemesis');
    expect(ok).toBe(true);
    const s = useSpriteStore.getState();
    expect(s.frames).toHaveLength(6);

    // ANTI-VACUOUS DIFF: the sideways frame now differs from the old render;
    // an upright frame is byte-identical (the swap touches ONLY its range).
    expect(s.frames[3].data).not.toEqual(oldFrames[3]);
    expect(s.frames[0].data).toEqual(oldFrames[0]);

    // HAND-DERIVED: frame 3 (.spg_Left) is one 2x4-cell piece at (-8,-$10)
    // whose tile indices 0..7 are VDP column-major into the VERTICAL pool
    // (_maps/Springs.asm .spg_Left; _incObj/41 Springs.asm:54-58). So the
    // 8x8 cell at piece-local (0,0) must be EXACTLY the decoded Nem_VSpring
    // tile 0, pixel for pixel.
    const vtiles = parseTiles(compressionFor('nemesis').decompress(
      new Uint8Array(fs.readFileSync(path.join(S1DIR, 'artnem/Spring Vertical.nem')))));
    const f3 = s.frames[3];
    const at = (x: number, y: number) => f3.data[(y + s.originY) * f3.width + (x + s.originX)];
    for (let py = 0; py < 8; py++) {
      for (let px = 0; px < 8; px++) {
        expect(at(-8 + px, -0x10 + py), `cell(0,0) px ${px},${py}`).toBe(vtiles[0].pixels[py * 8 + px]);
      }
    }
    // And column-major: piece cell (col 1, row 2) — canvas x -8+8=0.., y
    // -$10+16=0.. — shows vertical tile 1*4+2 = 6.
    expect(at(0 + 3, 0 + 3)).toBe(vtiles[6].pixels[3 * 8 + 3]);

    // CROSS-DOMAIN IDENTITY for the CDP harness (s1-sonic-sprite-harness.mjs):
    // FNV-1a of the frame's index bytes, mirrored in __dbg.spriteState().
    // These constants are MEASURED from this very render path over the real
    // files (scratchpad spring-hash probe) — the hand-derived pixel asserts
    // above are what prove them CORRECT; the constants only carry identity
    // into the harness, where frame 4 must hash 358b89d8 (vertical pool) and
    // must NOT hash 01af9749 (the old horizontal-pool render).
    const fnv1a = (d: Uint8Array) => {
      let h = 0x811c9dc5;
      for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193) >>> 0; }
      return h.toString(16).padStart(8, '0');
    };
    expect(fnv1a(s.frames[4].data)).toBe('358b89d8');
    expect(fnv1a(oldFrames[4])).toBe('01af9749');
    expect(fnv1a(s.frames[1].data)).toBe('7e380bb1'); // upright frame: same either way

    // Save-back: a frame-swap doc has NO single honest write target.
    expect(s.s1ArtSource).toBeNull();
    expect(s.saveBackRefusal).toContain("Spring can't save back in place");
    expect(s.saveBackRefusal).toContain('different art file');
    await saveSpriteArt();
    expect(lastToast()).toBe(s.saveBackRefusal);
  });
});

describe('openDiscoveredSet — positive control: the capture guard is not over-tightened', { skip: !referenceCheckout('s1disasm'), meta: { skipReason: S1_ABSENT } }, () => {
  it('Signpost (plain non-DPLC Nemesis) still captures an in-place target, no refusal recorded', async () => {
    const ok = await openDiscoveredSet(S1DIR, {
      name: 'Signpost', game: 's1', mappings: '_maps/Signpost.asm', art: 'artnem/Signpost.nem',
    }, 'nemesis');
    expect(ok).toBe(true);
    const s = useSpriteStore.getState();
    expect(s.s1ArtSource).not.toBeNull();
    expect(s.s1ArtSource!.relPath).toBe('artnem/Signpost.nem');
    expect(s.saveBackRefusal).toBeNull();
  });
});
