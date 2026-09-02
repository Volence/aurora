// crossover-paint-harness — does a loop crossover painted through the AGENT
// ROAD survive Aurora's save into the file aeon's bake reads?
//
// LP-3. The first half of "document -> file -> bake -> ROM". This harness owns
// the first arrow only; the bake and the ROM are measured by shell afterwards
// against the file this leaves behind.
//
// ⚠ WHAT A GREEN HERE DOES *NOT* MEAN. The engine read site does not exist yet
// (aeon: LOOP_CROSSOVER_ENCODING.md is an encoding anchor, not a runtime). So
// a perfect result establishes that the AUTHORING AND SAVE path carries the
// field intact, and says NOTHING about behaviour. "The bytes arrive" and "the
// crossover works" are claims about different halves of a system where only one
// half is built. Do not let a byte delta be cited as a working loop.
//
// THE MEASUREMENT, and why it is shaped this way
// ----------------------------------------------
// Every painted cell is written back with THE WORD IT ALREADY HAD, plus
// `crossover: 'hand-off'`. Geometry is therefore held constant by construction:
// the only bits that CAN move are 15:14. "The file changed" is consistent with
// a dozen things; "exactly these cells changed, in exactly those two bits, and
// their neighbours did not" is consistent with one.
//
// Values are DERIVED FROM THE ANCHOR, not from a peer's message. aeon
// `4f846e25` docs/LOOP_CROSSOVER_ENCODING.md §3.2: 0 XOVER_NONE, 1 = go to A,
// 2 = go to B, 3 = reserved and the bake hard-errors on it. §3.4/§4: a plane-A
// word's XOVER fires for a player on layer 0, a plane-B word's for layer 1 — so
// "hand-off" means 2 on plane A and 1 on plane B. Painting BOTH planes is
// deliberate: a bug that wrote one value to both planes would pass a
// single-plane check and is exactly the direction error this encoding invites.
//
// NO GEOMETRY IS ASSUMED. The harness does not compute a cell's byte offset —
// it diffs the whole file and derives WHICH words moved. A layout assumption
// would be a second claim riding inside the assertion, and the section grid is
// not 128x128 (the file is 131,072 B = 65,536 big-endian words per plane).
//
//   run:  VITE_AURORA_DEBUG=1 npm run build && node scratchpad/crossover-paint-harness.mjs

import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { session, resolveOwnedDiscovery, sleep, ROOT } from './canvas-cdp-harness.mjs';

const WORKTREE = siblingPathOrUnresolved('.aurora-crossover-paint');
const LIVE_AEON = siblingPathOrUnresolved('aeon');

// ═══ The tree under test must not be the peer's live checkout ══════════════
// aeon's main checkout currently holds unruled owner content (the d-44 scene
// edit). Aurora's save canonicalises EVERY editor-owned JSON in one pass, so a
// save here would interleave this paint with his uncommitted diff and make the
// card asking "is this yours?" harder to answer. Refuse rather than trust a
// constant.
if (WORKTREE.replace(/\/+$/, '') === LIVE_AEON.replace(/\/+$/, '')) {
  console.log('HARNESS REFUSES: WORKTREE is the live aeon checkout.');
  process.exit(2);
}

const SECTION = 0;
const X = 56, Y = 16, W = 4, H = 1;   // frame 2: BOTH planes carry geometry (0x30ff)
const CONTROL_X = [X - 1, X + W];      // immediate neighbours, deliberately unpainted

const A_REL = `games/sonic4/data/editor/ojz/act1/section_${SECTION}.collattr.bin`;
const B_REL = `games/sonic4/data/editor/ojz/act1/section_${SECTION}.collattrb.bin`;

const XOVER_SHIFT = 14, XOVER_MASK = 3;

// ⚠ UNITS. paint_collision takes 16px CELLS; the collattr file stores 8px
// SUB-TILE entries — its own reply contract says "painted counts 8px sub-tile
// entries actually changed (up to 4 per cell)", and the first run of this
// harness returned painted:16 for a 4-cell rect, which is how the assumption
// was caught. So a W*H cell rect moves W*H*4 words, laid out as 2H rows of 2W.
// Derived from the method's contract and confirmed against its reply, never
// assumed from the rect.
const EXPECT_WORDS = W * H * 4;
const EXPECT = { a: 2, b: 1 };         // anchor §3.2 + §4, derived above

let pass = 0, fail = 0;
const check = (id, label, ok, detail) => {
  (ok ? pass++ : fail++);
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${label}${detail ? `\n        ${detail}` : ''}`);
};

/** Whole-file big-endian word read. */
function words(rel) {
  const b = readFileSync(join(WORKTREE, rel));
  const out = new Uint16Array(b.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = (b[i * 2] << 8) | b[i * 2 + 1];
  return out;
}

/** Indices where two word arrays differ. Derived, never assumed. */
function changed(before, after) {
  if (before.length !== after.length) return null;
  const idx = [];
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) idx.push(i);
  return idx;
}

let nextId = 1;
async function rpc(port, method, params) {
  const res = await fetch(`http://127.0.0.1:${port}/aether`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: `127.0.0.1:${port}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  return (await res.json());
}

