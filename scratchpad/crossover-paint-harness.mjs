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
// NO GEOMETRY IS ASSUMED BY THE MEASUREMENT. The measurement does not compute a
// cell's byte offset — it diffs the whole file and derives WHICH words moved. A
// layout assumption would be a second claim riding inside the assertion, and the
// section grid is not 128x128 (the file is 131,072 B = 65,536 big-endian words
// per plane). The SETUP does need an offset (it authors plane B's fixture), and
// that index math is CHECKED rather than assumed — see row [1c].
//
// ═══ WHY THIS HARNESS MATERIALISES ITS OWN TREE (O48d, 2026-09-02) ═══════════
//
// It used to open a scratch directory it did not create
// (`../.aurora-crossover-paint`) and had NEVER been able to run on a clean
// checkout. Three states, all measured:
//
//   • against that scratch copy — row [2] red, because a previous run's paint
//     was still in it; row [2c] green ONLY because that same previous paint had
//     made the two planes differ;
//   • against a fresh `git archive` of aeon origin/master — row [2c] red: at the
//     hardcoded cells (56,16) BOTH planes read the same word;
//   • with the directory absent — ENOENT inside `words()`.
//
// So it scored green exactly once, against a tree somebody had already painted
// into. ⚠ THIS IS NOT the O66 "not re-runnable on a reused copy" shape, and an
// earlier reading that said so had it backwards: a reused copy was the ONLY
// thing it ever ran on, and a fresh one was the state it could not survive.
//
// Both halves are fixed here. The tree is materialised FRESH PER RUN from a
// COMMITTED aeon revision into a mkdtemp (`git archive` reads the object
// database, never aeon's working tree), and leftover crossover state in a
// supplied tree is REFUSED loudly instead of silently scoring row [2] red.
//
// ═══ THE FIXTURE, AND WHY PART OF IT IS AUTHORED ════════════════════════════
//
// Rows [2b]/[2bB]/[2c] are anti-vacuous guards: rows 5a/5b ("geometry HELD")
// can only fail on a plane that HAS geometry, and a cross-plane clobber is only
// detectable where the two planes read differently. Both are properties of the
// FIXTURE, not of the code under test, so the fixture is what has to satisfy
// them — relaxing the guards would leave the harness certifying nothing while
// looking like it certifies something.
//
// MEASURED over every `.collattr*.bin` pair aeon commits (9 files, ojz act1):
// there is NOT ONE cell anywhere in which both planes carry geometry AND read
// differently. Plane B is air wherever plane A has shape, and vice versa. So
// the property cannot be derived whole from committed data.
//
//   • plane A's half IS derived: the harness scans the file for the first run of
//     W adjacent uniform cells carrying real shape with no crossover set.
//   • plane B's half is AUTHORED, in the harness's own setup, into its own
//     throwaway tree, BEFORE the app is launched — so a fresh archive is always
//     sufficient and no run depends on what a previous run left behind. The
//     word written is not invented either: it is the most common non-zero cell
//     word plane B already carries elsewhere in the SAME file, so it is a word
//     the format and the bake already accept, and it is required to differ from
//     every plane-A word at the fixture cells.
//
// `PLANT=identical-planes` seeds plane B with plane A's words instead, which
// makes the two planes read identically at the fixture and MUST turn row [2c]
// red. That is the falsification pass for the guard this parcel repaired.
//
//   run:  VITE_AURORA_DEBUG=1 npm run build && node scratchpad/crossover-paint-harness.mjs
//   env:  AEON_DIR  the aeon tree to take the fixture from. A git checkout is
//                   archived at AEON_SHA; a plain extract is COPIED. Either way
//                   the run edits a fresh mkdtemp, never the tree named here.
//         AEON_SHA  the committed revision to archive (default `origin/master`).
//         PLANT     `identical-planes` — the row [2c] falsification.

import { siblingDefaultPathOrUnresolved, checkoutOverride } from '../test/support/sibling-root.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, mkdtempSync, existsSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { session, resolveOwnedDiscovery, sleep, ROOT } from './canvas-cdp-harness.mjs';

const PLANT = process.env.PLANT ?? '';
const SECTION = 0;
const W = 4, H = 1;                    // the painted rect, in 16px cells

const A_REL = `games/sonic4/data/editor/ojz/act1/section_${SECTION}.collattr.bin`;
const B_REL = `games/sonic4/data/editor/ojz/act1/section_${SECTION}.collattrb.bin`;

const XOVER_SHIFT = 14, XOVER_MASK = 3;
const XOVER_BITS = XOVER_MASK << XOVER_SHIFT;

