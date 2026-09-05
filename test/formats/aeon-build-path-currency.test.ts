/**
 * CURRENCY — is the in-app guide's account of aeon's build still what aeon does?
 *
 * `docs/guides/effects-first-run.md` §7 tells a first-time author what to run
 * after Ctrl+S. Every sentence in it is a claim about a SHELL SCRIPT IN ANOTHER
 * REPO, so nothing in this repo can keep it true, and the thing that happens to
 * a claim nobody re-checks is on the page beside it: until this parcel §7 quoted
 * a build message —
 *
 *     ERROR: the FAST re-bake failed. Run tools/regenerate-level.sh directly to see why
 *       (it needs the out-of-repo donors: sonic_hack + skdisasm/...)
 *
 * — that aeon stopped printing on 2026-09-02, and told the author to fix a stuck
 * build with `touch`, which aeon's own message names as NOT a remedy. Both were
 * written when they were true. See docs/reviews/2026-09-05-guide-sentences.md.
 *
 * This file is the instrument for the other half of that: it reads aeon at a
 * COMMITTED REVISION and asserts the STRUCTURE §7 describes, not the wording of
 * any message. It follows `aeon-fixture-currency.test.ts`'s three rules exactly,
 * because they are the same rules and it is the same hazard:
 *
 *   1. committed revision through git objects, never the sibling working tree —
 *      every sibling repo on this machine is some peer lane's live checkout;
 *   2. it NAMES the revision it read in every message it can print;
 *   3. when it cannot run it SKIPS LOUDLY, saying what could not be measured.
 *
 * A FAILURE HERE IS NOT AN AURORA REGRESSION. It means aeon's build path moved
 * and a guide sentence went stale with it; the message says which sentence.
 *
 * ⚠ WHAT IT DELIBERATELY DOES NOT DO: match message prose. aeon may reword any
 * of these messages freely — the rows below key on the structure the sentences
 * depend on (which arm of the staleness branch runs what, and in what order),
 * so a rewrite that keeps the behaviour keeps this green.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { peerRepo, resolveRev, readAtRev, AURORA_DIR } from '../support/peer-repo';

/**
 * ⚠ PROSE OUTBIDS CODE HERE TWICE OVER, AND THE PLANT CAUGHT BOTH.
 *
 * The first draft of the FAST row matched `regenerate-level.sh` anywhere in the
 * arm and came back GREEN against a planted clone whose FAST arm had been gutted
 * — because build.sh's staleness branch carries a 25-line COMMENT naming the
 * tool while explaining it. Stripping comments was not enough: the same plant
 * stayed green a second time, because the arm's failure banner ECHOES the tool's
 * name four more times. A feature's words live in the prose about it, and the
 * prose survives the deletion of the code.
 *
 * So there are two views and each row says which one it needs:
 *   `shellCode`  — comments gone. Structure: branches, `exit`, ordering.
 *   `shellExec`  — comments AND output statements gone. "does this arm actually
 *                  RUN the thing", which is the only reading a gutted arm fails.
 */
