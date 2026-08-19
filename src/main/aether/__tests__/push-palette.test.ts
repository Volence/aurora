import { describe, it, expect } from 'vitest';
import { pushPaletteLine, PaletteGateReason } from '../push-palette';

/** A client stand-in recording the wire calls in order. */
function fakeClient(opts: { symbols?: Record<string, number>; methods?: string[]; connected?: boolean; wasRunning?: boolean } = {}) {
  const symbols = opts.symbols ?? { Pal_Base: 0xff8ad2, Pal_Base_Dirty: 0xff8ca7 };
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  return {
    calls,
    status: opts.connected === false ? 'disconnected' : 'connected',
    hasMethod: (m: string) => (opts.methods ?? ['emulator/write_memory', 'emulator/pause', 'emulator/resume']).includes(m),
    resolve: async (name: string) => {
      const a = symbols[name];
      if (a === undefined) throw new Error(`no symbol named ${name}`);
      return a;
    },
    call: async (method: string, params: Record<string, unknown>) => {
      calls.push({ method, params });
      if (method === 'emulator/pause') return { wasRunning: opts.wasRunning ?? true };
      return {};
    },
  };
}

const line = () => Array.from({ length: 16 }, (_, i) => ({ r: i * 16, g: 0, b: 0, a: 255 }));

describe('pushPaletteLine', () => {
  it('writes the payload before raising the dirty flag', async () => {
    const c = fakeClient();
    const r = await pushPaletteLine(c as never, 2, line());
    expect(r.pushed).toBe(true);

    const writes = c.calls.filter((x) => x.method === 'emulator/write_memory');
    expect(writes).toHaveLength(2);
    // Pal_Base + line-2 offset (32), then the flag byte at Pal_Base_Dirty.
    expect(writes[0].params.addr).toBe('0xFF8AF2');
    expect(writes[1].params.addr).toBe('0xFF8CA7');
    expect(writes[1].params.bytes).toBe('0x01');
  });

  it('pauses around the writes and resumes afterwards', async () => {
    // write_memory is require_paused on the server. A push from a UI slider has
    // to restore the machine to whatever it was doing, or the first drag
    // silently freezes the game the artist is looking at.
    const c = fakeClient();
    await pushPaletteLine(c as never, 1, line());
    const order = c.calls.map((x) => x.method);
    expect(order[0]).toBe('emulator/pause');
    expect(order.at(-1)).toBe('emulator/resume');
    expect(order.filter((m) => m === 'emulator/write_memory')).toHaveLength(2);
  });

  it('resumes even when a write fails, rather than leaving the game frozen', async () => {
    const c = fakeClient();
    const orig = c.call;
    c.call = async (method: string, params: Record<string, unknown>) => {
      if (method === 'emulator/write_memory') throw new Error('boom');
      return orig(method, params);
    };
    const r = await pushPaletteLine(c as never, 1, line());
    expect(r.pushed).toBe(false);
    expect(r.error).toMatch(/boom/);
    expect(c.calls.map((x) => x.method)).toContain('emulator/resume');
  });

  it('gates on line 0 without touching the wire', async () => {
    const c = fakeClient();
    const r = await pushPaletteLine(c as never, 0, line());
    expect(r.pushed).toBe(false);
    expect(r.gate).toBe(PaletteGateReason.LineZero);
    expect(c.calls).toHaveLength(0);
  });

  it('gates when disconnected without throwing', async () => {
    const c = fakeClient({ connected: false });
    const r = await pushPaletteLine(c as never, 1, line());
    expect(r.pushed).toBe(false);
    expect(r.gate).toBe(PaletteGateReason.Disconnected);
    expect(c.calls).toHaveLength(0);
  });

  /**
   * Pal_Base lives in the release listing today, but a ROM built without
   * symbols — or a future engine that renames it — must grey the feature out
   * rather than write into a guessed address.
   */
  it('gates when the symbols are absent, and says which', async () => {
    const c = fakeClient({ symbols: { Pal_Base: 0xff8ad2 } });   // dirty flag missing
    const r = await pushPaletteLine(c as never, 1, line());
    expect(r.pushed).toBe(false);
    expect(r.gate).toBe(PaletteGateReason.NoSymbols);
    expect(r.error).toMatch(/Pal_Base_Dirty/);
    expect(c.calls.filter((x) => x.method === 'emulator/write_memory')).toHaveLength(0);
  });

  it('gates when the server does not serve write_memory', async () => {
    const c = fakeClient({ methods: [] });
    const r = await pushPaletteLine(c as never, 1, line());
    expect(r.pushed).toBe(false);
    expect(r.gate).toBe(PaletteGateReason.NoMethod);
  });
});

describe('pushPaletteLine and a machine somebody else paused', () => {
  /**
   * The bus is multi-client. A debugger, a harness or a person may have the
   * machine deliberately stopped, and an unconditional resume would start it
   * running underneath them the first time an artist nudged a slider.
   *
   * Found by the end-to-end harness rather than by reasoning: its observer
   * client had paused the machine, the app's push resumed it, and the
   * observer's next call came back -32005 machineRunning.
   */
  it('leaves an already-paused machine paused', async () => {
    const c = fakeClient({ wasRunning: false });
    const r = await pushPaletteLine(c as never, 1, line());
    expect(r.pushed).toBe(true);
    expect(c.calls.map((x) => x.method)).not.toContain('emulator/resume');
  });

  it('still resumes a machine that was running', async () => {
    const c = fakeClient({ wasRunning: true });
    await pushPaletteLine(c as never, 1, line());
    expect(c.calls.map((x) => x.method)).toContain('emulator/resume');
  });
});