// The Aether binding namespaces editor methods as `editor/<name>` and returns
// the result directly — NOT MCP's tools/call envelope. Established by reading
// collision-agent-harness.mjs, which drives the same wire.
async function callTool(port, name, args) {
  const env = await rpc(port, `editor/${name}`, args);
  if (env.error) throw new Error(`${name}: ${env.error.message} (${env.error.code})`);
  return env.result;
}

const beforeA = words(A_REL), beforeB = words(B_REL);
const mtimeBefore = statSync(join(WORKTREE, A_REL)).mtimeMs;

console.log(`=== crossover paint, throwaway tree ${WORKTREE}`);
console.log(`    section ${SECTION}, ${W}x${H} at (${X},${Y}); control cols ${CONTROL_X.join(',')}`);

await session('crossover paint through the agent road', async (c) => {
  await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(WORKTREE)})`)
    .catch((e) => console.log('        aeon open threw:', e.message));
  await sleep(4000);

  const owned = await resolveOwnedDiscovery({});
  if (!owned?.port) { console.log('UNMEASURABLE: no owned Aether port — refusing to touch a port we did not spawn.'); process.exit(2); }
  const port = owned.port;
  console.log(`    owned port ${port} (pid ${owned.pid})`);

  // ---- read EACH plane's own cells -------------------------------------
  // ⚠ ONE CALL PER PLANE, and the first draft of this harness got it wrong in
  // a way worth keeping. It read plane A and painted plane:'both' with A's
  // words, then asserted geometry held on both. Row 5b went RED — correctly.
  // The method's contract says so in its own description: *"'words' with
  // plane:'both' writes THE SAME per-cell word into both planes"*, and
  // *"round-tripping a region OVER ITSELF is exact"* — over ITSELF being the
  // operative phrase. So the app was right and the instrument was wrong. A
  // crossover-only call is not available to dodge this ("both or neither is
  // refused"), so the honest shape is: read a plane, write that plane back.
  //
  // It only surfaced because the fixture moved to cells with real geometry.
  // At (8,8) every word was 0 and the same broken call passed 11/11.
  const regionA = await callTool(port, 'get_collision_region',
    { section: SECTION, plane: 'a', x: X, y: Y, w: W, h: H });
  const regionB = await callTool(port, 'get_collision_region',
    { section: SECTION, plane: 'b', x: X, y: Y, w: W, h: H });
  const original = regionA.words;
  console.log(`    read back ${original?.length} word(s): ${JSON.stringify(original)}`);

  check('1', 'ANTI-VACUOUS: the read returned exactly the cells asked for',
    Array.isArray(original) && original.length === W * H,
    `got ${original?.length}, expected ${W * H}`);

  // ⚠ THE FIXTURE IS CHOSEN, NOT DEFAULTED. The first run of this harness used
  // (8,8), where every target word was 0 — air. Row 5 ("the low 14 bits are
  // identical") passed there for the wrong reason: there was no geometry to
  // lose, so a paint that clobbered shape would have passed it too. The cells
  // below carry real shape/solidity, found by scanning for the first run of 4
  // adjacent cells whose sub-tiles are ALL non-zero. That is what makes row 5
  // discriminate rather than merely report.
  check('2b', 'ANTI-VACUOUS: the target cells carry REAL geometry, so "geometry held" can actually fail',
    original.every((w) => (w & ~(XOVER_MASK << XOVER_SHIFT)) !== 0),
    `words ${original.map((w) => '0x' + w.toString(16)).join(' ')}`);

  check('2', 'BASELINE: every target cell starts with NO crossover (anchor §5: all cells are XOVER_NONE today)',
    original.every((w) => ((w >> XOVER_SHIFT) & XOVER_MASK) === 0),
    `bits 15:14 = ${original.map((w) => (w >> XOVER_SHIFT) & XOVER_MASK).join(',')}`);

  check('2c', 'ANTI-VACUOUS: plane B carries its OWN geometry, distinct from plane A — so a cross-plane clobber is DETECTABLE here',
    JSON.stringify(regionB.words) !== JSON.stringify(regionA.words),
    `A ${regionA.words.map((w) => '0x' + w.toString(16)).join(' ')}\n        B ${regionB.words.map((w) => '0x' + w.toString(16)).join(' ')}`);

  // ---- paint: each plane's OWN words back, plus the crossover axis --------
  const resA = await callTool(port, 'paint_collision', {
    section: SECTION, plane: 'a', x: X, y: Y, w: W, h: H,
    words: regionA.words, crossover: 'hand-off',
  });
  const resB = await callTool(port, 'paint_collision', {
    section: SECTION, plane: 'b', x: X, y: Y, w: W, h: H,
    words: regionB.words, crossover: 'hand-off',
  });
  console.log(`    paint A -> ${JSON.stringify(resA).slice(0, 120)}`);
  console.log(`    paint B -> ${JSON.stringify(resB).slice(0, 120)}`);

  // ---- save: a REAL Ctrl+S. There is no save on the aeon probe API, and
  // that is correct — the door under test is the one a human uses. Raw CDP
  // dispatch, modifiers:2 = Ctrl, same as band-art-foreground-harness.
  await sleep(1200);
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS',
    windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83, modifiers: 2 });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS',
    windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83, modifiers: 2 });
  await sleep(5000);
});

// ---- the file, after ------------------------------------------------------
const mtimeAfter = statSync(join(WORKTREE, A_REL)).mtimeMs;
check('3', 'the save actually rewrote the collision file (mtime moved)',
  mtimeAfter > mtimeBefore, `before ${mtimeBefore} after ${mtimeAfter}`);

const afterA = words(A_REL), afterB = words(B_REL);
const chA = changed(beforeA, afterA), chB = changed(beforeB, afterB);

console.log(`\n    plane A changed word indices: ${JSON.stringify(chA)}`);
console.log(`    plane B changed word indices: ${JSON.stringify(chB)}`);

for (const [plane, before, after, ch] of [['a', beforeA, afterA, chA], ['b', beforeB, afterB, chB]]) {
  check(`4${plane}`, `plane ${plane.toUpperCase()}: EXACTLY ${EXPECT_WORDS} words changed in the WHOLE file — no neighbour, no other section row, nothing else`,
    ch && ch.length === EXPECT_WORDS, `changed ${ch?.length}, expected ${EXPECT_WORDS} (${W}x${H} cells x4 sub-tiles)`);

  const onlyXover = ch && ch.every((i) => (before[i] & ~(XOVER_MASK << XOVER_SHIFT)) === (after[i] & ~(XOVER_MASK << XOVER_SHIFT)));
  check(`5${plane}`, `plane ${plane.toUpperCase()}: geometry HELD — the low 14 bits are identical on every changed word`,
    onlyXover,
    ch?.map((i) => `#${i} ${before[i].toString(16)}->${after[i].toString(16)}`).join(' '));

  const val = ch && ch.every((i) => ((after[i] >> XOVER_SHIFT) & XOVER_MASK) === EXPECT[plane]);
  check(`6${plane}`, `plane ${plane.toUpperCase()}: crossover is ${EXPECT[plane]} (anchor §3.2: ${plane === 'a' ? 'plane A hands off TO B' : 'plane B hands off TO A'})`,
    val, ch?.map((i) => (after[i] >> XOVER_SHIFT) & XOVER_MASK).join(','));
}

