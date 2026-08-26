// `set-bg-override-layout` — painting background cells in the plane the ROM is
// built from (docs/decisions.jsonl d-12).
//
// WHAT THESE ROWS ARE ABOUT. The gesture already existed and already recorded an
// undo step; what changed is WHERE it lands. Until d-12 a BG stroke on the
// overridden act edited a BG-library entry — a file no aeon tool reads — while
// the ROM was baked from `editor_bg_override.json`. The canvas now paints the
// override, so a stroke that still recorded against the library would be the
// worst shape available: an edit that appears on screen, survives a save, and
// never reaches the game.
//
// So every row below reads the DOCUMENT back, and one reads the SERIALIZED
// BYTES, because the file is what ships. None of them asks the command whether
// it worked.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { EditHistory } from '../history';
import type { S4Level, SetBgOverrideLayoutCommand } from '../commands';
import {
  parseBgOverride, serializeBgOverride, type BgOverrideDocument,
} from '../../formats/bg-override/bg-override';
import {
  bgOverrideDisplay,
} from '../../formats/bg-override/bg-override-view';

const GOLDEN_PATH = resolve(
  __dirname, '../../../../test/fixtures/bg-override/editor_bg_override.b0e5a661.json',
);
const GOLDEN: BgOverrideDocument = parseBgOverride(readFileSync(GOLDEN_PATH, 'utf8')).doc;

function freshDoc(): BgOverrideDocument {
  return parseBgOverride(readFileSync(GOLDEN_PATH, 'utf8')).doc;
}

function level(doc: BgOverrideDocument): S4Level {
  return { sections: [], bgOverride: doc } as unknown as S4Level;
}

/** Paint `words` at `indices`, recording the old values the way the stroke does. */
function paint(
  doc: BgOverrideDocument, cells: Array<[number, number]>,
): SetBgOverrideLayoutCommand {
  return {
    type: 'set-bg-override-layout',
    description: `Paint ${cells.length} background tile${cells.length === 1 ? '' : 's'}`,
    sectionIndex: -1,
    entries: cells.map(([index, newWord]) => ({ index, oldWord: doc.layout[index], newWord })),
  };
}

describe('set-bg-override-layout', () => {
  it('writes the DOCUMENT, so the bytes that ship change', () => {
    const doc = freshDoc();
    const before = serializeBgOverride(doc);
    const l = level(doc);
    const h = new EditHistory();

    // Anti-vacuous: pick a cell whose current word is NOT what we are about to
    // write, and a tile index that really exists in the blob, so a no-op cannot
    // pass as a paint.
    const index = 100;
    const target = (doc.layout[index] + 1) % doc.tiles.length;
    expect(doc.layout[index]).not.toBe(target);
    expect(target).toBeLessThan(doc.tiles.length);

    h.execute(paint(doc, [[index, target]]), l);

    expect(doc.layout[index]).toBe(target);
    expect(serializeBgOverride(doc)).not.toBe(before);
  });

  it('is ONE undo step for a whole stroke, and undo restores the file byte-for-byte', () => {
    const doc = freshDoc();
    const before = serializeBgOverride(doc);
    const l = level(doc);
    const h = new EditHistory();
    const cells: Array<[number, number]> = [[10, 1], [11, 2], [12, 3], [640, 4]];

    h.execute(paint(doc, cells), l);
    expect(serializeBgOverride(doc)).not.toBe(before);

    expect(h.canUndo).toBe(true);
    h.undo(l);
    expect(serializeBgOverride(doc)).toBe(before);
    expect(h.canUndo).toBe(false);

    h.redo(l);
    for (const [i, w] of cells) expect(doc.layout[i]).toBe(w);
  });

  /**
   * THE MIRROR ROW, and the one that would go green for the wrong reason if the
   * applier wrote `doc.layout` directly instead of going through the writer.
   *
   * `bgOverrideDisplay` hands the renderer a `Uint16Array` and KEEPS it; the
   * canvas repaints a cell by reading that array again. An applier that wrote
   * only the document would undo the file and leave the picture — which reads on
   * screen as "Ctrl+Z did nothing".
   *
   * The view is resolved ONCE, before the edit, and never re-resolved: a
   * re-resolve re-syncs from the document and would hide exactly the bug.
   */
  it('an APPLY and an UNDO both reach the canvas mirror, without a re-resolve', () => {
    const doc = freshDoc();
    const view = bgOverrideDisplay(doc);
    const l = level(doc);
    const h = new EditHistory();
    const index = 300;
    const was = doc.layout[index];
    const target = (was + 7) % doc.tiles.length;
    expect(view.layout[index]).toBe(was);

    h.execute(paint(doc, [[index, target]]), l);
    expect(doc.layout[index]).toBe(target);
    expect(view.layout[index]).toBe(target);

    h.undo(l);
    expect(doc.layout[index]).toBe(was);
    expect(view.layout[index]).toBe(was);
  });

  it('touches nothing but the cells it names — tiles, anims and the rest of the plane hold', () => {
    const doc = freshDoc();
    const l = level(doc);
    const h = new EditHistory();
    h.execute(paint(doc, [[5, 1]]), l);

    expect(doc.tiles).toEqual(GOLDEN.tiles);
    expect(doc.anims).toEqual(GOLDEN.anims);
    const changed = doc.layout
      .map((w, i) => (w === GOLDEN.layout[i] ? -1 : i))
      .filter((i) => i >= 0);
    expect(changed).toEqual([5]);
  });

  it('preserves the whole nametable WORD, attributes included, through undo', () => {
    // A word is an index plus palette / priority / flip bits the consumer keeps.
    // An undo that restored only the index would silently strip the attributes.
    const doc = freshDoc();
    const l = level(doc);
    const h = new EditHistory();
    const index = 42;
    doc.layout[index] = 0xE000 | 0x123;      // priority + palette 3 + index 0x123
    const was = doc.layout[index];
    h.execute(paint(doc, [[index, 0x2000 | 0x004]]), l);
    expect(doc.layout[index]).toBe(0x2004);
    h.undo(l);
    expect(doc.layout[index]).toBe(was);
  });

  it('THROWS on a level with no override document rather than consuming an undo slot', () => {
    // The rule set-palette-line and set-bg-override-band both state: a silent
    // no-op here would put a step on the stack that does nothing, and the next
    // Ctrl+Z would revert whatever came before it instead.
    const l = { sections: [] } as unknown as S4Level;
    const h = new EditHistory();
    expect(() => h.execute(paint(freshDoc(), [[1, 1]]), l))
      .toThrow(/set-bg-override-layout requires level\.bgOverride/);
  });
});