function shellCode(text: string): string {
  return text
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .map((l) => l.replace(/\s#.*$/, ''))
    .join('\n');
}

function shellExec(text: string): string {
  return shellCode(text)
    .split('\n')
    .filter((l) => !/^\s*(echo|printf|cat)\b/.test(l))
    .join('\n');
}

/** The branch whose tip answers "what does aeon's build do TODAY". */
const AEON_TIP = 'origin/master';

/** Prefix every message with this so nobody triages it as an Aurora regression. */
const NOT_OURS = 'NOT AN AURORA REGRESSION: aeon\'s build path moved and a guide sentence went stale with it.';

/** §7 of the shipped guide — the same bytes the app renders (guides.ts `?raw`). */
const SAVE_AND_BUILD = (() => {
  const src = readFileSync(resolve(AURORA_DIR, 'docs/guides/effects-first-run.md'), 'utf8');
  const from = src.indexOf('## 7. Save, and build');
  if (from < 0) throw new Error('the guide has no "## 7. Save, and build" heading');
  const to = src.indexOf('\n## ', from + 1);
  return src.slice(from, to === -1 ? undefined : to);
})();

describe('CURRENCY: §7 tells the author to run what aeon actually requires', () => {
  const aeon = peerRepo('aeon');

  /**
   * The claim: "The re-bake is a step of this path, not a recovery from an
   * error" — so §7 must name the tool, and the tool must exist at aeon's tip.
   * A guide command that is not a file is the worst kind of wrong: it looks
   * like the author's environment is broken.
   */
  it('names tools/regenerate-level.sh, and that script exists at aeon\'s tip', (ctx) => {
    expect(SAVE_AND_BUILD, '§7 no longer names the re-bake: see C10, the whole point')
      .toContain('tools/regenerate-level.sh');
    if (aeon === null) {
      ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR), so '
        + 'CANNOT MEASURE whether tools/regenerate-level.sh is still what §7 should name');
      return;
    }
    const tip = resolveRev(aeon, AEON_TIP);
    if (tip === null) {
      ctx.skip(`SKIPPED, NOT PASSED: ${AEON_TIP} does not resolve in ${aeon}, so `
        + 'CANNOT MEASURE the re-bake tool §7 names');
      return;
    }
    const at = readAtRev(aeon, tip, 'tools/regenerate-level.sh');
    expect(at.ok, at.ok ? '' : `${NOT_OURS}\n  aeon ${AEON_TIP} is ${tip}\n  ${at.why}\n`
      + '  §7 tells the author to run it as step one. Find its replacement and rewrite §7.').toBe(true);
  });

  /**
   * The two claims §7 makes about what happens after a save, and the ONLY thing
   * separating the two commands it prints:
   *
   *   "./build.sh refuses, and it refuses EARLY"
   *   "FAST=1 ./build.sh runs the re-bake for you"
   *
   * Read off the shape of build.sh's staleness branch rather than its prose:
   * one arm under `FAST == 1` that invokes the re-bake, one arm that exits
   * non-zero, and the whole branch ahead of the assemble.
   */
  it('build.sh still re-bakes under FAST and refuses without it, before it assembles', (ctx) => {
    if (aeon === null) {
      ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR), so '
        + 'CANNOT MEASURE the staleness branch §7 describes');
      return;
    }
    const tip = resolveRev(aeon, AEON_TIP);
    if (tip === null) {
      ctx.skip(`SKIPPED, NOT PASSED: ${AEON_TIP} does not resolve in ${aeon}, so `
        + 'CANNOT MEASURE the staleness branch §7 describes');
      return;
    }
    const at = readAtRev(aeon, tip, 'build.sh');
    expect(at.ok, at.ok ? '' : `${NOT_OURS} ${at.why}`).toBe(true);
    if (!at.ok) return;
    const sh = shellCode(at.text);
    const where = `  aeon ${AEON_TIP} is ${tip}\n  read build.sh at that revision (comments stripped).\n`;

    // The gate itself.
    const gateAt = sh.indexOf('level_staleness.py');
    expect(gateAt, `${NOT_OURS}\n${where}`
      + '  build.sh no longer runs tools/level_staleness.py at all, so §7\'s whole account of\n'
      + '  "a save makes the tree stale" is obsolete. Rewrite §7.').toBeGreaterThan(-1);

    // The branch it feeds, isolated so the two arms below are read from IT and
    // not from a coincidental match elsewhere in a 900-line script.
    const branchAt = sh.indexOf('if [[ "$STALE" == "1" ]]; then', gateAt);
    expect(branchAt, `${NOT_OURS}\n${where}`
      + '  build.sh no longer branches on a $STALE flag after the gate; §7 describes two arms\n'
      + '  (FAST re-bakes / canonical refuses) that may no longer be two arms. Re-read it.').toBeGreaterThan(-1);
    const branchEnd = sh.indexOf('\nfi\n', branchAt);
    expect(branchEnd).toBeGreaterThan(branchAt);
    const branch = sh.slice(branchAt, branchEnd);
    const [fastArm, canonicalArm] = ((): [string, string] => {
      const elseAt = branch.indexOf('\n    else\n');
      expect(elseAt, `${NOT_OURS}\n${where}`
        + '  the staleness branch has no else arm: the canonical build may no longer refuse.').toBeGreaterThan(-1);
      return [branch.slice(0, elseAt), branch.slice(elseAt)];
    })();

    // ARM 1 — §7: "FAST=1 ./build.sh runs the re-bake for you". Read off
    // `shellExec`: the arm must INVOKE the re-bake, not mention it.
    expect(fastArm, 'the FAST arm was not isolated: the branch has no `FAST == "1"` test in it')
      .toMatch(/if \[\[ "\$FAST" == "1" \]\]/);
    expect(shellExec(fastArm), `${NOT_OURS}\n${where}`
      + '  the FAST arm of the staleness branch no longer RUNS the re-bake (it may still name it\n'
      + '  in a message, which is what this row refuses to accept), so §7\'s "the iteration loop:\n'
      + '  re-bakes for you" is wrong and the loop needs the step spelled out.')
      .toMatch(/^\s*"?\$\{TOOLS\}\/regenerate-level\.sh/m);

    // ARM 2 — §7: "./build.sh refuses", and names the remedy.
    expect(canonicalArm, `${NOT_OURS}\n${where}`
      + '  the canonical arm no longer exits non-zero: §7 tells the author the plain build\n'
      + '  REFUSES until the tree is re-baked, which would then be a false warning.')
      .toContain('exit 1');
    expect(canonicalArm, `${NOT_OURS}\n${where}`
      + '  the canonical arm no longer names tools/regenerate-level.sh as the remedy; §7 says\n'
      + '  the build\'s own message gives it, which is why §7 does not transcribe the message.')
      .toContain('regenerate-level.sh');

    // §7: "it refuses EARLY … nothing downstream has looked at it yet". The one
    // sentence that tells an author a red build here is not a verdict on their work.
    const assembleAt = sh.indexOf('"${SIGIL_BUILD}" build');
    expect(assembleAt, `${NOT_OURS}\n${where}`
      + '  cannot find the assemble step in build.sh, so the ORDER §7 claims is unmeasured here.')
      .toBeGreaterThan(-1);
    expect(branchAt, `${NOT_OURS}\n${where}`
      + '  the staleness branch no longer precedes the assemble. §7 tells the author a stale\n'
      + '  build stops BEFORE anything judges their bytes: that is the sentence at risk.')
      .toBeLessThan(assembleAt);
  });

  /**
   * §7: "`touch` is not a shortcut past this … a second arm that reads no
   * timestamps at all". The guide said the opposite until this parcel, and
   * prescribed `touch` as the fix; the rewrite rests entirely on arm B existing.
   */
  it('the staleness gate still has a content-stamp arm, which is why touch is not a fix', (ctx) => {
    // A REGEX, NOT A LITERAL SUBSTRING, and the emphasis markers are why.
    // `markdown-lite` does not combine marks, so `**`touch` is not ...**` paints
    // its backticks on screen; the bold had to move off the code span and the
    // literal this line used to hold did not survive that. The SENTENCE is what
    // is under test, so the assertion tolerates where the `**` sits and nothing
    // else. See scripts/check-guide-text.mjs, check A.
    expect(SAVE_AND_BUILD, '§7 no longer warns that `touch` is not a shortcut. It used to PRESCRIBE it.')
      .toMatch(/`touch` \*{0,2}is not a shortcut past this/);
    if (aeon === null) {
      ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR), so '
        + 'CANNOT MEASURE whether the content-stamp arm §7 rests on still exists');
      return;
    }
    const tip = resolveRev(aeon, AEON_TIP);
    if (tip === null) {
      ctx.skip(`SKIPPED, NOT PASSED: ${AEON_TIP} does not resolve in ${aeon}, so `
        + 'CANNOT MEASURE the content-stamp arm §7 rests on');
      return;
    }
    const at = readAtRev(aeon, tip, 'tools/level_staleness.py');
    expect(at.ok, at.ok ? '' : `${NOT_OURS}\n  aeon ${AEON_TIP} is ${tip}\n  ${at.why}`).toBe(true);
    if (!at.ok) return;
    // Structural, not prose: the stamp is a written artifact and a flag, and the
    // arm is a sha256 comparison against it. A gate with only a timestamp arm
    // CANNOT see a delete, which is the case §7 sends the author to re-bake for.
    expect(at.text, `${NOT_OURS}\n  aeon ${AEON_TIP} is ${tip}\n`
      + '  tools/level_staleness.py no longer writes/reads an editor-source stamp. §7 tells the\n'
      + '  author a delete or a revert is caught whatever the mtimes say: without this arm it\n'
      + '  is not, and the old `touch` advice would be back on the table.').toMatch(/--stamp/);
    expect(at.text, `${NOT_OURS}\n  aeon ${AEON_TIP} is ${tip}\n`
      + '  tools/level_staleness.py no longer hashes the editor sources, so the arm §7 describes\n'
      + '  ("compares a content stamp … reads no timestamps at all") is gone.').toMatch(/sha256/);
  });
});
