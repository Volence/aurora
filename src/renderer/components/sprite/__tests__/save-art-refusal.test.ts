import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveSpriteArt } from '../export-sprite';
import { useSpriteStore, type S1ArtSource } from '../../../state/spriteStore';
import { useToastStore, type ToastType } from '../../../state/toastStore';
import { createBuffer } from '../../../../core/art/pixel-ops';

type AddToast = (message: string, type?: ToastType) => void;

/** A minimal S1 art source; the frame-count guard fires before any field but
 *  frameCount is used, so tiles/mappings can be empty. */
function fakeSource(frameCount: number): S1ArtSource {
  return {
    basePath: '/tmp/x', relPath: 'X.nem', expectedMtimeMs: 1,
    originalTiles: [], mappings: [], originX: 0, originY: 0, frameCount,
  };
}

describe('saveSpriteArt frame-count guard', () => {
  let addToast: ReturnType<typeof vi.fn<AddToast>>;

  beforeEach(() => {
    // Inject a fresh toast collector so we assert on exactly this test's calls
    // (spying on getState().addToast stacks across zustand's setState merges).
    addToast = vi.fn<AddToast>();
    useToastStore.setState({ addToast });
  });

  it('refuses (before any write) when the frame count changed since open', async () => {
    // Opened with 2 frames, now 3 (a frame was added).
    useSpriteStore.setState({
      s1ArtSource: fakeSource(2),
      frames: [createBuffer(16, 16), createBuffer(16, 16), createBuffer(16, 16)],
    });

    await saveSpriteArt();

    expect(addToast).toHaveBeenCalledTimes(1);
    const [msg, kind] = addToast.mock.calls[0];
    expect(msg).toMatch(/revert frame changes/i);
    expect(kind).toBe('error');
    // Source is untouched (the write never began).
    expect(useSpriteStore.getState().s1ArtSource?.frameCount).toBe(2);
  });

  it('refuses when there is no S1 art source at all', async () => {
    useSpriteStore.setState({ s1ArtSource: null });
    await saveSpriteArt();
    expect(addToast).toHaveBeenCalledTimes(1);
    expect(addToast.mock.calls[0][0]).toMatch(/no s1 art source/i);
  });
});
