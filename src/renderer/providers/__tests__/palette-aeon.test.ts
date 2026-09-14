// The aeon palette port's pure half, plus the one thing about it that is pure
// wiring and pure data-loss risk if it goes: the drag TEARDOWN.
//
// The hook cannot run here (no DOM, no renderer), and the commit/revert decision
// it routes through is executed in core/art/__tests__/palette-drag.test.ts. What
// is left for this file is the data the port hands the grid, and a
// comment-stripped scan proving the teardown is still wired — every identifier
// below is discussed at length in the port's docblocks, so a scan of raw source
// would pass on the prose.
//
// LINE 0, SINCE 2026-09-13. Until the owner's ruling (decisions.jsonl
// `PALETTE-LINE0-BLAST-RADIUS-answered`, `write_shared_file`) this file pinned
// the `refuse_line0` build: line 0 locked in every zone mount, refused with a
// sentence, refused as a copy target. Those rows are rewritten below to pin the
// replacement: nothing locked, line 0 marked as shared, and every write to it
// admitted only once the warning (providers/palette-line0-gate.ts, executed in
// palette-line0-gate.test.ts) has been accepted.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AEON_ZONE_PALETTE_POLICY,
  AEON_SPRITE_STANDALONE_PALETTE_POLICY,
  ZONE_SHARED_LINES,
  ZONE_SHARED_LINE_NOTE,
  isZoneSharedLine,
  zonePaletteWriteAdmitted,
  aeonPaletteLines,
  aeonPaletteVersionKey,
  keepIndex0Transparent,
  paletteLineChanged,
} from '../palette-aeon';
import { isLineLocked, swatchClick } from '../../components/art-shared/palette-grid-model';
import {
  encodeGenesisColor, PLAYER_PALETTE_LINE, ZONE_PALETTE_FIRST_LINE, ZONE_PALETTE_LINE_COUNT,
} from '../../../core/formats/palette';
import { PAL_BASE_FIRST_LINE, PAL_BASE_LAST_LINE } from '../../../core/aether/palette-push';
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

