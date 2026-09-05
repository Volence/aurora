// THE CHAIN THAT DECIDES WHETHER A VSRAM RAMP IS FULL-SCREEN OR A 16-PIXEL
// SLIVER, as a property of aeon's source read at a committed revision.
//
// ═══ WHAT IT MEASURES ═══
//
// `src/core/formats/effects/ramp-scroll-mode.ts` says a VSRAM `ramp` is
// full-width unless the bound SCENE carries a `v_deform`, and that the deciding
// bit is VDP $0B bit 2. That claim is three links in two of aeon's engine
// sources, so this file reads those sources — through git OBJECTS at
// `origin/master`, never the working tree — and asks each link's own question:
//
//   1. scene_dsl.emp   `scene_vdeform_table(None) => 0`         (off ⇒ null pointer)
//   2. scene_dsl.emp   `pcfg_v_deform_table_bg: scene_vdeform_table(s.sc_v_deform)`
//   3. parallax.emp    the register arm ORs bit 2 in when that pointer is non-zero,
//                      inside a `Game.SCANLINE_CAPS & CAP_PER_COL_VSRAM` block
//
// plus the CONJUNCT the sentence declines to drop: `sonic4` declares
// `CAP_PER_COL_VSRAM` and `demo` does not, which is why the panel says the
// conjunct instead of calling it inert.
//
// ⚠ THIS IS NOT A CLAIM ABOUT A ROM. It measures aeon's SOURCE. Whether a built
// ROM's $0B actually reads $07 on a v_deform scene is the engine lane's
// measurement, relayed in the module's docblock and labelled as relayed. Nothing
// here stands in for it, and nothing here can retire it.
//
// ⚠ NOR IS IT A CLAIM ABOUT WHERE THE 16 PIXELS LAND. `RAMP_SCROLL_COLUMN_SPAN`
// (x = 4..19) is the engine lane's on-screen measurement at their scene 10 and is
// unreachable from source text. It is relayed, it says so, and this file does
// not pretend to check it.
//
// ⚠ AND NOT A MERGE ANNOUNCEMENT. `aeon-ramp-sign-drift.test.ts`'s precedent: a
// message saying a gate moved is a claim about a conversation; this is a claim
// about a blob.

import { describe, it, expect } from 'vitest';
import { peerRepo, resolveRev, readAtRev } from '../support/peer-repo';
import {
  RAMP_SCROLL_MODE_NOTE, RAMP_SCROLL_MODE_MEASURED_AT,
} from '../../src/core/formats/effects/ramp-scroll-mode';

const TIP = 'origin/master';
const PARALLAX = 'engine/level/parallax.emp';
const SCENE_DSL = 'engine/level/scene_dsl.emp';
const SONIC4_GAME = 'games/sonic4/config/game.emp';
const DEMO_GAME = 'games/demo/config/game.emp';

/**
 * DOES THIS TEXT GATE VDP $0B BIT 2 ON A NON-NULL COLUMN TABLE?
 *
 * The shape being read, at `parallax.emp` `.update_mode`:
 *
 *     if (Game.SCANLINE_CAPS & CAP_PER_COL_VSRAM) != 0 {
 *         move.l  parallax_config.pcfg_v_deform_table_bg(a0), d1
 *         beq     .v_done
 *         ori.b   #%100, d0
 *     }
 *
 * All four parts matter and all four are asked for: the capability block (which
 * is the conjunct), the LOAD of the table pointer, the BRANCH that skips on
 * zero, and the OR of bit 2. A version missing the `beq` would raise the bit
 * unconditionally and the whole sentence would be wrong in one direction; a
 * version missing the `ori` would never raise it and the sentence would be wrong
 * in the other.
 */
function vscrGate(text: string): {
  capBlock: boolean; loadsTable: boolean; branchesOnZero: boolean; orsBit2: boolean;
} {
  const begin = text.indexOf('.cap_per_col_vsram_mode_begin');
  const end = text.indexOf('.cap_per_col_vsram_mode_end');
  const body = begin >= 0 && end > begin ? text.slice(begin, end) : '';
  // The `if` that opens the block, taken from the 400 characters before it so a
  // second capability's block cannot be mistaken for this one.
  const lead = begin >= 0 ? text.slice(Math.max(0, begin - 400), begin) : '';
  return {
    capBlock: /Game\.SCANLINE_CAPS\s*&\s*CAP_PER_COL_VSRAM/.test(lead),
    loadsTable: /move\.l\s+parallax_config\.pcfg_v_deform_table_bg\(a0\)/.test(body),
    branchesOnZero: /\bbeq\b/.test(body),
    orsBit2: /ori\.b\s+#%100/.test(body),
  };
}

/** `SCANLINE_CAPS = $07DE` → 0x07DE. Null when the game declares none. */
function scanlineCaps(text: string): number | null {
  const m = /const\s+SCANLINE_CAPS\s*=\s*(\$[0-9A-Fa-f]+|\d+)/.exec(text);
  if (!m) return null;
  return m[1].startsWith('$') ? parseInt(m[1].slice(1), 16) : Number(m[1]);
}

