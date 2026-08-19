#!/usr/bin/env node
// Does the AGENT REPLY actually carry `skippedCells`? Verification, not assumption.
// agent-handler.ts spreads the report verbatim (`{ ok: true, ...res.report }`),
// so the claim is that the new field rides along for free. This asks the wire.
// dryRun ONLY — nothing is written, and save_project is never called.
import { session, openProjectAndAct, sleep } from './canvas-cdp-harness.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function discoverPort() {
  for (const sub of ['.aurora', '.config/aurora', '.aether']) {
    const p = join(homedir(), sub, 'mcp.json');
    if (existsSync(p)) { try { const j = JSON.parse(readFileSync(p, 'utf8')); if (j.port) return j.port; } catch {} }
  }
  return null;
}
let nextId = 1;
async function rpc(port, method, params) {
  const res = await fetch(`http://127.0.0.1:${port}/aether`, {
    method: 'POST', headers: { 'content-type': 'application/json', host: `127.0.0.1:${port}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  return (await res.json());
}

await session('skippedCells over the wire', async (c) => {
  await openProjectAndAct(c);
  await sleep(600);
  const PORT = discoverPort();
  const where = await c.json(`window.__dbg.levelState()`);
  const level = (await rpc(PORT, 'editor/get_classic_level', { zone: where.zone, act: where.act })).result;
  const cellsWide = level.dims.fg.width * 16;
  console.log(`[act] ${level.label} — ${cellsWide} FG cells wide`);

  // A big sweep of real ground: plenty applies, far more skips as air/block 0.
  // GHZ's top-left is sky, so walk DOWN until a band actually applies something.
  const w = Math.min(cellsWide, 64);
  let r = null;
  for (let y = 0; y < level.dims.fg.height * 16 && !r; y += 8) {
    const got = (await rpc(PORT, 'editor/set_block_collision',
      { x: 0, y, w, h: 8, shape: 0xff, mode: 'link', dryRun: true })).result;
    if (got?.ok === true && (got.skipped ?? []).length > 0) { r = got; console.log(`[band] y=${y}`); }
  }
  if (!r) { console.log('no band applied anything — probe inconclusive'); return; }

  console.log('[reply keys]', Object.keys(r).join(', '));
  console.log('[ok]', r.ok, '[applied]', r.applied, '[noop]', r.noop);
  console.log('[skipped counts]', JSON.stringify(r.skipped));
  console.log('[skippedCells present]', Array.isArray(r.skippedCells));
  console.log('[skippedCells length]', r.skippedCells?.length, '[truncated]', r.skippedCellsTruncated);
  console.log('[first 4]', JSON.stringify(r.skippedCells?.slice(0, 4)));
  const total = (r.skipped ?? []).reduce((n, s) => n + s.count, 0);
  console.log(`[VERDICT] field-on-wire=${Array.isArray(r.skippedCells)} `
    + `capped=${r.skippedCells?.length <= 32} totals-authoritative=${total >= (r.skippedCells?.length ?? 0)} `
    + `total=${total} listed=${r.skippedCells?.length}`);
});
