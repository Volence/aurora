// Source-grep guard for the "Give new art collision" commit-time toggle — the
// same house pattern canvas-mode-wiring.test.ts and new-canvas-dialog-wiring.
// test.ts use: CommitPlanView.tsx is a .tsx file and the suite is node-only,
// no jsdom, no RTL, so nothing in it ever renders.
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. It proves the toggle is WIRED to the
// pure transform (commit-collision.ts's withCollision) rather than the view
// re-deciding the shape byte itself — a second copy of the $FF rule is exactly
// how one of the two copies ends up being $FB — and that it starts off. It does
// NOT prove the toggle behaves correctly on screen; that is
// commit-collision.test.ts's job for the transform and a CDP pass's job for
// the pixels.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Source with comments stripped, so prose ABOUT the rule cannot satisfy an
 *  assertion about the rule itself. */
const src = readFileSync(join(__dirname, '../CommitPlanView.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('CommitPlanView collision-toggle wiring', () => {
  it('routes the toggle through the pure transform', () => {
    expect(src).toMatch(/withCollision/);
    // The view must not assign shapes itself — a second copy of the $FF rule
    // is how one of them ends up being $FB.
    expect(src, 'the view must not name a shape byte itself').not.toMatch(/0xff|255/i);
  });

  it('defaults the toggle off', () => {
    expect(src).toMatch(/useState\(false\)|= false/);
  });
});