// The direction check the single-plane version cannot make.
check('7', 'the two planes carry DIFFERENT values — a hand-off that wrote one value to both would be wrong and would pass a one-plane check',
  chA?.length && chB?.length
  && ((afterA[chA[0]] >> XOVER_SHIFT) & XOVER_MASK) !== ((afterB[chB[0]] >> XOVER_SHIFT) & XOVER_MASK),
  `A=${chA?.length ? (afterA[chA[0]] >> XOVER_SHIFT) & XOVER_MASK : '?'} B=${chB?.length ? (afterB[chB[0]] >> XOVER_SHIFT) & XOVER_MASK : '?'}`);

// CONTROL, derived rather than assumed: group the changed indices into maximal
// consecutive runs. A W x H cell rect must appear as 2H runs of 2W words. This
// checks the SHAPE of the change without hardcoding the row stride — if the
// paint bled sideways the runs get longer, if it bled vertically there are more
// of them, and either way this fails.
const runs = [];
for (const i of chA ?? []) {
  if (runs.length && i === runs[runs.length - 1].at(-1) + 1) runs[runs.length - 1].push(i);
  else runs.push([i]);
}
check('8', `CONTROL: the change forms exactly ${2 * H} run(s) of ${2 * W} words — the painted rect's shape, with no bleed into a neighbour`,
  runs.length === 2 * H && runs.every((r) => r.length === 2 * W),
  `${runs.length} run(s) of lengths [${runs.map((r) => r.length).join(',')}]; starts [${runs.map((r) => r[0]).join(',')}]`);

console.log(`\n=== ${pass} passed, ${fail} failed`);
console.log(`=== the file to carry into the bake: ${A_REL}`);
process.exit(fail === 0 ? 0 : 1);
