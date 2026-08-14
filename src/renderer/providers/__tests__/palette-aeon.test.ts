// The aeon palette port's pure half, plus the one thing about it that is pure
// wiring and pure data-loss risk if it goes: the drag TEARDOWN.
//
// The hook cannot run here (no DOM, no renderer), and the commit/revert decision
// it routes through is executed in core/art/__tests__/palette-drag.test.ts. What
// is left for this file is the data the port hands the grid, and a
// comment-stripped scan proving the teardown is still wired — every identifier
// below is discussed at length in the port's docblocks, so a scan of raw source
// would pass on the prose.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AEON_ART_PALETTE_POLICY,
  AEON_SPRITE_PALETTE_POLICY,
  aeonPaletteLines,
  aeonPaletteVersionKey,
  keepIndex0Transparent,
  paletteLineChanged,
} from '../palette-aeon';
import { isLineLocked, swatchClick } from '../../components/art-shared/palette-grid-model';
import { encodeGenesisColor } from '../../../core/formats/palette';
import type { Color } from '../../../core/model/s4-types';

const rgb = (r: number, g: number, b: number, a = 255): Color => ({ r, g, b, a });

/**
 * The dependency array of the `React.useCallback` that `name` is declared with,
 * as source text — or `null` if it is not declared as one at all. Anchored to
 * the declaration and stopped at the FIRST closing `}, [...]);` after it, so it
 * cannot drift into the next callback's array.
 */
function callbackDeps(src: string, name: string): string | null {
  const start = src.indexOf(`const ${name} = React.useCallback(`);
  if (start < 0) return null;
  return /\}, (\[[^\]]*\])\);/.exec(src.slice(start))?.[1] ?? null;
}

describe('the aeon policies', () => {
  it('locks line 0 in the Art mount — it is the shared PLAYER palette', () => {
    expect(AEON_ART_PALETTE_POLICY.lockedLines).toEqual([0]);
    expect(isLineLocked(0, AEON_ART_PALETTE_POLICY)).toBe(true);
    expect(swatchClick(0, 4, AEON_ART_PALETTE_POLICY)).toEqual({ select: false, edit: false });
    for (const line of [1, 2, 3]) {
      expect(swatchClick(line, 4, AEON_ART_PALETTE_POLICY), `line ${line}`)
        .toEqual({ select: true, edit: true });
    }
  });

  it('unlocks the same line in the sprite mounts, where editing it is the job', () => {
    expect(AEON_SPRITE_PALETTE_POLICY.lockedLines).toEqual([]);
    expect(swatchClick(0, 4, AEON_SPRITE_PALETTE_POLICY)).toEqual({ select: true, edit: true });
  });

  it('treats index 0 as the eraser in both mounts', () => {
    for (const policy of [AEON_ART_PALETTE_POLICY, AEON_SPRITE_PALETTE_POLICY]) {
      expect(policy.transparent).toBe('paint');
    }
    // On an UNLOCKED line it binds the brush and opens nothing…
    expect(swatchClick(1, 0, AEON_ART_PALETTE_POLICY)).toEqual({ select: true, edit: false });
    // …and on the locked line the lock wins first.
    expect(swatchClick(0, 0, AEON_ART_PALETTE_POLICY)).toEqual({ select: false, edit: false });
  });
});

describe('aeonPaletteLines', () => {
  it('encodes the zone palette to CRAM words, line by line', () => {
    const palette = {
      lines: [
        { colors: [rgb(0, 0, 0, 0), rgb(255, 0, 0)] },
        { colors: [rgb(0, 0, 0, 0), rgb(0, 0, 255)] },
      ],
    };
    expect(aeonPaletteLines(palette)).toEqual([[0x0000, 0x000e], [0x0000, 0x0e00]]);
  });

  it('has nothing to draw with no zone', () => {
    expect(aeonPaletteLines(null)).toEqual([]);
    expect(aeonPaletteLines(undefined)).toEqual([]);
  });
});

