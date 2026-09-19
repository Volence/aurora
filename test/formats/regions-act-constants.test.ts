/**
 * RULE 4's CONSTANT CHAIN, READ OUT OF AEON'S OWN TWO FILES — ROADMAP row 201.
 *
 * `src/core/formats/regions/act-constants.ts` is the product; this file is its
 * independent check, and the split is the one `section-wiring.ts` already keeps
 * between `resolveIntConst` and the instrument in its own test ("two readers of
 * one syntax is a drift risk worth naming").
 *
 * ═══ HOW THESE ROWS CHAIN BACK TO AEON, AND WHERE EACH LINK CAN BREAK ══════
 *
 * Three links, because no single assertion reaches from a TypeScript function
 * to an `ensure` in a `.emp` file:
 *
 *   1. THE BYTES are aeon's. `test/formats/aeon-fixture-currency.test.ts` holds
 *      both fixtures to aeon's `origin/master` on every run and says so by
 *      name. Nothing here re-checks that; if aeon moves, THAT row goes red
 *      first and these rows keep passing against a stale pin, which is exactly
 *      the division of labour that file's header argues for.
 *   2. THE PREDICATES this file transcribes are aeon's, held by the
 *      TRANSCRIPTION LOCK below, which greps the five `ensure` lines out of the
 *      vendored descriptor. ⚠ A LOCK IS NOT A READER: it proves the sentence in
 *      this test matches the sentence in aeon's file. It cannot prove either
 *      one is right, and it would not notice aeon changing the CONSTANTS those
 *      predicates name.
 *   3. THE IMPLEMENTATION agrees with those transcribed predicates over a
 *      CENSUS of every edge in the act, not a sample. See the census rows.
 *
 * ═══ THE MIRROR, AND WHY THE VECTORS SIT ON THE ENDPOINTS ══════════════════
 *
 * The low and high edge predicates are NOT mirror images, and the most likely
 * wrong reading of aeon's rule is to write the high one by substituting `x1`
 * into the low one's shape. Over all 6144 x edges of this act the two readings
 * disagree on EXACTLY TWO: `x = CENTRE_X_MIN` and `x = CENTRE_X_MAX`. A suite
 * that sampled "near the boundary" would agree with the mirror everywhere it
 * looked and certify the wrong rule. So the census below asserts the size of
 * that disagreement set AND its membership, and the two named vectors stand on
 * the endpoints themselves.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  empConstDecls,
  empImportModules,
  empModuleName,
  evalEmpTokens,
  readEmpSource,
  regionRulesNotRead,
  resolveRegionRules,
  tokenizeEmpExpr,
  unreadEmpSource,
  RULE_4_CONSTANTS,
} from '../../src/core/formats/regions/act-constants';
import { validateRect, type RegionRules } from '../../src/core/editing/region-geometry';
import { engineConstantsPath, wiringPaths } from '../../src/core/formats/effects/section-wiring';

const FIXTURES = resolve(__dirname, '../fixtures/regions/act-constants');
const DESC_PATH = 'games/sonic4/data/levels/ojz/act1/act_descriptor.emp';
const ENGINE_PATH = 'engine/system/constants.emp';
const DESC = readFileSync(resolve(FIXTURES, 'act_descriptor.emp'), 'utf8');
const ENGINE = readFileSync(resolve(FIXTURES, 'engine_constants.emp'), 'utf8');

/** OJZ act 1's grid, from aeon's project.json: 3 x 3 sections of 2048 px. */
const ACT = { actW: 3 * 2048, actH: 3 * 2048 };

const resolveReal = () => resolveRegionRules({
  act: ACT,
  descriptor: readEmpSource(DESC_PATH, DESC),
  engine: readEmpSource(ENGINE_PATH, ENGINE),
});

/** The resolved rules, or a failure that names what did not resolve. */
function realRules(): RegionRules {
  const r = resolveReal();
  if (r.kind !== 'resolved') {
    throw new Error(`the vendored fixtures did not resolve: ${
      r.unresolved.map((u) => `${u.name}: ${u.reason}`).join(' | ')}`);
  }
  return r.rules;
}

// ---------------------------------------------------------------------------
// 1. THE CHAIN, END TO END
// ---------------------------------------------------------------------------

