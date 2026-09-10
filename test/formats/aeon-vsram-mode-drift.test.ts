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

/**
 * A GAME'S `SCANLINE_CAPS` — IN FOUR OUTCOMES, BECAUSE TWO IS WHAT MADE THIS
 * FILE PRINT A FALSEHOOD.
 *
 * ═══ WHAT WENT WRONG, AND WHY IT WAS OURS ═══
 *
 * This function used to be `number | null` over one regex for a literal, and the
 * row below asserted `.not.toBeNull()` with the message
 * `<file> declares no SCANLINE_CAPS`. On 2026-09-10 aeon changed
 * `games/demo/config/game.emp` from a hand-written `SCANLINE_CAPS = $0FDE` to a
 * DERIVED binding, `const SCANLINE_CAPS = DemoScenes_CapsFolded`, and this repo's
 * master went red at 08:55Z with no aurora change — printing that the file
 * declares no `SCANLINE_CAPS`, WHICH IS FALSE. The file declares one. We could
 * not evaluate it. A reader's BLINDNESS was being printed as the producer's
 * ABSENCE, and that is a defect on this side of the seam.
 *
 * So absence and blindness are now different answers, and they can never share a
 * message again:
 *
 *   `literal`     a hand-written mask (`= $0FDE`, games/sonic4). The value.
 *   `proved`      a DERIVED binding whose value is provable FROM SOURCE TEXT.
 *                 The value, and the proof named alongside it.
 *   `unreadable`  a binding this reader cannot evaluate. NOT a value and NOT
 *                 null — a distinct outcome whose message names OUR limit.
 *   `absent`      no `const SCANLINE_CAPS` line at all. That one IS a statement
 *                 about the producer, and it is the only one that is.
 *
 * ═══ THE ONE DERIVATION, AND WHY IT IS A PROOF AND NOT A GUESS ═══
 *
 * The remedy here is NOT "parse harder", and it is aeon's own, followed
 * deliberately: their `tools/scene_spans.py:game_caps()` text-scrapes this same
 * literal and RAISES rather than guessing, because "guessing zero here would
 * silently assert the maximal elision" (aeon 25d88e38, "two checks assumed a
 * hand-written mask, and the derived one caught both"). They kept the refusal and
 * added exactly one derivation: a name bound to `fold_caps(<registry>)` where
 * `<registry>` is DECLARED `[Scene; 0]` folds to 0, by the identity of the
 * OR-fold — derived at `fold_caps()` in `engine/level/scene_dsl.emp`. The
 * DECLARED LENGTH is sigil's proof that the registry is empty, not this reader's
 * reading of `[]`. So `proved` READS A PROOF out of the source; it does not
 * evaluate a fold, and this file has no evaluator for one.
 *
 * Every other derived shape is `unreadable`, loudly — including a registry with
 * any scene in it (the message names the count). A wrong zero here would assert
 * that demo declares NO capabilities, which is the strongest claim this file
 * makes about the conjunct.
 *
 * ═══ ONE DIFFERENCE FROM AEON'S TOOL, DELIBERATE ═══
 *
 * Their `game_caps()` decides "absent" by failing to match a LITERAL regex and
 * then a NAME regex, so a binding whose right-hand side is neither — say
 * `= $0FDE  // note`, or an expression — reports "no `const SCANLINE_CAPS`
 * binding", which is the same conflation this row was just bitten by. Here the
 * BINDING is found first, on its own line, and only then is its right-hand side
 * classified. Absence is therefore structural and cannot be reached by a value
 * shape we happen not to parse.
 */
type Caps =
  | { kind: 'literal'; value: number; how: string }
  | { kind: 'proved'; value: number; how: string }
  | { kind: 'unreadable'; why: string }
  | { kind: 'absent'; why: string };

/** The binding line itself, anchored — a `//` comment quoting one cannot match. */
const CAPS_BINDING = /^[ \t]*const[ \t]+SCANLINE_CAPS[ \t]*=[ \t]*(.*)$/m;
const CAPS_LITERAL = /^(\$[0-9A-Fa-f]+|\d+)$/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** `<name>` is always an already-validated identifier here, so it needs no escaping. */
const foldBinding = (name: string) => new RegExp(
  `^[ \\t]*(?:pub[ \\t]+)?const[ \\t]+${name}[ \\t]*=[ \\t]*fold_caps\\([ \\t]*([A-Za-z_][A-Za-z0-9_]*)[ \\t]*\\)`,
  'm',
);
const registryLen = (name: string) => new RegExp(
  `^[ \\t]*(?:pub[ \\t]+)?const[ \\t]+${name}[ \\t]*:[ \\t]*\\[[ \\t]*Scene[ \\t]*;[ \\t]*(\\d+)[ \\t]*\\][ \\t]*=`,
  'm',
);

