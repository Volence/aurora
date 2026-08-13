import { describe, it, expect } from 'vitest';
import {
  applyPaletteLineToWord, applyPaletteLineToDocCell, createDoc,
} from '../composer-buffer';
import { packNametableWord, unpackNametableWord } from '../../model/s4-types';

describe('applyPaletteLineToWord', () => {
  it('sets the palette line (bits 13-14) while preserving index/flip/priority', () => {
    const word = packNametableWord(0x123, /*pal*/ 1, /*pri*/ true, /*vf*/ true, /*hf*/ false);
    const out = applyPaletteLineToWord(word, 2);
    const e = unpackNametableWord(out);
    expect(e.tileIndex).toBe(0x123);
    expect(e.hFlip).toBe(false);
    expect(e.vFlip).toBe(true);
    expect(e.priority).toBe(true);
    expect(e.palette).toBe(2);
  });

  it('masks the line to 2 bits and touches nothing else', () => {
    const word = packNametableWord(0x7FF, 0, false, false, true);
    // line 6 (0b110) -> low 2 bits = 0b10 = 2
    const out = applyPaletteLineToWord(word, 6);
    const e = unpackNametableWord(out);
    expect(e.palette).toBe(2);
    expect(e.tileIndex).toBe(0x7FF);
    expect(e.hFlip).toBe(true);
  });

  it('is a no-op on an empty cell (word 0 stays 0)', () => {
    expect(applyPaletteLineToWord(0, 2)).toBe(0);
    expect(applyPaletteLineToWord(0, 3)).toBe(0);
  });
});

describe('applyPaletteLineToDocCell', () => {
  it('re-lines an occupied atlas cell, leaving index/flips intact', () => {
    const doc = createDoc(2, 2);
    doc.cells[0] = { atlasTile: 42, localId: null, pal: 0, hf: true, vf: false, pri: false };
    expect(applyPaletteLineToDocCell(doc, 0, 0, 2)).toBe(true);
    expect(doc.cells[0].pal).toBe(2);
    expect(doc.cells[0].atlasTile).toBe(42);
    expect(doc.cells[0].hf).toBe(true);
    expect(doc.cells[0].vf).toBe(false);
  });

  it('re-lines an occupied local cell', () => {
    const doc = createDoc(2, 2);
    doc.cells[0] = { atlasTile: null, localId: 7, pal: 1, hf: false, vf: false, pri: false };
    expect(applyPaletteLineToDocCell(doc, 0, 0, 3)).toBe(true);
    expect(doc.cells[0].pal).toBe(3);
    expect(doc.cells[0].localId).toBe(7);
  });

  it('is a no-op on an EMPTY cell (returns false, leaves it empty)', () => {
    const doc = createDoc(2, 2);
    expect(applyPaletteLineToDocCell(doc, 1, 1, 2)).toBe(false);
    expect(doc.cells[3].atlasTile).toBeNull();
    expect(doc.cells[3].localId).toBeNull();
    expect(doc.cells[3].pal).toBe(0);
  });

  it('returns false when the line already matches (no spurious dirty)', () => {
    const doc = createDoc(1, 1);
    doc.cells[0] = { atlasTile: 5, localId: null, pal: 2, hf: false, vf: false, pri: false };
    expect(applyPaletteLineToDocCell(doc, 0, 0, 2)).toBe(false);
  });

  it('returns false for out-of-bounds coords', () => {
    const doc = createDoc(2, 2);
    expect(applyPaletteLineToDocCell(doc, 5, 0, 2)).toBe(false);
    expect(applyPaletteLineToDocCell(doc, 0, -1, 2)).toBe(false);
  });
});
