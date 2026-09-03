// THE TWO WHOLESALE WIPES MUST NAME WHAT THEY DESTROY, IN THE AUTHOR'S WORDS.
//
// O48b pressed both buttons and found the REACH correct and the WORDING short:
// Clear and Reset each destroy the loop crossover field, and neither string said
// so. The field is written by the Loop row in this same palette, so an author who
// had painted crossovers was told about "reserved bits" — this file's internal
// name for the same thing — and could not connect the two. A destructive button
// whose wording understates its reach is a defect even when the code is right,
// because the wording is the half a reader acts on.
//
// SOURCE-GREP, deliberately: these are strings in JSX with no seam to call. The
// weakness is stated rather than hidden — this cannot prove the buttons are
// WIRED to those titles; `scratchpad/collision-destructive-harness.mjs` presses
// them for real and is what proves the reach. This row exists so the wording
// cannot drift back silently, which a harness nobody runs would not catch.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', 'CollisionPalette.tsx'), 'utf8');

describe('Clear and Reset say that the loop crossover goes with the wipe', () => {
  // Anti-vacuous: if the file stopped containing the buttons at all, every
  // assertion below would pass over an empty string. Prove the subject is here.
  //
  // ⚠ THE SPELLING MOVED ONCE, AND THIS ROW CAUGHT IT — which is the whole
  // point of a probe that pins a literal. d-27 (2026-09-03) routed both onClicks
  // through `actAndDropFocus` so the button drops keyboard focus as it fires,
  // and the old `onClick={resetToEngine}` text stopped existing. The probe is
  // re-pointed at the new spelling rather than loosened to a regex that could
  // never notice again.
  it('the file really carries both wholesale writers', () => {
    expect(SRC).toContain('onClick={(e) => actAndDropFocus(e, resetToEngine)}');
    expect(SRC).toContain('onClick={(e) => actAndDropFocus(e, clearSection)}');
  });

  // d-27, and READ WHAT THIS IS: a SPELLING pin, not a behaviour gate. It cannot
  // prove the blur runs, that it runs unconditionally, or that the button still
  // works — the node suite cannot see React, a DOM or a click. Rows [k3]-[k7] of
  // `scratchpad/collision-destructive-harness.mjs` press the real buttons in the
  // real app and are what prove all four; each was shown RED first under a plant
  // that removed the blur (P6/P7), one that kept the blur but broke the button
  // (P8), and one that blurred only on the acting path (P9). This row exists so
  // the wiring cannot be dropped in a refactor that never runs the harness.
  it('both destructive buttons go through the act-and-drop-focus helper, which blurs', () => {
    // Sliced, not regexed: the signature itself contains `()` (the `act: () =>
    // void` parameter), so a `[^)]*` for the parameter list stops in the middle
    // of it and reports the helper ABSENT while it is right there — a false
    // negative that reads exactly like the defect this row watches for.
    const at = SRC.indexOf('function actAndDropFocus');
    expect(at, 'actAndDropFocus not found — the d-27 wiring cannot be judged').toBeGreaterThan(-1);
    const end = SRC.indexOf('\n}', at);
    expect(end, 'actAndDropFocus has no closing brace — refusing to judge a partial read')
      .toBeGreaterThan(at);
    const helper = SRC.slice(at, end);
    expect(helper).toContain('.blur()');
    // BEFORE the action, so an early return inside the handler cannot skip it.
    expect(helper.indexOf('.blur()')).toBeLessThan(helper.indexOf('act()'));
  });

  it("Reset's tooltip names the loop crossover", () => {
    const title = /title=\{`Reset section \$\{activeSection\}[^`]*`\}/.exec(SRC)?.[0];
    expect(title, 'Reset button title not found — the row cannot judge what it cannot read').toBeTruthy();
    expect(title!.toLowerCase()).toContain('loop crossover');
  });

  it("Clear's tooltip names the loop crossover", () => {
    const title = /title=\{`Erase ALL collision[^`]*`\}/.exec(SRC)?.[0];
    expect(title, 'Clear button title not found — the row cannot judge what it cannot read').toBeTruthy();
    expect(title!.toLowerCase()).toContain('loop crossover');
  });

  it("Reset's discard toast names the loop crossover, not only the reserved bits", () => {
    // The toast is the one that fires at the moment work is destroyed, so it is
    // the most load-bearing of the three.
    const i = SRC.indexOf('Reset collision ${p.toUpperCase()}');
    expect(i, 'the discard toast was not found').toBeGreaterThan(-1);
    const toast = SRC.slice(i, i + 400).toLowerCase();
    expect(toast).toContain('loop crossover');
    // and it must still promise the undo, which O48b proved true by pressing it
    expect(toast).toContain('undo restores');
  });
});