describe('rule 4 constants resolve from aeon\'s two files', () => {
  it('every one of the five resolves, and each names the file it came from', () => {
    const r = resolveReal();
    expect(r.kind).toBe('resolved');
    if (r.kind !== 'resolved') return;
    const byName = new Map(r.resolved.map((c) => [c.name, c]));
    // ⚠ THE POINT OF ROW 201, AS AN ASSERTION. Three of the five constants the
    // rule needs are DERIVED in the act descriptor over leaves declared in the
    // ENGINE file. If a future reader ever resolved all of them from one file,
    // it would be resolving names aeon does not declare there.
    expect(byName.get('CENTRE_X_MAX')!.from).toBe(DESC_PATH);
    expect(byName.get('SCREEN_WIDTH')!.from).toBe(ENGINE_PATH);
    expect(byName.get('CAM_SCREEN_HALF_W')!.from).toBe(ENGINE_PATH);
    expect(byName.get('CAM_MAX_Y_STEP')!.from).toBe(ENGINE_PATH);
    // And the initializer is carried VERBATIM, so a person can audit the fold.
    expect(byName.get('CENTRE_X_MAX')!.expr).toBe('ACT_W - SCREEN_WIDTH + CAM_SCREEN_HALF_W');
    expect(byName.get('REGION_MIN_SPAN')!.expr).toBe('2 * CAM_MAX_Y_STEP');
  });

  /**
   * THE INDEPENDENT FOLD. The leaves are read out of the vendored engine file by
   * a regex that shares no code with the module under test, and the four
   * derivations are transcribed here from the descriptor. Both halves of the
   * chain are therefore re-done, not trusted.
   */
  it('the five values equal the chain folded independently over the same bytes', () => {
    const leaf = (name: string): number => {
      const m = new RegExp(`^pub const ${name}\\s*=\\s*(-?\\d+)`, 'm').exec(ENGINE);
      if (m === null) throw new Error(`${name} is not a plain integer const in ${ENGINE_PATH}`);
      return Number(m[1]);
    };
    const r = realRules();
    expect(r.minSpan).toBe(2 * leaf('CAM_MAX_Y_STEP'));
    expect(r.centreXMin).toBe(leaf('CAM_SCREEN_HALF_W'));
    expect(r.centreXMax).toBe(ACT.actW - leaf('SCREEN_WIDTH') + leaf('CAM_SCREEN_HALF_W'));
    expect(r.centreYMin).toBe(leaf('CAM_SCREEN_HALF_H'));
    expect(r.centreYMax).toBe(ACT.actH - leaf('SCREEN_HEIGHT') + leaf('CAM_SCREEN_HALF_H'));
  });

  /**
   * THE ABSOLUTE ANCHOR, and it is here because the row above is a fold of the
   * same bytes by a second route: two readers that agree can still both be
   * reading the wrong file. These are the values this lane MEASURED at aeon
   * `e0317db8` by hand, out of git objects, before any of this code existed.
   *
   * ⚠ WHEN THIS GOES RED, LOOK AT THE CURRENCY ROW FIRST. aeon moving
   * CAM_MAX_Y_STEP or the screen size is a re-vendor, not an Aurora bug, and
   * `aeon-fixture-currency.test.ts` will have gone red in the same run.
   */
  it('the values are the ones measured by hand at aeon e0317db8', () => {
    const r = realRules();
    expect(r.minSpan).toBe(32);        // 2 * CAM_MAX_Y_STEP, CAM_MAX_Y_STEP = 16
    expect(r.centreXMin).toBe(160);    // CAM_SCREEN_HALF_W
    expect(r.centreXMax).toBe(5984);   // 6144 - 320 + 160
    expect(r.centreYMin).toBe(112);    // CAM_SCREEN_HALF_H
    expect(r.centreYMax).toBe(6032);   // 6144 - 224 + 112
    // The extent is the act's own, seeded, never read out of the descriptor.
    expect(r.actW).toBe(6144);
    expect(r.actH).toBe(6144);
  });

  it('ACT_W is SEEDED from the act grid, not read from the descriptor', () => {
    // aeon writes `const ACT_W = GRID_W << SECTION_SIZE_SHIFT`, and `GRID_W`
    // forwards to `OJZ_ACT_GRID_W` in a THIRD file this reader does not open.
    // So the descriptor's own ACT_W is genuinely unresolvable here, and a
    // resolution that still produces a width is producing the caller's.
    const decls = empConstDecls(DESC);
    expect(decls.get('ACT_W')![0].expr).toBe('GRID_W << SECTION_SIZE_SHIFT');
    expect(decls.get('GRID_W')![0].expr).toBe('OJZ_ACT_GRID_W');
    expect(decls.has('OJZ_ACT_GRID_W')).toBe(false);

    // A DIFFERENT act grid moves the derived bound, which is what makes the
    // seeding real rather than a coincidence of this act's size.
    const wide = resolveRegionRules({
      act: { actW: 5 * 2048, actH: 3 * 2048 },
      descriptor: readEmpSource(DESC_PATH, DESC),
      engine: readEmpSource(ENGINE_PATH, ENGINE),
    });
    expect(wide.kind).toBe('resolved');
    if (wide.kind !== 'resolved') return;
    expect(wide.rules.centreXMax).toBe(10240 - 320 + 160);
    expect(wide.rules.centreYMax).toBe(realRules().centreYMax);
  });

  /**
   * TWO WIDTHS IN ONE FILE, and the edge rule uses the other one. Picking
   * `OJZ_AUTHORED_ACT_W` would decode perfectly and be wrong, so the rule is
   * asserted to be keyed on the one the `ensure` line actually names.
   */
  it('the act file declares a SECOND width that rule 4 does not use', () => {
    const decls = empConstDecls(DESC);
    expect(decls.has('OJZ_AUTHORED_ACT_W')).toBe(true);
    const ensures = DESC.slice(DESC.indexOf('comptime fn ojz_region('));
    expect(ensures.slice(0, ensures.indexOf('return Region'))).not.toContain('OJZ_AUTHORED_ACT_W');
  });
});

