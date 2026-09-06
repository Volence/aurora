#!/usr/bin/env node
// HOW BADLY DOES A BARE CAMERA+PLAYER POKE TEAR, AND DOES IT SELF-HEAL?
//
// The aeon session's account: the tile cache latches its streaming DIRECTION
// and prefetch baselines from per-frame camera DELTAS, so a teleport-shaped
// jump hands it a huge spurious delta and mis-latches. Small jumps are fine.
// This is the client-side measurement of that failure — the one the
// `Warp_Req_*` mailbox exists to delete.
//
// MEASURING "TORN" WITHOUT SQUINTING AT A PNG. Comparing screenshots is no
// good: two paths to the same place run different frame counts, so sprites and
// animated tiles differ for reasons that are not the defect. Instead this
// reaches the SAME destination two ways and diffs the PLANE NAMETABLE:
//
//   Path A — one big poke straight to the destination.
//   Path B — the same distance in small steps (which aeon says is safe),
//            from the same checkpoint.
//
// For a given camera position the background nametable should be identical
// however you arrived. Every differing entry is a cell holding art that
// streaming got wrong. Animated tiles change tile PIXELS, not nametable
// entries, so they do not pollute the count.
//
// Row 0 is the anti-vacuous control: Path B against itself must diff to ZERO,
// or the comparison is measuring nondeterminism rather than tearing.
//
// THE WINDOW THIS COMPARES IS NOW DERIVED, NOT TYPED (rows R0 to R6).
//
// Until 2026-09-05 the plane A base was the literal `0xC000` with a comment
// saying "the absolute address does not matter to the comparison, only that
// both paths read the same window". That sentence was an ASSUMPTION and there
// was no route to check it: `emulator/read_vdp_registers` sat in the schema's
// BLOCKED set, which is what aurora filed as GN-1 in its 2026-08-22
// instrument-gaps review and what empyrean adopted as contract section 11.41
// (CR-R). With the method served, the address comes from register `$02` and the
// plane geometry from register `$10`, so:
//
//   - Rows R1 to R4 assert every derived value EQUALS the literal it replaces
//     for this ROM. That is what makes the change measurement neutral rather
//     than a silent adoption of a new number.
//   - Row R2H does the same for plane HEIGHT, which had no such row until
//     2026-09-06 and is the one axis of the geometry nothing asserted. It was
//     missed because it never was a literal here: it arrived already derived,
//     inside the byte count. A machine decoding 64x32 passed R1, R2, R3, R4,
//     R5 and R7 green over a read covering half the plane, which is this arc's
//     own defect coming back through the unwatched axis. See the block at
//     `WAS_PLANE_H`.
//   - Row R6 reads the registers at EVERY plane sample on BOTH paths and
//     asserts they agree. THIS WAS PREVIOUSLY UNFALSIFIABLE. If a warp had
//     moved plane A's base or resized the plane, the old code would have
//     compared two DIFFERENT windows of VRAM and reported the difference as
//     tearing, and nothing in this harness or anywhere else could have caught
//     it. The comparison's central premise is now a row.
//   - Row R0 records why the read happens after the 600 frame boot and not
//     before it: the register file is game state, and before the game writes
//     it every register reads `0x00`, which decodes plane A to `0x0000`.
//
// The peek does not perturb what is measured: contract section 8 item 29 makes
// `read_vdp_registers` a peek that must not move the machine, and row 0's
// self-diff staying at zero with a register read now inside every sample is
// this harness's own evidence of that.
//
// "WHOLE-PLANE" NOW MEANS THE WHOLE PLANE (rows R2, R2H, R5 and R7), AND THE
// OFF-VIEW FLOOR IS MEASURED, NOT CITED (rows F1 and F2).
//
// Two things changed on 2026-09-05, both because a number in here could not be
// traced to anything:
//
//   - The plane read was one 0x1000 byte call against a plane the registers
//     say is 0x2000 bytes, so the metric named "whole-plane" covered plane rows
//     0 to 31 of 64. The literal sat exactly on `emulator/read_vram`'s 4096
//     byte ceiling. It is now as many calls as the plane needs, with the count
//     derived from the decoded plane size and from `initialize.limits`
//     `maxReadLen` off the wire. Row R7 asserts the chunks tile it exactly
//     once, checked against the addresses the SERVER echoed; row R5 asserts
//     the server DELIVERED every byte of it, checked against the byte counts
//     the server actually returned and the lengths it declared.
//   - `OFF_VIEW_FLOOR` was the constant 26 under a comment claiming it had been
//     stated before the run. No one could produce that statement. It is now
//     measured in every run as the largest whole-plane disagreement between the
//     reference walk and the five alternate walks in `FLOOR_STEPS`, counting
//     only the ones that pass F1's correctness premise, with row F1 asserting
//     those walks are correct and row F2 asserting the floor is clear of the
//     tear. (This said "from two correct walks", which was the phrasing of the
//     deleted aeon citation and never described the code: `FLOOR_STEPS` has had
//     five entries since this block landed.)
//
// Doubling the read changes what `diffAll`, row 6 and row 7 report, on purpose.
//
// RED FIRST, PER CLAUSE, all against commit 451db006 (2026-09-05). The two
// clauses are independent instruments and each poison leaves the other green,
// which is what stops "everything went red" from being mistaken for proof that
// the clause under test is live:
//
//   P1, poisoning the READ (`PLANE_BYTES` halved, the old defect restored):
//     R5 RED. R7 stayed GREEN and correctly so, because one chunk does tile
//     4096 bytes exactly once - R7 checks the walk, R5 checks the coverage, and
//     they are different questions. Every walk row (0, 1, 2, 3, F1, F2) green.
//   P2, poisoning the WALK (the alternate routes made far POKES instead of
//     walks): F1 RED naming all five routes as torn on screen, F2 RED with no
//     floor left to measure, row 7 REFUSED rather than passed. R5 and R7 green.
//
// P1's RESULT IS WITHDRAWN, retroactively, on 2026-09-06. It is reported
// accurately above and it proved nothing. P1 edited `PLANE_BYTES`, which is
// the quantity the old R5 was built out of, and the old R5's three conjuncts
// were an identity, a second identity, and a comparison true for every legal
// plane height. So it could only ever redden under a source mutation, and P1
// was one. A poison IS a source mutation by definition, which is why "the
// poison went red" cannot establish that a row has a production failure mode
// at all. The row was vacuous in production the whole time it was green.
//
// RED FIRST FOR THE 2026-09-06 PAIR, against commit 20d5cbcd on branch
// parcel/plane-height-and-r5:
//
//   P3, poisoning the DECODE (`planeH` forced to 32, the 64x32 machine): R2H
//     RED and correct, naming the height and saying every byte count below is
//     derived from it. R1, R2, R3, R4 and R7 green. THE OLD R5 WAS GREEN IN
//     THAT RUN, under the label "the read covers the WHOLE plane, not a prefix
//     of it", over a read covering plane rows 0 to 31 of 64. That run is the
//     production evidence for both defects at once. Row 7 also reddened, which
//     is a finding rather than noise: the off-view floor F1 measures collapsed
//     from 219 to 0 because every disagreement between correct walks lives in
//     the half of the plane the poisoned read could not see.
//   P4, poisoning the ADVERTISED CEILING (`limits.maxReadLen` overwritten to
//     8192 in the handshake, on a server whose real cap is 4096): R5 RED,
//     reading "0xC000 asked 8192 REFUSED (`len` = 8192 is outside 1..=4096)",
//     which is the SERVER'S OWN refusal text and not a fabricated one. The run
//     then aborted on R5's throw, which is what exercises the abort. This is
//     the production shape, not a contrived one: the call count here is
//     derived from a number the server advertises, and nothing anywhere made
//     the server prove it honours it.
//   P5, poisoning the TRANSPORT (a shim truncating the second read_vram reply
//     to half its bytes while leaving its declared `len` at 4096, the "honours
//     less than it declares" shape): R5 RED at "0xD000 asked 4096 got 2048
//     declared 4096", 6144 of 8192 bytes. R7 GREEN in the same run. R7 sums
//     the lengths this file ASKED for, so it is structurally blind to a short
//     delivery; R5 sums what the server RETURNED. That pair is the
//     demonstration that R5 catches something no other row here can.
//     R5's ABORT (not its assertion) was suppressed for that run so the run
//     would reach R7; P4 is what exercises the abort. And row 0 passed at zero
//     on a 6144 byte sample against an 8192 byte one, so `diffWords` narrows
//     to the shorter buffer without saying so - which is why R5 aborts rather
//     than merely reporting.
//
// AND THE HARDCODE THAT WOULD LOOK RIGHT STILL FAILS. Note first that at this
// file's own settings a frozen `OFF_VIEW_FLOOR = 26` passes row 7 by a margin
// of exactly zero: the mailbox's whole-plane diff is 26. So the canary gives
// the derivation an input whose true answer differs from this repo's - the
// reference route changed from 64px steps to 128px, which rows 0, 1, 6 and F1
// all confirm is still a CORRECT walk with a clean mailbox. The derived floor
// moves to 250 and row 7 passes on a mailbox diff of 245. Frozen at 26, the
// same run turns row 7 RED on a mailbox every other row calls clean. A floor
// that cannot move cannot be right for more than one pair of routes.
//
// Usage: node scratchpad/warp-tearing-harness.mjs   (VERBOSE=1 for server log)

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import * as esbuild from 'esbuild';

