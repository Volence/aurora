#!/usr/bin/env node
// HOW OFTEN IS A BLOCK NAMED BY EXACTLY ONE CHUNK-DEFINITION CELL?
//
// Decides whether the "isolate falls back to link when a block is fully
// contained in the selection" follow-up is worth building. The two are
// outcome-identical exactly when the selection covers EVERY chunk-definition
// cell naming that block — so the fallback's reach is bounded by how many
// blocks have small fan-out. If almost every block is named by dozens of cells,
// a human selection will essentially never contain one and the change buys
// nothing in the zones that need it.
//
// GHZ and SBZ are the zones that need it: both ship more blocks than their
// colind table has entries, so Isolate is refused there for every cell.
//
// Reads only. Never calls save_project.
import { session, openProjectAndAct } from './canvas-cdp-harness.mjs';

await session('block fan-out probe', async (c) => {
  await openProjectAndAct(c);
  const stats = await c.json(`(() => {
    const C = window.__dbg.classic;
    const pool = C.poolSizes();
    // ENGINE ids are 1-based; chunkCell takes an engine id. One page-side loop —
    // 82 x 256 as separate CDP calls would be ~21k round trips.
    const fan = new Map();
    for (let id = 1; id <= pool.chunks; id++) {
      for (let cell = 0; cell < 256; cell++) {
        const cc = C.chunkCell(id, cell);
        if (!cc || cc.block === 0) continue;
        fan.set(cc.block, (fan.get(cc.block) ?? 0) + 1);
      }
    }
    const counts = [...fan.values()];
    const hist = {};
    for (const n of counts) {
      const b = n === 1 ? 'a:1 cell' : n === 2 ? 'b:2' : n <= 4 ? 'c:3-4' : n <= 8 ? 'd:5-8' : 'e:9+';
      hist[b] = (hist[b] ?? 0) + 1;
    }
    let colindLen = 0;
    for (let i = 0; i < pool.blocks + 64; i++) if (C.colindOf(i) !== null) colindLen = i + 1;
    return {
      pool,
      colindReadableUpTo: colindLen,
      blocksActuallyUsed: fan.size,
      fanoutHistogram: hist,
      namedByOneCell: counts.filter((n) => n === 1).length,
      namedByFourOrFewer: counts.filter((n) => n <= 4).length,
      totalNamingCells: counts.reduce((a, b) => a + b, 0),
    };
  })()`);
  console.log(JSON.stringify(stats, null, 2));
});