// ---------------------------------------------------------------------------
// 2. THE TRANSCRIPTION LOCK
// ---------------------------------------------------------------------------

describe('aeon\'s ensure lines are what this suite transcribes', () => {
  /**
   * ⚠ WHAT THIS PROVES AND WHAT IT DOES NOT. It proves the five predicate texts
   * below are present, character for character, in the vendored descriptor. It
   * proves nothing about whether the TypeScript agrees with them; that is the
   * census. And it would not notice aeon renaming a constant these lines use.
   */
  const ENSURES = [
    'ensure(x1 - x0 + 1 >= REGION_MIN_SPAN && y1 - y0 + 1 >= REGION_MIN_SPAN,',
    'ensure(x0 == 0 || (x0 - 1 >= CENTRE_X_MIN && x0 <= CENTRE_X_MAX),',
    'ensure(x1 == ACT_W - 1 || (x1 >= CENTRE_X_MIN && x1 + 1 <= CENTRE_X_MAX),',
    'ensure(y0 == 0 || (y0 - 1 >= CENTRE_Y_MIN && y0 <= CENTRE_Y_MAX),',
    'ensure(y1 == ACT_H - 1 || (y1 >= CENTRE_Y_MIN && y1 + 1 <= CENTRE_Y_MAX),',
  ];

  for (const line of ENSURES) {
    it(`the descriptor still says: ${line.slice(7, 48)}...`, () => {
      expect(DESC).toContain(line);
    });
  }

  it('and the low/high pair are NOT the same shape, which is the whole hazard', () => {
    // If these two were mirror images the census below would have nothing to
    // measure, and this row is what says the asymmetry is aeon's and not a slip
    // in the transcription above.
    const low = ENSURES[1].replace(/x0/g, 'E');
    const high = ENSURES[2].replace(/x1/g, 'E');
    expect(low).not.toBe(high);
  });
});

// ---------------------------------------------------------------------------
// 3. THE CENSUS, AND THE TWO ENDPOINT VECTORS
// ---------------------------------------------------------------------------

/** aeon's predicates, transcribed from the lines locked above. */
const engineReading = (r: RegionRules) => ({
  left: (x0: number) => x0 === 0 || (x0 - 1 >= r.centreXMin && x0 <= r.centreXMax),
  right: (x1: number) => x1 === r.actW - 1 || (x1 >= r.centreXMin && x1 + 1 <= r.centreXMax),
  top: (y0: number) => y0 === 0 || (y0 - 1 >= r.centreYMin && y0 <= r.centreYMax),
  bottom: (y1: number) => y1 === r.actH - 1 || (y1 >= r.centreYMin && y1 + 1 <= r.centreYMax),
});

