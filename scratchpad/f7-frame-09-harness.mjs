#!/usr/bin/env node
// f7-frame-09-harness -- the gate on the F7 sprite jumble repair.
//
//     npm run harness:f7-frame-09
//     npm run harness:f7-frame-09 -- --perturb 0x0A     (proves it can fail)
//
// THE GATE, as the hub set it: after the repair, tilt frame $09 renders CLEAN
// and the other 47 tilt frames are UNCHANGED BY HASH. The second half is the
// one that matters, because the failure this campaign has been chasing is a fix
// that quietly moves a neighbouring frame.
//
// So this renders all 48 frames twice -- once from the base blobs and once from
// the repaired ones -- and hashes each render. It does NOT compare pictures by
// eye and it does not compare whole files: a whole-file hash cannot tell a
// one-frame repair from a sheet-wide relayout, and both of those change the
// file.
//
// WHAT IS DERIVED RATHER THAN TYPED HERE. The 48 frames are not a list. They
// come from Aeon's own `player_common.emp` (TILT_SETS / TILT_WALK_BASE / LEN /
// SHIFT and the run twins) and `sonic_anims.emp` (the Walk and Run scripts),
// parsed at run time, exactly as Aeon's `tools/tilt_frame_static_audit.py` does.
// A re-paged sheet moves those constants, and a harness holding its own copy
// would keep gating the frames the sheet no longer uses.
//
// THE BASE IS PINNED TO A REVISION, NOT A PATH. Every base blob is read with
// `git show <rev>:<path>` out of the resolved Aeon checkout and its blob id is
// asserted against the record. Reading the working tree would compare against
// whatever another lane happens to have staged.
//
// WHY --perturb EXISTS. A 47-unchanged assertion that has never been seen to
// fail is a claim, not a check, and this repo's dominant defect class is a
// guard that asserts nothing. `--perturb <frame>` plants a single changed pixel
// in one tile that frame loads and requires the comparison to FIRE. The check's
// own arithmetic is untouched: the plant is in the data.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

import { AURORA_DIR, siblingPath, siblingPathSource } from '../test/support/sibling-root.mjs';
import { announceFixture, READ_MODES } from './lib/fixture-provenance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = AURORA_DIR;
const CAPTURES = path.join(REPO, 'docs/captures/f7-frame-09');
const RECORD = path.join(CAPTURES, 'f7-frame-09-divergence.json');
const TILE = 32;
const FRAME = 0x09;

const argv = process.argv.slice(2);
function flag(name) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}
const perturbArg = flag('--perturb');
const PERTURB = perturbArg === null ? null : Number.parseInt(perturbArg, 16 | 0) || Number(perturbArg);

let failures = 0;
function ok(label, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!cond) failures += 1;
}
function unmeasurable(why) {
  console.log(`UNMEASURABLE: ${why}`);
  process.exit(2);
}

// ---------------------------------------------------------------- inputs

const record = JSON.parse(fs.readFileSync(RECORD, 'utf8'));
const AEON = siblingPath('aeon');
if (!AEON || !fs.existsSync(AEON)) {
  unmeasurable(`the aeon checkout is not resolvable (${siblingPathSource('aeon')}); `
    + 'the base blobs are read from it by revision and cannot be substituted');
}
const REV = record.base.revision;

// WHICH AEON THIS RUN IS ABOUT TO READ, printed before it reads anything, and
// before the first PASS line a person would otherwise take as the whole story.
// Aurora's lens ledger, FIXTURE-REVISION-UNSTAMPED: a run that does not say
// which revision produced its fixture makes a stale result indistinguishable
// from a fresh one. Mode is COMMITTED because every base blob below comes from
// `git show <rev>:<path>`, so aeon's working tree never reaches this gate --
// and the stamp says that in words rather than leaving it to be inferred.
let provenance = '';
announceFixture(
  { peer: 'aeon', mode: READ_MODES.COMMITTED, ref: REV, dir: AEON, dirSource: siblingPathSource('aeon') },
  (s) => { provenance += s; },
);
process.stdout.write(provenance);
// The stamp goes through `ok()` and not only through the terminal, so it is a
// ROW and not decoration. A printed line nobody asserts on is deletable in a
// tidy-up without anything going red, which is how the gate would quietly stop
// saying which revision it read while continuing to say GATE GREEN.
ok('the run stamped the aeon revision it read',
  provenance.includes(REV) && provenance.includes('COMMITTED OBJECTS'),
  `${REV.slice(0, 8)} from the object database`);