// ═══ 1. THE TREE UNDER TEST — made here, fresh, never borrowed ══════════════
//
// The source is read-only in every branch: `git archive` takes a COMMITTED
// revision out of the object database (so aeon's working tree is not read at
// all, dirty or not), and the copy branch exists only so a caller who already
// extracted an archive can point at it. The tree that gets painted is always a
// new mkdtemp, so "re-runnable" is true by construction rather than by remembering.
const AEON_SRC = checkoutOverride('aeon')?.value ?? siblingDefaultPathOrUnresolved('aeon');
const AEON_SHA = process.env.AEON_SHA ?? 'origin/master';

function materialise() {
  const dir = mkdtempSync(join(tmpdir(), 'aurora-crossover-paint-'));
  if (existsSync(join(AEON_SRC, '.git'))) {
    const sha = execFileSync('git', ['-C', AEON_SRC, 'rev-parse', AEON_SHA], { encoding: 'utf8' }).trim();
    const tar = execFileSync('git', ['-C', AEON_SRC, 'archive', sha], { maxBuffer: 1 << 30 });
    execFileSync('tar', ['-x', '-C', dir], { input: tar, maxBuffer: 1 << 30 });
    return { dir, provenance: `git archive ${AEON_SRC} @ ${AEON_SHA} = ${sha}` };
  }
  if (!existsSync(join(AEON_SRC, A_REL))) {
    console.log(`HARNESS REFUSES: ${AEON_SRC} is neither a git checkout nor an aeon extract (no ${A_REL}).`);
    process.exit(2);
  }
  cpSync(AEON_SRC, dir, { recursive: true });
  return { dir, provenance: `copy of the extract at ${AEON_SRC} (no .git — revision unverifiable)` };
}

const { dir: WORKTREE, provenance: PROVENANCE } = materialise();

