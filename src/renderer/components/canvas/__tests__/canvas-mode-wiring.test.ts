// Source-grep guard for the grid-origin field's per-keystroke defect and its
// fix — the same house pattern new-canvas-dialog-wiring.test.ts uses (see its
// header for why grepping is the right tool: CanvasMode.tsx is a .tsx file and
// the suite is node-only, no jsdom, no RTL, so nothing in it ever renders).
//
// WHAT THE BUG WAS. The grid-origin fields used to be plain `NumberField`s
// bound straight to `doc.gridOrigin`, whose `onChange` fires
// `Number(e.target.value)` on every keystroke and calls
// `useCanvasStore.getState().setGridOrigin` directly — one full CanvasSnapshot
// push (pixel buffer included) per digit typed, and a cleared field committing
// a literal 0 nobody typed. `GridOriginField` replaces that with locally-held
// text that commits once, on blur or Enter, through `parseCanvasSide` (so an
// empty/non-numeric field reverts instead of writing 0).
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. It proves the WIRING survives:
// `setGridOrigin` is called from a commit handler bound to `onBlur`, not from
// a handler bound to `onChange`, and the old direct-`NumberField` call sites
// are gone. It does NOT prove the field behaves correctly on screen — that is
// canvasStore.test.ts's job for the store-level consequence (the no-op guard,
// and the eviction-at-capacity pin) and a CDP pass's job for the pixels.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Source with comments stripped, matching new-canvas-dialog-wiring.test.ts's
 *  helper, so prose ABOUT the wiring cannot satisfy an assertion about it. */
const code = readFileSync(join(__dirname, '../CanvasMode.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('CanvasMode grid-origin field wiring', () => {
  it('commits on blur (and Enter-triggers a blur), not on every keystroke', () => {
    expect(code).toContain('onBlur={commit}');
    expect(code).toContain("e.key === 'Enter'");
    // The keystroke handler only ever updates LOCAL text — it must never be
    // the thing that calls the store setter directly.
    expect(code).toContain('onChange={(e) => setText(e.target.value)}');
  });

  it('holds the value as TEXT and parses it with parseCanvasSide, so an emptied field is not 0', () => {
    // Was: `NumberField`'s `onChange={(v) => ... setGridOrigin(docId, { ...doc.gridOrigin, originX: v | 0 })}`,
    // where `v` came from `Number(e.target.value)` — `Number('')` is 0.
    expect(code).toContain('parseCanvasSide(text)');
    expect(code).not.toContain('Number(e.target.value)');
    expect(code).not.toContain('NumberField');
  });

  it('the two axis fields are GridOriginField, not the old direct NumberField-to-store wiring', () => {
    expect(code).toContain('axis="originX"');
    expect(code).toContain('axis="originY"');
    // The old per-keystroke call sites, one per axis, are gone.
    expect(code).not.toContain('setGridOrigin(docId, { ...doc.gridOrigin, originX: v | 0 })');
    expect(code).not.toContain('setGridOrigin(docId, { ...doc.gridOrigin, originY: v | 0 })');
  });

  it('resyncs from an external change (undo/redo, switching documents) rather than from its own commit', () => {
    expect(code).toContain('if (value !== committed.current)');
  });
});