const ROOT = AURORA_DIR;
const SERVER = siblingPathOrUnresolved('oracle', 'target/release/oracle-aether');
// The mailbox is DEBUG-shape only — Warp_Req_* are absent from release listings.
const ROM = siblingPathOrUnresolved('aeon', 's4.debug.bin');
const SOCK = join(tmpdir(), `aur-warp-${process.pid}.sock`);
const SHOTS = join(ROOT, 'scratchpad/shots-warp-tearing');
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok });
  if (!ok) fails.push(id);
}
function note(label, detail) { console.log(`NOTE  ${label}\n        ${detail}`); }

async function loadClient(outDir) {
  const out = join(outDir, 'client.mjs');
  await esbuild.build({
    entryPoints: [join(ROOT, 'src/main/aether/client.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
  });
  return import(out);
}

const hx = (n) => '0x' + (n >>> 0).toString(16).toUpperCase();
const hx8 = (n) => '0x' + (n & 0xff).toString(16).toUpperCase().padStart(2, '0');

// ═══════════════════════════════════════════════════════════════════════════
// DECODING THE VDP GEOMETRY REGISTERS
// ═══════════════════════════════════════════════════════════════════════════
//
// WHERE THIS LAYOUT COMES FROM. Not from memory and not from a web search: a
// wrong shift here silently moves the window this harness compares, and a
// harness that reads the wrong REGION reports a clean plane forever. (This
// sentence said "the wrong 4 KiB" until 2026-09-05, when the read grew from
// one 0x1000 call to the whole plane. The geometry the cross-check below
// records for this ROM, reg $10 = $11, is HSZ 1 and VSZ 1 by the table under
// it, so 64x64 cells = 0x2000 bytes, which that same cross-check calls 8 KiB:
// the size in this sentence had become half the region it names and disagreed
// with its own file. The hazard never depended on the size, so the size is
// dropped rather than doubled.)
//
// PRIMARY SOURCE: oracle's render recon RR3, "Plane / window nametable bases +
// plane size", in oracle's `docs/2026-07-16-vdp-render-recon.md`. Its own
// stated evidence is Plutiedev's VDP register reference, and it is the same
// expression oracle's renderer FETCHES THROUGH, in
// `crates/oracle-core/src/render.rs` (`plane_a_base`, `plane_size`,
// `render_h40`). That last point is what makes it the right citation rather
// than merely a correct one: the address this harness hands to
// `emulator/read_vram` has to be the address the machine under measurement is
// actually drawing from, and oracle IS that machine.
//
// CROSS-CHECKED against two independent producers of the same numbers, so the
// decode does not rest on one document:
//   - aeon's own boot register table, `engine/system/boot_data.emp`
//     (`BootData_VDPRegs`), writes reg $10 = $11 and comments it "64x64 scroll
//     planes"; it also places plane B at $E000 and notes that plane B then
//     "spans $E000-$FFFF", which is 8 KiB and fits only a 64x64 plane.
//   - stock Sonic 2, `s2disasm/s2.asm`, sets reg $02 as
//     `$8200|(VRAM_Plane_A_Name_Table/$400)`, i.e. the register value is
//     base / $400. For $C000 that is $30, which is the value this ROM produces.
//
// THE BIT LAYOUTS USED BELOW, register by register:
//
//   $01 bit 3 (M2)       1 = V30 (30 cells tall), 0 = V28 (28 cells tall)
//   $02 bits 5..3        SA15..SA13: plane A nametable base, bits 15..13
//   $0C bit 0 (RS0)      both RS0 and RS1 set = H40 (40 cells wide),
//   $0C bit 7 (RS1)        otherwise H32 (32 cells wide)
//   $10 bits 1..0 (HSZ)  plane width in cells:  0 -> 32, 1 -> 64, 3 -> 128
//   $10 bits 5..4 (VSZ)  plane height in cells: 0 -> 32, 1 -> 64, 3 -> 128
//
// Size code 2 (`0b10`) is in no permitted source. oracle's core clamps it to 64
// deterministically and flags the clamp; this harness does NOT clamp, because a
// clamped guess here would report a plane geometry no document backs and the
// row consuming it would go green on an invention. It returns null and the row
// fails loudly instead.
const planeSizeCells = (bits) => ({ 0: 32, 1: 64, 3: 128 })[bits & 0x03] ?? null;

function decodeGeometry(regs) {
  const r01 = regs[0x01], r02 = regs[0x02], r0C = regs[0x0c], r10 = regs[0x10];
  return {
    planeA: (r02 & 0x38) << 10,
    planeW: planeSizeCells(r10),
    planeH: planeSizeCells(r10 >> 4),
    h40: (r0C & 0x81) === 0x81,
    v30: (r01 & 0x08) !== 0,
    raw: { r01, r02, r0C, r10 },
  };
}

/** Everything row R6 compares. Two samples with equal keys read the same window. */
const geomKey = (g) =>
  `planeA=${hx(g.planeA)} plane=${g.planeW}x${g.planeH}cells h40=${g.h40} v30=${g.v30} ` +
  `[regs $01=${hx8(g.raw.r01)} $02=${hx8(g.raw.r02)} $0C=${hx8(g.raw.r0C)} $10=${hx8(g.raw.r10)}]`;

async function main() {
  const workDir = mkdtempSync(join(tmpdir(), 'aurora-warp-'));
  let child = null, client = null;
  try {
    const { AetherClient } = await loadClient(workDir);
    child = spawn(SERVER, [ROM], {
      env: { ...process.env, ORACLE_SOCKET: SOCK },
      stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    let log = '';
    child.stdout.on('data', (d) => { log += d; if (process.env.VERBOSE) process.stdout.write(`[srv] ${d}`); });
    child.stderr.on('data', (d) => { log += d; if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });
    for (let i = 0; i < 60 && !log.includes('listening on'); i++) await sleep(200);

    client = new AetherClient({ connect: () => net.connect(SOCK), socketPath: SOCK });
    await client.connect();

    const call = (m, p) => client.call(m, p);
    const rd = async (addr, len) => {
      const r = await call('emulator/read_memory', { addr: hx(addr), len });
      return Buffer.from(r.bytes.replace(/^0x/i, ''), 'hex');
    };
    const wr = (addr, bytes) =>
      call('emulator/write_memory', { addr: hx(addr), bytes: '0x' + Buffer.from(bytes).toString('hex') });
    const u16 = (b) => (b[0] << 8) | b[1];
    const be16 = (v) => Uint8Array.of((v >> 8) & 0xff, v & 0xff);
    const be32 = (v) => Uint8Array.of((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);

    const camX = await client.resolve('Camera_X');
    const camY = await client.resolve('Camera_Y');
    const player = await client.resolve('Player_1');
    const prevCamX = await client.resolve('Cache_Prev_Cam_X');
    const prevCamRow = await client.resolve('Cache_Prev_Cam_Row');

    /**
     * The VDP register file, as 24 numbers. LOUD ON UNMEASURABLE: every shape
     * violation throws rather than falling back to a literal, because a
     * harness that quietly reverts to `0xC000` when the method is missing is
     * exactly the instrument this row exists to replace.
     */
    const readVdpRegs = async () => {
      const r = await call('emulator/read_vdp_registers', {});
      const raw = r?.raw;
      if (!Array.isArray(raw) || raw.length !== 24) {
        throw new Error(
          `emulator/read_vdp_registers must return exactly 24 index ordered entries ` +
          `(contract section 6, amended by 11.41); got ${JSON.stringify(raw)}`);
      }
      return raw.map((s, i) => {
        if (typeof s !== 'string' || !/^0x[0-9a-f]{2}$/i.test(s)) {
          throw new Error(`register $${i.toString(16).padStart(2, '0')} is not a two hex digit ` +
            `0x.. string: ${JSON.stringify(s)}`);
        }
        return parseInt(s, 16);
      });
    };

    await call('emulator/pause', {});
    // BEFORE the boot, on purpose: row R0 needs the untouched register file.
    let coldGeom = null;
    try {
      coldGeom = decodeGeometry(await readVdpRegs());
    } catch (e) {
      check('R0', 'the VDP register file is readable at all', false,
        `emulator/read_vdp_registers did not answer usably, so nothing below can be derived ` +
        `from it: ${e?.message ?? e}`);
      throw e;
    }
    await call('emulator/run_frames', { frames: 600 });   // boot into a level

    const startX = u16(await rd(camX, 2));
    const startY = u16(await rd(camY, 2));
    check('setup', 'the game is in a level with a live camera',
      Number.isFinite(startX), `Camera=(${startX},${startY}) Player_1=${hx(player)}`);

    const cp = (await call('emulator/checkpoint', { label: 'pre-warp' })).id;
    note('checkpoint', `id=${cp} — both paths start from exactly this machine`);

    // ── PLANE A, DERIVED FROM THE REGISTERS ────────────────────────────────
    //
    // Read AFTER the 600 frame boot, because the registers are game state: the
    // game writes them out of its own table on the way into a level, and a read
    // before that decodes a plane A base of 0x0000. Row R0 asserts exactly that
    // difference so the ordering requirement has an artifact rather than a
    // comment.
    const bootRegs = await readVdpRegs();
    const geom = decodeGeometry(bootRegs);
    note('VDP registers after boot, raw, index ordered $00 to $17',
      `${bootRegs.map((v) => hx8(v)).join(' ')}\n        ${geomKey(geom)}`);

    check('R0', 'the register file is GAME state, so the derivation reads it after the boot',
      coldGeom.planeA !== geom.planeA,
      `before the 600 boot frames plane A decoded to ${hx(coldGeom.planeA)} ` +
      `(reg $02=${hx8(coldGeom.raw.r02)}); after them it decodes to ${hx(geom.planeA)} ` +
      `(reg $02=${hx8(geom.raw.r02)}). Reading before the boot would have aimed this harness ` +
      `at VRAM ${hx(coldGeom.planeA)}.`);

    // The literals these rows replace, kept by name so the equality being
    // asserted is legible rather than inlined into the message.
    //
    // WAS_PLANE_H IS NOT LIKE ITS FOUR SIBLINGS AND THE NAME SHOULD NOT HIDE
    // THAT. The other four each pin a value that used to be a literal in this
    // file. Plane HEIGHT never was one: it arrived on 2026-09-05 already
    // derived, inside `PLANE_BYTES = planeW * planeH * 2`, and NOTHING
    // ASSERTED IT. That gap is this arc's own defect with the axis swapped. A
    // machine whose reg $10 decoded 64x32 would give PLANE_BYTES = 4096 and
    // 32 rows, and R1, R2, R3, R4, R5 and R7 would every one of them pass over
    // a read covering HALF the plane, which is exactly the state this arc
    // existed to end. So 64 is pinned here the way the stride is, and R2H is
    // the row that pins it.
    const WAS_PLANE_A = 0xC000, WAS_PLANE_W = 64, WAS_PLANE_H = 64, WAS_VIEW_W = 40, WAS_VIEW_H = 28;

    const PLANE_A = geom.planeA;
    check('R1', 'plane A base derived from register $02 equals the address this harness read',
      PLANE_A === WAS_PLANE_A,
      `reg $02=${hx8(geom.raw.r02)}, so (r02 & 0x38) << 10 = ${hx(PLANE_A)}; ` +
      `the literal it replaces was ${hx(WAS_PLANE_A)}` +
      (PLANE_A === WAS_PLANE_A ? '' : '. THEY DIFFER: this harness has not been reading plane A.'));

    const PLANE_W = geom.planeW;
    check('R2', 'plane width in cells derived from register $10 equals the row stride used here',
      PLANE_W === WAS_PLANE_W,
      geom.planeW === null
        ? `reg $10=${hx8(geom.raw.r10)} has HSZ code 2, which is in no permitted source; ` +
          `no width is derivable and none is guessed`
        : `reg $10=${hx8(geom.raw.r10)}, so HSZ=${geom.raw.r10 & 3} -> ${PLANE_W} cells wide ` +
          `and VSZ=${(geom.raw.r10 >> 4) & 3} -> ${geom.planeH} cells tall; ` +
          `the stride literal it replaces was ${WAS_PLANE_W}`);

    // R2H is a NEUTRALITY row, the same kind as R1 to R4: it says the value
    // this run derived is the value this ROM has always had, so nothing about
    // what the harness measures moved when the derivation replaced the typing.
    // It is NOT a production-detection row and cannot be made into one, because
    // there is no second, independent producer of the plane height to check the
    // registers against. Its only route to red is a machine that really does
    // decode a different height, or a mutation of the decode. That is the
    // point: the previous state of this file was that such a machine reddened
    // NOTHING and quietly halved the plane.
    const PLANE_H = geom.planeH;
    check('R2H', 'plane height in cells derived from register $10 equals the plane depth read here',
      PLANE_H === WAS_PLANE_H,
      geom.planeH === null
        ? `reg $10=${hx8(geom.raw.r10)} has VSZ code 2, which is in no permitted source; ` +
          `no height is derivable and none is guessed`
        : `reg $10=${hx8(geom.raw.r10)}, so VSZ=${(geom.raw.r10 >> 4) & 3} -> ${PLANE_H} cells tall; ` +
          `the pinned height for this ROM is ${WAS_PLANE_H}, and the whole plane read below is ` +
          `${geom.planeW} x ${PLANE_H} x 2 bytes` +
          (PLANE_H === WAS_PLANE_H
            ? ''
            : `. THEY DIFFER: every byte count below is derived from this height, so the read ` +
              `this harness calls the whole plane covers ${PLANE_H} rows, not ${WAS_PLANE_H}.`));

    const VIEW_W = geom.h40 ? 40 : 32;
    check('R3', 'view width in cells derived from register $0C equals the sample window width',
      VIEW_W === WAS_VIEW_W,
      `reg $0C=${hx8(geom.raw.r0C)}, RS0 and RS1 ${geom.h40 ? 'both set, so H40' : 'not both set, so H32'} ` +
      `-> ${VIEW_W} cells; the literal it replaces was ${WAS_VIEW_W}`);

    // V28 vs V30 is derived and then CHECKED AGAINST THE RENDERER, not merely
    // decoded. oracle's core renders 224 lines unconditionally and says so
    // (`crates/oracle-core/src/render.rs`, `active_display`: "Height is 224
    // unconditionally, which is a statement about this core rather than about
    // the chip"). So on a machine with M2 set, the register and the renderer
    // would disagree and there would be no honest number to sample with. That
    // is a red row, never a silently adopted 30.
    const VIEW_H = geom.v30 ? 30 : 28;
    check('R4', 'view height derived from register $01 equals the sample window height',
      VIEW_H === WAS_VIEW_H && !geom.v30,
      `reg $01=${hx8(geom.raw.r01)}, M2 (bit 3) ${geom.v30 ? 'SET, so V30' : 'clear, so V28'} ` +
      `-> ${VIEW_H} cells; the literal it replaces was ${WAS_VIEW_H}` +
      (geom.v30
        ? '. M2 is set, but oracle renders 224 lines unconditionally, so the register and the ' +
          'renderer disagree and no sample height here is trustworthy.'
        : ''));

    // ── THE READ WINDOW, WHICH IS NOW THE WHOLE PLANE ──────────────────────
    //
    // Until 2026-09-05 this was `const PLANE_LEN = 0x1000`, and the metric
    // built on it was called "whole-plane". The derived plane is
    // planeW x planeH cells = planeW*planeH*2 bytes, which for this ROM is
    // 0x2000 — so the name covered HALF of it, plane rows 0 to 31 of 64.
    //
    // That literal was not a typo. It sat exactly on the read ceiling:
    // `emulator/read_vram` and its non-deprecated successor `emulator/read`
    // both cap `len` at 4096 (protocol.md section 6, the VRAM/CRAM table and
    // the memory table respectively). One call can never return more.
    //
    // The fix is to issue as many calls as the plane needs, and the CALL COUNT
    // IS DERIVED — from the plane size decoded above and from the ceiling this
    // server advertises, never from an arithmetic constant typed here. A plane
    // of a different size, or a server with a different ceiling, therefore
    // changes the call count with no edit TO THIS READ. Not to this file: R1 to
    // R4 assert the derived values equal the WAS_ literals of this ROM, so a
    // genuinely different plane reddens R2 and those four rows have to be
    // retired deliberately. That is the intended behaviour, not a portability
    // claim, and this sentence used to promise the wider one.
    //
    // THE CEILING IS A MACHINE-READABLE FACT, so it is read rather than
    // retyped. protocol.md section 2.1 makes `limits` a REQUIRED top-level key
    // of the `initialize` result (registered 2026-08-15, section 11.5), and
    // `limits.maxReadLen` is defined there as "the largest `len` this server
    // will accept on a read-shaped op". The contract's own stated reason for
    // registering it is exactly this trap: section 6's parenthetical ceilings
    // "describe the catalog, not this server", and "a client has no other way
    // to discover that number, and discovering it by being refused is
    // discovering it too late". So the number below comes off the wire.
    //
    // LOUD ON UNMEASURABLE. A server that does not advertise it throws here
    // rather than falling back to 4096, because a silent fallback is how the
    // number got typed into this file in the first place.
    const advertised = client.handshake?.limits;
    const MAX_READ_LEN = advertised?.maxReadLen;
    if (!Number.isInteger(MAX_READ_LEN) || MAX_READ_LEN <= 0) {
      throw new Error(
        `initialize.limits.maxReadLen is REQUIRED (protocol.md section 2.1, registered 11.5) and is ` +
        `what the plane read's call count is derived from; this server advertised ` +
        `limits=${JSON.stringify(advertised)}. No ceiling is assumed and 4096 is not retyped.`);
    }
    if (geom.planeW === null || geom.planeH === null) {
      throw new Error(
        `plane geometry is not derivable from reg $10=${hx8(geom.raw.r10)}, so the plane's byte ` +
        `length cannot be derived and no read length is guessed. See row R2.`);
    }
    const PLANE_BYTES = geom.planeW * geom.planeH * 2;
    const PLANE_LEN = PLANE_BYTES;                       // the read IS the plane now
    const READ_CALLS = Math.ceil(PLANE_BYTES / MAX_READ_LEN);
    const ROWS_READ = PLANE_LEN / (geom.planeW * 2);
    note('read window coverage, which IS the whole plane',
      `the derived plane is ${geom.planeW}x${geom.planeH} cells = ${hx(PLANE_BYTES)} bytes; this ` +
      `server advertises limits.maxReadLen=${MAX_READ_LEN}, so each sample is ` +
      `ceil(${PLANE_BYTES}/${MAX_READ_LEN}) = ${READ_CALLS} calls from ${hx(PLANE_A)}: plane rows 0 ` +
      `to ${ROWS_READ - 1} of ${geom.planeH}. Both numbers are read, not typed.`);

    // WHERE ROW R5 WENT, AND WHY IT IS NOT HERE ANY MORE.
    //
    // Until 2026-09-06 a row R5 stood at this point saying "the read covers the
    // WHOLE plane, not a prefix of it", testing
    // `PLANE_LEN === PLANE_BYTES && ROWS_READ === geom.planeH && ROWS_READ >= VIEW_H`.
    // IT COULD NOT FAIL ON ANY GEOMETRY IT ACCEPTED. `PLANE_LEN` is bound to
    // `PLANE_BYTES` one line up, so the first conjunct is an identity;
    // `ROWS_READ` is `PLANE_LEN / (planeW * 2)`, which reduces to `planeH`, so
    // the second is `planeH === planeH`; and `planeH` is one of 32, 64, 128
    // while `VIEW_H` is 28 or 30, so the third is true for every legal plane.
    // Three conjuncts, no route to red except editing the arithmetic above it.
    //
    // ITS POISON PASSED FOR EXACTLY THAT REASON. P1 halved `PLANE_BYTES` and
    // reddened R5, which looked like a live row; a poison IS a source mutation
    // by definition, so a poison going red establishes only that the row reads
    // the thing the poison edited. It says nothing about whether any RUN can
    // redden it. This one could not.
    //
    // And it was in the wrong place to ever be a production row: it stood
    // BEFORE the first plane sample, so it could not have observed the server
    // even if it had wanted to. R5 now sits next to R7, after the first sample,
    // and asserts what the SERVER DELIVERED against what was derived here.
    //
    // The claim the old row was named for is not lost, it is redistributed onto
    // rows that can fail:
    //   - that the derived plane is the right SIZE   -> R2 (width) and R2H (height)
    //   - that the read WALKS that whole address range -> R7, against echoed addresses
    //   - that the server DELIVERED every byte of it   -> R5, below
    // `ROWS_READ` survives only as a reporting quantity for the note above.

    /**
     * Every plane sample is STAMPED with the geometry it was read under, and
     * row R6 asserts every stamp agrees. `tag` names the path and the sample
     * point, so a divergence says WHICH one moved.
     *
     * The sample is assembled from `READ_CALLS` chunks. Each chunk's REQUESTED
     * address is recorded, and so is the address the server ECHOED back, so row
     * R7 can check the walk over the plane against the server's own account of
     * where it read rather than against this loop's belief about itself. A
     * chunk loop that failed to advance its address would return a plausible
     * buffer of exactly the right length, and every diff built on it would be
     * comparing the first half of the plane with itself.
     *
     * WHAT EACH CHUNK RECORDS, AND WHY IT IS A RECORD RATHER THAN A THROW.
     * `want` is what this loop ASKED FOR; `got` is how many bytes the server
     * actually handed back; `echoedLen` is the length the server DECLARED in
     * the same reply; `error` is the refusal text if the call did not answer at
     * all. Those are the server's behaviour, and row R5 is the reader of them.
     *
     * Until 2026-09-06 a short chunk threw right here. That throw was correct
     * about the hazard and wrong about where the evidence should land: it
     * aborted the run with a stack trace, so a server delivering less than it
     * declares produced NO ROW AT ALL, and this harness's tally could never say
     * whether that property had been checked. R5 now says it, in the tally, on
     * every run. The abort still happens (R5 throws once it has reported), so
     * nothing downstream ever diffs a malformed buffer; it just happens one
     * line later, with the finding written down.
     *
     * A chunk that ERRORS is recorded and the loop continues, on purpose: the
     * full account of which chunks failed is worth more than the first one.
     * Samples taken after R5 has reported keep the hard throw, because by then
     * the property has an artifact and a mid-run change is a different fault.
     */
    const geomStamps = [];
    let lastChunks = null;
    let r5Reported = false;
    const plane = async (tag) => {
      geomStamps.push({ tag, key: geomKey(decodeGeometry(await readVdpRegs())) });
      const chunks = [];
      const parts = [];
      for (let off = 0; off < PLANE_BYTES; off += MAX_READ_LEN) {
        const want = Math.min(MAX_READ_LEN, PLANE_BYTES - off);
        const at = PLANE_A + off;
        let r = null, error = null;
        try {
          r = await call('emulator/read_vram', { addr: hx(at), len: want });
        } catch (e) {
          error = String(e?.message ?? e);
        }
        const buf = error === null
          ? Buffer.from(String(r.bytes).replace(/^0x/i, ''), 'hex')
          : Buffer.alloc(0);
        const echoed = typeof r?.addr === 'string' ? parseInt(r.addr, 16) : r?.addr;
        chunks.push({ want, at, echoed, echoedLen: r?.len, got: buf.length, error });
        parts.push(buf);
        if (r5Reported && (error !== null || buf.length !== want)) {
          throw new Error(
            `emulator/read_vram at ${hx(at)} asked for ${want} bytes and ` +
            `${error !== null ? `REFUSED: ${error}` : `returned ${buf.length}`}; ` +
            `a short chunk would make this sample a differently sized buffer than its peers and ` +
            `every diff against it silently shorter. Row R5 reported this property green on the ` +
            `first sample, so this is a change mid-run.`);
        }
      }
      const out = Buffer.concat(parts);
      lastChunks = chunks;
      if (r5Reported && out.length !== PLANE_BYTES) {
        throw new Error(`assembled ${out.length} bytes for a ${PLANE_BYTES} byte plane`);
      }
      return out;
    };

    // VISIBLE WINDOW ONLY, adopted from aeon's gate, whose stated reason is
    // that the full streaming ring is legitimately path-dependent OUTSIDE the
    // view. A whole-plane diff therefore has a false-positive floor, which is
    // fine for "is it torn?" (the tearing dwarfs it) and fatal for "is it
    // clean?", which is exactly what this run has to answer about the mailbox.
    // That floor is MEASURED further down (rows F1 and F2) rather than carried
    // as a number, and row 7 compares against what this run measured.
    //
    // Plane width and the visible window are derived above from registers $10,
    // $0C and $01, and rows R2 to R4 assert they equal the 64 / 40 / 28 that
    // used to be typed here.
    const diffWords = (a, b) => {
      let n = 0;
      for (let row = 0; row < VIEW_H; row++) {
        for (let col = 0; col < VIEW_W; col++) {
          const i = (row * PLANE_W + col) * 2;
          if (i + 1 >= Math.min(a.length, b.length)) continue;
          if (a[i] !== b[i] || a[i + 1] !== b[i + 1]) n++;
        }
      }
      return n;
    };
    const VIEW_WORDS = VIEW_W * VIEW_H;

    /**
     * The whole plane, as derived from the registers, reported ALONGSIDE the
     * window rather than instead of it.
     *
     * CAVEAT ON THE WINDOW METRIC, stated because it changes how much a zero is
     * worth: `diffWords` samples the nametable's first 40x28 cells, which is
     * the view ONLY when plane A's scroll is at the origin. Under scroll the
     * true window is elsewhere in the ring, so the window number is a fixed
     * SAMPLE of the plane, not the view. That makes it a fine tearing detector
     * (tearing is broad) and weak evidence of cleanliness — hence this.
     */
    const diffAll = (a, b) => {
      let n = 0;
      for (let i = 0; i + 1 < Math.min(a.length, b.length); i += 2) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1]) n++;
      }
      return n;
    };
    const ALL_WORDS = PLANE_LEN / 2;
    const shot = async (name) => {
      // `emulator/screenshot` WRITES A FILE and returns its `path`; it does not
      // return image bytes. This read `r.png ?? r.data ?? r.image` until
      // 2026-08-22 — three guesses at fields the server has never had, so every
      // call silently captured nothing while the harness reported clean. `bytes`
      // is a byte COUNT, not the image, and is the field that makes the mistake
      // look plausible. Ask for the destination explicitly rather than letting
      // the server default it into a tempdir we would then have to guess at.
      const dest = join(SHOTS, `${name}.png`);
      const r = await call('emulator/screenshot', { path: dest });
      if (!r || r.path !== dest) {
        throw new Error(`screenshot did not write ${dest}: ${JSON.stringify(r)}`);
      }
      if (!existsSync(dest)) throw new Error(`screenshot reported ${dest} but no file is there`);
    };

    /** Put camera + player at (x,y) with zeroed velocities, the bare-poke way. */
    const poke = async (x, y) => {
      await wr(camX, be16(x));
      await wr(camY, be16(y));
      await wr(player + 0x02, be32(x << 16));   // SST x, 16.16 fixed
      await wr(player + 0x06, be32(y << 16));   // SST y
      await wr(player + 0x10, be32(0));         // zero velocities so no momentum
    };

    // TWO SAMPLE POINTS, and the early one is the load-bearing one.
    //
    // The first run of the mailbox comparison used only SETTLE=90 and reported
    // the BARE POKE as clean — because restricting the diff to the visible
    // window (aeon's refinement) removed the off-screen ring, and the engine
    // reconciles what is on screen well before it finishes the ring. The tear
    // is real; 90 frames is simply past it in the view. aeon's own gate samples
    // at +30, so this does too, and keeps the settle sample as the "has it all
    // converged" check.
    const EARLY = 30;
    const SETTLE = 90;

    // ---- Path B first: many small steps, which aeon says the cache handles.
    const DIST = 2048;                 // several sections east
    const STEP = 64;
    const destX = startX + DIST, destY = startY;

    /**
     * A CORRECT WALK to `destX`: from the checkpoint, in `step` sized moves,
     * two frames apart, then `settle` frames. No warp and no far poke — every
     * move is inside the regime aeon says the cache handles and row 3 measures
     * as clean. `step` is the walk's one degree of freedom, and varying it is
     * what makes two runs of this two DIFFERENT legitimate routes to the same
     * place rather than a repeat of one.
     */
    const walkTo = async (step, settle, tag) => {
      await call('emulator/restore', { id: cp });
      for (let x = startX + step; x <= destX; x += step) {
        await poke(x, destY);
        await call('emulator/run_frames', { frames: 2 });
      }
      await call('emulator/run_frames', { frames: settle });
      return plane(tag);
    };
    const runPathB = () => walkTo(STEP, SETTLE, 'pathB:settle');
    /** The reference at the EARLY sample point, walked the safe way. */
    const runPathBEarly = () => walkTo(STEP, EARLY, 'pathB:early');

    const b1 = await runPathB();

    // ── ROW R5: DID THE SERVER DELIVER THE PLANE IT WAS ASKED FOR? ─────────
    //
    // THIS IS A PRODUCTION ROW, not a neutrality row like R1 to R4 and R2H. It
    // compares WHAT THE SERVER DID against what was derived here, which is the
    // one comparison the row it replaces never made: that row compared two
    // derived quantities and so reduced to identities.
    //
    // The failure mode it exists for: A SERVER THAT HONOURS LESS THAN IT
    // DECLARES. This harness derives its call count from the ceiling the server
    // ADVERTISES, `initialize.limits.maxReadLen`. Nothing in the protocol makes
    // a server prove it honours that number, and nothing in this client checked
    // it before today. Two shapes, both covered here:
    //   - the read is REFUSED because the real ceiling is lower than the
    //     advertised one. Measured on oracle build 6732dc4b: a `len` above its
    //     real cap comes back as "`len` = 8192 is outside 1..=4096", an error,
    //     not a short buffer.
    //   - the read is TRUNCATED: fewer bytes than `len`, or a `len` echoed in
    //     the reply that disagrees with the bytes actually sent.
    // Either way the assembled sample is short, every later diff is quietly
    // narrower than the plane, and the whole-plane numbers this harness
    // publishes are over a region smaller than the one they name.
    //
    // WHAT IT DELIBERATELY DOES NOT ASSERT. Address coverage is R7's job and is
    // checked there against the addresses the server ECHOED, so it is not
    // restated here: a row that duplicates a neighbour cannot fail on its own
    // and reads as two pieces of evidence when there is one. `READ_CALLS` is
    // not compared to `walk.length` here for the same reason, and because that
    // comparison is derived-versus-derived anyway.
    //
    // Anti-vacuous: a run whose first sample issued no read at all would have
    // an empty chunk list and every `every()` below would be true of it, so the
    // sample set is asserted non-empty.
    const walk = lastChunks ?? [];
    const refused = walk.filter((c) => c.error !== null);
    const short = walk.filter((c) => c.error === null && c.got !== c.want);
    const misdeclared = walk.filter((c) => c.error === null && c.echoedLen !== c.got);
    const delivered = walk.reduce((s, c) => s + c.got, 0);
    const r5ok = walk.length > 0 && refused.length === 0 && short.length === 0 &&
      misdeclared.length === 0 && delivered === PLANE_BYTES;
    check('R5', 'the server DELIVERED the whole derived plane: bytes returned equal planeW x planeH x 2',
      r5ok,
      walk.length === 0
        ? `VACUOUS: the first plane sample issued no read at all, so there is no server behaviour ` +
          `to compare against the derived ${PLANE_BYTES} bytes`
        : `the server returned ${delivered} of the ${geom.planeW} x ${geom.planeH} x 2 = ` +
          `${PLANE_BYTES} bytes derived from registers $10 and $02, over ${walk.length} calls ` +
          `capped at the advertised limits.maxReadLen=${MAX_READ_LEN}: ` +
          `${walk.map((c) => `${hx(c.at)} asked ${c.want} ` +
            `${c.error !== null ? `REFUSED (${c.error})` : `got ${c.got} declared ${JSON.stringify(c.echoedLen)}`}`).join('; ')}` +
          (r5ok
            ? ''
            : `. The server did not deliver the plane it was asked for, so this sample is ` +
              `${PLANE_BYTES - delivered} bytes short of the region every whole-plane number below ` +
              `claims to cover.`));
    r5Reported = true;
    if (!r5ok) {
      throw new Error(
        `row R5 is RED: the first plane sample assembled ${delivered} bytes for a ${PLANE_BYTES} ` +
        `byte plane. Refusing to diff a malformed sample. The finding is in the tally above, which ` +
        `is the point of the row: before 2026-09-06 this was a bare throw and no row recorded it.`);
    }

    // ── ROW R7: DID THE CHUNKED READ ACTUALLY WALK THE PLANE? ──────────────
    //
    // The one way a multi-call read fails invisibly: the loop returns a buffer
    // of exactly the right length that is the same region read twice. Length
    // cannot catch it and neither can any diff built on it. So this checks the
    // chunk addresses the server ECHOED — not the ones this file asked for —
    // and asserts they tile [PLANE_A, PLANE_A + PLANE_BYTES) exactly once,
    // contiguously, in order, with the lengths summing to the derived plane.
    // A server that echoes no `addr` fails this row rather than passing it by
    // omission: protocol.md section 6 lists `addr` in read_vram's result.
    // (`walk` is declared in R5's block above, off the same first sample.)
    const contiguous = walk.length === READ_CALLS && walk.every(
      (c, i) => c.echoed === c.at && c.at === PLANE_A + (i === 0 ? 0 : walk.slice(0, i).reduce((s, p) => s + p.want, 0)));
    const spanned = walk.reduce((s, c) => s + c.want, 0);
    check('R7', 'the plane sample is assembled from chunks that tile the plane exactly once',
      contiguous && spanned === PLANE_BYTES,
      `${walk.length} of ${READ_CALLS} expected chunks, spanning ${spanned} of ${PLANE_BYTES} bytes: ` +
      `${walk.map((c) => `${hx(c.at)}${c.echoed === c.at ? '' : ` (server echoed ${c.echoed === undefined ? 'NOTHING' : hx(c.echoed)})`}+${c.want}`).join(' ')}` +
      (contiguous && spanned === PLANE_BYTES
        ? ''
        : '. The chunks do not tile the plane, so this sample is not the plane and every diff below ' +
          'is comparing something else.'));

    await shot('pathB-small-steps');

    // ROW 0 — ANTI-VACUOUS. Same path twice must agree exactly, or every
    // number below is measuring nondeterminism instead of tearing.
    const b2 = await runPathB();
    const selfDiff = diffWords(b1, b2);
    check('0', 'the small-step path is reproducible (self-diff is zero)',
      selfDiff === 0, `${selfDiff} differing nametable words between two identical runs`);

    // ---- Path A: one big poke.
    await call('emulator/restore', { id: cp });
    const preX = u16(await rd(prevCamX, 2));
    await poke(destX, destY);
    const postCacheX = u16(await rd(prevCamX, 2));
    note('delta the cache sees',
      `Cache_Prev_Cam_X=${preX} while Camera_X jumps ${startX}->${destX} (${DIST}px). ` +
      `Still ${postCacheX} immediately after the poke — the latch input for the next frame.`);

    await call('emulator/run_frames', { frames: EARLY });
    const aEarly = await plane('pathA:early');
    const bEarly = await runPathBEarly();
    const tornEarly = diffWords(aEarly, bEarly);
    const tornEarlyAll = diffAll(aEarly, bEarly);
    console.log(`        at +${EARLY}f: ${tornEarly}/${VIEW_WORDS} window words, ${tornEarlyAll}/${ALL_WORDS} whole-plane words disagree`);

    // ═══════════════════════════════════════════════════════════════════════
    // THE OFF-VIEW FLOOR, MEASURED IN THIS RUN
    // ═══════════════════════════════════════════════════════════════════════
    //
    // WHY A FLOOR EXISTS AT ALL. `diffWords` samples the visible window;
    // `diffAll` samples the whole plane, and the plane outside the window is
    // the streaming ring, whose contents are legitimately route-dependent. Two
    // CORRECT walks to the same destination can therefore disagree out there
    // while agreeing exactly on screen. Row 7 asks "is the mailbox clean over
    // the whole plane?", and without a floor it is really asking "is the ring
    // identical?", which is not a property the engine promises.
    //
    // WHY IT IS MEASURED HERE RATHER THAN CITED. Until 2026-09-05 this file
    // carried `const OFF_VIEW_FLOOR = 26` under a comment saying the number had
    // been stated before the run, "so comparing against it is a citation rather
    // than a number chosen to make a red row green". Nobody could produce that
    // citation: not aeon, not the hub, and not aurora, where the number
    // appeared only inside this file. A sentence defending a constant against
    // having been fitted is worse than a bare constant when the sentence cannot
    // itself be checked, because the bare constant at least invites the
    // question. So the number is now DERIVED FROM THIS RUN and the claim about
    // who measured the old one is deleted.
    //
    // AND 26 DID NOT DESCRIBE THE HALF THE OLD CODE READ EITHER. Poison run P1
    // put the read back to one 0x1000 call and left this derivation alone: over
    // plane rows 0 to 31 all five alternate correct walks agreed EXACTLY, so
    // the off-view floor in the region the old harness actually sampled is 0,
    // not 26. Whatever 26 was a measurement of, it was not this instrument's
    // window, and the constant was never checkable against what this file read.
    //
    // THE CONSTRUCTION. Same checkpoint, same destination, same sample frame,
    // no warp and no far poke — only the step size differs, which is the walk's
    // one legitimate degree of freedom (and it moves the arrival's frame count
    // too, the way the mailbox's ack does). Each is compared against `bEarly`,
    // the step-64 walk that row 7's reference already is.
    //
    // WHY MORE THAN ONE ALTERNATE ROUTE. Because the number turned out to be a
    // property of the ROUTE PAIR rather than of the engine, and one pair cannot
    // show that. Measured here on 2026-09-05, against the 64px reference: 16px
    // steps agreed EXACTLY over the whole plane, while 128px steps disagreed by
    // two hundred odd words, with 32, 48 and 96 in between. So "the off-view
    // floor" is not a constant of the machine — it is how far apart the two
    // routes being compared are. The set below is what makes that visible in
    // every run's log rather than something a reader has to take on trust.
    const FLOOR_STEPS = [16, 32, 48, 96, 128];
    const floorSamples = [];
    for (const step of FLOOR_STEPS) {
      const w = await walkTo(step, EARLY, `pathB:floor${step}`);
      floorSamples.push({ step, view: diffWords(w, bEarly), all: diffAll(w, bEarly) });
    }
    for (const s of floorSamples) {
      console.log(`        alternate walk, ${String(s.step).padStart(3)}px steps vs ${STEP}px steps ` +
        `-> window ${s.view}/${VIEW_WORDS}, whole-plane ${s.all}/${ALL_WORDS}` +
        (s.view === 0 ? '' : '   NOT A CORRECT WALK: it tore on screen'));
    }

    // ONLY THE CORRECT WALKS SET THE FLOOR. This is not a formality. The first
    // version of this block took the max over EVERY sample, and a probe that
    // widened the step set to 256 and 512 px showed exactly what that costs:
    // both of those tore ON SCREEN, F1 went red as it should, and the floor
    // they inflated to still let row 7 pass — a torn route quietly raising the
    // bar until the defect fits under it, with the row that noticed shouting
    // into a number nothing consumed. A route that fails the correctness
    // premise contributes nothing to the floor now, and if none is left there
    // is no floor and row 7 is refused rather than passed.
    const correctWalks = floorSamples.filter((s) => s.view === 0);
    const OFF_VIEW_FLOOR = correctWalks.length ? Math.max(...correctWalks.map((s) => s.all)) : null;

    // PREMISE OF THE FLOOR, asserted rather than assumed. These walks are only
    // usable as a floor if they are CORRECT, and the evidence for that is that
    // they agree in the VIEW.
    const viewClean = correctWalks.length === floorSamples.length;
    check('F1', 'the walks the floor is measured from are CORRECT: they agree in the view',
      floorSamples.length === FLOOR_STEPS.length && viewClean,
      `${floorSamples.map((s) => `${s.step}px -> ${s.view} window words`).join(', ')} against the ` +
      `${STEP}px reference` +
      (viewClean
        ? `. Off view they disagree by ${floorSamples.map((s) => s.all).join(', ')} whole-plane ` +
          `words respectively, so the floor measured in this run is ${OFF_VIEW_FLOOR} of ${ALL_WORDS}. ` +
          `That spread is the finding: the number is a property of which two correct routes are ` +
          `compared, not a constant of the machine.`
        : `. ${floorSamples.length - correctWalks.length} route(s) tore ON SCREEN, so their off-view ` +
          `numbers are defects and not floors. They are excluded from the floor, which is now ` +
          `${OFF_VIEW_FLOOR === null ? 'UNMEASURABLE' : OFF_VIEW_FLOOR} from ${correctWalks.length} ` +
          `surviving walk(s).`));

    // DISCRIMINATION, which is what stops a floor from being a licence. A floor
    // at or above the bare poke's whole-plane number would pass row 7 for any
    // outcome at all, including the tear this harness exists to measure.
    check('F2', 'the measured floor is well under the tear it has to stay clear of',
      OFF_VIEW_FLOOR !== null && OFF_VIEW_FLOOR < tornEarlyAll,
      OFF_VIEW_FLOOR === null
        ? `no correct walk survived F1, so there is no floor to compare anything against`
        : `floor ${OFF_VIEW_FLOOR}, bare poke ${tornEarlyAll}, both of ${ALL_WORDS} whole-plane words` +
          (OFF_VIEW_FLOOR < tornEarlyAll
            ? ` (${(OFF_VIEW_FLOOR / Math.max(1, tornEarlyAll) * 100).toFixed(0)}% of the tear)`
            : `. The floor swallows the tear, so row 7 would pass on a torn plane and proves nothing.`));

    // Back to path A for the settle sample.
    await call('emulator/restore', { id: cp });
    await poke(destX, destY);
    await call('emulator/run_frames', { frames: SETTLE });
    const a1 = await plane('pathA:settle');
    await shot('pathA-one-big-poke');

    const torn = tornEarly;
    check('1', 'a single far poke tears the VISIBLE WINDOW at the early sample',
      tornEarly > 0,
      `${torn} of ${VIEW_WORDS} visible-window words disagree after ${SETTLE} settle frames ` +
      `(${(torn / VIEW_WORDS * 100).toFixed(1)}% of the view)`);

    // ---- Does it self-heal, and how long does the mess stay on screen?
    //
    // The first run of this harness asserted it does NOT recover. That was
    // wrong — it recovers completely. The assertion has been replaced by the
    // measurement it should have been: recovery TIME is the number that
    // matters, because ~N seconds of visibly wrong art is what a
    // play-from-cursor feature cannot ship with, not permanence.
    let recoveredAt = null;
    let elapsed = SETTLE;
    for (const step of [30, 30, 60, 60, 120, 120, 180, 180]) {
      await call('emulator/run_frames', { frames: step });
      elapsed += step;
      const d = diffWords(await plane(`pathA:recovery+${elapsed}f`), b1);
      console.log(`        +${String(elapsed).padStart(4)} frames -> ${String(d).padStart(4)} differing words`);
      if (d === 0) { recoveredAt = elapsed; break; }
    }
    check('2', 'the tear is TRANSIENT — it heals, but only after seconds of wrong art',
      recoveredAt !== null,
      recoveredAt !== null
        ? `clean again at ${recoveredAt} frames (~${(recoveredAt / 60).toFixed(1)}s at 60fps) after the poke`
        : `still torn after ${elapsed} frames`);
    await shot('pathA-after-recovery');

    // ---- Where is the threshold? Sweep jump distance.
    const rows = [];
    for (const dist of [64, 128, 256, 512, 1024, 2048]) {
      await call('emulator/restore', { id: cp });
      await poke(startX + dist, startY);
      await call('emulator/run_frames', { frames: SETTLE });
      const jumped = await plane(`pathA:jump${dist}`);

      await call('emulator/restore', { id: cp });
      for (let x = startX + STEP; x <= startX + dist; x += STEP) {
        await poke(x, startY);
        await call('emulator/run_frames', { frames: 2 });
      }
      await call('emulator/run_frames', { frames: SETTLE });
      const walked = await plane(`pathB:walk${dist}`);

      const d = diffWords(jumped, walked);
      rows.push({ dist, d });
      console.log(`        jump ${String(dist).padStart(5)}px -> ${String(d).padStart(4)} differing words`);
    }
    const clean = rows.filter((r) => r.d === 0).map((r) => r.dist);
    const dirty = rows.filter((r) => r.d > 0).map((r) => r.dist);
    check('3', 'small jumps are clean and large ones are not — there is a threshold',
      clean.length > 0 && dirty.length > 0,
      `clean at ${clean.join(', ') || 'none'}px; torn at ${dirty.join(', ') || 'none'}px`);

    // ---- Rows 4-6: THE MAILBOX, which is what all of the above justifies ----
    //
    // Same instrument, same destination, same settle — only the METHOD changes.
    // That is the point: a before/after measured two different ways would prove
    // nothing about the fix.
    const wx = await client.resolve('Warp_Req_X').catch(() => null);
    const wy = await client.resolve('Warp_Req_Y').catch(() => null);
    const wf = await client.resolve('Warp_Req_Flag').catch(() => null);
    check('4', 'the DEBUG warp mailbox symbols resolve',
      wx !== null && wy !== null && wf !== null,
      wx === null ? 'absent — is this a release ROM?' : `X=${hx(wx)} Y=${hx(wy)} Flag=${hx(wf)}`);

    if (wx !== null) {
      await call('emulator/restore', { id: cp });
      // Write X, Y, then the flag LAST — a torn read must never act on half a
      // destination.
      await wr(wx, be16(destX));
      await wr(wy, be16(destY));
      await wr(wf, Uint8Array.of(1));

      // The engine clears the flag when it has consumed the request. Poll it
      // rather than sleeping a guessed interval; their gate measured ~21 frames.
      let ackFrames = null;
      for (let f = 0; f < 120; f++) {
        await call('emulator/run_frames', { frames: 1 });
        const flag = (await rd(wf, 1))[0];
        if (flag === 0) { ackFrames = f + 1; break; }
      }
      check('5', 'the engine acknowledges by clearing the flag',
        ackFrames !== null, ackFrames === null ? 'never cleared within 120 frames' : `ack after ${ackFrames} frames`);

      // Sample at the SAME early point the bare poke was judged at, so the two
      // numbers are comparable. The ack already cost ~20 frames, so top up to
      // EARLY rather than adding EARLY on top.
      const topUp = Math.max(0, EARLY - (ackFrames ?? 0));
      if (topUp) await call('emulator/run_frames', { frames: topUp });
      const viaMailbox = await plane('mailbox:early');
      const mailboxDiff = diffWords(viaMailbox, bEarly);
      const mailboxDiffAll = diffAll(viaMailbox, bEarly);
      check('6', 'the mailbox lands CLEAN at the distance and frame where the bare poke tears',
        mailboxDiff === 0,
        `window ${mailboxDiff}/${VIEW_WORDS} and whole-plane ${mailboxDiffAll}/${ALL_WORDS} words disagree ` +
        `at ${DIST}px, +${EARLY}f (bare poke at the same point: ${tornEarly} window, ${tornEarlyAll} whole-plane) ` +
        `— landed at (${u16(await rd(wx, 2))},${u16(await rd(wy, 2))})`);
      // ---- Row 8: do the EDITOR's world pixels mean the same thing as the
      // ENGINE's? Aurora's warp-math assumes they do (an aeon act is flat world
      // coordinates end to end, and the editor lays sections out on the same
      // grid at the same scale). Assumed correspondences between two codebases
      // are exactly what has bitten this work repeatedly, so it is measured:
      // ask for a known world point and see where the PLAYER ends up.
      const playerAddr = await client.resolve('Player_1');
      const warpAndRead = async (ax, ay) => {
        await call('emulator/restore', { id: cp });
        await wr(wx, be16(ax));
        await wr(wy, be16(ay));
        await wr(wf, Uint8Array.of(1));
        for (let f = 0; f < 120; f++) {
          await call('emulator/run_frames', { frames: 1 });
          if ((await rd(wf, 1))[0] === 0) break;
        }
        // SETTLE BEFORE READING. The player arrives airborne, so reading at the
        // ack (~20 frames) catches them mid-fall — and two warps read at the
        // same elapsed time have both fallen the same distance, which preserves
        // their difference and imitates a constant offset exactly. The first
        // run of this row fell for that: it reported a fixed -11 that was
        // really two unfinished falls.
        await call('emulator/run_frames', { frames: 240 });
        return {
          x: (await rd(playerAddr + 0x02, 4)).readUInt32BE(0) >>> 16,   // SST x, 16.16
          y: (await rd(playerAddr + 0x06, 4)).readUInt32BE(0) >>> 16,   // SST y
        };
      };

      const askX = 1536;
      const low = await warpAndRead(askX, 320);
      check('8', 'X is the editor world coordinate, exactly — the spaces correspond',
        low.x === askX, `asked x=${askX}, player x=${low.x}`);

      // Y needs characterising rather than a tolerance. aeon says the player
      // "arrives airborne with zeroed velocities and falls to the ground", so
      // two different asked-Y values at the same X should converge to the SAME
      // ground if it is a fall, and stay a CONSTANT offset apart if it is a
      // placement convention Aurora would have to compensate for.
      const high = await warpAndRead(askX, 120);
      // What matters to the client is not the offset's VALUE but whether it is
      // PREDICTABLE. A fall-to-ground would make Y terrain-dependent and
      // uncorrectable; a constant offset is a convention Aurora can compensate
      // for (or deliberately not, once aeon says which point it means).
      const dLow = low.y - 320, dHigh = high.y - 120;
      const constant = dLow === dHigh;
      check('9', 'Y differs from the request by a CONSTANT, not by terrain',
        constant,
        `asked 320 -> ${low.y} (${dLow}); asked 120 -> ${high.y} (${dHigh}). ` +
        (constant
          ? `A stable ${dLow}px convention — Player_1.y is not the point the warp takes. ` +
            `Measured after 240 settle frames, so it is not an unfinished fall. Aurora does NOT ` +
            `compensate: the engine's read-back reports the request, and which point it means ` +
            `(feet vs origin) is aeon's to define.`
          : 'Terrain-dependent — Y cannot be predicted client-side.'));

      // ---- Row 10: terrain snap, or a constant shift? aeon's discriminator.
      //
      // If the engine grounds the player, every request in clear air above the
      // SAME x must settle to the SAME resting y (surface - radius), ignoring
      // the requested height. If instead resting y tracks the request, then
      // something is applying a constant shift and the terrain-snap account is
      // falsified.
      //
      // Note all of these share one x, so they share one terrain column — which
      // is what makes the sweep discriminating rather than a survey of spots.
      const sweep = [];
      for (const ay of [64, 128, 192, 256, 320, 384]) {
        const r = await warpAndRead(askX, ay);
        sweep.push({ ask: ay, rest: r.y, delta: r.y - ay });
      }
      for (const s of sweep) {
        console.log(`        ask y=${String(s.ask).padStart(3)} -> rest ${String(s.rest).padStart(3)} (delta ${s.delta})`);
      }
      const restingYs = new Set(sweep.map((s) => s.rest));
      const deltas = new Set(sweep.map((s) => s.delta));
      const snapped = restingYs.size === 1;
      const shifted = deltas.size === 1;
      // NOTE THE WORDING. This row reports WHAT the sweep shows; it deliberately
      // does not conclude anything about the engine's intent, because row 11
      // below establishes whether the player is being simulated at all — and if
      // it is not, "no terrain snap" is trivially true and means nothing.
      // An earlier version of this row announced terrain snap FALSIFIED on this
      // evidence alone. It was not entitled to.
      check('10', 'the sweep resolves to one regime, whatever that regime means',
        snapped || shifted,
        snapped
          ? `all six settle at y=${[...restingYs][0]} regardless of the request (consistent with terrain snap)`
          : shifted
            ? `resting y tracks the request at a constant ${[...deltas][0]}px across all six, ` +
              `same x throughout — READ ROW 11 BEFORE CONCLUDING ANYTHING FROM THIS`
            : `neither: resting ${[...restingYs].join(',')} deltas ${[...deltas].join(',')}`);

      // RESOLVED ENGINE-SIDE (aeon b3169c26), recorded so nobody re-opens it:
      // the placement is VERBATIM, and the -11 is DESTINATION-DEPENDENT — an
      // engine raw probe at this same x got delta 0 for a request in clear air
      // and -11 for one intersecting terrain. Prime suspect is a one-shot
      // terrain resolve inside the ack window that runs once and then never
      // ticks again in this state. So all six of the sweep's points sat in
      // terrain. Aurora still does NOT compensate: doing so would break the
      // clear-air case, which is the common one.
      //
      // ---- Row 11: is the player's PHYSICS even running in this state?
      //
      // Row 10's conclusion only means something if the player is being
      // simulated. If gameplay is not advancing, "no terrain snap" is trivially
      // true and says nothing about the engine's intent — so trace y frame by
      // frame after a warp into clear air instead of assuming.
      await call('emulator/restore', { id: cp });
      await wr(wx, be16(askX));
      await wr(wy, be16(64));
      await wr(wf, Uint8Array.of(1));
      for (let f = 0; f < 120; f++) {
        await call('emulator/run_frames', { frames: 1 });
        if ((await rd(wf, 1))[0] === 0) break;
      }
      const trace = [];
      for (const step of [0, 1, 4, 15, 40, 120, 240]) {
        if (step) await call('emulator/run_frames', { frames: step - (trace.at(-1)?.f ?? 0) });
        trace.push({ f: step, y: (await rd(playerAddr + 0x06, 4)).readUInt32BE(0) >>> 16 });
      }
      console.log(`        y after ack: ${trace.map((s) => `+${s.f}f=${s.y}`).join('  ')}`);
      const moved = new Set(trace.map((s) => s.y)).size > 1;
      check('11', 'the player is actually being simulated (y moves after the warp)',
        moved,
        moved
          ? 'y changes over time, so row 10 compares real physics outcomes'
          : 'y NEVER changes — the player is not being simulated here, so row 10 cannot ' +
            'distinguish terrain snap from a shift and its conclusion must not be trusted');

      // The floor is the one MEASURED above by rows F1 and F2, in this run, on
      // this machine. It is not a stated prior and it is not a threshold picked
      // to make this row green: F1 asserts the walks it comes from are correct
      // and F2 asserts it is well clear of the tear, so a floor inflated by a
      // torn route reddens F1 or F2 before it can rescue this row.
      check('7', 'the mailbox whole-plane diff is inside the floor measured in this run',
        OFF_VIEW_FLOOR !== null && mailboxDiffAll <= OFF_VIEW_FLOOR,
        OFF_VIEW_FLOOR === null
          ? `${mailboxDiffAll} of ${ALL_WORDS} whole-plane words, and NO FLOOR WAS MEASURABLE: every ` +
            `alternate walk failed F1's correctness premise. This row is refused rather than passed ` +
            `on a floor built out of torn routes.`
          : `${mailboxDiffAll} of ${ALL_WORDS} whole-plane words (floor ${OFF_VIEW_FLOOR}, measured by ` +
            `rows F1 and F2 from ${correctWalks.length} correct walks in this run; bare poke ` +
            `${tornEarlyAll}). COVERAGE: those ${ALL_WORDS} words are plane rows 0 to ` +
            `${ROWS_READ - 1} of ${geom.planeH}, which is the whole plane, read in ${READ_CALLS} ` +
            `calls of at most ${MAX_READ_LEN} bytes.`);
      await shot('mailbox-warp');
    }

    // ── ROW R6: DO BOTH PATHS READ THE SAME WINDOW? ────────────────────────
    //
    // The premise every diff above rests on. Each plane sample stamped the
    // decoded geometry it was read under, so this compares the actual windows
    // rather than trusting the comment that used to assert them equal. A warp
    // that moved plane A's base or resized the plane would have made the two
    // paths diff two different regions of VRAM, and the number would have come
    // out as tearing with nothing able to tell the difference.
    //
    // Anti-vacuous first: a run that collected no stamps, or stamps from only
    // one path, would pass this trivially, so the sample set is asserted too.
    const stampPaths = new Set(geomStamps.map((s) => s.tag.split(':')[0]));
    const bootKey = geomKey(geom);
    const divergent = geomStamps.filter((s) => s.key !== bootKey);
    const bothPaths = stampPaths.has('pathA') && stampPaths.has('pathB');
    check('R6', 'both paths read the SAME window: the plane geometry is identical at every sample',
      divergent.length === 0 && geomStamps.length >= 2 && bothPaths,
      !bothPaths || geomStamps.length < 2
        ? `VACUOUS: ${geomStamps.length} samples from paths {${[...stampPaths].join(', ')}}; ` +
          `this row needs at least one from pathA and one from pathB`
        : divergent.length === 0
          ? `${geomStamps.length} samples across {${[...stampPaths].join(', ')}} all read ` +
            `${bootKey}`
          : `${divergent.length} of ${geomStamps.length} samples read a DIFFERENT window. ` +
            `First: ${divergent[0].tag} read ${divergent[0].key}, against boot ${bootKey}. ` +
            `Every diff in this run compared two different regions of VRAM.`);
  } finally {
    try { client?.disconnect(); } catch { /* */ }
    if (child) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* */ }
      await sleep(300);
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* */ }
    }
    try { rmSync(SOCK, { force: true }); } catch { /* */ }
    try { rmSync(workDir, { recursive: true, force: true }); } catch { /* */ }
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