/** `pub const CAP_PER_COL_VSRAM = $0002` → 2. Null when the name is gone. */
function capBit(text: string, name: string): number | null {
  const m = new RegExp(`pub\\s+const\\s+${name}\\s*=\\s*(\\$[0-9A-Fa-f]+|\\d+)`).exec(text);
  if (!m) return null;
  return m[1].startsWith('$') ? parseInt(m[1].slice(1), 16) : Number(m[1]);
}

type Read =
  | { kind: 'skip'; why: string }
  | { kind: 'fail'; why: string }
  | { kind: 'ok'; tip: string; parallax: string; sceneDsl: string; sonic4: string; demo: string };

function readChain(): Read {
  const aeon = peerRepo('aeon');
  if (aeon === null) {
    return {
      kind: 'skip',
      why: 'SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR), so CANNOT '
        + 'MEASURE whether a scene\'s v_deform still raises VDP $0B bit 2, so the ramp card\'s '
        + 'full-screen/one-column sentence is neither confirmed nor refuted here.',
    };
  }
  const tip = resolveRev(aeon, TIP);
  if (tip === null) {
    return {
      kind: 'skip',
      why: `SKIPPED, NOT PASSED: ${TIP} does not resolve in ${aeon} (unfetched? shallow?), so `
        + 'CANNOT MEASURE the VSRAM mode chain.',
    };
  }
  const files: Record<string, string> = {};
  for (const path of [PARALLAX, SCENE_DSL, SONIC4_GAME, DEMO_GAME]) {
    const at = readAtRev(aeon, tip, path);
    if (!at.ok) return { kind: 'fail', why: `aeon ${tip}: ${at.why}` };
    files[path] = at.text;
  }
  return {
    kind: 'ok',
    tip,
    parallax: files[PARALLAX],
    sceneDsl: files[SCENE_DSL],
    sonic4: files[SONIC4_GAME],
    demo: files[DEMO_GAME],
  };
}

const READ = readChain();

function onAeon(ctx: { skip: (why: string) => void }, body: (r: Read & { kind: 'ok' }) => void): void {
  if (READ.kind === 'skip') { ctx.skip(READ.why); return; }
  expect(READ.kind, READ.kind === 'fail' ? READ.why : '').toBe('ok');
  if (READ.kind !== 'ok') return;
  body(READ);
}