/**
 * THE WRONG READING: the high edge's BAND CLAUSE written by substituting into
 * the low edge's shape. Present so the census can measure the difference rather
 * than assert its absence.
 *
 * ⚠ IT KEEPS THE HIGH EDGE'S EXEMPTION (`x1 == ACT_W - 1`) AND ONLY MIRRORS THE
 * BAND. Mirroring the exemption too would also disagree at x = 0 and
 * x = ACT_W - 1, and those two are a different mistake with a different fix.
 * Isolating the band clause is what makes the disagreement set exactly the two
 * endpoints, which is the measurement this file exists to pin.
 */
const mirrorReading = (r: RegionRules) => ({
  right: (x1: number) => x1 === r.actW - 1 || (x1 - 1 >= r.centreXMin && x1 <= r.centreXMax),
  bottom: (y1: number) => y1 === r.actH - 1 || (y1 - 1 >= r.centreYMin && y1 <= r.centreYMax),
});

/** Does `validateRect` accept this right edge? Every other rule is made to pass. */
function rightEdgeAccepted(r: RegionRules, x1: number): boolean {
  const codes = validateRect({ x: 0, y: 0, w: x1 + 1, h: r.actH }, r).map((f) => f.code);
  return !codes.includes('edge-right-unreachable');
}

function bottomEdgeAccepted(r: RegionRules, y1: number): boolean {
  const codes = validateRect({ x: 0, y: 0, w: r.actW, h: y1 + 1 }, r).map((f) => f.code);
  return !codes.includes('edge-bottom-unreachable');
}

function leftEdgeAccepted(r: RegionRules, x0: number): boolean {
  const codes = validateRect({ x: x0, y: 0, w: r.actW - x0, h: r.actH }, r).map((f) => f.code);
  return !codes.includes('edge-left-unreachable');
}

