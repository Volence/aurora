// ToastContainer paints the CAPPED stack, and paints the overflow row.
//
// BY SOURCE SCAN, and this file should be read knowing exactly how weak that is.
// ToastContainer is `.tsx`; the node suite does not collect it and no row here
// executes a single line of it. What follows cannot prove the overflow row is
// legible, correctly placed, or clickable — that needs the real app under CDP
// (scratchpad/toast-overflow-harness.mjs, `npm run harness:toast-overflow`).
//
// What it CAN prove is the one regression a reviewer would otherwise never see:
// that the container renders `stack.visible` and not the raw store array. The
// cap lives in `toastStore.toastStack` — pure, and covered properly in
// state/__tests__/toast-stack.test.ts — and it is worth nothing at all if the
// component quietly goes back to `toasts.map(...)`, which is a one-word edit
// that no other row in the suite would notice. Same reasoning as the sibling
// toast-colors.test.ts, and the same honest limit.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '..', 'ToastContainer.tsx'), 'utf8');

describe('ToastContainer honours the cap', () => {
  it('renders the capped list, not the raw store array', () => {
    expect(src).toMatch(/stack\.visible\.map\(/);
    // The exact shape of the defect: mapping the store's own array paints all
    // 63 again with every other line of this file unchanged.
    expect(src).not.toMatch(/\btoasts\.map\(/);
  });

  it('gets its decision from the pure selector rather than re-deriving one', () => {
    expect(src).toMatch(/toastStack\(/);
    expect(src).toMatch(/from '\.\.\/state\/toastStore'/);
  });

  it('paints an overflow row, and it is what makes the hidden ones reachable', () => {
    expect(src).toMatch(/overflowLabel\(/);
    // Rendered, not merely computed.
    expect(src).toMatch(/\{overflow\}/);
    // And clicking it opens the full stack — without this the count is a
    // dead end, which is the failure mode that is worse than the wall.
    expect(src).toMatch(/setExpanded\(true\)/);
    expect(src).toMatch(/setExpanded\(false\)/);
  });

  it('bounds the expanded stack so showing all cannot run off the screen', () => {
    expect(src).toMatch(/overflowY:\s*'auto'/);
  });
});
