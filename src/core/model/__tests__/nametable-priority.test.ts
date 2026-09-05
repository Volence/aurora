// The aeon priority predicate, checked against the ENCODER rather than against
// a typed constant — `packNametableWord` is the only definition of the word
// layout this project has, so deriving the expectations from it is what stops
// this file agreeing with a stale copy of the bit position.

import { describe, it, expect } from 'vitest';
import { packNametableWord, unpackNametableWord } from '../s4-types';
import {
  tileWordDrawsAboveSprites, countHighPriorityTiles, NAMETABLE_PRIORITY_BIT,
} from '../nametable-priority';

describe('tileWordDrawsAboveSprites', () => {
  it('agrees with the encoder for every combination of the OTHER fields', () => {
    for (const tileIndex of [0, 1, 0x2ff, 0x7ff]) {
      for (const palette of [0, 1, 2, 3]) {
        for (const hFlip of [false, true]) {
          for (const vFlip of [false, true]) {
            for (const priority of [false, true]) {
              const w = packNametableWord(tileIndex, palette, priority, vFlip, hFlip);
              expect(tileWordDrawsAboveSprites(w)).toBe(priority);
              // And against the decoder, the other half of the same pair.
              expect(tileWordDrawsAboveSprites(w)).toBe(unpackNametableWord(w).priority);
            }
          }
        }
      }
    }
  });

  it('reads the bit the encoder writes: derived, not typed', () => {
    // packNametableWord(0,0,true,false,false) IS the priority bit alone.
    expect(NAMETABLE_PRIORITY_BIT).toBe(packNametableWord(0, 0, true, false, false));
  });

  it('EXCLUDES the empty word for free: the renderer\'s own "this cell draws" gate', () => {
    // composeNametable skips `word === 0` as transparent, and a transparent
    // cell cannot occlude anything. A high-priority word is necessarily
    // non-zero, so the two gates coincide and no extra check is needed. If a
    // future layout moved priority off bit 15 this is the row that notices.
    expect(tileWordDrawsAboveSprites(0)).toBe(false);
    for (const w of [0x0000, 0x0001, 0x2000, 0x4fff, 0x7fff]) {
      expect(tileWordDrawsAboveSprites(w)).toBe(false);
    }
    for (const w of [0x8000, 0x8001, 0xc000, 0xffff]) {
      expect(tileWordDrawsAboveSprites(w)).toBe(true);
      expect(w).not.toBe(0);
    }
  });

  it('does NOT special-case tile index 0: the renderer draws it like any other', () => {
    // 0xC000 = tile 0, palette 2, priority. Real OJZ sections contain these
    // (7-20 per section, measured 2026-08-28), and hiding them would be the
    // lens inventing a rule composeNametable does not follow.
    expect(tileWordDrawsAboveSprites(0xc000)).toBe(true);
  });
});

describe('countHighPriorityTiles', () => {
  it('counts them, and reports 0 for an empty nametable (anti-vacuous instrument)', () => {
    expect(countHighPriorityTiles(new Uint16Array(16))).toBe(0);
    const nt = new Uint16Array([0, 0x8000, 0x0123, 0xc04f, 0x7fff]);
    expect(countHighPriorityTiles(nt)).toBe(2);
  });
});
