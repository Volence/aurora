/**
 * `scripts/check-pseudo-skip.mjs` is only a gate while something actually runs it.
 *
 * It is a STATIC pass, not a vitest reporter, so — unlike every other check in
 * this suite — vitest running does not run it. It is wired in one place, the
 * `test` script in package.json, and that is a single line a merge or a
 * "let me just run vitest directly" habit can drop. Dropping it changes no
 * test's output: the suite stays green, and the class of defect it exists for
 * (a test that reports PASSED while touching none of its subject) is by
 * construction invisible in a run's output. That is the same silence the gate
 * exists to break, so the wiring needs its own alarm.
 *
 * This asserts the wiring, not the behaviour.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../..');
const PKG = resolve(REPO, 'package.json');
const GATE = 'scripts/check-pseudo-skip.mjs';

describe('the pseudo-skip gate is wired into `npm test`', () => {
  const pkg = JSON.parse(readFileSync(PKG, 'utf8')) as { scripts?: Record<string, string> };

  it('ANTI-VACUOUS: package.json really declares a `test` script to look inside', () => {
    // Without this, a package.json that lost the script entirely would make the
    // row below assert over `undefined` and could only pass by finding nothing.
    expect(pkg.scripts, 'package.json declares no scripts at all').toBeTruthy();
    expect(typeof pkg.scripts!.test, 'package.json declares no `test` script').toBe('string');
    expect(pkg.scripts!.test.length).toBeGreaterThan(0);
  });

  it('`npm test` runs the gate', () => {
    expect(pkg.scripts!.test).toContain(GATE);
  });

  it('runs it BEFORE vitest, so a violation stops the run rather than trailing it', () => {
    const script = pkg.scripts!.test;
    const gateAt = script.indexOf(GATE);
    const vitestAt = script.indexOf('vitest');
    expect(gateAt).toBeGreaterThanOrEqual(0);
    expect(vitestAt).toBeGreaterThanOrEqual(0);
    expect(gateAt).toBeLessThan(vitestAt);
  });

  it('the file the script names exists on disk', () => {
    // Renaming or moving the gate without touching package.json would otherwise
    // leave `npm test` invoking a path that cannot load.
    expect(existsSync(resolve(REPO, GATE)), `${GATE} is named in package.json but is not on disk`)
      .toBe(true);
  });
});