describe('keepIndex0Transparent', () => {
  it('forces alpha 0 on index 0 and leaves its RGB alone', () => {
    const out = keepIndex0Transparent([rgb(9, 9, 9, 255), rgb(1, 2, 3)]);
    expect(out[0]).toEqual(rgb(9, 9, 9, 0));
    expect(out[1]).toEqual(rgb(1, 2, 3));
  });

  it('copies rather than mutating the line it was given', () => {
    // The drag path reads the LIVE document here; mutating it would corrupt the
    // very colours the revert is about to restore.
    const src = [rgb(9, 9, 9, 255)];
    const out = keepIndex0Transparent(src);
    expect(src[0].a).toBe(255);
    expect(out[0]).not.toBe(src[0]);
  });

  it('survives an empty line', () => {
    expect(keepIndex0Transparent([])).toEqual([]);
  });
});

describe('paletteLineChanged', () => {
  it('is false when nothing moved', () => {
    const line = [rgb(0, 0, 0, 0), rgb(255, 0, 0)];
    expect(paletteLineChanged(line, line.map((c) => ({ ...c })))).toBe(false);
  });

  it('compares the QUANTIZED word, not raw 8-bit RGB', () => {
    // The sliders work in 3-bit levels. Two 8-bit triples that encode to the same
    // CRAM word are the same colour to the hardware, and recording an undo step
    // for the difference would put an invisible entry on the stack.
    const a = [rgb(250, 0, 0)];
    const b = [rgb(255, 0, 0)];
    expect(encodeGenesisColor(a[0])).toBe(encodeGenesisColor(b[0]));
    expect(paletteLineChanged(a, b)).toBe(false);
  });

  it('notices a real colour change', () => {
    expect(paletteLineChanged([rgb(255, 0, 0)], [rgb(0, 255, 0)])).toBe(true);
  });

  it('notices an alpha-only change on the transparent index', () => {
    // Index 0's alpha is document state the commit writes; a line that differs
    // only there is still a change worth recording.
    expect(paletteLineChanged([rgb(0, 0, 0, 0)], [rgb(0, 0, 0, 255)])).toBe(true);
  });

  it('treats a differently-sized line as changed rather than reading past the end', () => {
    expect(paletteLineChanged([rgb(1, 1, 1)], [])).toBe(true);
  });
});

describe('aeonPaletteVersionKey', () => {
  it('moves on a preview tick, on a history change, and on a scope change', () => {
    const base = aeonPaletteVersionKey('zone:ghz', 3, 9);
    expect(base).not.toBe(aeonPaletteVersionKey('zone:ghz', 4, 9)); // slider tick
    expect(base).not.toBe(aeonPaletteVersionKey('zone:ghz', 3, 10)); // undo/redo
    expect(base).not.toBe(aeonPaletteVersionKey('zone:mz', 3, 9));   // act/zone switch
    expect(base).toBe(aeonPaletteVersionKey('zone:ghz', 3, 9));
  });

  it('separates a sprite doc from the zone, and one sprite doc from another', () => {
    expect(aeonPaletteVersionKey('sprite:doc:a', 3, 9))
      .not.toBe(aeonPaletteVersionKey('sprite:doc:b', 3, 9));
    expect(aeonPaletteVersionKey('sprite:doc:a', 3, 9))
      .not.toBe(aeonPaletteVersionKey('zone:ghz', 3, 9));
  });
});

