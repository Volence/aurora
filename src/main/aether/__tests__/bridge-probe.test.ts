import { describe, it, expect, vi } from 'vitest';
import { PAL_BASE_SYMBOL, PAL_BASE_DIRTY_SYMBOL, classicPaletteSymbol, CLASSIC_LINES } from '../../../core/aether/palette-push';
import { MethodNotServedError } from '../unserved';

// The bridge owns IPC handlers and a socket, neither of which this file needs.
// `electron` is stubbed so the module can be imported in a node-only suite.
vi.mock('electron', () => ({ ipcMain: { handle: () => {} } }));

const { probePalette } = await import('../bridge');

/**
 * THE LEGITIMATE DISCRIMINATOR, AND ITS ONE BLIND SPOT.
 *
 * `probePalette` uses a failed resolve as INFORMATION: "Pal_Base did not
 * resolve" is how it learns the loaded listing is not aeon's, so it falls
 * through and tries classic. That is a genuine either/or and turning it into an
 * error would destroy the only family detection there is.
 *
 * What it could not survive is the instrument going missing. If the server does
 * not serve `emulator/lookup_symbol`, BOTH arms fail, and the probe's answer —
 * "this ROM carries no palette symbols" — is about a ROM that was never asked.
 */
function fakeClient(symbols: Record<string, number>, opts: { unservedLookup?: boolean } = {}) {
  let resolves = 0;
  return {
    resolves: () => resolves,
    client: {
      status: 'connected' as const,
      server: { name: 'oracle-next' },
      hasMethod: () => !opts.unservedLookup,
      resolve: async (name: string) => {
        resolves++;
        if (opts.unservedLookup) {
          throw new MethodNotServedError('emulator/lookup_symbol', 'advertised-list', 'oracle-next');
        }
        const a = symbols[name];
        if (a === undefined) throw new Error(`symbol ${name} did not resolve`);
        return a;
      },
    },
  };
}

const AEON = { [PAL_BASE_SYMBOL]: 0xff8ad2, [PAL_BASE_DIRTY_SYMBOL]: 0xff8ca7 };
const CLASSIC = Object.fromEntries(
  Array.from({ length: CLASSIC_LINES }, (_, i) => [classicPaletteSymbol(i), 0xfffb00 + i * 32]),
);

describe('probePalette keeps its either/or but not its blind spot', () => {
  it('still falls THROUGH an aeon miss to detect a classic listing', async () => {
    // THE ROW THAT PROTECTS THE DISCRIMINATOR. If the aeon arm's failure were
    // turned into a hard error, classic ROMs would stop being detected at all —
    // and every guard about the unserved case would still be green.
    const f = fakeClient(CLASSIC);
    const r = await probePalette(f.client as never);
    expect(r.kind).toBe('classic');
    expect(r.unservedMethod).toBeUndefined();
    // ANTI-VACUOUS: it really did try aeon first and really did ask for all
    // four classic lines, rather than short-circuiting to a lucky answer.
    expect(f.resolves()).toBe(1 + CLASSIC_LINES);
  });

  it('detects aeon without touching the classic arm', async () => {
    const f = fakeClient(AEON);
    const r = await probePalette(f.client as never);
    expect(r.kind).toBe('aeon');
    expect(f.resolves()).toBe(2);
  });

  it('answers null with no method named when a healthy server meets a stripped ROM', async () => {
    const f = fakeClient({});
    const r = await probePalette(f.client as never);
    expect(r.kind).toBeNull();
    expect(r.unservedMethod).toBeUndefined();
  });

  it('does NOT claim "no palette symbols" when the lookup itself is unserved', async () => {
    const f = fakeClient(AEON, { unservedLookup: true });
    const r = await probePalette(f.client as never);

    expect(r.kind).toBeNull();
    expect(r.unservedMethod).toBe('emulator/lookup_symbol');
    // AND IT DOES NOT RUN THE SECOND ARM. Four more lookups through a missing
    // instrument only manufacture a second wrong negative; the fixture here
    // carries aeon symbols precisely so a probe that ignored the unserved
    // condition would have reported 'aeon' and this row would fail loudly.
    expect(f.resolves()).toBe(1);
  });
});
