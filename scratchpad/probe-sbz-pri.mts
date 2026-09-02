// Measurement probe (not shipped): print the raw block words + unpacked cells
// for the audit's SBZ mixed-priority spot-check ids, so the unit-test fixture
// is measured off the real data rather than invented.
import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import * as fs from 'node:fs';
import { enigmaDecompress } from '../src/core/formats/classic/enigma';
import { unpackBlockCell } from '../src/core/level-classic/model';

const raw = new Uint8Array(fs.readFileSync(siblingPathOrUnresolved('s1disasm', 'map16/SBZ.eni')));
const dec = enigmaDecompress(raw);
console.log('decoded bytes:', dec.length, 'blocks:', dec.length / 8);
for (const id of [0x11, 0x12, 0x2b, 0x35]) {
  const words: string[] = [];
  const quads: unknown[] = [];
  for (let i = 0; i < 4; i++) {
    const w = (dec[id * 8 + i * 2] << 8) | dec[id * 8 + i * 2 + 1];
    words.push('0x' + w.toString(16).padStart(4, '0'));
    const c = unpackBlockCell(w);
    quads.push({ tile: '0x' + c.tile.toString(16), xf: c.xf, yf: c.yf, pal: c.pal, pri: c.pri });
  }
  console.log(`block $${id.toString(16)}:`, words.join(' '));
  console.log('  cells (TL,TR,BL,BR):', JSON.stringify(quads));
}
