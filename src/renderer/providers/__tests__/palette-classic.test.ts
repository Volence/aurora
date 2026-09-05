// The classic palette port's pure half: the grid data, the repaint key, and the
// write. The hook itself is unreachable here (no DOM, no renderer), so the two
// claims that only exist as wiring — the art-facet claim and the clock it keys
// on — are pinned by a comment-stripped source scan at the bottom. The facet
// claim proper is enumerated in components/classic/__tests__/classic-surface.ts.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLASSIC_PALETTE_POLICY,
  classicPaletteLines,
  classicPaletteVersionKey,
  commitClassicSwatch,
} from '../palette-classic';
import { LINE_LENGTH, swatchClick } from '../../components/art-shared/palette-grid-model';
import type { CommandResult } from '../../state/classicLevelStore';

const OK: CommandResult = { ok: true };
const line = (fill: number): Uint16Array => new Uint16Array(LINE_LENGTH).fill(fill);

/** A stand-in for classicSetPalette that records what it was handed. */
function recorder(result: CommandResult = OK) {
  const calls: { line: number; colors: Uint16Array }[] = [];
  const set = (l: number, colors: Uint16Array): CommandResult => {
    calls.push({ line: l, colors });
    return result;
  };
  return { calls, set };
}

describe('CLASSIC_PALETTE_POLICY', () => {
  it('locks no line: classic has no sprite-reserved palette to protect', () => {
    // The single substantive difference from aeon's Art mount, stated as data.
    expect(CLASSIC_PALETTE_POLICY.lockedLines).toEqual([]);
    expect(swatchClick(0, 7, CLASSIC_PALETTE_POLICY)).toEqual({ select: true, edit: true });
  });

  it('explains index 0 rather than binding it as an eraser', () => {
    // There is no brush on this surface, so a click there can only be an
    // invitation to read the note.
    expect(CLASSIC_PALETTE_POLICY.transparent).toBe('explain');
    expect(swatchClick(2, 0, CLASSIC_PALETTE_POLICY)).toEqual({ select: false, edit: true });
  });
});

describe('classicPaletteLines', () => {
  it('converts the act\'s CRAM lines to word arrays, in order', () => {
    const palettes = [line(1), line(2), line(3), line(4)];
    const lines = classicPaletteLines(palettes);
    expect(lines).toHaveLength(4);
    expect(lines.map((l) => l[0])).toEqual([1, 2, 3, 4]);
    expect(lines.every((l) => l.length === LINE_LENGTH)).toBe(true);
    expect(Array.isArray(lines[0])).toBe(true); // a plain array, not the Uint16Array
  });

  it('has nothing to draw with no level open', () => {
    expect(classicPaletteLines(undefined)).toEqual([]);
  });

  it('pads a short line to 16 rather than leaving a ragged row', () => {
    // A hole in a fixed 4x16 grid reads as corruption; black does not.
    const short = new Uint16Array([0x0eee, 0x0246]);
    expect(classicPaletteLines([short])[0]).toEqual([0x0eee, 0x0246, ...Array(14).fill(0)]);
  });
});

describe('classicPaletteVersionKey', () => {
  it('moves when the palette clock moves', () => {
    expect(classicPaletteVersionKey('GHZ', 1, 7)).not.toBe(classicPaletteVersionKey('GHZ', 1, 8));
  });

  it('moves when the act changes under an unmoved clock', () => {
    // openAct allocates a fresh epoch, so this is belt-and-braces — but a stale
    // grid showing the previous act's colours is the failure it insures against.
    expect(classicPaletteVersionKey('GHZ', 1, 7)).not.toBe(classicPaletteVersionKey('GHZ', 2, 7));
    expect(classicPaletteVersionKey('GHZ', 1, 7)).not.toBe(classicPaletteVersionKey('MZ', 1, 7));
  });

  it('is stable when nothing did', () => {
    expect(classicPaletteVersionKey('GHZ', 1, 7)).toBe(classicPaletteVersionKey('GHZ', 1, 7));
  });
});