describe('CENSUS: validateRect agrees with aeon over every edge in the act', () => {
  it('all 6144 right edges, and all 6144 left edges', () => {
    const r = realRules();
    const eng = engineReading(r);
    const wrongRight: number[] = [];
    const wrongLeft: number[] = [];
    // A right edge below REGION_MIN_SPAN - 1 cannot be tested in isolation
    // (the rect would also be too narrow), so the census runs the edge rule
    // over every edge and reads only that rule's own code back.
    for (let x = 0; x < r.actW; x += 1) {
      if (rightEdgeAccepted(r, x) !== eng.right(x)) wrongRight.push(x);
      if (leftEdgeAccepted(r, x) !== eng.left(x)) wrongLeft.push(x);
    }
    expect(wrongRight, 'right edges where Aurora and aeon disagree').toEqual([]);
    expect(wrongLeft, 'left edges where Aurora and aeon disagree').toEqual([]);
    // Anti-vacuous: a census that accepted everything would also be empty here,
    // so the reading itself is shown to refuse and to accept. The LOW edge's
    // band starts one pixel above CENTRE_X_MIN (`x0 - 1 >= CENTRE_X_MIN`),
    // which is the asymmetry, stated as two assertions rather than assumed.
    expect(eng.right(r.centreXMax)).toBe(false);
    expect(eng.left(r.centreXMin)).toBe(false);
    expect(eng.left(r.centreXMin + 1)).toBe(true);
  });

  it('all 6144 bottom edges', () => {
    const r = realRules();
    const eng = engineReading(r);
    const wrong: number[] = [];
    for (let y = 0; y < r.actH; y += 1) {
      if (bottomEdgeAccepted(r, y) !== eng.bottom(y)) wrong.push(y);
    }
    expect(wrong, 'bottom edges where Aurora and aeon disagree').toEqual([]);
  });

  /**
   * ⚠ THE ROW THAT MAKES THE ONE ABOVE MEAN SOMETHING. A census against a
   * reading is only as good as the reading being the RIGHT one, and the mirror
   * is the wrong one a reader actually writes. This row measures how far apart
   * they are: two edges on each axis, and it names them.
   */
  it('the naive mirror disagrees with aeon on EXACTLY the two endpoints, x and y', () => {
    const r = realRules();
    const eng = engineReading(r);
    const mir = mirrorReading(r);
    const diffX: number[] = [];
    for (let x = 0; x < r.actW; x += 1) if (eng.right(x) !== mir.right(x)) diffX.push(x);
    const diffY: number[] = [];
    for (let y = 0; y < r.actH; y += 1) if (eng.bottom(y) !== mir.bottom(y)) diffY.push(y);
    expect(diffX).toEqual([r.centreXMin, r.centreXMax]);
    expect(diffY).toEqual([r.centreYMin, r.centreYMax]);
  });

  /**
   * VECTOR A — x1 = CENTRE_X_MIN. aeon ACCEPTS it; the mirror REJECTS it.
   * A right edge one pixel further in (CENTRE_X_MIN + 1) is accepted by BOTH,
   * which is why a vector "near" the boundary proves nothing.
   */
  it('VECTOR A: a right edge exactly at CENTRE_X_MIN is REACHABLE', () => {
    const r = realRules();
    expect(rightEdgeAccepted(r, r.centreXMin)).toBe(true);
    expect(mirrorReading(r).right(r.centreXMin)).toBe(false);
    // The neighbour both readings accept: the control that shows the vector is
    // load-bearing and not just "somewhere over there".
    expect(rightEdgeAccepted(r, r.centreXMin + 1)).toBe(true);
    expect(mirrorReading(r).right(r.centreXMin + 1)).toBe(true);
  });

  /**
   * VECTOR B — x1 = CENTRE_X_MAX. aeon REJECTS it (the camera centre must be
   * able to stand on x1 + 1 to cross out of the region); the mirror accepts it.
   */
  it('VECTOR B: a right edge exactly at CENTRE_X_MAX is UNREACHABLE', () => {
    const r = realRules();
    expect(rightEdgeAccepted(r, r.centreXMax)).toBe(false);
    expect(mirrorReading(r).right(r.centreXMax)).toBe(true);
    expect(rightEdgeAccepted(r, r.centreXMax - 1)).toBe(true);
    expect(mirrorReading(r).right(r.centreXMax - 1)).toBe(true);
    // And the act's own outer edge is exempt whatever the band says.
    expect(rightEdgeAccepted(r, r.actW - 1)).toBe(true);
  });

  it('VECTORS A and B again on the y axis, where the bounds are different numbers', () => {
    const r = realRules();
    expect(r.centreYMin).not.toBe(r.centreXMin);
    expect(r.centreYMax).not.toBe(r.centreXMax);
    expect(bottomEdgeAccepted(r, r.centreYMin)).toBe(true);
    expect(bottomEdgeAccepted(r, r.centreYMax)).toBe(false);
    expect(bottomEdgeAccepted(r, r.actH - 1)).toBe(true);
  });

  it('the minimum span is the RESOLVED one, and one pixel under it is refused', () => {
    const r = realRules();
    const at = validateRect({ x: 0, y: 0, w: r.minSpan, h: r.actH }, r).map((f) => f.code);
    const under = validateRect({ x: 0, y: 0, w: r.minSpan - 1, h: r.actH }, r).map((f) => f.code);
    expect(at).not.toContain('min-span');
    expect(under).toContain('min-span');
  });
});

// ---------------------------------------------------------------------------
// 4. THE REFUSALS — loud, named, and never a number
// ---------------------------------------------------------------------------

