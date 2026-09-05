// "YOU MAY NOT AUTHOR A FIELD YOU CANNOT SEE" — one rule, now two brushes.
//
// The map brush has had this since the priority chips landed; O17 gives the Art
// composer's tile-stamp the same tri-state, and the rule moved out of
// editorStore's setter into a module so the second brush could not re-spell it.
// These rows assert the rule ITSELF and then assert that BOTH setters go
// through it — because a shared helper nobody calls fails exactly the way four
// open-coded paint words did.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { surfacePriorityLens, PRIORITY_LENS_TOAST } from '../priority-lens-surface';
import { useViewStore } from '../viewStore';
import { useToastStore } from '../toastStore';
import { useEditorStore } from '../editorStore';
import { useArtStore } from '../artStore';

function reset() {
  useViewStore.getState().setOverlay('showPriority', false);
  useToastStore.setState({ toasts: [] });
}

describe('surfacePriorityLens: the rule', () => {
  beforeEach(reset);

  it('does NOTHING while the brush is `keep`', () => {
    expect(surfacePriorityLens('keep')).toBe(false);
    expect(useViewStore.getState().overlays.showPriority).toBe(false);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('raises the lens and says so when the brush starts AUTHORING', () => {
    expect(surfacePriorityLens('on')).toBe(true);
    expect(useViewStore.getState().overlays.showPriority).toBe(true);
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([PRIORITY_LENS_TOAST]);
  });

  it('`off` authors too: it CLEARS the bit, which is just as invisible', () => {
    expect(surfacePriorityLens('off')).toBe(true);
    expect(useViewStore.getState().overlays.showPriority).toBe(true);
  });

  it('does not re-toast when the lens is already up', () => {
    useViewStore.getState().setOverlay('showPriority', true);
    expect(surfacePriorityLens('on')).toBe(false);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('NEVER lowers the lens: returning to `keep` leaves the veil alone', () => {
    surfacePriorityLens('on');
    surfacePriorityLens('keep');
    expect(useViewStore.getState().overlays.showPriority).toBe(true);
  });
});

describe('both brushes are wired to it', () => {
  beforeEach(reset);

  it('the MAP brush surfaces the lens', () => {
    useEditorStore.getState().setSelectedTilePriority('on');
    expect(useEditorStore.getState().selectedTilePriority).toBe('on');
    expect(useViewStore.getState().overlays.showPriority).toBe(true);
  });

  it('the COMPOSER stamp surfaces the lens (O17)', () => {
    useArtStore.getState().setStampPriority('on');
    expect(useArtStore.getState().stampPriority).toBe('on');
    expect(useViewStore.getState().overlays.showPriority).toBe(true);
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([PRIORITY_LENS_TOAST]);
  });

  it('the two brushes are SEPARATE: arming one does not arm the other', () => {
    // Deliberate: different facet, different tile, different flips. What they
    // share is the rule above, not the state.
    useArtStore.getState().setStampPriority('off');
    expect(useEditorStore.getState().selectedTilePriority).not.toBe('off');
    useEditorStore.getState().setSelectedTilePriority('on');
    expect(useArtStore.getState().stampPriority).toBe('off');
  });

  it('the composer stamp DEFAULTS to `keep`, like every other brush', () => {
    // Not a preference: brush-word.ts decides `keep` by detectability, and a
    // composer that opened armed to `on` would author depth onto every stamp an
    // artist laid before they had said anything about depth at all.
    const fresh = readFileSync(
      join(__dirname, '..', 'artStore.ts'), 'utf8',
    );
    expect(fresh).toMatch(/stampPriority: DEFAULT_BRUSH_ATTRIBUTES\.priority/);
  });
});

// ── THE SETTERS MAY NOT RE-SPELL THE RULE ──────────────────────────────────
//
// The rows above would still pass if a setter pasted the three lines instead of
// calling the helper — and then the next change to the rule would land on one
// brush. This is the same guard core/editing/brush-word.ts earns for the paint
// word, applied to the lens.
describe('one copy of the rule', () => {
  const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('neither store open-codes the setOverlay/toast pair for showPriority', () => {
    for (const f of ['editorStore.ts', 'artStore.ts']) {
      const code = read(f);
      expect(code, `${f} re-spells the priority-lens rule`)
        .not.toMatch(/setOverlay\(\s*'showPriority'/);
    }
  });

  it('both setters call the shared helper', () => {
    expect(read('editorStore.ts')).toMatch(/setSelectedTilePriority:[\s\S]{0,200}surfacePriorityLens\(/);
    expect(read('artStore.ts')).toMatch(/setStampPriority:[\s\S]{0,200}surfacePriorityLens\(/);
  });
});
