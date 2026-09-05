// DOES THE EDITOR'S WORLD PIXEL AND THE ENGINE'S WORLD PIXEL MEAN THE SAME
// THING? — a FOREGROUND instrument for aeon.
//
// ==========================================================================
//  RUN IT WITH:
//
//      AURORA_LIVE_AEON_WARP=1 npx vitest run test/live/aeon-warp-correspondence.test.ts
//
//  It is OPT-IN and SKIPS WITH A MESSAGE otherwise, so `npx vitest run` never
//  starts an emulator. Same reason as its classic twin
//  (`test/live/s1-warp-live.test.ts`): the node suite cannot see a running
//  machine, and a background agent driving one deadlocks. Nothing here may run
//  except from a foreground session.
//
//  WHO RUNS IT AND WHEN: whoever changes `src/core/aether/warp-math.ts`,
//  `src/main/aether/warp.ts`, or lands an aeon change to the warp mailbox /
//  the act-bounds formula (`Debug_Warp_Consume`, `clamp_and_publish`,
//  `Player_BoundsInit`). It is not in CI — it needs a built `s4.debug.bin` and
//  a built `oracle-aether`, neither of which CI has.
// ==========================================================================
//
// WHAT IT CLOSES. `warp-math.ts` states a correspondence and, until this file,
// said honestly that nothing checked it: *"The editor and the engine agree on
// world pixels TODAY … ⚠ THAT CORRESPONDENCE IS ASSUMED, NOT CHECKED."* The
// header used to cite `scratchpad/warp-mailbox-harness`, which has never existed
// in this repo — not in the tree, and not anywhere in its history.
//
// What already existed answers other questions and must not be mistaken for
// this one:
//   • `src/core/aether/__tests__/warp-math.test.ts` is ARITHMETIC ONLY. It
//     never leaves the editor, so it cannot see an engine that disagrees.
//   • `scratchpad/warp-tearing-harness.mjs` diffs two routes to the SAME
//     destination. It is silent about whether that destination is the pixel
//     the editor meant.
//
// SO THIS ONE READS THE PLAYER OUT OF RAM. Not a screenshot: a rendered frame
// is a post-hoc state render and cannot answer "where is the player", and
// mistaking one for the other cost this suite a real defect on 2026-09-03.
// `Player_1`'s SST x_pos/y_pos are 16.16 fixed-point (`aeon
// engine/objects/sst.emp`), so the integer pixel is the HIGH WORD, and that is
// what the engine's own `Debug_Warp_Consume` writes verbatim from the mailbox.
//
// FIVE THINGS MAKE IT NON-VACUOUS:
//
//  1. THE EXPECTATION IS NOT `warpTargetFor`'s OUTPUT. If it were, perturbing
//     `warpTargetFor` would move the request AND the expectation together and
//     the row would stay green forever. The expectation is the CURSOR POINT —
//     an integer world pixel chosen inside both clamps, so the contract is
//     simply "the player ends up exactly there". Perturb `warpTargetFor` by
//     any offset and this row goes red. (Red-first evidence:
//     `docs/reviews/2026-09-04-warp-correspondence.md`.)
//
//  2. TWO POINTS, NOT ONE. A single-point check passes against a stuck value,
//     against a clamped value, and against an engine that ignores the mailbox
//     entirely. Two different editor pixels must produce two different engine
//     pixels, and the DIFFERENCE must equal the difference asked for — signed,
//     on both axes, exactly. The deltas are deliberately not round numbers so
//     an engine that snapped to a grid could not coincide with them.
//
//  3. THE MACHINE IS PAUSED THROUGHOUT. `warpTo` polls a running machine when
//     it finds one running, and each poll is a round trip — so an unknown
//     number of frames of gravity would land between the ack and the read, and
//     the y figure would be a measurement of the network. Paused, `warpTo`
//     steps one frame per poll, so the read happens a fixed one frame after
//     the consume. That the pause actually took is ASSERTED, because if it
//     silently did not, every number below is off by an unknown amount.
//
//  4. IT REFUSES TO REPORT UNLESS A LEVEL IS LIVE. `Current_Act_Ptr` must be a
//     plausible ROM pointer and the act bounds must be live, or the figures
//     would describe a title screen. (Its classic twin learned this the hard
//     way: the spike measured a "player" drifting on the SEGA screen.)
//
//  5. THE CLAMPS ARE EXERCISED, NOT AVOIDED. A clamped coordinate is a case
//     where editor and engine legitimately DISAGREE, and the disagreement is
//     asserted rather than dodged — see the clamp row below.
//
// WHAT IT DOES NOT COVER, said plainly:
//   • `screenToWorld` (MapViewport's mouse → world step). The claim in
//     `warp-math.ts` is about world pixels; this row starts at one.
//   • The u16 PROTOCOL clamp. It cannot fire on any act this ROM can hold —
//     asserted below as an inert-by-construction fact rather than skipped
//     silently. Only an act wider than 32 sections would reach it, and
//     `warp-math.test.ts` covers the arithmetic.
//   • Whether the editor's act grid metadata matches the ROM's. The act dims
//     here are derived from the RUNNING ENGINE, because the subject is the
//     COORDINATE SPACE, not the act table. A project whose grid dims disagree
//     with the ROM it launched is a different defect with a different check.

