// Task B2 fix — save routing. Ctrl+S / app-bar save must reach the right saver:
//   • sprite mode with a captured S1 art source → save art back (guarded),
//   • else a classic project open → classic guarded level save,
//   • else → the caller's aeon save (routeClassicSave returns false).
// Savers are stubbed via the module's injectable seam.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  routeClassicSave,
  __setSaveRoutingForTest,
  __resetSaveRoutingForTest,
} from '../save-routing';
import { useEditorStore } from '../editorStore';
import { useSpriteStore } from '../spriteStore';
import { useClassicProjectStore } from '../classicProjectStore';
import type { S1ArtSource } from '../spriteStore';

const FAKE_SOURCE = { relPath: 'artnem/Signpost.nem', frameCount: 1 } as unknown as S1ArtSource;

let spriteArt: ReturnType<typeof vi.fn>;
let classic: ReturnType<typeof vi.fn>;

beforeEach(() => {
  spriteArt = vi.fn();
  classic = vi.fn();
  // Cast: vi.fn()'s Mock type also carries a construct signature, so it isn't
  // directly assignable to the plain-function seam type.
  __setSaveRoutingForTest({ spriteArt: spriteArt as () => unknown, classic: classic as () => unknown });
  useEditorStore.getState().setAppMode('map');
  useSpriteStore.setState({ s1ArtSource: null });
  useClassicProjectStore.setState({ status: 'closed' });
});

afterEach(() => {
  __resetSaveRoutingForTest();
  vi.restoreAllMocks();
});

describe('routeClassicSave', () => {
  it('routes to the sprite-art saver in sprite mode with an S1 art source', () => {
    useEditorStore.getState().setAppMode('sprite');
    useSpriteStore.setState({ s1ArtSource: FAKE_SOURCE });
    useClassicProjectStore.setState({ status: 'open' }); // classic still open under it

    const handled = routeClassicSave();

    expect(handled).toBe(true);
    expect(spriteArt).toHaveBeenCalledTimes(1);
    expect(classic).not.toHaveBeenCalled();
  });

  it('routes to the classic saver in sprite mode WITHOUT an S1 art source', () => {
    useEditorStore.getState().setAppMode('sprite');
    useSpriteStore.setState({ s1ArtSource: null });
    useClassicProjectStore.setState({ status: 'open' });

    const handled = routeClassicSave();

    expect(handled).toBe(true);
    expect(classic).toHaveBeenCalledTimes(1);
    expect(spriteArt).not.toHaveBeenCalled();
  });

  it('routes to the classic saver in a non-sprite mode with a classic project open', () => {
    useEditorStore.getState().setAppMode('map');
    useClassicProjectStore.setState({ status: 'open' });

    const handled = routeClassicSave();

    expect(handled).toBe(true);
    expect(classic).toHaveBeenCalledTimes(1);
    expect(spriteArt).not.toHaveBeenCalled();
  });

  it('does not handle the save (returns false) when no classic project is open', () => {
    useEditorStore.getState().setAppMode('map');
    useClassicProjectStore.setState({ status: 'closed' });

    const handled = routeClassicSave();

    expect(handled).toBe(false);
    expect(classic).not.toHaveBeenCalled();
    expect(spriteArt).not.toHaveBeenCalled();
  });
});
