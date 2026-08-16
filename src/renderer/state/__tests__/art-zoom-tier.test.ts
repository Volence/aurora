import { describe, it, expect, beforeEach } from 'vitest';
import { useArtStore, selectArtZoom, ART_TIER_DEFAULT_ZOOM } from '../artStore';

/**
 * Zoom is PER TIER because one shared number cannot serve four surfaces whose
 * content sizes are nothing alike. Shipping one was a real defect: 24x suits an
 * 8x8 tile (192px on screen) and opened a 256x256 chunk at 6144x6144 — roughly
 * 151 MB of canvas backing store — before the artist touched anything.
 */
describe('art zoom, per tier', () => {
  beforeEach(() => {
    useArtStore.setState({ artTier: 'tile', zoomByTier: { ...ART_TIER_DEFAULT_ZOOM } });
  });

  it('opens each surface at a zoom that suits its content size', () => {
    // The property that matters is the on-screen size, not the multiplier.
    const onScreen = (contentPx: number, zoom: number) => contentPx * zoom;
    expect(onScreen(8, ART_TIER_DEFAULT_ZOOM.tile)).toBe(192);
    expect(onScreen(16, ART_TIER_DEFAULT_ZOOM.block)).toBe(192);
    expect(onScreen(256, ART_TIER_DEFAULT_ZOOM.chunk)).toBe(768);
    // The defect, stated as a test: the old shared 24 on a chunk.
    expect(onScreen(256, 24)).toBe(6144);
  });

  it('reads the ACTIVE tier', () => {
    const s = () => useArtStore.getState();
    expect(selectArtZoom(s())).toBe(ART_TIER_DEFAULT_ZOOM.tile);
    s().setArtTier('chunk');
    expect(selectArtZoom(s())).toBe(ART_TIER_DEFAULT_ZOOM.chunk);
  });

  it('setZoom writes only the active tier, leaving the others alone', () => {
    const s = () => useArtStore.getState();
    s().setArtTier('chunk');
    s().setZoom(8);
    expect(selectArtZoom(s())).toBe(8);
    s().setArtTier('tile');
    // Zooming a chunk must not have moved the tile editor — the whole point.
    expect(selectArtZoom(s())).toBe(ART_TIER_DEFAULT_ZOOM.tile);
  });

  it('remembers each tier across a switch', () => {
    const s = () => useArtStore.getState();
    s().setArtTier('block'); s().setZoom(32);
    s().setArtTier('chunk'); s().setZoom(4);
    s().setArtTier('block');
    expect(selectArtZoom(s())).toBe(32);
    s().setArtTier('chunk');
    expect(selectArtZoom(s())).toBe(4);
  });

  it('still clamps to 2..64, per tier', () => {
    const s = () => useArtStore.getState();
    s().setArtTier('chunk');
    s().setZoom(1000);
    expect(selectArtZoom(s())).toBe(64);
    s().setZoom(0.1);
    expect(selectArtZoom(s())).toBe(2);
  });
});
