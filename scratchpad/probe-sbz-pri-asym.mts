// Find SBZ mixed-priority blocks whose pattern is asymmetric under x-flip AND
// y-flip — the fixture the flip-trap test needs (a symmetric pattern like
// [0,0,1,1] cannot distinguish a correct mask from one that ignores xf).
import * as fs from 'node:fs';
import { enigmaDecompress } from '../src/core/formats/classic/enigma';
import { unpackBlockCell } from '../src/core/level-classic/model';

const raw = new Uint8Array(fs.readFileSync('/home/volence/sonic_hacks/s1disasm/map16/SBZ.eni'));
const dec = enigmaDecompress(raw);
const nBlocks = dec.length / 8;
for (let id = 0; id < nBlocks; id++) {
  const pri: number[] = [];
  const words: string[] = [];
  for (let i = 0; i < 4; i++) {
    const w = (dec[id * 8 + i * 2] << 8) | dec[id * 8 + i * 2 + 1];
    words.push('0x' + w.toString(16).padStart(4, '0'));
    pri.push(unpackBlockCell(w).pri ? 1 : 0);
  }
  const sum = pri[0] + pri[1] + pri[2] + pri[3];
  if (sum === 0 || sum === 4) continue; // not mixed
  const [tl, tr, bl, br] = pri;
  const xAsym = tl !== tr || bl !== br;
  const yAsym = tl !== bl || tr !== br;
  if (xAsym && yAsym) {
    console.log(`block $${id.toString(16)}: pri TL,TR,BL,BR = [${pri}] words = ${words.join(' ')}`);
  }
}