/** Whole-file big-endian word read. */
function words(rel) {
  const b = readFileSync(join(WORKTREE, rel));
  const out = new Uint16Array(b.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = (b[i * 2] << 8) | b[i * 2 + 1];
  return out;
}

// ═══ 2. LEFTOVER STATE IS REFUSED, NOT SCORED ═══════════════════════════════
//
// aeon LOOP_CROSSOVER_ENCODING.md §5: every committed cell is XOVER_NONE today.
// So ANY word with bits 15:14 set in the tree we are about to paint is a
// previous run's residue, and the honest answer is to stop — not to let row [2]
// go red and have a reader wonder whether the app broke. Unreachable on the
// archive branch by construction; this is the guard for the copy branch.
{
  const stale = [];
  for (const rel of [A_REL, B_REL]) {
    const w = words(rel);
    for (let i = 0; i < w.length; i++) if (w[i] & XOVER_BITS) stale.push(`${rel}#${i}=0x${w[i].toString(16)}`);
  }
  if (stale.length) {
    console.log(`HARNESS REFUSES: ${WORKTREE} already carries ${stale.length} crossover word(s) — leftover state, not a clean tree.`);
    console.log(`        first few: ${stale.slice(0, 6).join(' ')}`);
    console.log(`        provenance: ${PROVENANCE}`);
    process.exit(2);
  }
}

// ═══ 3. THE FIXTURE ═════════════════════════════════════════════════════════
//
// ⚠ THE ONE PLACE THIS FILE COMPUTES A CELL'S OFFSET, and the assumption is
// named: the plane is square in 8px tiles, so its edge is sqrt(word count) —
// 65,536 words -> 256 tiles -> 128 cells, which is what
// `SECTION_TILES_WIDE`/`SECTION_CELLS_WIDE` say in src. It is not TAKEN on
// faith: row [1c] reads both planes back THROUGH THE APP at the chosen cells
// and requires the app's words to equal the ones this math picked out of the
// file. Wrong stride -> wrong cells -> [1c] red.
const PLANE_WORDS = words(A_REL).length;
const TILES_WIDE = Math.sqrt(PLANE_WORDS);
if (!Number.isInteger(TILES_WIDE)) {
  console.log(`HARNESS REFUSES: ${PLANE_WORDS} words per plane is not a square tile grid — the cell index math below has no derivation.`);
  process.exit(2);
}
const CELLS_WIDE = TILES_WIDE / 2, CELLS_HIGH = TILES_WIDE / 2;

/** The four 8px sub-tile indices of one 16px cell — `cellTileIndices`, in .mjs. */
const cellTiles = (x, y) => [
  (2 * y) * TILES_WIDE + 2 * x, (2 * y) * TILES_WIDE + 2 * x + 1,
  (2 * y + 1) * TILES_WIDE + 2 * x, (2 * y + 1) * TILES_WIDE + 2 * x + 1,
];
/** A cell's word, or null when its four sub-tiles disagree — the app's own rule. */
const cellWord = (plane, x, y) => {
  const v = cellTiles(x, y).map((i) => plane[i]);
  return v.every((q) => q === v[0]) ? v[0] : null;
};

/** The first run of W adjacent cells where plane A carries real shape and no
 *  crossover, and plane B is uniform — DERIVED from the file, never typed. */
function pickFixture(A, B) {
  for (let y = 0; y < CELLS_HIGH; y++) {
    for (let x = 1; x + W < CELLS_WIDE; x++) {   // x>=1 and x+W<edge: both control columns exist
      let ok = true;
      for (let k = 0; k < W && ok; k++) {
        const a = cellWord(A, x + k, y), b = cellWord(B, x + k, y);
        ok = a !== null && b !== null && (a & XOVER_BITS) === 0 && (b & XOVER_BITS) === 0 && (a & ~XOVER_BITS) !== 0;
      }
      if (ok) return { x, y };
    }
  }
  return null;
}

/** The most common non-zero cell word plane B already carries in THIS file, and
 *  not one plane A holds at the fixture. Authoring a value out of thin air would
 *  put a word of my invention in front of a bake that has opinions; taking one
 *  the plane already carries cannot. */
function seedWordFor(B, avoid) {
  const freq = new Map();
  for (let y = 0; y < CELLS_HIGH; y++) for (let x = 0; x < CELLS_WIDE; x++) {
    const w = cellWord(B, x, y);
    if (w === null || (w & ~XOVER_BITS) === 0) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const ranked = [...freq].sort((p, q) => q[1] - p[1] || p[0] - q[0]);
  for (const [w] of ranked) if (!avoid.includes(w)) return { word: w, cells: freq.get(w), vocabulary: ranked.length };
  return null;
}

const fixture = pickFixture(words(A_REL), words(B_REL));
if (fixture === null) {
  console.log('HARNESS REFUSES: no run of adjacent cells in plane A carries real geometry with no crossover — nothing to measure "geometry held" against.');
  process.exit(2);
}
const { x: X, y: Y } = fixture;
const CONTROL_X = [X - 1, X + W];      // immediate neighbours, deliberately unpainted

// ---- author plane B's half of the fixture, into our own throwaway tree ------
const A_FIXTURE = Array.from({ length: W }, (_, k) => cellWord(words(A_REL), X + k, Y));
const seed = seedWordFor(words(B_REL), A_FIXTURE);
if (seed === null) {
  console.log('HARNESS REFUSES: plane B carries no non-air word anywhere in this file that differs from plane A at the fixture — cannot author a REAL distinct geometry, and inventing one would make row [2c] pass without making the detection real.');
  process.exit(2);
}
// PLANT=identical-planes: author plane A's own words into plane B instead. The
// planes then read the SAME at the fixture, a cross-plane clobber becomes
// undetectable, and row [2c] must say so.
const B_FIXTURE = PLANT === 'identical-planes' ? A_FIXTURE.slice() : Array(W).fill(seed.word);
{
  const path = join(WORKTREE, B_REL);
  const buf = readFileSync(path);
  for (let k = 0; k < W; k++) {
    for (const i of cellTiles(X + k, Y)) {
      buf[i * 2] = (B_FIXTURE[k] >> 8) & 0xff;
      buf[i * 2 + 1] = B_FIXTURE[k] & 0xff;
    }
  }
  writeFileSync(path, buf);
}

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
console.log(`    materialised fresh this run: ${PROVENANCE}`);
console.log(`    grid ${TILES_WIDE}x${TILES_WIDE} tiles = ${CELLS_WIDE}x${CELLS_HIGH} cells, derived from ${PLANE_WORDS} words/plane`);
console.log(`    section ${SECTION}, ${W}x${H} at (${X},${Y}) — DERIVED: first run of ${W} adjacent plane-A cells with real shape and no crossover`);
console.log(`    control cols ${CONTROL_X.join(',')}`);
console.log(`    plane A there (from the file): ${A_FIXTURE.map((w) => '0x' + w.toString(16)).join(' ')}`);
console.log(`    plane B AUTHORED there${PLANT === 'identical-planes' ? ' (PLANT=identical-planes: plane A\'s own words)' : ''}: `
  + `${B_FIXTURE.map((w) => '0x' + w.toString(16)).join(' ')}`
  + `${PLANT === 'identical-planes' ? '' : `  (plane B's commonest non-air word in this file: ${seed.cells} cell(s), ${seed.vocabulary} distinct)`}`);

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

  // THE SETUP'S OWN INDEX MATH, CHECKED THROUGH THE APP. The fixture was picked
  // — and plane B's half of it AUTHORED — by computing sub-tile offsets in this
  // file. If that stride were wrong the cells the app reads would not be the
  // cells the setup touched, every anti-vacuous row below would be reporting on
  // somewhere else, and nothing would say so. This is what says so.
  check('1c', 'the app reads back EXACTLY the words the setup put at these cells — the harness\'s own tile-index math is confirmed, not assumed',
    JSON.stringify(regionA.words) === JSON.stringify(A_FIXTURE)
    && JSON.stringify(regionB.words) === JSON.stringify(B_FIXTURE),
    `A app ${JSON.stringify(regionA.words)} vs file ${JSON.stringify(A_FIXTURE)}\n        `
    + `B app ${JSON.stringify(regionB.words)} vs file ${JSON.stringify(B_FIXTURE)}`);

  // ⚠ THE FIXTURE IS CHOSEN, NOT DEFAULTED. The first run of this harness used
  // (8,8), where every target word was 0 — air. Row 5 ("the low 14 bits are
  // identical") passed there for the wrong reason: there was no geometry to
  // lose, so a paint that clobbered shape would have passed it too. The cells
  // are now found by scanning for a run of adjacent cells whose sub-tiles are
  // ALL non-zero. That is what makes row 5 discriminate rather than merely
  // report — and it has to hold on BOTH planes, because row 5b is exactly as
  // vacuous over air as row 5a was.
  check('2b', 'ANTI-VACUOUS: plane A\'s target cells carry REAL geometry, so "geometry held" can actually fail',
    original.every((w) => (w & ~XOVER_BITS) !== 0),
    `words ${original.map((w) => '0x' + w.toString(16)).join(' ')}`);

  check('2bB', 'ANTI-VACUOUS: plane B\'s target cells carry REAL geometry too — over air, row [5b] could not fail either',
    regionB.words.every((w) => (w & ~XOVER_BITS) !== 0),
    `words ${regionB.words.map((w) => '0x' + w.toString(16)).join(' ')}`);

  check('2', 'BASELINE: every target cell starts with NO crossover (anchor §5: all cells are XOVER_NONE today)',
    original.every((w) => ((w >> XOVER_SHIFT) & XOVER_MASK) === 0)
    && regionB.words.every((w) => ((w >> XOVER_SHIFT) & XOVER_MASK) === 0),
    `A bits 15:14 = ${original.map((w) => (w >> XOVER_SHIFT) & XOVER_MASK).join(',')}; `
    + `B bits 15:14 = ${regionB.words.map((w) => (w >> XOVER_SHIFT) & XOVER_MASK).join(',')}`);

  // ⚠ DO NOT RELAX THIS ROW. It is an anti-vacuous guard, and a red here means
  // "I could not detect the thing I exist to detect" — the fixture is what has
  // to change, never the matcher. O48d repaired the fixture underneath it; the
  // falsification that keeps it honest is `PLANT=identical-planes`.
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

// KEEP THE FILE, DROP THE TREE (O48e). The last line naming a real .collattr.bin
// is the point of this harness — it is the artifact a bake would consume — but
// keeping the whole ~52 MB worktree to hold two files left one copy per run
// lying in /tmp forever. So the two painted planes are lifted into a small
// directory that survives, and the worktree goes.
//
// ⚠ THE NAMED FILE IS COPIED BEFORE THE TREE IS REMOVED, AND THE REMOVAL IS
// GATED ON THAT COPY EXISTING. A cleanup that deletes first and reports a path
// into the deleted tree would print a line that reads exactly like the old one
// and names nothing — the failure would be invisible in the output, which is
// the shape this lane has spent the night finding.
// ⚠ THE NAME MUST NOT MATCH THE WORKTREE GLOB. The throwaway trees are
// `aurora-crossover-paint-<random>`, so a sweep of `aurora-crossover-paint-*`
// — the obvious way to reclaim them, and what the overseer typed within a
// minute of this landing — would take the kept artifact with them. A name
// that shares the worktrees' prefix is a name that gets deleted by any
// correct cleanup of the worktrees.
const KEEP = join(tmpdir(), 'aurora-crossover-kept');
let kept = null;
try {
  mkdirSync(KEEP, { recursive: true });
  for (const rel of [A_REL, B_REL]) {
    cpSync(join(WORKTREE, rel), join(KEEP, basename(rel)));
  }
  const a = join(KEEP, basename(A_REL));
  kept = statSync(a).size > 0 ? a : null;
} catch (e) {
  console.log(`=== could not keep the painted file: ${e.message}`);
}

if (kept) {
  rmSync(WORKTREE, { recursive: true, force: true });
  console.log(`=== the file to carry into the bake: ${kept}`);
  console.log(`=== (its plane-B twin is beside it; the ${PROVENANCE} worktree has been removed)`);
} else {
  // Could not save it, so the tree STAYS — a named file that does not exist is
  // worse than the disk cost this change exists to remove.
  console.log(`=== the file to carry into the bake: ${join(WORKTREE, A_REL)}`);
  console.log(`=== KEPT THE WORKTREE because the copy failed: ${WORKTREE}`);
}
console.log(`=== that tree was made this run and is not reused: ${PROVENANCE}`);
process.exit(fail === 0 ? 0 : 1);