describe('commitClassicSwatch', () => {
  it('writes ONE whole line with a single word changed', () => {
    // The command is a whole-line replace; that shape is what makes a colour edit
    // exactly one undo step.
    const { calls, set } = recorder();
    const palettes = [line(0x0111), line(0x0222)];
    expect(commitClassicSwatch(set, palettes, 1, 5, 0x0eee)).toEqual(OK);
    expect(calls).toHaveLength(1);
    expect(calls[0].line).toBe(1);
    expect(calls[0].colors).toHaveLength(LINE_LENGTH);
    expect(calls[0].colors[5]).toBe(0x0eee);
    for (let i = 0; i < LINE_LENGTH; i++) {
      if (i !== 5) expect(calls[0].colors[i], `idx ${i}`).toBe(0x0222);
    }
  });

  it('hands over a COPY: the store must not alias the open document', () => {
    const { calls, set } = recorder();
    const palettes = [line(0x0111)];
    commitClassicSwatch(set, palettes, 0, 3, 0x0eee);
    expect(calls[0].colors).not.toBe(palettes[0]);
    expect(palettes[0][3]).toBe(0x0111); // the source line is untouched
  });

  it('masks the word to 16 bits', () => {
    const { calls, set } = recorder();
    commitClassicSwatch(set, [line(0)], 0, 1, 0x1234eee);
    expect(calls[0].colors[1]).toBe(0x4eee);
  });

  it('refuses a line the document does not have, without writing', () => {
    // Rejecting rather than substituting a blank line: a caller and a document
    // that disagree about the grid's shape would otherwise blank a real line.
    const { calls, set } = recorder();
    const res = commitClassicSwatch(set, [line(0)], 3, 5, 0x0eee);
    expect(res).toEqual({ ok: false, error: 'no palette line 3' });
    expect(calls).toEqual([]);
    expect(commitClassicSwatch(set, undefined, 0, 5, 0x0eee).ok).toBe(false);
  });

  it('refuses index 0 and anything off the end of the line', () => {
    const { calls, set } = recorder();
    for (const idx of [-1, 0, LINE_LENGTH, 99, 1.5]) {
      expect(commitClassicSwatch(set, [line(0)], 0, idx, 0x0eee).ok, `idx ${idx}`).toBe(false);
    }
    expect(calls).toEqual([]);
  });

  it('passes the command\'s own failure through, unwrapped', () => {
    const fail: CommandResult = { ok: false, error: 'no classic level is open' };
    const { set } = recorder(fail);
    expect(commitClassicSwatch(set, [line(0)], 0, 1, 0x0eee)).toEqual(fail);
  });
});

describe('the classic port keys on the FINE palette clock', () => {
  const SRC = readFileSync(join(__dirname, '..', 'palette-classic.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('subscribes paletteEpoch', () => {
    expect(SRC).toMatch(/s\.paletteEpoch/);
  });

  it('subscribes neither of the coarse clocks', () => {
    // chunkEpoch bumps for tile and block edits too. Keying a palette grid on it
    // is the regression the finer clocks were added to end — every object sprite
    // and all ~965 tile thumbnails rebuilt on a single pencil stroke.
    expect(SRC, 'the palette port reads chunkEpoch').not.toMatch(/\bchunkEpoch\b/);
    expect(SRC, 'the palette port reads tileEpoch').not.toMatch(/\btileEpoch\b/);
  });

  it('does not subscribe `doc` itself', () => {
    // What ClassicPalettePanel did. `doc` identity churns on every command in the
    // act — a layout stamp would re-render the palette grid — and undo/redo swap
    // it too. The port subscribes the palettes array and the epoch instead.
    expect(SRC, 'the port subscribes doc identity again').not.toMatch(/\(s\) => s\.doc\b(?!\?\.palettes)/);
    expect(SRC).toMatch(/\(s\) => s\.doc\?\.palettes/);
  });

  it('previews and drains NOTHING: classic writes no document mid-drag', () => {
    // Aeon needs a teardown because its preview mutates the open document. Giving
    // classic one would mean giving it that hazard; its preview is the grid's own
    // draft word, discarded harmlessly if the panel goes away.
    expect(SRC).toMatch(/preview:\s*PREVIEW_NOTHING/);
    expect(SRC).toMatch(/drain:\s*DRAIN_NOTHING/);
  });
});
