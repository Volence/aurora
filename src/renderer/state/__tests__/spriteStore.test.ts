import { describe, it, expect, beforeEach } from 'vitest';
import { useSpriteStore } from '../spriteStore';
import { createBuffer } from '../../../core/art/pixel-ops';

// unsavedEdits is the honest sprite-dirtiness signal (Fix A): TRUE only when the
// working sprite has edits not yet persisted. recordEdit (the single edit choke
// point) sets it; loadSprite/newSprite reset it; non-mutating actions must NOT
// touch it. dirtySpriteDocIds()/the tab dot/the close guard all read it.
describe('spriteStore unsavedEdits lifecycle', () => {
  beforeEach(() => {
    // A fresh load zeroes history + the flag — the cleanest reset between cases.
    useSpriteStore.getState().loadSprite([createBuffer(16, 16)], [], 8, 8);
  });

  it('starts clean after a load', () => {
    expect(useSpriteStore.getState().unsavedEdits).toBe(false);
  });

  it('a mutating action (through recordEdit) sets it true', () => {
    useSpriteStore.getState().clearCanvas();
    expect(useSpriteStore.getState().unsavedEdits).toBe(true);
  });

  it('setBuffer (a pixel edit) sets it true', () => {
    useSpriteStore.getState().setBuffer(createBuffer(16, 16));
    expect(useSpriteStore.getState().unsavedEdits).toBe(true);
  });

  it('loadSprite resets it to false', () => {
    useSpriteStore.getState().clearCanvas();
    expect(useSpriteStore.getState().unsavedEdits).toBe(true);
    useSpriteStore.getState().loadSprite([createBuffer(16, 16)], [], 8, 8);
    expect(useSpriteStore.getState().unsavedEdits).toBe(false);
  });

  it('newSprite resets it to false', () => {
    useSpriteStore.getState().clearCanvas();
    expect(useSpriteStore.getState().unsavedEdits).toBe(true);
    useSpriteStore.getState().newSprite(24, 24);
    expect(useSpriteStore.getState().unsavedEdits).toBe(false);
  });

  it('selectFrame does NOT set it (navigation is not an edit)', () => {
    // Two frames so there is somewhere to move to.
    useSpriteStore.getState().loadSprite([createBuffer(16, 16), createBuffer(16, 16)], [], 8, 8);
    useSpriteStore.getState().selectFrame(1);
    expect(useSpriteStore.getState().currentIndex).toBe(1);
    expect(useSpriteStore.getState().unsavedEdits).toBe(false);
  });

  it('setTool and setZoom do NOT set it (tool/view state is not an edit)', () => {
    useSpriteStore.getState().setTool('eraser');
    useSpriteStore.getState().setZoom(20);
    expect(useSpriteStore.getState().unsavedEdits).toBe(false);
  });

  it('setUnsavedEdits(false) clears it (the saver/export hook)', () => {
    useSpriteStore.getState().clearCanvas();
    expect(useSpriteStore.getState().unsavedEdits).toBe(true);
    useSpriteStore.getState().setUnsavedEdits(false);
    expect(useSpriteStore.getState().unsavedEdits).toBe(false);
  });

  // Timeline edits mutate persisted data (exportSprite writes steps to
  // <name>_anims.asm) so they must dirty the doc — even though they sit outside
  // the snapshot history and so leave no undo entry.
  it('addStep sets it true (timeline is persisted data)', () => {
    useSpriteStore.getState().addStep(0);
    expect(useSpriteStore.getState().unsavedEdits).toBe(true);
  });

  it('setStepDuration sets it true', () => {
    useSpriteStore.getState().addStep(0);
    useSpriteStore.getState().setUnsavedEdits(false); // isolate the setStepDuration effect
    useSpriteStore.getState().setStepDuration(0, 12);
    expect(useSpriteStore.getState().unsavedEdits).toBe(true);
  });

  it('setSteps sets it true', () => {
    useSpriteStore.getState().setSteps([{ frameIndex: 0, duration: 6 }]);
    expect(useSpriteStore.getState().unsavedEdits).toBe(true);
  });

  it('setPlaybackMode does NOT set it (preview-only; not persisted in export)', () => {
    useSpriteStore.getState().setPlaybackMode('pingpong');
    expect(useSpriteStore.getState().unsavedEdits).toBe(false);
  });
});
