/**
 * The skip reporter is only a gate while something actually runs it.
 *
 * `scripts/skip-report-reporter.mjs` names every skipped test with its reason and
 * fails the run when a skip cannot say why. It is wired in `vitest.config.ts`'s
 * `reporters`, which is a single line that a merge, a refactor or a stray
 * `--reporter=` experiment can drop — and dropping it changes NO test's output.
 * The suite would go on being green, the skip block would stop being printed, and
 * nothing would say the gate had left. That is the same silence the reporter
 * exists to break, so it needs its own alarm.
 *
 * This asserts the wiring, not the behaviour; `skip-report-reporter.test.ts`
 * drives the reporter itself.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../..');
const CONFIG = resolve(REPO, 'vitest.config.ts');

/** Every `./…`-style reporter path named in the config's `reporters` array. */
function declaredReporterPaths(source: string): string[] {
  const block = /reporters\s*:\s*\[([^\]]*)\]/s.exec(source);
  if (!block) return [];
  return [...block[1].matchAll(/['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
}

describe('the skip reporter is wired into vitest.config.ts', () => {
  const source = readFileSync(CONFIG, 'utf8');

  it('ANTI-VACUOUS: the config really declares a `reporters` array to look inside', () => {
    // Without this, a config that lost the whole array would make the row below
    // assert over an empty list and could only ever pass by finding nothing.
    expect(source, 'vitest.config.ts declares no `reporters` array at all').toMatch(
      /reporters\s*:\s*\[/,
    );
    expect(declaredReporterPaths(source).length).toBeGreaterThan(0);
  });

  it('names the skip reporter among its reporters', () => {
    expect(declaredReporterPaths(source)).toContain('./scripts/skip-report-reporter.mjs');
  });

  it('every reporter path the config names exists on disk', () => {
    // Renaming or moving the file without touching the config would otherwise
    // leave a config that mentions a gate that cannot load.
    for (const p of declaredReporterPaths(source)) {
      expect(existsSync(resolve(REPO, p)), `${p} is named in vitest.config.ts but is not on disk`)
        .toBe(true);
    }
  });

  it('keeps vitest\'s own `default` reporter alongside it', () => {
    // The skip reporter prints only the skip block. If it ever replaced
    // 'default' the suite would lose its normal pass/fail output entirely.
    expect(source).toMatch(/reporters\s*:\s*\[\s*['"]default['"]/);
  });
});
