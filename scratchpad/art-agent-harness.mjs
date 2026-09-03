#!/usr/bin/env node
// ⚠ IT DELETES INSIDE THE OPENED PROJECT'S `.aurora/canvas`, so `S1DISASM_DIR`
// must name a WRITABLE COPY of a populated s1disasm. There is no default: the
// guard lives in scratchpad/canvas-cdp-harness.mjs (this file's `CANVAS_DIR`
// comes from there) and refuses at import when the variable is unset or points
// at the live checkout. See docs/reviews/2026-09-03-canvas-harness-live-tree-delete.md.
//
//     cp -r <sibling>/s1disasm /tmp/s1disasm-copy
//     S1DISASM_DIR=/tmp/s1disasm-copy npm run harness:art-agent
//
// STAGE 5 / TASK 8: are the art tools actually reachable, and honest, over the wire?
//
// The node suite proves the pure halves, guards the registry, and drives
// `handleAgentRequest` directly. None of it crosses the transport, the zod layer,
// or the IPC bridge. This drives the BUILT app under xvfb and calls both tools
// the way an agent would — POST /aether — then reads the result back out of the
// document through `__dbg.classic`.
//
// THREE ROWS EXIST BECAUSE NOTHING ELSE CAN COVER THEM:
//
//   Row 6  A refusal must arrive as a JSON-RPC *result* carrying ok:false, not
//          as a JSON-RPC *error*. That distinction is made by the adapter, which
//          no node test reaches. If it regresses, it regresses silently: the
//          tool still "works", and every caller is told Aurora broke.
//   Row 7  A bad canvas name must be -32602 INVALID_PARAMS from the schema, not
//          -32603 INTERNAL from the renderer's throw. Same reason.
//   Row 8  The `grid-origin` refusal has NEVER executed anywhere. Every canvas in
//          the node suite is sidecar-less, so gridOrigin is always {0,0}. This
//          row is its first run, ever.
//
// PROVENANCE. `session()` launches `${ROOT}/dist/main/index.mjs`, and ROOT is now
// self-locating — but the port comes from a discovery file in $HOME that a
// DIFFERENT Aurora (another worktree, another session) may own. So row 1 is not
// a formality: `editor/commit_canvas` exists only on this branch, and if the
// port we found does not advertise it we are talking to somebody else's app.
// Every later row's PASS would be a lie. Row 1 aborts the run rather than fail
// one line.
//
// SAFETY. This drives the REAL /home/volence/sonic_hacks/s1disasm. Commits mutate
// the in-memory document only; **nothing here may call save_project**, or the
// pools get written to the user's disassembly. The canvases it writes are
// prefixed `stage5-` and removed at both ends of the run — a leftover canvas
// makes a later create refuse as a duplicate, which produced ten false failures
// in an earlier harness.
//
//   VITE_AURORA_DEBUG=1 npm run build && node scratchpad/art-agent-harness.mjs