describe('a constant that cannot be resolved is NAMED, never defaulted', () => {
  it('an unreadable engine file leaves all five unresolved and names it', () => {
    const r = resolveRegionRules({
      act: ACT,
      descriptor: readEmpSource(DESC_PATH, DESC),
      engine: unreadEmpSource(ENGINE_PATH, 'ENOENT: no such file'),
    });
    expect(r.kind).toBe('unresolved');
    if (r.kind !== 'unresolved') return;
    expect(r.unresolved.map((u) => u.name).sort()).toEqual([...RULE_4_CONSTANTS].sort());
    // Each reason names the LEAF that failed and the file it was looked for in.
    const minSpan = r.unresolved.find((u) => u.name === 'REGION_MIN_SPAN')!;
    expect(minSpan.reason).toContain('CAM_MAX_Y_STEP');
    expect(minSpan.reason).toContain(ENGINE_PATH);
    expect(minSpan.reason).toContain('ENOENT: no such file');
    expect(minSpan.lookedIn).toEqual([DESC_PATH, ENGINE_PATH]);
  });

  it('an unreadable DESCRIPTOR is a different sentence from an unreadable engine file', () => {
    const r = resolveRegionRules({
      act: ACT,
      descriptor: unreadEmpSource(DESC_PATH, 'could not be read'),
      engine: readEmpSource(ENGINE_PATH, ENGINE),
    });
    expect(r.kind).toBe('unresolved');
    if (r.kind !== 'unresolved') return;
    // CENTRE_X_MIN is DERIVED in the descriptor, so its own name is what fails
    // here, not the leaf it would have named.
    const x = r.unresolved.find((u) => u.name === 'CENTRE_X_MIN')!;
    expect(x.reason).toContain('CENTRE_X_MIN is declared in neither');
    expect(x.reason).toContain(DESC_PATH);
  });

  /**
   * ⚠ REPORTED, NOT CLASSIFIED. empyrean's 2026-09-18T23:47Z amendment refuses
   * the general form "build-gated means exclude-and-report": the grant is keyed
   * on participation in the DEBUG delta and covers `OJZ_SEC2_X1` and
   * `OJZ_SEC5_X1` by name. A gated rule-4 constant is UNRULED, so this reader
   * is required to hand it back as a question rather than decide it. The
   * assertion is therefore that it becomes UNMEASURABLE with the condition
   * quoted -- never excluded, never an error, and never a value.
   *
   * aeon has no such constant at `e0317db8` (all eight resolutions are
   * top-level), so the fixture is synthetic and says so.
   */
  it('a rule-4 constant behind a build switch is quoted back, not evaluated', () => {
    const synthetic = [
      'module games.synthetic.act',
      'use engine.constants.{CAM_MAX_Y_STEP}',
      'const REGION_MIN_SPAN = 2 * CAM_MAX_Y_STEP',
      'const CENTRE_X_MIN = 160',
      'const CENTRE_Y_MIN = 112',
      'const CENTRE_Y_MAX = 6032',
      'if DEBUG == 1 {',
      '    const CENTRE_X_MAX = 4799',
      '}',
    ].join('\n');
    const r = resolveRegionRules({
      act: ACT,
      descriptor: readEmpSource('synthetic.emp', synthetic),
      engine: readEmpSource(ENGINE_PATH, ENGINE),
    });
    expect(r.kind).toBe('unresolved');
    if (r.kind !== 'unresolved') return;
    expect(r.unresolved.map((u) => u.name)).toEqual(['CENTRE_X_MAX']);
    const u = r.unresolved[0];
    expect(u.reason).toContain('DEBUG == 1');
    expect(u.reason).toContain('a question for a person');
    // The four that DID resolve are still carried, so the panel can say four
    // of five rather than "could not resolve".
    expect(r.resolved.map((c) => c.name)).toContain('REGION_MIN_SPAN');
    // ANTI-VACUOUS: the same file WITHOUT the gate resolves, so the refusal is
    // the condition and not the synthetic document.
    const ungated = resolveRegionRules({
      act: ACT,
      descriptor: readEmpSource('synthetic.emp', synthetic.replace('if DEBUG == 1 {', '').replace(/^\}$/m, '')),
      engine: readEmpSource(ENGINE_PATH, ENGINE),
    });
    expect(ungated.kind).toBe('resolved');
  });

  it('an `if` INITIALIZER is refused the same way, and never half-read', () => {
    const synthetic = [
      'const REGION_MIN_SPAN = 32',
      'const CENTRE_X_MIN = 160',
      'const CENTRE_X_MAX = if DEBUG == 1 { 4799 } else { 5984 }',
      'const CENTRE_Y_MIN = 112',
      'const CENTRE_Y_MAX = 6032',
    ].join('\n');
    const r = resolveRegionRules({
      act: ACT,
      descriptor: readEmpSource('synthetic.emp', synthetic),
      engine: readEmpSource(ENGINE_PATH, ENGINE),
    });
    expect(r.kind).toBe('unresolved');
    if (r.kind !== 'unresolved') return;
    expect(r.unresolved.map((u) => u.name)).toEqual(['CENTRE_X_MAX']);
    // NOT 4799 and NOT 5984: the two arms are both visible on the line and
    // picking either is the thing this reader must never do.
    expect(r.unresolved[0].reason).not.toContain('= 5984');
    expect(r.unresolved[0].reason).toContain('not an integer expression Aurora can fold');
  });

  it('a name declared twice in one file is refused, not guessed', () => {
    const synthetic = [
      'const REGION_MIN_SPAN = 32', 'const CENTRE_X_MIN = 160', 'const CENTRE_X_MAX = 5984',
      'const CENTRE_Y_MIN = 112', 'const CENTRE_Y_MAX = 6032', 'const CENTRE_Y_MAX = 9999',
    ].join('\n');
    const r = resolveRegionRules({
      act: ACT,
      descriptor: readEmpSource('synthetic.emp', synthetic),
      engine: readEmpSource(ENGINE_PATH, ENGINE),
    });
    expect(r.kind).toBe('unresolved');
    if (r.kind !== 'unresolved') return;
    expect(r.unresolved[0].name).toBe('CENTRE_Y_MAX');
    expect(r.unresolved[0].reason).toContain('declared 2 times');
  });

  it('a value is not read out of a file the descriptor did not name', () => {
    // The descriptor imports its leaves from `engine.constants`. Hand it a file
    // that declares the right names under a DIFFERENT module and the read is
    // refused, rather than folding a same-named constant out of the wrong file.
    const impostor = ENGINE.replace(/^module engine\.constants$/m, 'module engine.other');
    expect(empModuleName(impostor)).toBe('engine.other');
    const r = resolveRegionRules({
      act: ACT,
      descriptor: readEmpSource(DESC_PATH, DESC),
      engine: readEmpSource(ENGINE_PATH, impostor),
    });
    expect(r.kind).toBe('unresolved');
    if (r.kind !== 'unresolved') return;
    expect(r.unresolved[0].reason).toContain('engine.constants');
    expect(r.unresolved[0].reason).toContain('engine.other');
  });

  it('a descriptor ACT_W that disagrees with the act grid is refused, not preferred', () => {
    const synthetic = [
      'const ACT_W = 4096',
      'const REGION_MIN_SPAN = 32', 'const CENTRE_X_MIN = 160',
      'const CENTRE_X_MAX = ACT_W - 320 + 160',
      'const CENTRE_Y_MIN = 112', 'const CENTRE_Y_MAX = 6032',
    ].join('\n');
    const r = resolveRegionRules({
      act: ACT,
      descriptor: readEmpSource('synthetic.emp', synthetic),
      engine: readEmpSource(ENGINE_PATH, ENGINE),
    });
    expect(r.kind).toBe('unresolved');
    if (r.kind !== 'unresolved') return;
    expect(r.unresolved[0].name).toBe('CENTRE_X_MAX');
    expect(r.unresolved[0].reason).toContain('4096');
    expect(r.unresolved[0].reason).toContain('6144');
    // ANTI-VACUOUS: the SAME document with an agreeing ACT_W resolves.
    const agreeing = resolveRegionRules({
      act: ACT,
      descriptor: readEmpSource('synthetic.emp', synthetic.replace('ACT_W = 4096', 'ACT_W = 6144')),
      engine: readEmpSource(ENGINE_PATH, ENGINE),
    });
    expect(agreeing.kind).toBe('resolved');
  });

  it('regionRulesNotRead names all five and carries the caller\'s reason', () => {
    const r = regionRulesNotRead('a hand-built act reads no aeon files');
    expect(r.kind).toBe('unresolved');
    if (r.kind !== 'unresolved') return;
    expect(r.unresolved.map((u) => u.name)).toEqual([...RULE_4_CONSTANTS]);
    expect(r.unresolved.every((u) => u.reason === 'a hand-built act reads no aeon files')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. THE READER'S OWN PARTS
// ---------------------------------------------------------------------------

describe('the .emp const reader survives aeon\'s real text', () => {
  it('a `const` written inside a comment is not a declaration', () => {
    // The vendored descriptor's prose says `const GRID_W = OJZ_ACT_GRID_W` in a
    // banner as well as declaring it, so a reader that did not mask comments
    // would see two declarations and refuse the real one.
    expect(DESC).toContain('See the banner over `const GRID_W` below');
    expect(DESC).toContain('used to be `const GRID_W = 3`');
    expect(empConstDecls(DESC).get('GRID_W')!.length).toBe(1);
  });

  it('hex, shifts and parentheses fold; a call or a field access does not', () => {
    const ok = (e: string) => evalEmpTokens(tokenizeEmpExpr(e)!, () => null);
    expect(ok('$0800')).toBe(2048);
    expect(ok('0x10')).toBe(16);
    expect(ok('(3 + 1) * 2')).toBe(8);
    expect(ok('1 << 11')).toBe(2048);
    expect(ok('6144 - 320 + 160')).toBe(5984);
    // `<<` is NOT JavaScript's 32-bit signed shift: aeon's widths are only
    // small today and a silent wrap to negative would be the quietest possible
    // wrong number.
    expect(ok('1 << 31')).toBe(2147483648);
    expect(tokenizeEmpExpr('f(3)')).toBeNull();
    expect(tokenizeEmpExpr('Act.width')).toBeNull();
    expect(tokenizeEmpExpr('[1, 2]')).toBeNull();
    expect(tokenizeEmpExpr('1.5')).toBeNull();
  });

  it('the descriptor\'s import list and the engine file\'s module are both read', () => {
    const imports = empImportModules(DESC);
    for (const n of ['SCREEN_WIDTH', 'SCREEN_HEIGHT', 'CAM_SCREEN_HALF_W', 'CAM_SCREEN_HALF_H', 'CAM_MAX_Y_STEP']) {
      expect(imports.get(n), `${n} should be imported from engine.constants`).toBe('engine.constants');
    }
    expect(empModuleName(ENGINE)).toBe('engine.constants');
  });

  it('aeon\'s real build-time delta is read as an UNFOLDABLE initializer', () => {
    // MEASURED, NOT ASSUMED. The descriptor's own build-time deltas --
    // `OJZ_SEC2_X1` and `OJZ_SEC5_X1` -- are not declarations INSIDE an `if`
    // block at all: each is a one-line `if` INITIALIZER, so `condition` is null
    // and it is the expression that cannot be folded. Both shapes must refuse,
    // and the suite would have tested only the synthetic one if this row had
    // trusted the shape instead of reading it.
    //
    // NOTHING HERE CLASSIFIES EITHER CONSTANT. Whether a gated constant belongs
    // to the DEBUG delta is empyrean's call (2026-09-18T23:47Z); these two are
    // granted by name and are not rule-4 constants anyway. This row only shows
    // that the reader sees the shape and folds nothing.
    for (const name of ['OJZ_SEC2_X1', 'OJZ_SEC5_X1']) {
      const decls = empConstDecls(DESC).get(name);
      expect(decls, `${name} should still be in the vendored descriptor`).toBeDefined();
      expect(decls!.length).toBe(1);
      expect(decls![0].condition).toBeNull();
      expect(decls![0].expr).toContain('if DEBUG == 1 {');
      expect(tokenizeEmpExpr(decls![0].expr)).toBeNull();
    }
  });

  it('a declaration INSIDE an `if` block carries that condition', () => {
    // The other shape, which aeon does not currently write for a const: the
    // reader must see the enclosing block, because `enclosingCondition` walking
    // outward is what the rule-4 refusal above depends on.
    const decls = empConstDecls([
      'const A = 1',
      'if DEBUG == 1 {',
      '    {',
      '        const B = 2',
      '    }',
      '}',
    ].join('\n'));
    expect(decls.get('A')![0].condition).toBeNull();
    expect(decls.get('B')![0].condition).toBe('DEBUG == 1');
  });
});

// ---------------------------------------------------------------------------
// 6. THE PATHS
// ---------------------------------------------------------------------------

describe('aeon\'s two files are LOCATED from the act\'s dataPath', () => {
  const DATA = 'games/sonic4/data/editor/ojz/act1/';

  it('the descriptor and the engine constants come from the same one key', () => {
    expect(wiringPaths(DATA, 'ojz')!.descriptor).toBe(DESC_PATH);
    expect(engineConstantsPath(DATA)).toBe(ENGINE_PATH);
  });

  it('a checkout under a prefix keeps both relative to the same root', () => {
    expect(engineConstantsPath('work/aeon/games/sonic4/data/editor/ojz/act1/'))
      .toBe('work/aeon/engine/system/constants.emp');
  });

  it('a layout with no games/<game> segment REFUSES rather than guessing', () => {
    expect(engineConstantsPath('data/editor/ojz/act1/')).toBeNull();
    expect(engineConstantsPath('sonic4/data/editor/ojz/act1/')).toBeNull();
    expect(engineConstantsPath('games/sonic4/levels/ojz/act1/')).toBeNull();
  });
});