describe('the aeon policies (owner ruling 2026-09-13: line 0 edits behind a warning)', () => {
  /**
   * The lines a zone palette OWNS, derived here the way a reader would derive
   * them rather than typed as [1, 2, 3]: from the first line the authored file
   * lands on and how many it holds.
   */
  const ownedLines = Array.from(
    { length: ZONE_PALETTE_LINE_COUNT }, (_, i) => ZONE_PALETTE_FIRST_LINE + i);

  /**
   * WAS `locks line 0 in EVERY zone mount: it is the shared player palette`.
   * The `refuse_line0` build locked it; the ruling made it editable behind a
   * warning, so NO zone line is locked and a click on line 0 is allowed to
   * select and edit (the port's `admit` is what asks first).
   */
  it('locks no zone line: line 0 is guarded by a warning, not locked', () => {
    expect(AEON_ZONE_PALETTE_POLICY.lockedLines).toEqual([]);
    for (const line of [PLAYER_PALETTE_LINE, ...ownedLines]) {
      expect(isLineLocked(line, AEON_ZONE_PALETTE_POLICY), `line ${line}`).toBe(false);
      expect(swatchClick(line, 4, AEON_ZONE_PALETTE_POLICY), `line ${line}`)
        .toEqual({ select: true, edit: true });
    }
  });

  /** The shared set is DERIVED from the format (every CRAM line below the zone
   *  file's first), and it is exactly the player palette's line. */
  it('marks exactly the lines below the zone file as shared: the player palette line', () => {
    expect([...ZONE_SHARED_LINES]).toEqual([PLAYER_PALETTE_LINE]);
    expect(isZoneSharedLine(PLAYER_PALETTE_LINE)).toBe(true);
    for (const line of ownedLines) expect(isZoneSharedLine(line), `line ${line}`).toBe(false);
  });

  /**
   * The sprite pane's zone mode shares the zone policy, so the standalone row
   * is the only other "line 0" there is, and it is not a CRAM line at all.
   */
  it('leaves the STANDALONE row unlocked, because it is not a CRAM line at all', () => {
    expect(AEON_SPRITE_STANDALONE_PALETTE_POLICY.lockedLines).toEqual([]);
    expect(swatchClick(0, 4, AEON_SPRITE_STANDALONE_PALETTE_POLICY))
      .toEqual({ select: true, edit: true });
  });

  it('treats index 0 as the eraser in both mounts, on every line', () => {
    for (const policy of [AEON_ZONE_PALETTE_POLICY, AEON_SPRITE_STANDALONE_PALETTE_POLICY]) {
      expect(policy.transparent).toBe('paint');
    }
    // It binds the brush and opens nothing, line 0 included: a select-only
    // click changes no colour, so nothing about the shared file applies.
    for (const line of [PLAYER_PALETTE_LINE, ...ownedLines]) {
      expect(swatchClick(line, 0, AEON_ZONE_PALETTE_POLICY), `line ${line}`)
        .toEqual({ select: true, edit: false });
    }
  });

  /**
   * WAS `refuses line 0 with a sentence, and refuses nothing else` (and its
   * copy-target twin). The decision is now "may this write go ahead without
   * asking", and the only input that changes the answer for line 0 is whether
   * the warning was accepted.
   */
  it('admits the zone\'s own lines at once, and the shared line only once acknowledged', () => {
    for (const line of ownedLines) {
      expect(zonePaletteWriteAdmitted(line, false), `line ${line}`).toBe(true);
    }
    expect(zonePaletteWriteAdmitted(PLAYER_PALETTE_LINE, false), 'line 0 was admitted without the warning')
      .toBe(false);
    expect(zonePaletteWriteAdmitted(PLAYER_PALETTE_LINE, true)).toBe(true);
  });

  /** The phrase every surface reads for line 0 says WHOSE it is and HOW FAR it
   *  reaches. Asserted on content: a note that names no owner reads as noise. */
  it('says whose the shared line is, in the one phrase every surface reads', () => {
    expect(ZONE_SHARED_LINE_NOTE).toContain('Sonic and Tails');
    expect(ZONE_SHARED_LINE_NOTE).toContain('every zone');
  });

  /**
   * WAS `locks exactly the lines the live CRAM push refuses to send`. The same
   * two independent statements, still cross-checked: `core/aether/palette-push.ts`
   * fixed `Pal_Base` at lines 1 to 3 and THROWS on line 0, and the shared set
   * is derived from the zone file's first line. If they ever disagreed, a line
   * 0 edit could be pushed to a game that never reads it, or a zone line could
   * be treated as shared.
   */
  it('the shared lines are exactly the ones the live CRAM push never sends', () => {
    expect(ZONE_PALETTE_FIRST_LINE).toBe(PAL_BASE_FIRST_LINE);
    expect(ZONE_PALETTE_FIRST_LINE + ZONE_PALETTE_LINE_COUNT - 1).toBe(PAL_BASE_LAST_LINE);
    for (const line of ZONE_SHARED_LINES) {
      expect(line, `line ${line} is shared and inside the live push range`).toBeLessThan(PAL_BASE_FIRST_LINE);
    }
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
    expect(SRC, 'the port lost its drain: a mid-drag unmount strands the mutation')
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

  /**
   * THE SECOND LOCK, AND WHY IT NEEDS A ROW OF ITS OWN.
   *
   * WAS `refuses line 0 inside previewZone, before anything is written`, which
   * required the unconditional `zonePaletteLineRefusal`. Since the 2026-09-13
   * ruling the lock is conditional: `previewZone` refuses a shared-line write
   * the warning has not admitted for the open project. The grid's `admit` is
   * the first check and the palette-line0-gate rows execute it; this is the
   * second, because `preview` is a public port method that writes into the open
   * document OUTSIDE the command system.
   *
   * A SCAN, AND SAID SO. The hook needs a DOM and this suite has none. What it
   * can prove is that the admission is consulted BEFORE the write and returns;
   * the executable half is `zonePaletteWriteAdmitted` above.
   */
  it('refuses an unadmitted shared-line write inside previewZone, before anything is written', () => {
    const body = /const previewZone = React\.useCallback\(([\s\S]*?)\}, \[/.exec(SRC)?.[1];
    expect(body, 'previewZone is no longer a useCallback: this scan measures nothing')
      .toBeTruthy();
    expect(body!, 'previewZone no longer asks whether the write is admitted')
      .toMatch(/zonePaletteWriteAdmitted\(line, isSharedLineAcknowledged\(\)\)/);
    // …and it must SHORT-CIRCUIT, not merely mention it. Anchored as the old
    // row was, because its first version was vacuous: between the admission
    // check and the first thing that touches the zone there must be a `return`.
    const gateAt = body!.indexOf('zonePaletteWriteAdmitted(line');
    const zoneAt = body!.indexOf('getCurrentZone');
    const writeAt = body!.indexOf('z.palette.lines[line].colors[idx]');
    const beginAt = body!.indexOf('beginZoneDrag(line, idx)');
    expect(writeAt, 'previewZone stopped writing the palette: this scan is aimed at nothing')
      .toBeGreaterThan(-1);
    expect(zoneAt, 'previewZone stopped reading the zone: this scan is aimed at nothing')
      .toBeGreaterThan(gateAt);
    expect(
      body!.slice(gateAt, zoneAt),
      'the admission check does not return, so an unadmitted line falls through and is written',
    ).toMatch(/\breturn;/);
    expect(writeAt, 'the palette write is not behind the admission check').toBeGreaterThan(gateAt);
    expect(beginAt, 'the drag snapshot is taken before the admission check').toBeGreaterThan(gateAt);
  });

  /** The grid's first check: every zone line goes through the one door, and a
   *  standalone row (not a CRAM line) is admitted at once. */
  it('hands the grid an admit that asks the shared-line door for zone lines', () => {
    expect(SRC, 'the port no longer tells the grid to ask before a zone edit')
      .toMatch(/admit: \(line\) => \(standaloneMode \? true : admitZoneLine\(line\)\)/);
  });

  /**
   * THE LIVE PUSH NEVER SENDS LINE 0, even after an admitted edit: `Pal_Base`
   * does not hold it and `palBaseOffset` throws on it. The loop's lower bound
   * is the push module's own first line, which the row above proves is past
   * every shared line.
   */
  it('never pushes a shared line live: the push loop starts at the first Pal_Base line', () => {
    expect(SRC, 'the push loop no longer starts at the first pushable line')
      .toMatch(/for \(let line = PUSHABLE_FIRST_LINE; line <= PUSHABLE_LAST_LINE; line\+\+\)/);
    expect(SRC, 'PUSHABLE_FIRST_LINE is no longer the push module\'s own constant')
      .toMatch(/PAL_BASE_FIRST_LINE as PUSHABLE_FIRST_LINE/);
    expect(PAL_BASE_FIRST_LINE).toBeGreaterThan(PLAYER_PALETTE_LINE);
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
    expect(SRC, 'the port narrowed to the aeon-only history clock: the sprite palette will go stale')
      .not.toMatch(/useAeonHistoryVersion/);
  });
});