import { describe, it, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AetherClient } from '../../src/main/aether/client';
import { warpTo } from '../../src/main/aether/warp';
import { warpTargetFor, SECTION_PX_WIDE, SECTION_PX_HIGH, WARP_COORD_MAX } from '../../src/core/aether/warp-math';
import { referencePath } from '../support/fixture-tree';

/**
 * An `@ $NN` field offset out of an aeon `struct` — DERIVED, never typed.
 *
 * `Sst` pins every field's offset in-file (`x_pos: Coord @ $02`) and aeon's own
 * layout engine verifies them, so reading the literal is reading the same
 * number the engine assembles against. It returns null — never a plausible
 * default — if the field is not shaped that way any more, and the caller turns
 * that into a loud failure rather than a silent zero offset, which would read
 * `code_addr` and call it a position.
 */
function sstOffset(src: string, field: string): number | null {
  const m = new RegExp(`^\\s*${field}\\s*:[^@\\n]*@\\s*\\$([0-9A-Fa-f]+)`, 'm').exec(src);
  return m === null ? null : Number.parseInt(m[1], 16);
}

/** A `const NAME = <decimal|$hex>` out of an aeon module, or null. */
function empConst(src: string, name: string): number | null {
  const m = new RegExp(`^\\s*(?:pub\\s+)?const\\s+${name}\\s*=\\s*(\\$?[0-9A-Fa-f]+)\\b`, 'm').exec(src);
  if (m === null) return null;
  return m[1].startsWith('$') ? Number.parseInt(m[1].slice(1), 16) : Number.parseInt(m[1], 10);
}

function sibling(name: string, within: string): string | null {
  const root = referencePath(name);
  return existsSync(join(root, within)) ? root : null;
}

const OPTED_IN = process.env.AURORA_LIVE_AEON_WARP === '1';
// The mailbox is DEBUG-shape only: `Warp_Req_*` are absent from a release
// listing, and `Debug_Warp_Consume` emits zero bytes there.
const AEON = sibling('aeon', 's4.debug.bin');
const ORACLE = sibling('oracle', 'target/release/oracle-aether');

const missing: string[] = [];
if (!OPTED_IN) missing.push('AURORA_LIVE_AEON_WARP=1 not set');
if (!AEON) missing.push('no sibling aeon with a built s4.debug.bin: ./build.sh DEBUG=1');
else if (!existsSync(join(AEON, 's4.debug.lst'))) missing.push('aeon has no s4.debug.lst beside the ROM: rebuild it');
if (!ORACLE) missing.push('no sibling oracle with target/release/oracle-aether: cargo build --release');

const row = missing.length === 0 ? it : it.skip;
const why = missing.length === 0 ? '' : ` (SKIPPED: ${missing.join('; ')})`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (n: number) => '0x' + (n >>> 0).toString(16).toUpperCase();

/**
 * Frames to run from reset before the act is trusted.
 *
 * aeon's DEBUG shape boots straight into the level state, so this is a settle
 * budget rather than a menu walk — but entering a level is not the level being
 * ready (its init clears object RAM and re-seeds the player), and a warp inside
 * that window would be discarded silently. 600 is the same budget
 * `scratchpad/warp-tearing-harness.mjs` measured this ROM booting under, and
 * the gate below refuses to report if it was not enough.
 */
const BOOT_FRAMES = 600;