import { session, openProjectAndAct, S1DIR, CANVAS_DIR, ROOT, MAIN, sleep, resolveOwnedDiscovery } from './canvas-cdp-harness.mjs';
import { deflateSync } from 'node:zlib';
import { writeFileSync, rmSync, existsSync, readdirSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const rows = [];
function check(id, what, pass, detail = '') {
  rows.push({ id, what, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${what}${detail ? `\n        ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// A minimal indexed PNG, written straight to disk.
//
// Authoring the canvas as FILES rather than through the canvas UI is what makes
// row 8 possible at all: the sidecar is the only way to give a canvas a non-zero
// gridOrigin, and no UI flow produces one on demand.
// ---------------------------------------------------------------------------

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** `palette` is [{r,g,b}]; `indices` is width*height bytes. */
function indexedPng(width, height, palette, indices) {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 3;  // colour type 3 = indexed
  const plte = new Uint8Array(palette.length * 3);
  palette.forEach((c, i) => { plte[i * 3] = c.r; plte[i * 3 + 1] = c.g; plte[i * 3 + 2] = c.b; });
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0; // filter None
    raw.set(indices.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('PLTE', plte),
    chunk('IDAT', new Uint8Array(deflateSync(Buffer.from(raw)))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** A Genesis CRAM word (0000BBB0GGG0RRR0) as 8-bit RGB, the way PLTE wants it. */
function cramToRgb(w) {
  const r = (w & 0x000e) >> 1, g = (w & 0x00e0) >> 5, b = (w & 0x0e00) >> 9;
  return { r: r * 36, g: g * 36, b: b * 36 };
}

/**
 * Write a `stage5-` canvas whose palette IS the act's, so a commit with
 * paletteResolution 'none' is not refused for drift before it reaches the thing
 * under test. `gridOrigin` defaults to aligned; row 8 passes a non-zero one.
 */
function writeCanvas(name, { actPalette, width = 256, height = 256, gridOrigin = { originX: 0, originY: 0 }, entry = 1 }) {
  mkdirSync(CANVAS_DIR, { recursive: true });
  // Line 0's 16 colours, so every 8x8 cell draws from one line by construction.
  const plte = actPalette.slice(0, 16).map(cramToRgb);
  const indices = new Uint8Array(width * height).fill(entry);
  writeFileSync(join(CANVAS_DIR, `${name}.png`), indexedPng(width, height, plte, indices));
  writeFileSync(join(CANVAS_DIR, `${name}.canvas.json`), JSON.stringify({
    version: 1, profile: 'none', palette: actPalette, gridOrigin,
  }, null, 2));
}

function clearCanvases() {
  if (!existsSync(CANVAS_DIR)) return;
  for (const f of readdirSync(CANVAS_DIR)) {
    if (/^stage5-/.test(f)) rmSync(join(CANVAS_DIR, f), { force: true });
  }
}

// ---------------------------------------------------------------------------
// The wire.
// ---------------------------------------------------------------------------

// O16: `discoverPort()` used to live here. It read the FIRST of
// ~/.aurora, ~/.config/aurora, ~/.aether mcp.json that existed and took its
// `port` — paths the OWNER'S OWN Aurora publishes to as well. A harness that
// found his app would have driven his open document and read its own writes
// straight back: every row green, describing nothing, while corrupting his
// work. `resolveOwnedDiscovery()` accepts a port only when the pid the file
// names is a descendant of a process this harness spawned; anything else is
// UNMEASURABLE. See scratchpad/lib/harness-guard.mjs.

let nextId = 1;
/** One JSON-RPC call over the real Aether HTTP binding. Returns the ENVELOPE. */
async function rpc(port, method, params) {
  const res = await fetch(`http://127.0.0.1:${port}/aether`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: `127.0.0.1:${port}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  return { status: res.status, body: await res.json() };
}

// ---------------------------------------------------------------------------

const main = async () => {
  clearCanvases();

  await session('art agent surface', async (c) => {
    await openProjectAndAct(c);
    await sleep(400);

    // AFTER launch, never before: the discovery file exists only while an Aurora
    // is running, and the app removes it on shutdown. Reading it up front found
    // nothing and aborted a run that would have been fine.
    const found = await resolveOwnedDiscovery({ timeoutMs: 20000 });
    for (const r of found.rejected ?? []) console.log(`[prov] refused ${r}`);
    if (!found.ok) {
      console.error(`\nUNMEASURABLE: ${found.why}`);
      console.error('Refusing to POST to a port this harness cannot prove it owns.');
      process.exitCode = 2;
      return;
    }
    const PORT = found.port;
    console.log(`\n[prov] discovery file ${found.from} said:\n       ${found.raw.trim()}`);
    console.log(`[prov] pid ${found.pid} IS a descendant of ${found.roots.join(',')} — accepted`);
    console.log(`[wire] POST http://127.0.0.1:${PORT}/aether`);
    console.log(`[app ] ${MAIN} against ${S1DIR}\n`);

    // TWO INDEPENDENT READERS, on purpose. `poolSizes()` comes off the live store
    // through the CDP probe; `get_classic_level` comes back over the same wire
    // the tools use. Checking a tool's own report against a number the tool also
    // produced would prove nothing, so rows 3 and 4 compare the reply against the
    // PROBE, and the wire reader is used only for setup (palette, layout, ids).
    const pools = () => c.evalExpr(`window.__dbg.classic.poolSizes()`);
    const where = await c.evalExpr(`window.__dbg.levelState()`);
    const levelOf = async () => (await rpc(PORT, 'editor/get_classic_level',
      { zone: where.zone, act: where.act })).body.result;

    const level0 = await levelOf();
    if (!level0) { console.error('get_classic_level returned nothing — no act open?'); return; }
    // Line-major 64 CRAM words, the shape a canvas sidecar stores.
    const actPalette = [];
    for (let l = 0; l < 4; l++) for (let e = 0; e < 16; e++) actPalette.push(level0.palettes[l]?.[e] ?? 0);

    // --- 1: provenance + discovery ---------------------------------------
    const init = await rpc(PORT, 'initialize', { protocolVersion: 1 });
    const methods = init.body.result?.methods ?? [];
    const advertised = methods.includes('editor/commit_canvas') && methods.includes('editor/import_art_sheet');
    check(1, 'initialize advertises both art methods', advertised,
      `${methods.length} methods; commit_canvas=${methods.includes('editor/commit_canvas')} import_art_sheet=${methods.includes('editor/import_art_sheet')}`);
    if (!advertised) {
      console.error('\nABORT: the app on this port does not carry this branch. Every later row would be a lie.');
      return;
    }

    writeCanvas('stage5-flat', { actPalette });

    // --- 2: dryRun mutates nothing ---------------------------------------
    const before = await pools();
    const dry = await rpc(PORT, 'editor/commit_canvas', { name: 'stage5-flat', dryRun: true });
    const afterDry = await pools();
    check(2, 'dryRun reports without mutating',
      dry.body.result?.ok === true && dry.body.result.applied === false
        && JSON.stringify(before) === JSON.stringify(afterDry),
      `applied=${dry.body.result?.applied} pools ${JSON.stringify(before)} -> ${JSON.stringify(afterDry)}`);

    // --- 3 + 4: the real commit ------------------------------------------
    const live = await rpc(PORT, 'editor/commit_canvas', { name: 'stage5-flat' });
    const afterLive = await pools();
    const rep = live.body.result?.report;
    check(3, 'report.poolAfter matches the document',
      !!rep && rep.poolAfter.chunks === afterLive.chunks && rep.poolAfter.blocks === afterLive.blocks,
      `reported ${JSON.stringify(rep?.poolAfter)} vs actual ${JSON.stringify(afterLive)}`);

    const ids = live.body.result?.appendedChunkIds ?? [];
    check(4, 'appendedChunkIds are real engine ids',
      ids.length > 0 && ids.every((id) => id >= 1 && id <= afterLive.chunks)
        && ids[0] === before.chunks + 1,
      `ids ${JSON.stringify(ids)} against ${afterLive.chunks} chunks (before ${before.chunks})`);

    // --- 5: the round trip the ids exist for ------------------------------
    const id = ids[0];
    const placed0 = (await levelOf()).layout.fg[0][0];
    await rpc(PORT, 'editor/set_layout_region', { plane: 'fg', x: 0, y: 0, chunkIds: [[id]] });
    const placed = (await levelOf()).layout.fg[0][0];
    check(5, 'set_layout_region accepts a returned id', placed === id,
      `layout.fg[0][0] ${placed0} -> ${placed}, wanted ${id}`);

    // --- 6: a refusal is a RESULT, not an error ---------------------------
    const refused = await rpc(PORT, 'editor/commit_canvas', {
      name: 'stage5-flat', targets: [{ chunkFileIndex: 99999 }],
    });
    check(6, 'a refusal is a JSON-RPC result, not an error',
      refused.status === 200 && refused.body.error === undefined
        && refused.body.result?.ok === false
        && typeof refused.body.result.message === 'string' && refused.body.result.message.length > 0,
      `status=${refused.status} error=${JSON.stringify(refused.body.error)} kind=${refused.body.result?.refusal?.kind} msg=${JSON.stringify(refused.body.result?.message)}`);

    // --- 7: a bad name is -32602, not -32603 ------------------------------
    const badName = await rpc(PORT, 'editor/commit_canvas', { name: '../etc/passwd' });
    check(7, 'a bad canvas name is INVALID_PARAMS (-32602), not INTERNAL (-32603)',
      badName.body.error?.code === -32602,
      `code=${badName.body.error?.code} message=${JSON.stringify(badName.body.error?.message)}`);

    // --- 8: the grid-origin refusal, executing for the first time ---------
    writeCanvas('stage5-offgrid', { actPalette, gridOrigin: { originX: 3, originY: 5 } });
    const offgrid = await rpc(PORT, 'editor/commit_canvas', { name: 'stage5-offgrid', dryRun: true });
    check(8, 'a canvas whose sidecar carries a non-zero gridOrigin is REFUSED',
      offgrid.body.error === undefined && offgrid.body.result?.ok === false
        && offgrid.body.result.refusal?.kind === 'grid-origin',
      `kind=${offgrid.body.result?.refusal?.kind} msg=${JSON.stringify(offgrid.body.result?.message)}`);

    // --- 9: collision, against a real colind table ------------------------
    writeCanvas('stage5-coll', { actPalette, entry: 2 });
    const noColl = await rpc(PORT, 'editor/commit_canvas', { name: 'stage5-coll', dryRun: true });
    const coll = await rpc(PORT, 'editor/commit_canvas', { name: 'stage5-coll', collision: true, dryRun: true });
    const applied = coll.body.result?.collision;
    // The toggle OFF must report nothing, and ON must report something: a reply
    // that carried `collision` either way would mean the field is decoration.
    check(9, 'collision:true reports what the toggle did, and false reports nothing',
      noColl.body.result?.ok === true && noColl.body.result.collision === undefined
        && coll.body.result?.ok === true && !!applied
        && typeof applied.blocks === 'number' && typeof applied.cells === 'number'
        && typeof applied.skippedOverhang === 'number'
        && applied.blocks + applied.skippedOverhang > 0,
      `off=${JSON.stringify(noColl.body.result?.collision)} on=${JSON.stringify(applied)}`);

    // --- 10: import_art_sheet end to end ----------------------------------
    const sheetPath = join(ROOT, 'scratchpad', 'stage5-sheet.png');
    writeFileSync(sheetPath, indexedPng(256, 256, actPalette.slice(0, 16).map(cramToRgb), new Uint8Array(256 * 256).fill(1)));
    const beforeSheet = await pools();
    const sheet = await rpc(PORT, 'editor/import_art_sheet', { path: sheetPath, dryRun: true });
    const afterSheet = await pools();
    check(10, 'import_art_sheet plans from a real PNG on disk without mutating',
      sheet.body.error === undefined && sheet.body.result?.ok === true
        && sheet.body.result.applied === false
        && JSON.stringify(beforeSheet) === JSON.stringify(afterSheet),
      `ok=${sheet.body.result?.ok} applied=${sheet.body.result?.applied} refusal=${JSON.stringify(sheet.body.result?.refusal)}`);
    rmSync(sheetPath, { force: true });

    // NOTE: no save_project anywhere in this file, deliberately. Everything above
    // mutates the in-memory document only; the disassembly on disk is untouched.
  });

  clearCanvases();
  const passed = rows.filter((r) => r.pass).length;
  console.log(`\n${passed}/${rows.length}`);
  process.exit(passed === rows.length ? 0 : 1);
};

main().catch((e) => { console.error(e); clearCanvases(); process.exit(1); });
