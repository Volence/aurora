// Source-grep guard for the three dialog defects the first CDP render found.
//
// WHY GREP. The suite is node-only — no jsdom, no RTL — and .tsx files render
// nowhere in it, so a behavioural test of this component would silently never
// run. Grepping the source is the house pattern for exactly this situation (see
// workspace/__tests__/undo-keys.test.ts, which does the same for the undo
// bindings).
//
// WHAT IT PROVES: that the WIRING is still present. What it does NOT prove: that
// any of it behaves. Enter really submitting, Tab really staying inside, and an
// emptied field really looking empty were all confirmed by eye under CDP in
// Task 14 and would have to be re-confirmed there if this component is
// substantially rewritten. Each assertion below is one exact expression, so a
// refactor that keeps the behaviour but renames the handler fails here loudly —
// which is the intended failure mode: whoever renames it re-states the rule.
//
// The pure halves ARE properly tested: ui/__tests__/focus-trap.test.ts owns the
// tab arithmetic, and shell/__tests__/new-canvas.test.ts owns parseCanvasSide
// and the per-field errors.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Source with comments stripped, so prose ABOUT a rule cannot satisfy an
 *  assertion about one — the same helper undo-keys.test.ts uses. */
const code = readFileSync(join(__dirname, '../NewCanvasDialog.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('NewCanvasDialog wiring', () => {
  it('is a real <form>, so Enter submits from any field', () => {
    // Was: only the name input had an Enter handler, so Enter did nothing from
    // the width and height fields.
    expect(code).toContain('onSubmit={(e) => { e.preventDefault(); void submit(); }}');
    expect(code).toContain('type="submit"');
    // Cancel must opt OUT, or it submits the form too.
    expect(code).toContain('<button type="button" onClick={onClose}');
    // The old per-input handler is gone rather than doubled up with the form.
    expect(code).not.toContain("if (e.key === 'Enter') void submit()");
  });

  it('traps Tab inside the panel', () => {
    // Was: no trap at all — Tab walked out of the modal into the app behind it.
    expect(code).toContain('onKeyDown={trapTab}');
    expect(code).toContain('nextTrapIndex(');
    // Read LIVE on each press: the element list changes as you type, because
    // Create is disabled (and so unfocusable) while the form is invalid.
    expect(code).toContain('panelRef.current.querySelectorAll');
  });

  it('holds the sizes as TEXT and parses them, so an emptied field is not 0', () => {
    // Was: `Number(e.target.value)`, and `Number('')` is 0 — a cleared field
    // showed a literal 0 the user never typed.
    expect(code).toContain('parseCanvasSide(widthText)');
    expect(code).toContain('parseCanvasSide(heightText)');
    expect(code).not.toContain('Number(e.target.value)');
  });

  it('does NOT dismiss on a backdrop click', () => {
    // Deliberate, and the one item here that is a decision rather than a fix: a
    // click a few pixels outside used to throw away a filled-in form silently.
    // Esc and Cancel remain, both explicit. ConfirmDialog keeps its backdrop
    // dismiss — it holds a question, not typed input.
    expect(code).not.toContain('style={styles.backdrop} onMouseDown={onClose}');
    expect(code).toContain("if (e.key === 'Escape')");
    expect(code).toContain('onClick={onClose}');
  });
});
