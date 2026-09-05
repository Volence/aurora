// The shared swatch grid's model is the ONE part of the palette-sharing work
// that a node-only suite can actually run: the components are .tsx, which this
// suite does not collect, and there is no DOM to render them into. So the two
// engine differences that the whole port design exists for — aeon's locked line
// 0, and what a click on the transparent index 0 means — are pinned here as
// executed behaviour rather than as a source scan.
//
// The last describe is the exception: a purity guard over the model file itself,
// which nothing can execute its way to. It reads COMMENT-STRIPPED source, because
// this file's docblocks name every identifier a naive grep would look for.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LINE_LENGTH,
  NO_SELECTION,
  TRANSPARENT_INDEX,
  channelLevel,
  isLineLocked,
  isTransparent,
  lineWords,
  swatchCss,
  swatchClick,
  swatchState,
  withChannel,
  type PalettePolicy,
} from '../palette-grid-model';
import { decodeGenesisColor, encodeGenesisColor } from '../../../../core/formats/palette';

/** Aeon's Art mount: line 0 is the sprite-reserved player palette. */
const LOCKED: PalettePolicy = { lockedLines: [0], transparent: 'paint' };
/** Aeon's sprite mounts: nothing locked, index 0 is the eraser. */
const UNLOCKED: PalettePolicy = { lockedLines: [], transparent: 'paint' };
/** Classic: nothing locked, index 0 explains itself instead. */
const EXPLAIN: PalettePolicy = { lockedLines: [], transparent: 'explain' };

describe('the grid constants are the hardware, not a preference', () => {
  it('is 16 colours per line with index 0 the backdrop', () => {
    expect(LINE_LENGTH).toBe(16);
    expect(TRANSPARENT_INDEX).toBe(0);
    expect(isTransparent(0)).toBe(true);
    expect(isTransparent(1)).toBe(false);
  });
});

describe('the line-0 difference is DATA', () => {
  it('locks aeon Art line 0 and nothing else', () => {
    expect(isLineLocked(0, LOCKED)).toBe(true);
    for (const line of [1, 2, 3]) expect(isLineLocked(line, LOCKED)).toBe(false);
  });

  it('leaves classic line 0 fully editable', () => {
    // The engines' line 0 are different things: aeon's is the PLAYER palette,
    // shared across the zone; classic's is an ordinary act line. Same position,
    // opposite rule, and the model reaches both by reading the list.
    for (const line of [0, 1, 2, 3]) expect(isLineLocked(line, EXPLAIN)).toBe(false);
    // The same swatch, both policies: classic opens it, aeon's Art mount refuses.
    expect(swatchClick(0, 5, EXPLAIN)).toEqual({ select: true, edit: true });
    expect(swatchClick(0, 5, LOCKED)).toEqual({ select: false, edit: false });
  });

  it('unlocks the same line for the sprite mounts, with no second policy shape', () => {
    // Mode 2 (sprite + zone palette) edits line 0 on purpose. It is the SAME
    // policy type with an empty list — not a flag, and not an engine name.
    expect(swatchClick(0, 5, UNLOCKED)).toEqual({ select: true, edit: true });
  });

  it('never paints a locked swatch as the brush colour', () => {
    // artStore's paint line outlives this grid, so it CAN point at a line the Art
    // mount locks; outlining a swatch the user cannot use would be a lie.
    const sel = { edit: null, paint: { line: 0, idx: 3 } };
    expect(swatchState(0, 3, LOCKED, sel).paintSelected).toBe(false);
    expect(swatchState(0, 3, UNLOCKED, sel).paintSelected).toBe(true);
  });
});

describe('the index-0 difference is DATA', () => {
  it("makes aeon's index 0 the eraser: it binds the brush and opens nothing", () => {
    expect(swatchClick(2, 0, UNLOCKED)).toEqual({ select: true, edit: false });
  });

  it("makes classic's index 0 explain itself: it selects but binds no brush", () => {
    expect(swatchClick(2, 0, EXPLAIN)).toEqual({ select: false, edit: true });
  });

  it('opens the sliders for every editable index under both behaviours', () => {
    for (const policy of [UNLOCKED, EXPLAIN]) {
      for (let idx = 1; idx < LINE_LENGTH; idx++) {
        expect(swatchClick(2, idx, policy), `idx ${idx}`).toEqual({ select: true, edit: true });
      }
    }
  });

  it('refuses a locked line before it ever asks what index 0 does', () => {
    expect(swatchClick(0, 0, LOCKED)).toEqual({ select: false, edit: false });
  });
});

