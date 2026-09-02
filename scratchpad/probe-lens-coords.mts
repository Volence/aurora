// Measurement probe (not shipped): find world-pixel coordinates the priority
// lens harness can assert on, from the REAL s1disasm data with Aurora's own
// decoders — never guessed.
//
//  - SBZ act 1: a placement of hand-verified mixed block $5A (pri [1,0,0,0])
//    or $11 (pri [0,0,1,1]) in the FG layout, with the chunk-cell flips at that
//    placement, plus the world px of one HIGH tile and one LOW tile inside it.
//  - SLZ act 1: a placement of an ALL-HIGH block (SLZ has 58, 0 mixed).
import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import * as fs from 'node:fs';
import { enigmaDecompress } from '../src/core/formats/classic/enigma';
import { kosinskiDecompress } from '../src/core/formats/kosinski';
import { decodeS1Layout } from '../src/core/formats/classic/s1-layout';
import { unpackBlockCell, unpackChunkCell, type BlockDef } from '../src/core/level-classic/model';

const S1 = siblingPathOrUnresolved('s1disasm');
const read = (p: string) => new Uint8Array(fs.readFileSync(`${S1}/${p}`));

function loadBlocks(eni: string): BlockDef[] {
  const dec = enigmaDecompress(read(eni));
  const blocks: BlockDef[] = [];
  for (let b = 0; b < dec.length / 8; b++) {
    const cells = [];
    for (let i = 0; i < 4; i++) cells.push(unpackBlockCell((dec[b * 8 + i * 2] << 8) | dec[b * 8 + i * 2 + 1]));
    blocks.push({ cells });
  }
  return blocks;
}
function loadChunks(kos: string) {
  const dec = kosinskiDecompress(read(kos));
  const chunks = [];
  for (let c = 0; c < dec.length / 512; c++) {
    const cells = [];
    for (let i = 0; i < 256; i++) cells.push(unpackChunkCell((dec[c * 512 + i * 2] << 8) | dec[c * 512 + i * 2 + 1]));
    chunks.push({ cells });
  }
  return chunks;
}

function findPlacements(zone: string, layoutFile: string, chunksFile: string, blocksFile: string, wantBlockIds: number[]) {
  const blocks = loadBlocks(blocksFile);
  const chunks = loadChunks(chunksFile);
  const layout = decodeS1Layout(read(layoutFile));
  console.log(`${zone}: layout ${layout.width}x${layout.height} chunks=${chunks.length} blocks=${blocks.length}`);
  const found: string[] = [];
  for (let row = 0; row < layout.height && found.length < 6; row++) {
    for (let col = 0; col < layout.width && found.length < 6; col++) {
      const cellByte = layout.cells[row * layout.width + col];
      if (cellByte === undefined) continue;
      const chunkId = cellByte & 0x7f;
      if (chunkId === 0) continue;
      const chunk = chunks[chunkId - 1];
      if (!chunk) continue;
      for (let i = 0; i < 256; i++) {
        const cc = chunk.cells[i];
        if (!wantBlockIds.includes(cc.block)) continue;
        const cellX = col * 256 + (i % 16) * 16;
        const cellY = row * 256 + ((i / 16) | 0) * 16;
        const pri = blocks[cc.block].cells.map((c) => (c.pri ? 1 : 0));
        found.push(
          `  block $${cc.block.toString(16)} at layout(${col},${row}) chunk $${chunkId.toString(16)} cellIdx ${i} ` +
          `xf=${cc.xf} yf=${cc.yf} pri[TL,TR,BL,BR]=[${pri}] cell world px=(${cellX},${cellY})`,
        );
        if (found.length >= 6) break;
      }
    }
  }
  console.log(found.join('\n') || '  NOT PLACED in this act');
}

findPlacements('SBZ1', 'levels/sbz1.bin', 'map256/SBZ (REV01).kos', 'map16/SBZ.eni', [0x5a, 0x11]);

// SLZ: find all-high block ids first, then their placements.
const slzBlocks = loadBlocks('map16/SLZ.eni');
const allHigh = slzBlocks.map((b, id) => ({ id, hi: b.cells.every((c) => c.pri) && b.cells.length === 4 })).filter((x) => x.hi).map((x) => x.id);
console.log(`SLZ all-high block ids (${allHigh.length}):`, allHigh.slice(0, 12).map((i) => '$' + i.toString(16)).join(' '), '...');
findPlacements('SLZ1', 'levels/slz1.bin', 'map256/SLZ.kos', 'map16/SLZ.eni', allHigh.slice(0, 20));
