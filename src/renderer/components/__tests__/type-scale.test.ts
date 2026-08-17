// THE TYPE SCALE IS CONSUMED (VIS7).
//
// theme.css generated a full type scale and three weights from the Empyrean
// contract, and the app used NONE of them: 227 inline `fontSize:` sites carried
// 13 different hard-coded numbers, so the tokens were decoration and the real
// scale was whatever each screen happened to type.
//
// The rule this file enforces is deliberately narrow: **no raw number where a
// contract step already exists.** It does not forbid off-scale sizes, because
// Aurora genuinely draws below the contract's floor — xs is 11px and the app's
// most common chrome size is 10px, with 9 and 8 beneath it. Those are a gap in
// the SUITE's tokens.json (shared with Seraph), not something Aurora may forge a
// local step for, so they stay raw and stay visible.
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
  11: 'T.tXs', 12: 'T.tSm', 13: 'T.tBase', 14: 'T.tMd', 16: 'T.tLg', 20: 'T.tXl', 24: 'T.t2xl',
};
const TOKENISED_WEIGHTS: Record<string, string> = { 500: 'T.wMedium', 600: 'T.wSemibold' };

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
