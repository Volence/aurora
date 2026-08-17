// THE TYPE SCALE IS CONSUMED (VIS7).
//
// theme.css generated a full type scale and three weights from the Empyrean
// contract, and the app used NONE of them: 227 inline `fontSize:` sites carried
// 13 different hard-coded numbers, so the tokens were decoration and the real
// scale was whatever each screen happened to type.
//
// The rule this file enforces is deliberately narrow: **no raw number where a
// contract step already exists.**
//
// The floor has since moved. Aurora's densest tier — 10px, 58 sites — had no
// name because the contract stopped at xs/11px, so `2xs` was added to the SUITE's
// tokens.json (additive: every consumer's generator iterates the scale). The
// dozen 9px hints were folded into that same step rather than given one of their
// own; the app does not need two micro tiers a pixel apart when colour already
// separates them, so 9 is mapped here as a value that must not come back.
//
// What is still allowed to be a raw number: the 8px/7px numerals stamped ON
// artwork (frame numbers, thumbnail corner tags, the ◀▶ stepper arrows) and the
// three display one-offs (15, 18, 36). Those are sized to the thing they sit on,
// not to a text scale.
//
// A source scan: these are .tsx files and this suite is node-only.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../../..');

/** Every renderer source file, tests excluded — they may quote raw values. */
function sources(): string[] {
  return execFileSync('git', ['ls-files', 'src/renderer'], { cwd: ROOT, encoding: 'utf8' })
    .trim().split('\n')
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__'));
}

/** px values that HAVE a step in the contract, and the token to use instead. */
const TOKENISED_SIZES: Record<string, string> = {
  10: 'T.t2xs', 11: 'T.tXs', 12: 'T.tSm', 13: 'T.tBase', 14: 'T.tMd', 16: 'T.tLg', 20: 'T.tXl', 24: 'T.t2xl',
  // 9 has no step of its own BY DECISION — the hint tier was folded into 2xs.
  // Mapped here so it cannot drift back in as a second micro size.
  9: 'T.t2xs (the 9px hint tier was folded into 2xs)',
};
const TOKENISED_WEIGHTS: Record<string, string> = {
  500: 'T.wMedium', 600: 'T.wSemibold',
  // The contract stops at semibold; the five 700 sites were snapped to it rather
  // than the suite gaining a weight for tiny text that reads the same either way.
  700: 'T.wSemibold (the contract stops at semibold)',
};

describe('inline type goes through the token bridge', () => {
  const files = sources();

  it('finds the renderer sources it is meant to scan', () => {
    // The vacuous-pass failure this repo has actually shipped twice: a path that
    // stops resolving turns every case below into a no-op that reports green.
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('src/renderer/components/ui/primitives.tsx');
  });

  it('uses no raw fontSize that the scale already names', () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      for (const m of src.matchAll(/\bfontSize: (\d+)\b/g)) {
        const tok = TOKENISED_SIZES[m[1]];
        if (tok) bad.push(`${f}: fontSize: ${m[1]} → ${tok}`);
      }
    }
    expect(bad, `raw sizes with a token:\n${bad.join('\n')}`).toEqual([]);
  });

  it('uses no raw fontWeight that the scale already names', () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      for (const m of src.matchAll(/\bfontWeight: (\d+)\b/g)) {
        const tok = TOKENISED_WEIGHTS[m[1]];
        if (tok) bad.push(`${f}: fontWeight: ${m[1]} → ${tok}`);
      }
    }
    // 700 is intentionally absent from the map: the contract stops at semibold,
    // so the handful of bold sites are off-contract and left visible, exactly
    // like the sub-11px sizes.
    expect(bad, `raw weights with a token:\n${bad.join('\n')}`).toEqual([]);
  });

  it('bridges every step the contract generates, none invented', () => {
    const theme = readFileSync(join(ROOT, 'src/renderer/components/ui/theme.ts'), 'utf8');
    const css = readFileSync(join(ROOT, 'src/renderer/styles/theme.css'), 'utf8');
    // Each token T claims must exist in the GENERATED css — a bridge to a
    // custom property that :root never defines renders as nothing at all, and
    // inline styles fail silently.
    for (const m of theme.matchAll(/var\((--text-[\w-]+|--weight-[\w-]+)\)/g)) {
      expect(css, `${m[1]} is bridged in theme.ts but not generated`).toContain(`${m[1]}:`);
    }
    // And the reverse for sizes: a step generated but unnamed is how VIS7 began.
    for (const m of css.matchAll(/(--text-[\w-]+-size):/g)) {
      expect(theme, `${m[1]} is generated but not bridged`).toContain(`var(${m[1]})`);
    }
  });
});
