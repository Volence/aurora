/**
 * CURRENCY FOR A TRANSCRIBED RULE — is the two-writer advisory still the
 * engine's, and does the engine still say what Aurora claims it says?
 *
 * WHY THIS FILE EXISTS. `VSPLIT_LOCK_CLAUSES` is a TRANSCRIPTION of one aeon
 * `ensure`. Every assertion in `effects-aeon.test.ts` about it is
 * self-consistent by construction — the clauses are declared once and the tests
 * derive from that declaration, which is right for "do the three surfaces agree"
 * and answers NOTHING about "does aeon still refuse this, for these reasons,
 * with these two remedies". The defect being closed by ROADMAP row 80 was
 * exactly a self-consistent claim about a fact nobody re-checked: a comment
 * saying "it already has its own advisory" about an advisory that did not exist.
 * So the fact gets an instrument pointed at the engine.
 *
 * IT READS AEON AT A COMMITTED REVISION through git objects, never through the
 * sibling working tree — `test/support/peer-repo.ts` carries the whole rule and
 * the incident behind it (`docs/reviews/2026-08-28-golden-live-tree.md`).
 *
 * WHEN IT CANNOT RUN it SKIPS LOUDLY, naming what could not be measured. A
 * "could not measure" is never rendered as green-and-silent.
 *
 * A FAILURE HERE IS NOT AN AURORA REGRESSION in the usual sense: it means the
 * engine's ruling moved and the advisory's words need re-deriving from it.
 */

import { describe, it, expect } from 'vitest';
import { peerRepo, resolveRev, readAtRev, isAncestor } from '../support/peer-repo';
import { VSPLIT_LOCK_CLAUSES } from '../../src/renderer/providers/effects-aeon';

/** The revision the advisory's words were derived from, on 2026-08-28. */
const PIN = 'ea343260c42c961b544f14cede0a8f25a7a7a5fd';
/** The branch whose tip answers "what does the engine rule TODAY". */
const AEON_TIP = 'origin/master';
const PATH = 'engine/level/scene_dsl.emp';

/**
 * THE ENSURE, IDENTIFIED BY ITS CONDITION rather than by a line number.
 *
 * A pinned line number is a fixture that rots on the next edit anywhere above
 * it; the condition is the rule. `scene_dsl.emp:1290` at the pin, for a reader.
 */
const SCENE_ENSURE_COND = 'any_vsplit == 0 || v_factor == 15';
/** `scene_vsplit_line()`'s backstop — the second half of the ruling. */
const LINE_ENSURE_COND = 's.sc_v_factor == 15';

/**
 * The FACTS Aurora's sentence claims about the engine, each as a phrase that
 * must be present in the engine's own message.
 *
 * ⚠ NOT THE WHOLE MESSAGE. Aurora's hint is a panel sentence, not a build log,
 * and pinning the engine's prose verbatim would fail on a comma. What is pinned
 * is every load-bearing CLAIM: the two writers by name, the word they share, the
 * baked-once property, and BOTH remedies — because the remedy count is the thing
 * that was silently wrong before row 80.
 */
const ENGINE_CLAIMS = Object.freeze({
  writerOne: 'Parallax_Step5_Vscroll recomputes',
  writerOneShips: 'Vscroll_Write ships it to VSRAM entry 1 at frame top',
  writerTwo: 'writes an ABSOLUTE constant to the same word mid-frame',
  bakedOnce: 'ONE baked scroll value at ONE baked fire line',
  whyBaked: 'only while Vscroll_BG is constant',
  remedyLock: 'Lock the plane (v_factor: 15) and author the depth as a split',
  remedyHorizontal: 'express it horizontally (layer(fb:) / curve:), which the walker recomputes every frame',
});

function sceneEnsureAt(text: string, cond: string): string | null {
  const i = text.indexOf(cond);
  if (i < 0) return null;
  // The message is the double-quoted string that follows the condition.
  const open = text.indexOf('"', i);
  if (open < 0) return null;
  const close = text.indexOf('"', open + 1);
  return close < 0 ? null : text.slice(open + 1, close);
}

