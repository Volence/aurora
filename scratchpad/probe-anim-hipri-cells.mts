// Does any zone have a HI-PRI block cell referencing an ANIMATED tile on the
// FG plane? (If yes, the occlusion overlay would show frame-0 art there while
// playback runs — a documented limitation to size honestly.)
import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { s1Adapter } from '../src/core/project/s1/index';
import { animatedTilesForZone } from '../src/core/level-classic/s1-anim-art';
import { layoutCellAt } from '../src/renderer/components/classic/viewport-math';
import { chunkIndexForId } from '../src/core/level-classic/model';

const S1DIR = siblingPathOrUnresolved('s1disasm');
const rfs = {
  async exists(r: string) { return fs.existsSync(path.join(S1DIR, r)); },
  async read(r: string) { return new Uint8Array(fs.readFileSync(path.join(S1DIR, r))); },
  async list(r: string) { return fs.readdirSync(path.join(S1DIR, r)); },
};

async function main() {
  const handle = await s1Adapter.open(rfs as never);
  for (const ref of handle.levels!.list().filter((r) => r.available)) {
    const doc = await handle.levels!.read(ref);
    const anim = animatedTilesForZone(ref.zone);
    if (anim.size === 0) continue;
    // Which chunks are placed on FG?
    const placed = new Set<number>();
    for (let row = 0; row < doc.fg.height; row++) {
      for (let col = 0; col < doc.fg.width; col++) {
        const cell = layoutCellAt(doc.fg, col, row);
        if (cell !== undefined) placed.add(cell & 0x7f);
      }
    }
    let hits = 0;
    for (const chunkId of placed) {
      const idx = chunkIndexForId(doc, chunkId);
      if (idx === null) continue;
      const chunk = doc.chunks[idx];
      if (!chunk) continue;
      for (const cc of chunk.cells) {
        if (!cc) continue;
        const block = doc.blocks[cc.block];
        if (!block) continue;
        for (const bc of block.cells) {
          if (bc && bc.pri && anim.has(bc.tile)) hits++;
        }
      }
    }
    console.log(`${ref.zone}${ref.act}: hi-pri animated FG cells = ${hits}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
