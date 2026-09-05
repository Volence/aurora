// The game screen's size, checked against the ENGINE'S OWN CONSTANT.
//
// Aurora states 320x224 in core/model/screen.ts and this file is why that is
// not a typed pin: it reads aeon's `engine/system/constants.emp` and asserts
// the two agree. If aeon ever moves to a different frame (a 256-wide H32 mode,
// a 240-line PAL strip), this goes red rather than the overlay quietly lying
// about what the camera sees.
//
// ⚠ IT READS A COMMITTED REVISION, NOT THE WORKING TREE — changed 2026-09-02.
// Until then this WALKED UP twelve directories for a sibling `aeon/` and then
// `readFileSync`'d the file out of it. Two defects in one line:
//
//   1. On this machine every sibling repo is some peer lane's LIVE checkout, so
//      this row's colour was decided by whatever that lane had typed and not
//      committed. Green and red both came from outside this repository. That is
//      the most upstream rule in the suite protocol (empyrean origin/main
//      2fd7b5f0, docs/OVERSEER-PROTOCOL.md: "prefer `git show <rev>:<path>` over
//      reading a sibling's working file, because the first names a revision and
//      the second silently names 'whatever is on disk right now'"), and the
//      defect is booked in docs/reviews/2026-08-28-golden-live-tree.md.
//   2. The walk was the one route into a peer tree that no environment variable
//      could redirect — the same shape measured as an fs-level leak in two other
//      files on 2026-08-30 (docs/reviews/2026-08-30-s1disasm-test-coupling.md).
//
// Both go away by using the module this repo already has for the job:
// `test/support/peer-repo.ts`, which resolves the checkout through the one
// sibling-root derivation (`AEON_DIR`, then `EMPYREAN_SUITE_ROOT/aeon`, then a
// derivation from this repo's own git common dir — empyrean
// contract/SUITE_PATHS.md @ 82982b7f) and then reads through `git -C … show`,
// never opening a file inside the checkout.
//
// WHY A BRANCH TIP AND NOT A FROZEN SHA. The proposition under test is "aurora
// and aeon agree about the frame TODAY". A frozen SHA equals itself forever, so
// the row would pass for the rest of its life and detect exactly the drift it
// exists for: none. `origin/master` is a REMOTE-TRACKING ref — committed,
// named, and never anybody's uncommitted edit — which is the same trade
// `test/formats/aeon-fixture-currency.test.ts` makes and states: as fresh as
// the last fetch in that checkout, "an invisible failure for a visible lag".
//
// When the checkout is absent, or the ref does not resolve, the row SKIPS WITH
// A MESSAGE naming the variable to set — never silently green, never a hard
// failure on a machine without aeon. A file that is GONE at that revision is
// not a skip: the revision resolved, so it was measured, and a renamed or
// deleted `constants.emp` is drift of the loudest kind.

import { describe, it, expect } from 'vitest';
import { peerRepo, resolveRev, readAtRev } from '../../../../test/support/peer-repo';
import { checkoutEnv } from '../../../../test/support/sibling-root.mjs';
import { SCREEN_WIDTH, SCREEN_HEIGHT, SCREEN_CONSTANT_SOURCE } from '../screen';

/** The branch whose tip answers "what frame does aeon draw today". */
const AEON_TIP = 'origin/master';

function readConst(src: string, name: string): number | null {
  const m = src.match(new RegExp(`^\\s*pub\\s+const\\s+${name}\\s*=\\s*(\\d+)`, 'm'));
  return m ? Number(m[1]) : null;
}

interface Measured {
  rev: string;
  text: string;
}

/**
 * The constants file at aeon's tip, or a skip reason. Called INSIDE each row —
 * a throw or a read in a describe body takes the whole file with it.
 */
function constantsAtTip(): Measured | { skip: string } {
  const aeon = peerRepo('aeon');
  if (aeon === null) {
    return {
      skip: `SKIPPED, NOT PASSED: no aeon checkout beside this repo (set ${checkoutEnv('aeon')}): `
        + `CANNOT MEASURE whether Aurora's ${SCREEN_WIDTH}x${SCREEN_HEIGHT} still matches the engine`,
    };
  }
  const tip = resolveRev(aeon, AEON_TIP);
  if (tip === null) {
    return {
      skip: `SKIPPED, NOT PASSED: ${AEON_TIP} does not resolve in ${aeon} (unfetched? shallow?): `
        + `CANNOT MEASURE ${SCREEN_CONSTANT_SOURCE.file}`,
    };
  }
  const at = readAtRev(aeon, tip, SCREEN_CONSTANT_SOURCE.file);
  // Not a skip: the revision resolved, so this WAS measured, and the file being
  // gone at aeon's tip is the loudest possible form of the drift this watches.
  if (!at.ok) {
    throw new Error(
      `${SCREEN_CONSTANT_SOURCE.file} could not be read at aeon ${AEON_TIP} (${tip}): ${at.why}. `
      + 'If aeon moved the constant, move SCREEN_CONSTANT_SOURCE in src/core/model/screen.ts with it.',
    );
  }
  return { rev: tip, text: at.text };
}

describe('core/model/screen mirrors aeon engine.constants', () => {
  for (const [label, ours, symbol] of [
    ['SCREEN_WIDTH', SCREEN_WIDTH, SCREEN_CONSTANT_SOURCE.width],
    ['SCREEN_HEIGHT', SCREEN_HEIGHT, SCREEN_CONSTANT_SOURCE.height],
  ] as const) {
    it(`${label} equals aeon's ${symbol} at ${AEON_TIP}`, (ctx) => {
      const got = constantsAtTip();
      if ('skip' in got) {
        ctx.skip(got.skip);
        return;
      }
      const theirs = readConst(got.text, symbol);
      expect(
        theirs,
        `${symbol} not found in ${SCREEN_CONSTANT_SOURCE.file} at aeon ${got.rev}: the constant `
        + 'was renamed or its spelling changed; update SCREEN_CONSTANT_SOURCE to match.',
      ).not.toBeNull();
      expect(
        ours,
        `Aurora says ${label}=${ours}; aeon ${got.rev} says ${symbol}=${theirs}. The overlay draws `
        + 'what Aurora says, so one of the two is lying about what the player sees.',
      ).toBe(theirs);
    });
  }

  it('names the file and symbols it mirrors, so the docblock cannot drift from the check', () => {
    expect(SCREEN_CONSTANT_SOURCE.file).toBe('engine/system/constants.emp');
    expect(SCREEN_CONSTANT_SOURCE.width).toBe('SCREEN_WIDTH');
    expect(SCREEN_CONSTANT_SOURCE.height).toBe('SCREEN_HEIGHT');
  });
});