describe('aeon world pixels: the editor and the engine mean the same thing', () => {
  row(`warps to two known editor pixels and reads the player out of RAM${why}`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aurora-aeon-warp-'));
    const sock = join(dir, 'o.sock');
    let srv: ChildProcess | null = null;
    let client: AetherClient | null = null;
    const say = (s: string) => process.stderr.write(`  ${s}\n`);
    try {
      srv = spawn(join(ORACLE!, 'target/release/oracle-aether'),
        [join(AEON!, 's4.debug.bin'), '--socket', sock], { stdio: ['ignore', 'pipe', 'pipe'] });
      for (let i = 0; i < 150 && !existsSync(sock); i++) await sleep(100);
      expect(existsSync(sock), 'the headless server never created its socket').toBe(true);

      client = new AetherClient({
        connect: () => net.connect(sock) as never,
        socketPath: sock,
        log: () => {},
      });
      await client.connect();
      expect(client.status).toBe('connected');
      await client.loadSymbols(join(AEON!, 's4.debug.lst'));

      const readBytes = async (addr: number, len: number): Promise<Buffer> => {
        const r = await client!.call('emulator/read_memory', { addr: hex(addr), len }) as { bytes: string };
        return Buffer.from(r.bytes.replace(/^0x/i, ''), 'hex');
      };
      const readWord = async (addr: number) => (await readBytes(addr, 2)).readUInt16BE(0);
      const readLong = async (addr: number) => (await readBytes(addr, 4)).readUInt32BE(0);

      // ---- CONSTANTS AND OFFSETS, DERIVED FROM aeon's SOURCE ---------------
      // Every number below that describes the engine comes out of the engine's
      // own text. A typed `0x02` here would keep reading SOMETHING after a
      // layout change and report it as a position.
      const sstSrc = readFileSync(join(AEON!, 'engine/objects/sst.emp'), 'utf8');
      const constSrc = readFileSync(join(AEON!, 'engine/system/constants.emp'), 'utf8');
      const playerSrc = readFileSync(join(AEON!, 'games/sonic4/player/player_common.emp'), 'utf8');
      const OFF_X = sstOffset(sstSrc, 'x_pos');
      const OFF_Y = sstOffset(sstSrc, 'y_pos');
      const SECTION_SHIFT = empConst(constSrc, 'SECTION_SIZE_SHIFT');
      const SCREEN_HEIGHT = empConst(constSrc, 'SCREEN_HEIGHT');
      const RIGHT_MARGIN = empConst(playerSrc, 'PBOUND_RIGHT_MARGIN');
      for (const [name, v] of [['Sst.x_pos', OFF_X], ['Sst.y_pos', OFF_Y],
        ['SECTION_SIZE_SHIFT', SECTION_SHIFT], ['SCREEN_HEIGHT', SCREEN_HEIGHT],
        ['PBOUND_RIGHT_MARGIN', RIGHT_MARGIN]] as const) {
        expect(v, `could not derive ${name} from the aeon checkout: this row cannot measure anything`)
          .not.toBeNull();
      }

      // THE SCALE HALF OF THE CLAIM, source against source. The editor lays
      // sections out at SECTION_PX_WIDE; the engine at 1 << SECTION_SIZE_SHIFT.
      // "The same grid at the same scale" is exactly this equality, and it has
      // never been stated anywhere a change could trip over it.
      expect(1 << SECTION_SHIFT!, "aeon's section size and the editor's SECTION_PX_WIDE disagree")
        .toBe(SECTION_PX_WIDE);
      expect(1 << SECTION_SHIFT!, "aeon's section size and the editor's SECTION_PX_HIGH disagree")
        .toBe(SECTION_PX_HIGH);

      // ---- GATE: a level must actually be live -----------------------------
      await client.call('emulator/pause');
      await client.call('emulator/run_frames', { frames: BOOT_FRAMES });

      const actPtrCell = await client.resolve('Current_Act_Ptr');
      const actPtr = await readLong(actPtrCell);
      expect(actPtr, 'Current_Act_Ptr is null: no act is loaded, so every figure below would be about a menu')
        .not.toBe(0);
      expect(actPtr, 'Current_Act_Ptr is not a plausible ROM pointer').toBeLessThan(0x400000);

      const player = await client.resolve('Player_1');
      const camTarget = await client.resolve('Camera_Target');
      // `Debug_Warp_Consume` places the LEADER — `movea.w Camera_Target, a0` —
      // so reading `Player_1` is only right while the leader IS Player_1. Say
      // so rather than assume it; a two-player build would quietly move the
      // subject out from under this row.
      // Compared in the 68000's 24-bit address space, which is the space both
      // sides actually live in: `Camera_Target` is a WORD (`movea.w` sign-
      // extends `$8F72` to `$FFFF8F72`) while `lookup_symbol` answers the
      // 24-bit `$FF8F72`. Comparing the raw values makes a true statement fail.
      const A24 = 0xffffff;
      const leader = (0xff0000 | await readWord(camTarget)) & A24;
      expect(leader, 'the camera leader is not Player_1: this row is reading the wrong object')
        .toBe(player & A24);

      const boundRight = await readWord(await client.resolve('Player_Bound_Right'));
      const boundBottom = await readWord(await client.resolve('Player_Bound_Bottom'));
      expect(boundRight, 'Player_Bound_Right is 0: the act bounds are not live yet').toBeGreaterThan(0);
      expect(boundBottom, 'Player_Bound_Bottom is 0: the act bounds are not live yet').toBeGreaterThan(0);

      // The act's section grid, RECOVERED from the engine's own live clamp
      // edges and its own margin constants (`Player_BoundsInit`:
      // right = grid_w<<SECTION_SIZE_SHIFT − PBOUND_RIGHT_MARGIN). That the
      // recovery divides EXACTLY is the live half of the scale check: if the
      // engine's section stride were not the editor's, this would not land on
      // a whole number of sections.
      const levelW = boundRight + RIGHT_MARGIN!;
      const levelH = boundBottom + SCREEN_HEIGHT!;
      expect(levelW % SECTION_PX_WIDE, `act width ${levelW}px is not a whole number of ${SECTION_PX_WIDE}px sections`).toBe(0);
      expect(levelH % SECTION_PX_HIGH, `act height ${levelH}px is not a whole number of ${SECTION_PX_HIGH}px sections`).toBe(0);
      const act = { gridWidth: levelW / SECTION_PX_WIDE, gridHeight: levelH / SECTION_PX_HIGH };
      say(`act: ${act.gridWidth}x${act.gridHeight} sections = ${levelW}x${levelH}px; `
        + `engine clamp edges = (${boundRight}, ${boundBottom})`);

      // ---- THE PAUSE HAS TO BE REAL ----------------------------------------
      // `warpTo` resumes and polls a machine it found running, so an unknown
      // number of frames of gravity would fall between the ack and the read.
      // Paused, it steps ONE frame per poll and leaves the machine stopped, so
      // the read below is a fixed one frame after the consume.
      const paused = await client.call('emulator/pause') as { wasRunning?: boolean };
      expect(paused?.wasRunning,
        'the server did not report the machine as already paused: every figure below would be off by an unknown number of frames')
        .toBe(false);

      /** Warp through the SHIPPED call and read the machine independently. */
      const go = async (worldX: number, worldY: number) => {
        const t = warpTargetFor(worldX, worldY, act);
        const r = await warpTo(client!, t.x, t.y);
        expect(r.gate, `gated: ${r.error}`).toBeUndefined();
        expect(r.warped, `not warped: ${r.error}`).toBe(true);
        // The PLAYER, out of RAM — not the mailbox, and not a picture. The
        // mailbox read-back is the engine repeating the request to itself; only
        // the SST says where the player is.
        const px = (await readLong(player + OFF_X!)) >>> 16;
        const py = (await readLong(player + OFF_Y!)) >>> 16;
        return { t, r, px, py };
      };

      // ---- POINT A and POINT B: the two-point control ----------------------
      // Both sit inside the act and inside the engine's clamp edges, so NO
      // clamp applies and the contract is exact identity: the player ends up
      // at the cursor pixel. High in the act (small y) so the destination is
      // open air — a warp seeds PSTATE_AIR and the one frame that runs before
      // the read would otherwise be able to snap the player onto a floor,
      // which is the engine behaving correctly and would not be a coordinate
      // finding.
      const A = { x: 1024, y: 96 };
      const DX = 777, DY = 333;            // deliberately not round: a grid snap cannot coincide
      const B = { x: A.x + DX, y: A.y + DY };
      for (const p of [A, B]) {
        expect(p.x, 'point is outside the act: pick a smaller one').toBeLessThan(boundRight);
        expect(p.y, 'point is outside the act: pick a smaller one').toBeLessThan(boundBottom);
      }

      const a = await go(A.x, A.y);
      say(`A: editor (${A.x},${A.y}) -> request (${a.t.x},${a.t.y}) -> engine (${a.px},${a.py})  `
        + `delta (${a.px - A.x},${a.py - A.y})  polls=${a.r.polls}`);
      const b = await go(B.x, B.y);
      say(`B: editor (${B.x},${B.y}) -> request (${b.t.x},${b.t.y}) -> engine (${b.px},${b.py})  `
        + `delta (${b.px - B.x},${b.py - B.y})  polls=${b.r.polls}`);

      // THE CORRESPONDENCE ITSELF. Expected is the CURSOR, not warpTargetFor's
      // answer — see note 1 in the header.
      expect(a.px, `editor asked for world x=${A.x}; the engine put the player at ${a.px}`).toBe(A.x);
      expect(a.py, `editor asked for world y=${A.y}; the engine put the player at ${a.py}`).toBe(A.y);
      expect(b.px, `editor asked for world x=${B.x}; the engine put the player at ${b.px}`).toBe(B.x);
      expect(b.py, `editor asked for world y=${B.y}; the engine put the player at ${b.py}`).toBe(B.y);

      // THE CONTROL. Two different pixels, two different landings, and the
      // difference is the difference asked for — signed, both axes. A stuck
      // value, a clamped value, and an engine ignoring the mailbox all fail
      // here even if a single-point check had passed.
      expect(b.px - a.px, 'the two warps did not differ by the x distance asked for').toBe(DX);
      expect(b.py - a.py, 'the two warps did not differ by the y distance asked for').toBe(DY);
      expect(b.px, 'both warps landed on the same x: a stuck value would look exactly like this').not.toBe(a.px);
      expect(b.py, 'both warps landed on the same y: a stuck value would look exactly like this').not.toBe(a.py);

      // ---- CLAMP 1: the act clamp, ASSERTED rather than avoided -------------
      // A cursor far outside the act. The editor clamps to the last addressable
      // pixel of the act; the engine clamps HARDER, to its own playable edges
      // (`Player_Bound_Right` = width − PBOUND_RIGHT_MARGIN, `Player_Bound_Bottom`
      // = height − SCREEN_HEIGHT). So the two legitimately DISAGREE here, and
      // the size of the disagreement is a derived quantity, not a mystery.
      const FAR = 10_000_000;
      const far = await go(FAR, FAR);
      const expectFarX = Math.min(act.gridWidth * SECTION_PX_WIDE - 1, boundRight);
      const expectFarY = Math.min(act.gridHeight * SECTION_PX_HIGH - 1, boundBottom);
      say(`clamp: editor (${FAR},${FAR}) -> request (${far.t.x},${far.t.y}) -> engine (${far.px},${far.py})  `
        + `editor-vs-engine gap (${far.t.x - far.px},${far.t.y - far.py})`);
      expect(far.t.clampedToAct, "the editor did not report clamping a cursor far outside the act").toBe(true);
      expect(far.px, 'the engine did not clamp to its own right edge').toBe(expectFarX);
      expect(far.py, 'the engine did not clamp to its own bottom edge').toBe(expectFarY);
      // And the gap is exactly the two margins, less the editor's inclusive-
      // last-pixel. Named so a change to either margin lands here rather than
      // silently widening the disagreement.
      expect(far.t.x - far.px, 'the editor/engine right-edge gap is not PBOUND_RIGHT_MARGIN − 1').toBe(RIGHT_MARGIN! - 1);
      expect(far.t.y - far.py, 'the editor/engine bottom-edge gap is not SCREEN_HEIGHT − 1').toBe(SCREEN_HEIGHT! - 1);

      // ---- CLAMP 2: the negative cursor -------------------------------------
      // The viewport shows more than the act, so a cursor left of the origin is
      // ordinary. Both sides clamp to 0 and they AGREE there. The y is held at
      // a safe airborne value so this row measures the x clamp and not terrain.
      const neg = await go(-500, A.y);
      say(`clamp: editor (-500,${A.y}) -> request (${neg.t.x},${neg.t.y}) -> engine (${neg.px},${neg.py})`);
      expect(neg.t).toMatchObject({ x: 0, y: A.y, clampedToAct: true });
      expect(neg.px, 'a cursor left of the act did not land on the act origin').toBe(0);
      expect(neg.py, 'the y of a negative-x warp moved').toBe(A.y);

      // ---- CLAMP 3: the u16 protocol clamp is INERT on this ROM --------------
      // Stated as a measured fact rather than skipped silently: no act this
      // build can hold reaches the mailbox's u16 ceiling, so this row cannot
      // exercise it and does not pretend to. `warp-math.test.ts` covers the
      // arithmetic; only an act wider than 32 sections would make it live.
      const lastPixel = Math.max(act.gridWidth * SECTION_PX_WIDE, act.gridHeight * SECTION_PX_HIGH) - 1;
      expect(lastPixel, 'this act DOES reach the u16 mailbox ceiling: the protocol clamp is live and this row must grow a case for it')
        .toBeLessThanOrEqual(WARP_COORD_MAX);
      expect(far.t.clampedToProtocol, 'the protocol clamp fired on an act that cannot reach it').toBe(false);
      expect(far.t.reachable).toBe(true);
      say(`protocol clamp: inert here (the act's last pixel is ${lastPixel}, ceiling is ${WARP_COORD_MAX})`);
    } finally {
      client?.disconnect();
      srv?.kill();
    }
  }, 180_000);
});