describe('swatchState', () => {
  it('reports nothing selected without a selection', () => {
    expect(swatchState(1, 4, UNLOCKED)).toEqual({
      locked: false, transparent: false, paintSelected: false, editSelected: false,
    });
    expect(swatchState(1, 4, UNLOCKED, NO_SELECTION)).toEqual(swatchState(1, 4, UNLOCKED));
  });

  it('matches a selection on BOTH coordinates', () => {
    const sel = { edit: { line: 2, idx: 5 }, paint: { line: 1, idx: 5 } };
    expect(swatchState(2, 5, UNLOCKED, sel).editSelected).toBe(true);
    // Same index, wrong line — the bug a `sel.idx === ci` test alone would miss.
    expect(swatchState(1, 5, UNLOCKED, sel).editSelected).toBe(false);
    expect(swatchState(2, 4, UNLOCKED, sel).editSelected).toBe(false);
    expect(swatchState(1, 5, UNLOCKED, sel).paintSelected).toBe(true);
    expect(swatchState(2, 5, UNLOCKED, sel).paintSelected).toBe(false);
  });

  it('carries the two selections independently: they are different things', () => {
    // The edit selection is the grid's own; the paint selection is the engine's.
    // One swatch can be both, and classic has no paint selection at all.
    const both = { edit: { line: 1, idx: 2 }, paint: { line: 1, idx: 2 } };
    const s = swatchState(1, 2, UNLOCKED, both);
    expect(s.editSelected && s.paintSelected).toBe(true);
    expect(swatchState(1, 2, EXPLAIN, { edit: both.edit, paint: null }).paintSelected).toBe(false);
  });

  it('flags index 0 transparent on every line, whatever the policy says to do', () => {
    for (const policy of [LOCKED, UNLOCKED, EXPLAIN]) {
      for (const line of [0, 1, 2, 3]) {
        expect(swatchState(line, 0, policy).transparent, `${line}`).toBe(true);
        expect(swatchState(line, 1, policy).transparent, `${line}`).toBe(false);
      }
    }
  });
});

describe('CRAM word arithmetic', () => {
  it('quantises 8-bit channels to the 3-bit levels the hardware has', () => {
    expect(channelLevel(0)).toBe(0);
    expect(channelLevel(255)).toBe(7);
    expect(channelLevel(128)).toBe(4);
    // Clamped, not wrapped — an out-of-range channel must not roll into another.
    expect(channelLevel(-40)).toBe(0);
    expect(channelLevel(400)).toBe(7);
  });

  it('replaces one channel and leaves the other two bit-identical', () => {
    const word = encodeGenesisColor({ r: 255, g: 0, b: 146 });
    const next = withChannel(word, 'g', 5);
    const before = decodeGenesisColor(word);
    const after = decodeGenesisColor(next);
    expect(channelLevel(after.g)).toBe(5);
    expect(after.r).toBe(before.r);
    expect(after.b).toBe(before.b);
  });

  it('round-trips every level of every channel', () => {
    // The whole slider range, exhaustively: 0BGR packs the channels three bits
    // apart, so an off-by-one shift shows up as a neighbour channel moving.
    for (const ch of ['r', 'g', 'b'] as const) {
      for (let level = 0; level <= 7; level++) {
        const w = withChannel(0, ch, level);
        expect(channelLevel(decodeGenesisColor(w)[ch]), `${ch}=${level}`).toBe(level);
        for (const other of ['r', 'g', 'b'] as const) {
          if (other === ch) continue;
          expect(decodeGenesisColor(w)[other], `${ch}=${level} moved ${other}`).toBe(0);
        }
      }
    }
  });

  it('cannot corrupt a word with a level outside 0-7', () => {
    // The clamp lives in encodeGenesisColor, not in withChannel — asserted at
    // this seam because this is where an out-of-range level can arrive, but the
    // sensitivity is to core/formats/palette. withChannel carried its own second
    // clamp until a planted violation showed removing it changed nothing.
    expect(withChannel(0, 'r', 99)).toBe(withChannel(0, 'r', 7));
    expect(withChannel(0x0eee, 'b', -3)).toBe(withChannel(0x0eee, 'b', 0));
    // …and only the 0BGR bits are ever set, whatever it was handed.
    expect(withChannel(0, 'g', 4096) & ~0x0eee).toBe(0);
  });

  it('leaves a word untouched when the channel already holds that level', () => {
    for (const word of [0x0000, 0x0eee, 0x0246, 0x08a2]) {
      const c = decodeGenesisColor(word);
      expect(withChannel(word, 'g', channelLevel(c.g)), `$${word.toString(16)}`).toBe(word);
    }
  });

  it('renders a word as CSS through the one decoder', () => {
    const c = decodeGenesisColor(0x0246);
    expect(swatchCss(0x0246)).toBe(`rgb(${c.r},${c.g},${c.b})`);
    expect(swatchCss(0x0000)).toBe('rgb(0,0,0)');
    expect(swatchCss(0x0eee)).toBe('rgb(255,255,255)');
  });
});