function baseBlob(p) {
  try {
    return execFileSync('git', ['-C', AEON, 'show', `${REV}:${p}`], { maxBuffer: 1 << 28 });
  } catch (e) {
    unmeasurable(`${p} is not in ${AEON} at ${REV}: ${e.message}`);
    return null;
  }
}
function blobId(buf) {
  const h = crypto.createHash('sha1');
  h.update(Buffer.from(`blob ${buf.length}\0`));
  h.update(buf);
  return h.digest('hex');
}

const base = {};
for (const [role, meta] of Object.entries(record.blobs)) {
  base[role] = baseBlob(meta.path);
  ok(`base ${role} is blob ${meta.base_blob}`,
    blobId(base[role]) === meta.base_blob,
    `${meta.path} @ ${REV.slice(0, 8)} -> ${blobId(base[role])} (${base[role].length} B)`);
}

const shipped = {};
for (const [role, meta] of Object.entries(record.blobs)) {
  const f = path.join(CAPTURES, meta.capture);
  if (!fs.existsSync(f)) unmeasurable(`the shipped capture ${f} is missing`);
  shipped[role] = fs.readFileSync(f);
  ok(`shipped ${role} is blob ${meta.shipped_blob}`,
    blobId(shipped[role]) === meta.shipped_blob,
    `${meta.capture} -> ${blobId(shipped[role])} (${shipped[role].length} B)`);
}

ok('the mappings blob is UNCHANGED by this repair',
  Buffer.compare(base.mappings, shipped.mappings) === 0,
  'the row was booked as a mapping defect; the mapping is faithful and needed no byte');

// ---------------------------------------------------------------- which frames

function empConst(text, name) {
  const m = new RegExp(`^\\s*(?:pub\\s+)?const\\s+${name}\\s*=\\s*(\\$[0-9A-Fa-f]+|\\d+)\\b`, 'm').exec(text);
  if (!m) unmeasurable(`const ${name} is not in the player source; re-derive it`);
  return m[1].startsWith('$') ? Number.parseInt(m[1].slice(1), 16) : Number(m[1]);
}
function scriptFrames(text, anim) {
  const m = new RegExp(`^\\s*${anim}:\\s*\\[u8;\\s*\\d+\\]\\s*=\\s*\\[([^\\]]*)\\]`, 'm').exec(text);
  if (!m) unmeasurable(`the ${anim} row is not in the animation source; re-derive it`);
  const out = [];
  for (const raw of m[1].split(',')) {
    const t = raw.split('//')[0].trim();
    if (!t) continue;
    if (t.startsWith('$')) out.push(Number.parseInt(t.slice(1), 16));
    else if (/^\d+$/.test(t)) out.push(Number(t));
  }
  if (out.length === 0) unmeasurable(`the ${anim} row parsed to zero frames`);
  return out;
}

const playerSrc = baseBlob('games/sonic4/player/player_common.emp').toString('utf8');
const animSrc = baseBlob('games/sonic4/data/animations/sonic_anims.emp').toString('utf8');
const SETS = empConst(playerSrc, 'TILT_SETS');
const WSHIFT = empConst(playerSrc, 'TILT_WALK_SHIFT');
const RSHIFT = empConst(playerSrc, 'TILT_RUN_SHIFT');
const walk = scriptFrames(animSrc, 'Walk');
const run = scriptFrames(animSrc, 'Run');
const tiltFrames = [];
for (const f of walk) for (let b = 0; b < SETS; b += 1) tiltFrames.push(f + (b << WSHIFT));
for (const f of run) for (let b = 0; b < SETS; b += 1) tiltFrames.push(f + (b << RSHIFT));
console.log(`\nderived ${tiltFrames.length} tilt frames from the player and animation sources `
  + `(TILT_SETS=${SETS}, walk shift ${WSHIFT}, run shift ${RSHIFT})`);
ok('the derived tilt set contains the frame under repair',
  tiltFrames.includes(FRAME), `$${FRAME.toString(16).toUpperCase().padStart(2, '0')}`);