const BLIND = 'This is a limit of THIS READER, not a defect in aeon\'s file: '
  + 'test/formats/aeon-vsram-mode-drift.test.ts cannot evaluate comptime. Teach `scanlineCaps` '
  + 'the new shape (aeon\'s tools/scene_spans.py:caps_from_manifest is the precedent for what a '
  + 'reader may PROVE and what it must refuse), or read the mask out of a build artifact. Do NOT '
  + 'make it guess: a wrong zero asserts that the game declares NO capabilities.';

function scanlineCaps(text: string, where: string): Caps {
  const bound = CAPS_BINDING.exec(text);
  if (bound === null) {
    return {
      kind: 'absent',
      why: `MEASURED, AND IT IS ABOUT AEON: ${where} carries no \`const SCANLINE_CAPS = …\` line `
        + 'at all. A game that does not declare the member cannot be specialised, and the '
        + 'conjunct on the ramp card has no game-side half to stand on.',
    };
  }
  // Right-hand side, minus any trailing `//` comment.
  const cut = bound[1].indexOf('//');
  const expr = (cut >= 0 ? bound[1].slice(0, cut) : bound[1]).trim();

  if (CAPS_LITERAL.test(expr)) {
    return {
      kind: 'literal',
      value: expr.startsWith('$') ? parseInt(expr.slice(1), 16) : Number(expr),
      how: `the hand-written literal \`${expr}\``,
    };
  }

  if (!IDENT.test(expr)) {
    return {
      kind: 'unreadable',
      why: `${where} binds SCANLINE_CAPS to \`${expr}\`, which is neither a literal nor a bare `
        + `name. ${BLIND}`,
    };
  }

  const fold = foldBinding(expr).exec(text);
  if (fold === null) {
    return {
      kind: 'unreadable',
      why: `${where} binds SCANLINE_CAPS to the name \`${expr}\`, and the only derivation this `
        + `reader follows is a \`const ${expr} = fold_caps(<registry>)\` in the same file. There `
        + `is none. ${BLIND}`,
    };
  }

  const registry = fold[1];
  const decl = registryLen(registry).exec(text);
  if (decl === null) {
    return {
      kind: 'unreadable',
      why: `${where} folds \`${registry}\`, whose declared type this reader could not read. It `
        + `needs \`const ${registry}: [Scene; N] = …\`; the DECLARED LENGTH is the only proof it `
        + `accepts that a registry is empty, because that length is checked by sigil while \`[]\` `
        + `is only this reader looking at a bracket. ${BLIND}`,
    };
  }

  const n = Number(decl[1]);
  if (n !== 0) {
    return {
      kind: 'unreadable',
      why: `${where} folds \`${registry}\`, which declares ${n} scene(s). Only an EMPTY registry `
        + `has a fold this reader can derive (0, the OR-fold's identity); a real fold needs `
        + `sigil. ${BLIND}`,
    };
  }

  return {
    kind: 'proved',
    value: 0,
    how: `a PROOF, not an evaluation: \`${expr} = fold_caps(${registry})\` over `
      + `\`${registry}: [Scene; 0]\`, where an empty OR-fold is 0 by the fold's own identity `
      + '(aeon engine/level/scene_dsl.emp `fold_caps`) and the DECLARED length is sigil\'s proof '
      + 'that the registry is empty',
  };
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
   * `demo` folds to 0, and on it the register arm compiles to nothing, so a
   * `v_deform` scene would stay full-width. The panel therefore SAYS the
   * conjunct rather than dropping it, and these rows are what keep that sentence
   * true in both halves.
   *
   * ⚠ TWO ROWS, NOT ONE, AND THAT SPLIT IS THE FIX'S SECOND HALF. They were a
   * single `it` until 2026-09-10, so the demo half failing took the sonic4 half
   * down with it: the run that reported `demo declares no SCANLINE_CAPS` never
   * evaluated sonic4's conjunct at all, and a reader could not tell from the
   * output whether sonic4 was still fine. The halves read DIFFERENT files and
   * are in different states — sonic4's mask is a hand-written literal, demo's is
   * derived — so one going unreadable must not silence the other.
   */
  it('the conjunct, sonic4 half: sonic4 DECLARES CAP_PER_COL_VSRAM', (ctx) => {
    onAeon(ctx, ({ tip, sceneDsl, sonic4 }) => {
      const bit = capBit(sceneDsl, 'CAP_PER_COL_VSRAM');
      expect(bit, `CAP_PER_COL_VSRAM is no longer declared in ${SCENE_DSL} at aeon ${tip}`)
        .not.toBeNull();

      const s4 = scanlineCaps(sonic4, `${SONIC4_GAME} at aeon ${tip}`);
      expect(
        s4.kind === 'literal' || s4.kind === 'proved',
        s4.kind === 'literal' || s4.kind === 'proved' ? '' : s4.why,
      ).toBe(true);
      if (s4.kind !== 'literal' && s4.kind !== 'proved') return;

      expect(
        (s4.value & bit!) !== 0,
        `sonic4's SCANLINE_CAPS (${s4.value}, read from ${s4.how}) no longer declares `
        + `CAP_PER_COL_VSRAM (${bit}) at aeon ${tip}. The ramp card's one-column arm assumes it `
        + 'does: on a game without the bit a v_deform scene stays FULL-WIDTH, so the sentence '
        + 'would be wrong for the very data this editor opens. Edit '
        + 'src/core/formats/effects/ramp-scroll-mode.ts.',
      ).toBe(true);
    });
  });

  /**
   * ⚠ THE DEMO HALF, AND WHAT IT DOES WHEN IT CANNOT SEE.
   *
   * demo's mask is DERIVED (`= DemoScenes_CapsFolded`) as of aeon 2026-09-10, and
   * `scanlineCaps` proves it is 0 from the declared-empty registry rather than
   * evaluating anything. If aeon gives `DEMO_SCENES` a scene, that proof stops
   * being available and this reader goes `unreadable`.
   *
   * THIS ROW THEN FAILS, deliberately, rather than skipping — and the reasoning is
   * worth keeping because the opposite call is defensible in general. This repo
   * SKIPS, with a named reason, when the local ENVIRONMENT cannot answer (no aeon
   * checkout; see `readChain`). `unreadable` is not that: aeon's source is present
   * and readable, and what is missing is our evaluator, which is a defect on THIS
   * side, actionable HERE, today. Worse, `unreadable` is CORRELATED with the very
   * change it would hide: the only way to reach it from aeon's demo is for that
   * registry to gain a scene, which is precisely the event that could raise
   * demo's caps and make the panel's "demo does not" clause FALSE. Skipping at
   * exactly that moment would be green-because-blind at the moment the answer is
   * most likely to have moved. The message therefore blames US, names the shape
   * it found, and says what to do — but it is red.
   */
  it('the conjunct, demo half: demo does NOT declare CAP_PER_COL_VSRAM', (ctx) => {
    onAeon(ctx, ({ tip, sceneDsl, demo }) => {
      const bit = capBit(sceneDsl, 'CAP_PER_COL_VSRAM');
      expect(bit, `CAP_PER_COL_VSRAM is no longer declared in ${SCENE_DSL} at aeon ${tip}`)
        .not.toBeNull();

      const dm = scanlineCaps(demo, `${DEMO_GAME} at aeon ${tip}`);
      expect(
        dm.kind === 'literal' || dm.kind === 'proved',
        dm.kind === 'literal' || dm.kind === 'proved' ? '' : dm.why,
      ).toBe(true);
      if (dm.kind !== 'literal' && dm.kind !== 'proved') return;

      expect(
        (dm.value & bit!) === 0,
        `demo's SCANLINE_CAPS (${dm.value}, read from ${dm.how}) now declares CAP_PER_COL_VSRAM `
        + `at aeon ${tip}. The panel's hover names demo as the game where the conjunct BITES; if `
        + 'both games declare it, that clause is now false and should be re-worded (it may '
        + 'finally be inert).',
      ).toBe(true);
    });
  });

  /**
   * ⚠ THE READER'S OWN FOUR OUTCOMES, EXERCISED — because the row above can only
   * ever walk ONE of them against aeon's tree, and the whole point of this
   * parcel is that the other three stay distinguishable.
   *
   * Synthetic manifests, not aeon's: aeon's tree cannot be mutated from here, and
   * a reader that silently collapsed `unreadable` back into `absent` would look
   * exactly like it did on the morning it printed a falsehood.
   */
  it('⚠ the reader tells a literal, a PROVED fold, a blindness and an ABSENCE apart', () => {
    const manifest = (body: string) => `use engine.level.scene_dsl.*\n${body}\n`;

    // 1. LITERAL — games/sonic4's shape.
    const lit = scanlineCaps(manifest('    const SCANLINE_CAPS = $0FDE'), 'x');
    expect(lit.kind).toBe('literal');
    expect(lit.kind === 'literal' ? lit.value : -1).toBe(0x0FDE);
    expect(scanlineCaps(manifest('    const SCANLINE_CAPS = 0'), 'x'))
      .toMatchObject({ kind: 'literal', value: 0 });

    // 2. PROVED — games/demo's shape since aeon 25d88e38. The registry's DECLARED
    //    length is the proof; an empty OR-fold is 0.
    const proved = scanlineCaps(manifest([
      'pub const DEMO_SCENES: [Scene; 0] = []',
      'pub const DemoScenes_CapsFolded = fold_caps(DEMO_SCENES)',
      '    const SCANLINE_CAPS = DemoScenes_CapsFolded',
    ].join('\n')), 'x');
    expect(proved.kind).toBe('proved');
    expect(proved.kind === 'proved' ? proved.value : -1).toBe(0);
    expect(proved.kind === 'proved' ? proved.how : '').toContain('[Scene; 0]');

    // 3. UNREADABLE — four shapes, all of them OURS to say so about, and none of
    //    them allowed to answer with a number.
    const registryHasScenes = scanlineCaps(manifest([
      'pub const DEMO_SCENES: [Scene; 3] = [a, b, c]',
      'pub const DemoScenes_CapsFolded = fold_caps(DEMO_SCENES)',
      '    const SCANLINE_CAPS = DemoScenes_CapsFolded',
    ].join('\n')), 'x');
    expect(registryHasScenes.kind).toBe('unreadable');
    // ⚠ the count is named, and 0 is NOT invented for it
    expect(registryHasScenes.kind === 'unreadable' ? registryHasScenes.why : '')
      .toContain('declares 3 scene(s)');

    // an UNTYPED registry: `[]` is this reader looking at a bracket, `[Scene; 0]`
    // is the type checker agreeing. Only the second is a proof.
    expect(scanlineCaps(manifest([
      'pub const DEMO_SCENES = []',
      'pub const DemoScenes_CapsFolded = fold_caps(DEMO_SCENES)',
      '    const SCANLINE_CAPS = DemoScenes_CapsFolded',
    ].join('\n')), 'x').kind).toBe('unreadable');

    // a name bound to something that is not a fold
    expect(scanlineCaps(manifest([
      'pub const DemoScenes_CapsFolded = SOME_OTHER_MASK | $0002',
      '    const SCANLINE_CAPS = DemoScenes_CapsFolded',
    ].join('\n')), 'x').kind).toBe('unreadable');

    // an expression right-hand side, which is neither literal nor bare name
    expect(scanlineCaps(manifest('    const SCANLINE_CAPS = CAP_A | CAP_B'), 'x').kind)
      .toBe('unreadable');

    // 4. ABSENT — the ONLY outcome that is a claim about the producer. A comment
    //    quoting the binding is not a binding.
    const absent = scanlineCaps(
      manifest('// it writes `const SCANLINE_CAPS = $0FDE` by hand, elsewhere'), 'x');
    expect(absent.kind).toBe('absent');
    expect(absent.kind === 'absent' ? absent.why : '').toContain('MEASURED, AND IT IS ABOUT AEON');

    // ⚠ AND THE SEAM ITSELF: the two messages must never be interchangeable.
    const blind = scanlineCaps(manifest('    const SCANLINE_CAPS = CAP_A | CAP_B'), 'x');
    expect(blind.kind === 'unreadable' ? blind.why : '').toContain('limit of THIS READER');
    expect(blind.kind === 'unreadable' ? blind.why : '').not.toContain('no `const SCANLINE_CAPS');
    expect(absent.kind === 'absent' ? absent.why : '').not.toContain('THIS READER');

    // ⚠ a trailing comment is a VALUE-SHAPE wrinkle, never an absence. This is
    //    the conflation aeon's own tool still has, and the reason absence is
    //    decided structurally here.
    expect(scanlineCaps(manifest('    const SCANLINE_CAPS = $0FDE  // the mask'), 'x'))
      .toMatchObject({ kind: 'literal', value: 0x0FDE });
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
