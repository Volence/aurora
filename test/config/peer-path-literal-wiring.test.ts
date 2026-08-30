/**
 * `scripts/check-peer-path-literals.mjs` is only a gate while something runs it.
 *
 * Same reasoning as `pseudo-skip-wiring.test.ts`, and the same hole it plugs: a
 * STATIC pass is not run by vitest, so dropping its one line from `package.json`
 * changes no test's output. Worse here than for most gates, because the defect
 * it guards — a test pinned to one machine's home directory — is invisible ON
 * THAT MACHINE by definition. The suite stays green either way; only a different
 * checkout ever finds out, and by then the row has been unrunnable for months.
 *
 * This asserts the wiring, not the behaviour.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../..');
const PKG = resolve(REPO, 'package.json');
const GATE = 'scripts/check-peer-path-literals.mjs';

describe('the peer-path-literal gate is wired into `npm test`', () => {
  const pkg = JSON.parse(readFileSync(PKG, 'utf8')) as { scripts?: Record<string, string> };

  it('ANTI-VACUOUS: package.json really declares a `test` script to look inside', () => {
    // Without this, a package.json that lost the script entirely would make the
    // rows below assert over `undefined` and could only pass by finding nothing.
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
    expect(existsSync(resolve(REPO, GATE)), `${GATE} is named in package.json but is not on disk`)
      .toBe(true);
  });
});
