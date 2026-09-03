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
  it('the file really carries both wholesale writers', () => {
    expect(SRC).toContain('onClick={resetToEngine}');
    expect(SRC).toContain('onClick={clearSection}');
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