describe('the two-writer advisory is a transcription of an ensure that still exists', () => {
  const aeon = peerRepo('aeon');

  const load = (rev: string): { text: string } | { why: string } => {
    if (aeon === null) {
      return { why: `no aeon checkout beside this repo (set AURORA_AEON_REPO): CANNOT MEASURE ${rev}` };
    }
    const r = readAtRev(aeon, rev, PATH);
    return r.ok ? { text: r.text } : { why: r.why };
  };

  it(`aeon ${PIN.slice(0, 12)} still carries the scene() ensure the clauses were derived from`, (ctx) => {
    const got = load(PIN);
    if ('why' in got) { ctx.skip(`SKIPPED, NOT PASSED: ${got.why}`); return; }
    const msg = sceneEnsureAt(got.text, SCENE_ENSURE_COND);
    expect(msg, `${PATH} at ${PIN} has no ensure on \`${SCENE_ENSURE_COND}\``).not.toBeNull();
    // Every claim Aurora's sentence makes about the engine, checked against it.
    for (const [name, phrase] of Object.entries(ENGINE_CLAIMS)) {
      expect(msg, `engine message lost the "${name}" claim`).toContain(phrase);
    }
    // The backstop is the other half of the ruling and its own docblock is why
    // this must be an EDITOR message: the authored path never reaches it.
    const backstop = sceneEnsureAt(got.text, LINE_ENSURE_COND);
    expect(backstop, `${PATH} at ${PIN} has no ensure on \`${LINE_ENSURE_COND}\``).not.toBeNull();
    expect(backstop).toContain('An authored scene cannot reach this');
  });

  it('AURORA\'S CLAUSES SAY WHAT THE ENGINE SAYS: both writers, and BOTH remedies', (ctx) => {
    const got = load(PIN);
    if ('why' in got) { ctx.skip(`SKIPPED, NOT PASSED: ${got.why}`); return; }
    const msg = sceneEnsureAt(got.text, SCENE_ENSURE_COND) ?? '';

    // ── THE MECHANISM ──────────────────────────────────────────────────────
    // Aurora shortens the engine's prose for a panel; what must survive is that
    // BOTH writers, the shared word and the baked-once property are named. Each
    // assertion below pairs an Aurora phrase with the engine phrase it stands
    // for, so a reader can see the derivation without opening two files.
    expect(msg).toContain(ENGINE_CLAIMS.writerOne);
    expect(VSPLIT_LOCK_CLAUSES.mechanism).toMatch(/the parallax step recomputes/i);
    expect(msg).toContain(ENGINE_CLAIMS.writerOneShips);
    expect(VSPLIT_LOCK_CLAUSES.mechanism).toMatch(/ships it at frame top/i);
    expect(msg).toContain(ENGINE_CLAIMS.writerTwo);
    expect(VSPLIT_LOCK_CLAUSES.mechanism).toMatch(/ABSOLUTE constant to the same word mid-frame/);
    expect(msg).toContain(ENGINE_CLAIMS.bakedOnce);
    expect(VSPLIT_LOCK_CLAUSES.mechanism).toContain('ONE baked scroll value at ONE baked fire line');

    // ── THE LOCK SENTINEL, the number the author types ─────────────────────
    expect(msg).toContain('15 is the lock sentinel');
    expect(VSPLIT_LOCK_CLAUSES.sceneIs(3)).toContain('15 is the lock sentinel');
    expect(VSPLIT_LOCK_CLAUSES.sceneIs(3)).toContain('v_factor 3');

    // ── BOTH REMEDIES, which is the half that was missing ──────────────────
    // The engine offers two and they are different products. Before row 80 the
    // only sentence in Aurora on this bound offered one.
    expect(msg).toContain(ENGINE_CLAIMS.remedyLock);
    expect(VSPLIT_LOCK_CLAUSES.remedyLock).toMatch(/lock the plane \(v_factor 15\)/i);
    expect(VSPLIT_LOCK_CLAUSES.remedyLock).toMatch(/author the depth as a split/i);
    expect(msg).toContain(ENGINE_CLAIMS.remedyHorizontal);
    expect(VSPLIT_LOCK_CLAUSES.remedyHorizontal).toMatch(/horizontally/i);
    // `layer(fb:)` and `curve:` are the engine's two spellings; Aurora names
    // both in the author's words rather than the DSL's.
    expect(VSPLIT_LOCK_CLAUSES.remedyHorizontal).toMatch(/Plane B factor/);
    expect(VSPLIT_LOCK_CLAUSES.remedyHorizontal).toMatch(/curve/i);
    expect(VSPLIT_LOCK_CLAUSES.remedyHorizontal).toMatch(/recomputes every frame/);
    expect(VSPLIT_LOCK_CLAUSES.remedies).toContain(VSPLIT_LOCK_CLAUSES.remedyLock);
    expect(VSPLIT_LOCK_CLAUSES.remedies).toContain(VSPLIT_LOCK_CLAUSES.remedyHorizontal);
  });

  it(`CURRENCY: the ruling is unchanged at aeon ${AEON_TIP}`, (ctx) => {
    // The pin equals itself by construction; this is the only row that can
    // notice the engine moving on. KNOWN LIMIT, stated: it resolves the
    // remote-tracking ref WITHOUT fetching, so it is as fresh as the last fetch
    // in that checkout — the protocol's own trade, offline-safe and committed.
    if (aeon === null) {
      ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AURORA_AEON_REPO): '
        + `CANNOT MEASURE whether the pin ${PIN} is still current`);
      return;
    }
    const tip = resolveRev(aeon, AEON_TIP);
    if (tip === null) {
      ctx.skip(`SKIPPED, NOT PASSED: ${AEON_TIP} does not resolve in ${aeon}: `
        + `CANNOT MEASURE currency of pin ${PIN}`);
      return;
    }
    if (!isAncestor(aeon, PIN, tip)) {
      ctx.skip(`SKIPPED, NOT PASSED: pin ${PIN} is not an ancestor of ${AEON_TIP} (${tip}): `
        + 'the pin is unpublished or the branch was rewritten; re-derive the clauses');
      return;
    }
    const got = load(tip);
    if ('why' in got) { ctx.skip(`SKIPPED, NOT PASSED: ${got.why}`); return; }
    const msg = sceneEnsureAt(got.text, SCENE_ENSURE_COND);
    expect(msg, `${PATH} at ${AEON_TIP} (${tip}) no longer has an ensure on \`${SCENE_ENSURE_COND}\`: `
      + 'the two-writer ruling moved; re-derive VSPLIT_LOCK_CLAUSES from its new home').not.toBeNull();
    for (const [name, phrase] of Object.entries(ENGINE_CLAIMS)) {
      expect(msg, `at ${AEON_TIP} (${tip}) the engine message no longer makes the "${name}" claim: `
        + 'Aurora\'s advisory is stale, not wrong; re-derive it').toContain(phrase);
    }
  });
});