describe('a palette drag through this port can never be stranded', () => {
  // THE DATA-LOSS TRAP the preview design carries: `previewZone` writes
  // `zone.palette.lines[..].colors[..]` in place, outside the command system, so
  // the composer repaints per tick. Only a drag END turns that into an undoable,
  // dirty-marking step — and Chrome does not fire `blur` when a focused element
  // is removed, so the end has to be guaranteed by a teardown, not by the DOM.
  const SRC = readFileSync(join(__dirname, '..', 'palette-aeon.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('exposes a drain that ends BOTH paths', () => {
    // Both, unconditionally: at teardown time the palette mode may already have
    // flipped to the value that removed the panel, so picking an ender by the
    // current mode runs the wrong one. Each is a no-op with no snapshot out.
    expect(SRC, 'the port lost its drain — a mid-drag unmount strands the mutation')
      .toMatch(/const drain = React\.useCallback\(\(\): void => \{\s*endZoneDrag\(\);\s*endStandaloneDrag\(\);\s*\}/);
    expect(SRC, 'drain is not on the port, so no host can call it').toMatch(/^\s*drain,$/m);
  });

  it('routes every drag end through the shared commit/revert decision', () => {
    expect(SRC, 'the port no longer imports resolvePaletteDragEnd')
      .toMatch(/import \{ resolvePaletteDragEnd \}/);
    const calls = SRC.match(/resolvePaletteDragEnd\(\{/g) ?? [];
    expect(calls, 'one of the two drag-end paths decides for itself again').toHaveLength(2);
  });

  it('snapshots the DOCUMENT, not just the line index', () => {
    // Without this, a drag that ends after an act switch restores the pre-drag
    // colours onto whatever zone is current NOW — corrupting one the user never
    // touched.
    expect(SRC, 'the zone snapshot no longer carries the zone it was taken from')
      .toMatch(/preDragRef = React\.useRef<\{ zone: Zone;/);
    expect(SRC, 'the standalone snapshot no longer carries its sprite doc id')
      .toMatch(/preDragStandaloneRef = React\.useRef<\{ docId: string;/);
    // …and the standalone revert reaches a PARKED doc, which setState cannot.
    expect(SRC, 'the standalone revert writes the active store field instead of its own doc')
      .toMatch(/patchSpriteDoc\(pre\.docId, \{ standalonePalette:/);
  });

  it('keeps every drag-end path identity-stable, so a stale cleanup still works', () => {
    // The host calls `drain` from an effect cleanup keyed on the open swatch. If
    // an ender were rebuilt per render around render-scoped state, the cleanup
    // captured earlier would run against the wrong snapshot. They read
    // everything through getState and refs, so `[]` deps are honest.
    //
    // Read the deps of THAT declaration, not "some `[]` later in the file": a
    // lazy `[\s\S]*?` version of this passed with a planted `[project]`, because
    // it happily ran on to the next callback's empty array.
    for (const name of ['endZoneDrag', 'endStandaloneDrag']) {
      expect(callbackDeps(SRC, name), `${name} is no longer identity-stable`).toBe('[]');
    }
  });

  it('commits AMBIENTLY, because the sprite pane has no aeon history focused', () => {
    // This grid edits ZONE palette lines from inside the sprite pane too, where
    // focus is the sprite DOCUMENT — which owns no aeon command history, so
    // routing by focus throws inside the event handler.
    expect(SRC).toMatch(/executeAmbientCommand\(/);
    expect(SRC, 'the port routes a zone palette edit by focus again')
      .not.toMatch(/\bexecuteCommand\(/);
  });
});

describe('the aeon port watches both clocks', () => {
  const SRC = readFileSync(join(__dirname, '..', 'palette-aeon.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('subscribes paletteVersion for the live preview', () => {
    // The clock that exists specifically so a slider tick does NOT wake the
    // history-keyed caches in TilesetPanel and ChunkLibrary.
    expect(SRC).toMatch(/useArtStore\(\(s\) => s\.paletteVersion\)/);
  });

  it('subscribes the history hub too, or undo leaves the swatches stale', () => {
    // paletteVersion does not move on undo/redo: the command layer restores the
    // colours without going near it.
    expect(SRC).toMatch(/useHistoryVersion\(\)/);
  });

  it('uses the HUB-WIDE history clock, not the aeon-scoped one', () => {
    // useAeonHistoryVersion deliberately drops sprite documents, and the
    // standalone palette commits to exactly those.
    expect(SRC, 'the port narrowed to the aeon-only history clock — the sprite palette will go stale')
      .not.toMatch(/useAeonHistoryVersion/);
  });
});