describe('lineWords', () => {
  it('encodes a line of RGBA colours to CRAM words, in order', () => {
    const colors = [
      { r: 0, g: 0, b: 0, a: 0 },
      { r: 255, g: 255, b: 255, a: 255 },
      { r: 255, g: 0, b: 0, a: 255 },
      { r: 0, g: 0, b: 255, a: 255 },
    ];
    expect(lineWords(colors)).toEqual(colors.map((c) => encodeGenesisColor(c)));
    // 0BGR: red is the LOW bits and blue the high ones. A swapped pair here is
    // the classic way a palette comes out inverted.
    expect(lineWords(colors)[2]).toBe(0x000e);
    expect(lineWords(colors)[3]).toBe(0x0e00);
  });

  it('drops alpha, which the grid never renders anyway', () => {
    const clear = { r: 8, g: 8, b: 8, a: 0 };
    const opaque = { r: 8, g: 8, b: 8, a: 255 };
    expect(lineWords([clear])).toEqual(lineWords([opaque]));
  });

  it('is empty for an empty line', () => {
    expect(lineWords([])).toEqual([]);
  });
});

describe('the model stays store-free', () => {
  // art-shared/ carries no enforced no-store rule the way components/shared/ does
  // (shared-purity.test.ts), but a store import here would be a one-way door: it
  // would make the model un-promotable and un-runnable in this node-only suite,
  // and it would bind a supposedly engine-neutral file to ONE engine's clock.
  const SRC = readFileSync(join(__dirname, '..', 'palette-grid-model.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('imports nothing from state/ and no engine store', () => {
    // Specifier-shaped, and tolerant of both quote styles plus dynamic import —
    // the repo runs no formatter, so quoting is a habit and not a guarantee.
    expect(SRC).not.toMatch(/(?:from|import)\s*\(?\s*["'`](?:[^"'`]*\/)?state\//);
    expect(SRC).not.toMatch(/\buse[A-Z][A-Za-z]*Store\b/);
  });

  it('names neither engine', () => {
    // The rule the port pattern rests on: a model that says `engine === 'aeon'`
    // has failed, whatever else it gets right.
    expect(SRC).not.toMatch(/\baeon\b|\bclassic\b/i);
  });

  it('reuses core/formats/palette rather than re-deriving 0BGR', () => {
    expect(SRC).toMatch(/from ['"]\.\.\/\.\.\/\.\.\/core\/formats\/palette['"]/);
    // No second bit layout: the shifts that pack a CRAM word appear once, in core.
    expect(SRC).not.toMatch(/>>\s*9|<<\s*9/);
  });

  it('pulls in React for types only, so it can run outside a renderer', () => {
    expect(SRC).not.toMatch(/^import React/m);
    expect(SRC).toMatch(/import type React from ['"]react['"]/);
  });
});
