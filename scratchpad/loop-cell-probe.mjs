#!/usr/bin/env node
// CAN THE LOOP WARNING EVER FIRE IN GHZ ACT 1?
//
// The warning needs a layout byte with bit 7 set (loop region) naming chunk $28
// — the one id FindNearestTile substitutes ($51) while the player is behind the
// loop. If GHZ 1 has none, the feature is real but has no runtime coverage
// there, and a CDP row for it would have to open a different act.
//
// Reads only. Never calls save_project.
import { session, openProjectAndAct } from './canvas-cdp-harness.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function discoverPort() {
  for (const sub of ['.aurora', '.config/aurora', '.aether']) {
    const p = join(homedir(), sub, 'mcp.json');
    if (existsSync(p)) { try { const j = JSON.parse(readFileSync(p, 'utf8')); if (j.port) return j.port; } catch {} }
  }
  return null;
}
let id = 1;
const rpc = async (port, method, params) => (await (await fetch(`http://127.0.0.1:${port}/aether`, {
  method: 'POST', headers: { 'content-type': 'application/json', host: `127.0.0.1:${port}` },
  body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }),
})).json());

await session('loop cell probe', async (c) => {
  await openProjectAndAct(c);
  const port = discoverPort();
  const out = {};
  for (const act of [1, 2, 3]) {
    const r = await rpc(port, 'editor/get_classic_level', { zone: 'ghz', act });
    const fg = r.result?.layout?.fg ?? r.result?.fg;
    if (!fg) { out[`ghz${act}`] = 'no fg in reply'; continue; }
    let looping = 0, loopIs28 = 0, plain28 = 0;
    for (const row of fg) for (const raw of row) {
      if ((raw & 0x80) !== 0) { looping++; if ((raw & 0x7f) === 0x28) loopIs28++; }
      else if ((raw & 0x7f) === 0x28) plain28++;
    }
    out[`ghz${act}`] = { loopFlaggedCells: looping, loopFlaggedNamingChunk28: loopIs28, chunk28WithoutLoopBit: plain28 };
  }
  console.log(JSON.stringify(out, null, 2));
});