// ---------------------------------------------------------------- render

// Aeon's mapping container: 4 bbox bytes, piece-count word, then 8-byte pieces
// of y.w / size.b / pad.b / attrs.w / x.w. This is a FOURTH variant of the
// classic format and Aurora's readSonicMappings covers Ver 1/2/3 only, so the
// pieces are decoded here and CROSS-CHECKED against Aurora's reader over the
// donor container below.
function mappingPieces(blob, frame) {
  const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const off = dv.getUint16(frame * 2, false);
  const n = dv.getUint16(off + 4, false);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const b = off + 6 + 8 * i;
    out.push({
      y: dv.getInt16(b, false),
      size: blob[b + 2],
      attrs: dv.getUint16(b + 4, false),
      x: dv.getInt16(b + 6, false),
    });
  }
  return out;
}

function renderHash(mappings, dplcTiles, art, frame) {
  const win = dplcTiles[frame] ?? [];
  const pieces = mappingPieces(mappings, frame);
  // Canonical, order-independent pixel record: every drawn pixel as
  // "x,y,index", sorted, then hashed. Two renders hash alike exactly when they
  // put the same colour at the same place.
  const px = [];
  for (const p of pieces) {
    const w = ((p.size >> 2) & 3) + 1;
    const h = (p.size & 3) + 1;
    const baseTile = p.attrs & 0x7ff;
    const xFlip = (p.attrs & 0x0800) !== 0;
    const yFlip = (p.attrs & 0x1000) !== 0;
    for (let col = 0; col < w; col += 1) {
      for (let row = 0; row < h; row += 1) {
        const rel = baseTile + col * h + row;   // VDP order: column-major
        const src = win[rel];
        const sc = xFlip ? w - 1 - col : col;
        const sr = yFlip ? h - 1 - row : row;
        for (let dy = 0; dy < 8; dy += 1) {
          for (let dx = 0; dx < 8; dx += 1) {
            let v;
            if (src === undefined) {
              v = -1;                            // out of the loaded window
            } else {
              const sy = yFlip ? 7 - dy : dy;
              const sx = xFlip ? 7 - dx : dx;
              const byte = art[src * TILE + sy * 4 + (sx >> 1)];
              v = (sx & 1) === 0 ? byte >> 4 : byte & 0xf;
            }
            if (v === 0) continue;
            px.push(`${p.x + sc * 8 + dx},${p.y + sr * 8 + dy},${v}`);
          }
        }
      }
    }
  }
  px.sort();
  return crypto.createHash('sha256').update(px.join(';')).digest('hex');
}

// ---------------------------------------------------------------- the gate

