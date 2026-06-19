import { describe, it, expect, beforeEach } from 'vitest';
import { useToolStore } from '../../src/renderer/state/toolStore';

beforeEach(() => {
  useToolStore.setState({
    mirror: null,
    ditherPattern: 'checker',
    ditherSecondary: 0,
    pixelPerfect: false,
  });
});

describe('useToolStore', () => {
  it('(a) has correct defaults', () => {
    const state = useToolStore.getState();
    expect(state.mirror).toBeNull();
    expect(state.ditherPattern).toBe('checker');
    expect(state.ditherSecondary).toBe(0);
    expect(state.pixelPerfect).toBe(false);
  });

  it('(b) setMirror updates mirror', () => {
    useToolStore.getState().setMirror('h');
    expect(useToolStore.getState().mirror).toBe('h');

    useToolStore.getState().setMirror('both');
    expect(useToolStore.getState().mirror).toBe('both');

    useToolStore.getState().setMirror(null);
    expect(useToolStore.getState().mirror).toBeNull();
  });

  it('(c) setDither sets both pattern and secondary', () => {
    useToolStore.getState().setDither('sparse25', 5);
    const state = useToolStore.getState();
    expect(state.ditherPattern).toBe('sparse25');
    expect(state.ditherSecondary).toBe(5);
  });

  it('(d) setPixelPerfect sets pixelPerfect', () => {
    useToolStore.getState().setPixelPerfect(true);
    expect(useToolStore.getState().pixelPerfect).toBe(true);

    useToolStore.getState().setPixelPerfect(false);
    expect(useToolStore.getState().pixelPerfect).toBe(false);
  });
});