describe(`the VSRAM mode chain: measured at aeon ${TIP}`, () => {
  it('LINK 1+2: a scene\'s v_deform is what fills pcfg_v_deform_table_bg', (ctx) => {
    onAeon(ctx, ({ tip, sceneDsl }) => {
      // Anti-vacuous: a real file, not an empty read.
      expect(sceneDsl.length, `${SCENE_DSL} at aeon ${tip} is suspiciously short`)
        .toBeGreaterThan(10000);

      expect(
        /pcfg_v_deform_table_bg:\s*scene_vdeform_table\(s\.sc_v_deform\)/.test(sceneDsl),
        `${SCENE_DSL} at aeon ${tip} no longer lowers the scene's own v_deform into `
        + 'pcfg_v_deform_table_bg. The ramp card\'s scroll-mode sentence keys the full-screen / '
        + 'one-column answer on the scene\'s `v_deform`; if that key no longer reaches the '
        + 'parallax config, RE-DERIVE the rule by hand and edit '
        + 'src/core/formats/effects/ramp-scroll-mode.ts. Do NOT retire it on an announcement.',
      ).toBe(true);

      expect(
        /None\s*=>\s*0/.test(
          sceneDsl.slice(sceneDsl.indexOf('fn scene_vdeform_table'),
            sceneDsl.indexOf('fn scene_vdeform_table') + 260),
        ),
        `scene_vdeform_table at aeon ${tip} no longer maps SceneVDeform.None to 0: "no v_deform" `
        + 'may no longer mean "null table pointer", which is the whole of the full-screen arm.',
      ).toBe(true);
    });
  });

  it('LINK 3: parallax.emp ORs $0B bit 2 in ONLY for a non-null column table', (ctx) => {
    onAeon(ctx, ({ tip, parallax }) => {
      expect(parallax.length, `${PARALLAX} at aeon ${tip} is suspiciously short`)
        .toBeGreaterThan(10000);
      const gate = vscrGate(parallax);
      expect(
        gate,
        `the VSCR register arm in ${PARALLAX} at aeon ${tip} has changed shape `
        + `(${JSON.stringify(gate)}). The ramp card tells authors that a scene WITHOUT a `
        + 'v_deform scrolls the full width and one WITH it narrows to a 16-pixel column; that '
        + 'sentence is exactly this gate. Re-read `.update_mode` and edit '
        + 'src/core/formats/effects/ramp-scroll-mode.ts, including its quoted listing.',
      ).toEqual({ capBlock: true, loadsTable: true, branchesOnZero: true, orsBit2: true });
    });
  });

  /**
   * ⚠ THE DETECTOR MUST BE ABLE TO SEE THE GATE GO AWAY, or the row above is a
   * green-forever claim. aeon's tree cannot be mutated from here, so the READER
   * is exercised on synthetic bodies missing one part each.
   */
  it('⚠ the reader can SEE a missing branch, a missing OR and a missing block', () => {
    const shell = (body: string) => `
    if (Game.SCANLINE_CAPS & CAP_PER_COL_VSRAM) != 0 {
    .cap_per_col_vsram_mode_begin:
${body}
    .cap_per_col_vsram_mode_end:
    }
`;
    const whole = shell([
      '        move.l  parallax_config.pcfg_v_deform_table_bg(a0), d1',
      '        beq     .v_done',
      '        ori.b   #%100, d0',
    ].join('\n'));
    expect(vscrGate(whole))
      .toEqual({ capBlock: true, loadsTable: true, branchesOnZero: true, orsBit2: true });

    // the bit raised unconditionally — the sentence would be wrong for every
    // full-screen scene
    expect(vscrGate(shell([
      '        move.l  parallax_config.pcfg_v_deform_table_bg(a0), d1',
      '        ori.b   #%100, d0',
    ].join('\n'))).branchesOnZero).toBe(false);

    // the bit never raised — the sentence would be wrong for every column scene
    expect(vscrGate(shell([
      '        move.l  parallax_config.pcfg_v_deform_table_bg(a0), d1',
      '        beq     .v_done',
    ].join('\n'))).orsBit2).toBe(false);

    // no capability block at all
    expect(vscrGate('nothing here at all'))
      .toEqual({ capBlock: false, loadsTable: false, branchesOnZero: false, orsBit2: false });
  });

  /**
   * ⚠ THE CONJUNCT, WHICH THE BRIEF CALLED INERT AND WHICH IS NOT.
   *
   * `sonic4` declares `CAP_PER_COL_VSRAM` and is the data this editor opens;
   * `demo` declares 0, and on it the register arm compiles to nothing, so a
   * `v_deform` scene would stay full-width. The panel therefore SAYS the
   * conjunct rather than dropping it, and this row is what keeps that sentence
   * true in both halves.
   */
  it('the conjunct is real: sonic4 declares CAP_PER_COL_VSRAM and demo does not', (ctx) => {
    onAeon(ctx, ({ tip, sceneDsl, sonic4, demo }) => {
      const bit = capBit(sceneDsl, 'CAP_PER_COL_VSRAM');
      expect(bit, `CAP_PER_COL_VSRAM is no longer declared in ${SCENE_DSL} at aeon ${tip}`)
        .not.toBeNull();
      const s4 = scanlineCaps(sonic4);
      const dm = scanlineCaps(demo);
      expect(s4, `${SONIC4_GAME} at aeon ${tip} declares no SCANLINE_CAPS`).not.toBeNull();
      expect(dm, `${DEMO_GAME} at aeon ${tip} declares no SCANLINE_CAPS`).not.toBeNull();

      expect(
        (s4! & bit!) !== 0,
        `sonic4's SCANLINE_CAPS (${s4}) no longer declares CAP_PER_COL_VSRAM (${bit}) at aeon `
        + `${tip}. The ramp card's one-column arm assumes it does: on a game without the bit a `
        + 'v_deform scene stays FULL-WIDTH, so the sentence would be wrong for the very data '
        + 'this editor opens. Edit src/core/formats/effects/ramp-scroll-mode.ts.',
      ).toBe(true);

      expect(
        (dm! & bit!) === 0,
        `demo's SCANLINE_CAPS (${dm}) now declares CAP_PER_COL_VSRAM at aeon ${tip}. The panel's `
        + 'hover names demo as the game where the conjunct BITES; if both games declare it, that '
        + 'clause is now false and should be re-worded (it may finally be inert).',
      ).toBe(true);
    });
  });

  /**
   * THE MODULE'S OWN PIN, CHECKED AGAINST THE REPO RATHER THAN AGAINST ITSELF.
   *
   * The hover tells a reader "measured at aeon <rev>" so they can re-run it. A
   * revision that does not resolve in aeon is an invitation the reader cannot
   * accept — the exact shape of a citation that looks precise and names nothing.
   */
  it('the revision the hover cites really resolves in aeon', (ctx) => {
    onAeon(ctx, () => {
      expect(RAMP_SCROLL_MODE_NOTE).toContain(RAMP_SCROLL_MODE_MEASURED_AT);
      const aeon = peerRepo('aeon')!;
      expect(
        resolveRev(aeon, RAMP_SCROLL_MODE_MEASURED_AT),
        `src/core/formats/effects/ramp-scroll-mode.ts cites aeon ${RAMP_SCROLL_MODE_MEASURED_AT}, `
        + 'which does not resolve in the aeon checkout beside this repo. Either the constant is '
        + 'wrong or the measurement was never taken at a committed revision.',
      ).not.toBeNull();
    });
  });
});