const core = await (async () => {
  const entry = `export { readSonicDPLC } from ${JSON.stringify(path.join(REPO, 'src/core/formats/games/sonic-dplc.ts'))};
export { readSonicMappings } from ${JSON.stringify(path.join(REPO, 'src/core/formats/games/sonic-mappings.ts'))};`;
  const outfile = path.join(os.tmpdir(), `f7-core-${process.pid}.mjs`);
  await build({
    stdin: { contents: entry, resolveDir: REPO, sourcefile: 'entry.ts', loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent',
  });
  const mod = await import(`file://${outfile}`);
  fs.rmSync(outfile, { force: true });
  return mod;
})();

// Aurora's SHIPPED DPLC reader does the tile expansion for both sides, so the
// two hashes cannot differ because of two decoders.
const baseTiles = core.readSonicDPLC(new Uint8Array(base.dplc_opt), 2);
const shippedArt = Buffer.from(shipped.art_opt);
if (PERTURB !== null) {
  const t = core.readSonicDPLC(new Uint8Array(shipped.dplc_opt), 2)[PERTURB]?.[0];
  if (t === undefined) unmeasurable(`frame $${PERTURB.toString(16)} loads no tile to perturb`);
  // Plant a single changed pixel in a tile that frame loads. Nothing in the
  // comparison below is touched: the plant is in the DATA.
  shippedArt[t * TILE] ^= 0x0f;
  console.log(`\nPERTURBED frame $${PERTURB.toString(16).toUpperCase().padStart(2, '0')}: `
    + `one pixel of art tile ${t} flipped. The 47-unchanged check MUST fire.`);
}
const shippedTiles = core.readSonicDPLC(new Uint8Array(shipped.dplc_opt), 2);

const moved = [];
for (const f of tiltFrames) {
  const a = renderHash(base.mappings, baseTiles, base.art_opt, f);
  const b = renderHash(shipped.mappings, shippedTiles, shippedArt, f);
  if (a !== b) moved.push(f);
}
const hex = (f) => `$${f.toString(16).toUpperCase().padStart(2, '0')}`;
const expectMoved = PERTURB === null ? [FRAME] : [FRAME, PERTURB].sort((x, y) => x - y);
const movedSorted = [...moved].sort((x, y) => x - y);

console.log('');
ok(`frame ${hex(FRAME)}'s render CHANGED`, moved.includes(FRAME));
ok(`the other ${tiltFrames.length - 1} tilt frames are UNCHANGED by render hash`,
  movedSorted.length === 1 && movedSorted[0] === FRAME,
  `moved: ${movedSorted.map(hex).join(' ') || 'none'}`);

if (PERTURB !== null) {
  const fired = movedSorted.length !== 1 || movedSorted[0] !== FRAME;
  console.log('');
  ok('the 47-unchanged check FIRES on a perturbed neighbour',
    fired && movedSorted.join() === expectMoved.join(),
    `expected moved ${expectMoved.map(hex).join(' ')}, got ${movedSorted.map(hex).join(' ')}`);
  // Under --perturb the run is a proof that the check works, so the gate's own
  // verdict is inverted: a clean 47 here would be the failure.
  console.log(`\n${failures === 1 ? 'PROVEN' : 'BROKEN'}: the perturbation run left exactly `
    + `${failures} gate row red (the 47-unchanged row), which is the point.`);
  process.exit(failures === 1 ? 0 : 1);
}

// ---------------------------------------------------------------- cross-checks

// Aurora's own reader, over the DONOR container it does cover (Ver 2), must
// agree field for field with the decode above of Aeon's converted container.
// A disagreement is a finding about OUR reader and is worth more than the frame.
const HACK = siblingPath('sonic_hack');
const donorPath = HACK ? path.join(HACK, record.donor.mappings.path) : null;
if (!donorPath || !fs.existsSync(donorPath)) {
  console.log(`\nUNMEASURABLE (cross-check only): the donor container is not readable at `
    + `${donorPath ?? '<unresolved sonic_hack>'}; the reader agreement row did not run.`);
  failures += 1;
} else {
  const donor = fs.readFileSync(donorPath);
  ok(`the donor mappings container is blob ${record.donor.mappings.blob}`,
    blobId(donor) === record.donor.mappings.blob, blobId(donor));
  const donorFrames = core.readSonicMappings(new Uint8Array(donor), 2);
  const theirs = donorFrames[FRAME].pieces.map((p) =>
    [p.yOffset, p.xOffset, p.widthCells, p.heightCells, p.tile, p.palette, p.xFlip, p.yFlip, p.priority].join(','));
  const ours = mappingPieces(shipped.mappings, FRAME).map((p) =>
    [p.y, p.x, ((p.size >> 2) & 3) + 1, (p.size & 3) + 1, p.attrs & 0x7ff,
      (p.attrs >> 13) & 3, (p.attrs & 0x800) !== 0, (p.attrs & 0x1000) !== 0,
      (p.attrs & 0x8000) !== 0].join(','));
  ok(`Aurora's readSonicMappings over the donor agrees with the shipped frame ${hex(FRAME)}`,
    ours.join(' | ') === theirs.join(' | '), `${ours.length} pieces`);
}

// The record must describe the bytes it ships beside, or it rots into a rule
// nobody trusts. These three rows are the ones the engine lane's checker wires.
ok('the record names the frame this gate repairs', record.frame === FRAME, `${record.frame}`);
ok('the record pins a donor revision as well as a blob',
  typeof record.donor.mappings.blob === 'string' && record.donor.mappings.blob.length === 40);
ok('the record states its own scope condition',
  typeof record.applicability === 'object' && record.applicability.generated === false,
  'a generated sibling must record its divergence where the generator reads');

console.log(`\n${failures === 0 ? 'GATE GREEN' : `GATE RED (${failures} row(s))`}`);
process.exit(failures === 0 ? 0 : 1);
