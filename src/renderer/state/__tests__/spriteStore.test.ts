import { describe, it, expect, beforeEach } from 'vitest';
import { useSpriteStore, activeSpriteHistory } from '../spriteStore';
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
  // <name>_anims.asm) so they must dirty the doc — and, since U2 put `steps`
  // into the snapshot, they record an undo entry too.
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

/**
 * U2 (UNDO-A6). Animation steps are INDICES into `frames`. Deleting a frame
 * drops the steps that referenced it and shifts every higher reference down —
 * and `steps` was not a snapshot field, so undoing restored the frames without
 * them. Every later step was left off by one, pointing at the wrong picture:
 * silently, and wrong on export.
 */
describe('undoing a frame delete restores the animation', () => {
  const frames = () => [createBuffer(8, 8), createBuffer(8, 8), createBuffer(8, 8)];

  beforeEach(() => {
    useSpriteStore.getState().loadSprite(frames(), [
      { frameIndex: 0, duration: 4 },
      { frameIndex: 1, duration: 5 },
      { frameIndex: 2, duration: 6 },
    ], 4, 4);
  });

  it('brings the steps back with the frames, not re-indexed', () => {
    useSpriteStore.getState().selectFrame(1);
    useSpriteStore.getState().deleteFrame();
    // The delete itself is right: step 1 goes, step 2 shifts down to 1.
    expect(useSpriteStore.getState().steps).toEqual([
      { frameIndex: 0, duration: 4 },
      { frameIndex: 1, duration: 6 },
    ]);

    activeSpriteHistory().undo();
    expect(useSpriteStore.getState().frames).toHaveLength(3);
    expect(useSpriteStore.getState().steps).toEqual([
      { frameIndex: 0, duration: 4 },
      { frameIndex: 1, duration: 5 },
      { frameIndex: 2, duration: 6 },
    ]);
  });

  it('a timeline edit is undoable now that steps are snapshotted', () => {
    useSpriteStore.getState().setStepDuration(0, 30);
    expect(useSpriteStore.getState().steps[0].duration).toBe(30);
    activeSpriteHistory().undo();
    expect(useSpriteStore.getState().steps[0].duration).toBe(4);
  });
});
