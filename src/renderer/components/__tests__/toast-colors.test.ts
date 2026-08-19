// Every toast type has a colour, by source scan: ToastContainer is .tsx and
// never executes in this node-only suite.
//
// `TYPE_COLORS` is a `Record<ToastType, …>`, so a missing member is a COMPILE
// error and tsc is the real gate — this guard exists for the other half, which
// the type cannot state: that the new member is bound to the theme's own
// warning token rather than borrowing the error colour (a warning painted red
// says "something failed", which is exactly what a loop warning does not mean).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '..', 'ToastContainer.tsx'), 'utf8');

describe('ToastContainer colours', () => {
  it('gives warning the theme warning token, not the error one', () => {
    expect(src).toMatch(/warning:\s*\{[^}]*border:\s*T\.warning/);
  });

  it('keeps every type on the shared raised surface', () => {
    for (const type of ['success', 'info', 'error', 'warning']) {
      expect(src, `${type} lost its background`).toMatch(
        new RegExp(`${type}:\\s*\\{[^}]*bg:\\s*T\\.raised`),
      );
    }
  });
});
