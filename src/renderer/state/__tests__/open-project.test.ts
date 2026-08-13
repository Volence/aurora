import { describe, it, expect, beforeEach } from 'vitest';
import { openEngine, openCapabilities, openArtTiers } from '../open-project';
import { useProjectStore } from '../projectStore';
import { useClassicProjectStore } from '../classicProjectStore';

function resetStores() {
  useClassicProjectStore.setState({ status: 'closed' } as never);
  useProjectStore.setState({ project: null, config: null, capabilities: null } as never);
}

describe('openEngine', () => {
  beforeEach(resetStores);

  it('is null when nothing is open', () => {
    expect(openEngine()).toBeNull();
  });

  it("is 's1' when the classic project is open", () => {
    useClassicProjectStore.setState({ status: 'open' } as never);
    expect(openEngine()).toBe('s1');
  });

  it("is 'aeon' when an aeon project is resident", () => {
    useProjectStore.setState({ project: {} } as never);
    expect(openEngine()).toBe('aeon');
  });

  it('prefers classic when both are somehow resident', () => {
    useClassicProjectStore.setState({ status: 'open' } as never);
    useProjectStore.setState({ project: {} } as never);
    expect(openEngine()).toBe('s1');
  });

  it('is null while an aeon project is mid-load (config set, project not)', () => {
    useProjectStore.setState({ config: { name: 'x' }, project: null } as never);
    expect(openEngine()).toBeNull();
  });
});

describe('openCapabilities / openArtTiers', () => {
  beforeEach(resetStores);

  it('returns empty facets when nothing is open', () => {
    // Nothing is open, so there is no manifest to read — NOT "the profile
    // declares no tiers" (both profiles declare a ladder since Task 2).
    expect(openEngine()).toBeNull();
    expect(openCapabilities()).toBeNull();
    expect(openCapabilities()?.facets ?? []).toEqual([]);
    expect(openArtTiers()).toEqual([]);
  });

  it('reads the aeon manifest when aeon is open', () => {
    useProjectStore.setState({
      project: {},
      capabilities: { facets: ['layout', 'art'], artTiers: [{ id: 'tile', label: 'Tile', pixelSize: 8, shared: true }] },
    } as never);
    expect(openCapabilities()?.facets).toEqual(['layout', 'art']);
    expect(openArtTiers().map((t) => t.id)).toEqual(['tile']);
  });

  it('reads the classic manifest when classic is open', () => {
    useClassicProjectStore.setState({
      status: 'open',
      capabilities: { facets: ['layout', 'art', 'objects'], artTiers: [] },
    } as never);
    expect(openCapabilities()?.facets).toEqual(['layout', 'art', 'objects']);
  });
});
