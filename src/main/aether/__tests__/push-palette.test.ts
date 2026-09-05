import { describe, it, expect } from 'vitest';
import { pushPaletteLine, pushPaletteWords, PaletteGateReason } from '../push-palette';
import { MethodNotServedError } from '../unserved';

/** A client stand-in recording the wire calls in order. */
function fakeClient(opts: {
  symbols?: Record<string, number>; methods?: string[]; connected?: boolean; wasRunning?: boolean;
  /**
   * `emulator/lookup_symbol` is ADVERTISED and answers -32601 anyway. The
   * advertised list cannot see this shape, so only the reply proves it — and it
   * is the ONLY route that reaches the catch around symbol resolution.
   */
  lookupUnimplemented?: boolean;
} = {}) {
  const symbols = opts.symbols ?? { Pal_Base: 0xff8ad2, Pal_Base_Dirty: 0xff8ca7 };
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  return {
    calls,
    status: opts.connected === false ? 'disconnected' : 'connected',
    server: { name: 'oracle-next' },
    // `emulator/lookup_symbol` belongs here because this fake's `resolve`
    // stands in for exactly that call — a fake that omits it is not modelling
    // a server, it is modelling one with a hole the real one does not have.
    hasMethod: (m: string) => (opts.methods ?? [
      'emulator/write_memory', 'emulator/pause', 'emulator/resume', 'emulator/lookup_symbol',
    ]).includes(m),
    resolve: async (name: string) => {
      if (opts.lookupUnimplemented) {
        throw new MethodNotServedError('emulator/lookup_symbol', 'rpc-error', 'oracle-next');
      }
      if (!(opts.methods ?? [
        'emulator/write_memory', 'emulator/pause', 'emulator/resume', 'emulator/lookup_symbol',
      ]).includes('emulator/lookup_symbol')) {
        throw new MethodNotServedError('emulator/lookup_symbol', 'advertised-list', 'oracle-next');
      }
      const a = symbols[name];
      if (a === undefined) throw new Error(`no symbol named ${name}`);
      return a;
    },
    call: async (method: string, params: Record<string, unknown>) => {
      calls.push({ method, params });
      // A real client REJECTS an unadvertised method rather than answering it.
      // Without this the fake would serve a method it claims not to have, and
      // any row about the unserved path would be testing the fake.
      if (!(opts.methods ?? [
        'emulator/write_memory', 'emulator/pause', 'emulator/resume', 'emulator/lookup_symbol',
      ]).includes(method)) {
        throw new MethodNotServedError(method, 'advertised-list', 'oracle-next');
      }
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

describe('pushPaletteWords on a classic (S1) project', () => {
  // Addresses in this fixture are arbitrary fake values (the real ones come
  // from the listing at runtime; nothing here may hardcode $FFFB20-shaped
  // knowledge). What IS pinned: which SYMBOL a given editor line resolves,
  // the single-write shape, and the pause/resume envelope.
  const s1Symbols = {
    v_palette_line_1: 0x110000,
    v_palette_line_2: 0x220000,
    v_palette_line_3: 0x330000,
    v_palette_line_4: 0x440000,
  };
  const words = Array.from({ length: 16 }, () => 0x0eee);

  it('writes ONE 32-byte payload to the mapped v_palette_line_(N+1), no flag', async () => {
    const c = fakeClient({ symbols: s1Symbols });
    const r = await pushPaletteWords(c as never, 2, words, 'classic');
    expect(r.pushed).toBe(true);
    const writes = c.calls.filter((x) => x.method === 'emulator/write_memory');
    expect(writes).toHaveLength(1);                       // no dirty flag exists on S1
    // Editor line 2 -> v_palette_line_3 (1-indexed engine lines; derivation in
    // core/aether/__tests__/palette-push.test.ts), at the symbol's own address.
    expect(writes[0].params.addr).toBe('0x330000');
    // 16 words -> 32 bytes -> '0x' + 64 hex chars.
    expect((writes[0].params.bytes as string).length).toBe(2 + 64);
  });

  it('pushes line 0: an ordinary act line on classic', async () => {
    const c = fakeClient({ symbols: s1Symbols });
    const r = await pushPaletteWords(c as never, 0, words, 'classic');
    expect(r.pushed).toBe(true);
    const writes = c.calls.filter((x) => x.method === 'emulator/write_memory');
    expect(writes[0].params.addr).toBe('0x110000');
  });

  it('keeps the pause/resume envelope: write_memory is require_paused', async () => {
    const c = fakeClient({ symbols: s1Symbols });
    await pushPaletteWords(c as never, 1, words, 'classic');
    const order = c.calls.map((x) => x.method);
    expect(order[0]).toBe('emulator/pause');
    expect(order.at(-1)).toBe('emulator/resume');
  });

  it('gates NoSymbols against an aeon ROM: resolution IS the family detection', async () => {
    // A classic push while the running ROM only serves aeon symbols must grey
    // out, never write: the aeon listing has no v_palette_line_2.
    const c = fakeClient();                                // aeon default symbols
    const r = await pushPaletteWords(c as never, 1, words, 'classic');
    expect(r.pushed).toBe(false);
    expect(r.gate).toBe(PaletteGateReason.NoSymbols);
    expect(r.error).toMatch(/v_palette_line_2/);
    expect(c.calls.filter((x) => x.method === 'emulator/write_memory')).toHaveLength(0);
  });

  it('still refuses an out-of-range line before touching the wire', async () => {
    const c = fakeClient({ symbols: s1Symbols });
    const r = await pushPaletteWords(c as never, 4, words, 'classic');
    expect(r.pushed).toBe(false);
    expect(c.calls).toHaveLength(0);
  });

  it('defaults to the aeon geometry when no kind is given: existing callers unchanged', async () => {
    const c = fakeClient();
    const r = await pushPaletteWords(c as never, 1, words);
    expect(r.pushed).toBe(true);
    const writes = c.calls.filter((x) => x.method === 'emulator/write_memory');
    expect(writes).toHaveLength(2);                        // payload then flag
  });
});

/**
 * THE CUTOVER ROWS. The push had two stories — "no write_memory" and "no
 * symbols" — and the second was quietly absorbing a third: a server that cannot
 * look symbols up at all. "Your ROM has no palette symbols" is a claim about the
 * artist's ROM, and making it when the ROM was never asked is a fabrication.
 */
describe('pushPalette and a server that does not serve what it needs', () => {
  it('does NOT call an unserved lookup "no symbols": it names the method', async () => {
    const c = fakeClient({ methods: ['emulator/write_memory', 'emulator/pause', 'emulator/resume'] });
    const r = await pushPaletteLine(c as never, 1, line());

    expect(r.pushed).toBe(false);
    expect(r.gate).toBe(PaletteGateReason.UnservedMethod);
    expect(r.gate).not.toBe(PaletteGateReason.NoSymbols);
    expect(r.unservedMethod).toBe('emulator/lookup_symbol');
    // Nothing touched the wire, so the machine was never paused for a push that
    // could not happen.
    expect(c.calls).toEqual([]);
  });

  /**
   * THE ROUTE THAT REACHES THE CATCH. When `lookup_symbol` is simply
   * unadvertised the up-front check refuses first, so the catch around symbol
   * resolution is only ever entered by the advertised-and-unimplemented shape.
   * A row that did not use that shape would leave that branch untested — and it
   * did, until a planted violation there came back green.
   */
  it('names an ADVERTISED-but-unimplemented lookup instead of blaming the ROM', async () => {
    const c = fakeClient({ lookupUnimplemented: true });
    const r = await pushPaletteLine(c as never, 1, line());

    expect(r.pushed).toBe(false);
    expect(r.gate).toBe(PaletteGateReason.UnservedMethod);
    expect(r.gate).not.toBe(PaletteGateReason.NoSymbols);
    expect(r.unservedMethod).toBe('emulator/lookup_symbol');
    // ANTI-VACUOUS: the up-front check PASSED (the method is advertised), so
    // this refusal came from the reply and not from the list.
    expect(c.hasMethod('emulator/lookup_symbol')).toBe(true);
  });

  /** The discrimination: a served server with an unhelpful ROM still gates NoSymbols. */
  it('still says no-symbols when the server is fine and the ROM lacks them', async () => {
    const c = fakeClient({ symbols: {} });
    const r = await pushPaletteLine(c as never, 1, line());
    expect(r.gate).toBe(PaletteGateReason.NoSymbols);
    expect(r.unservedMethod).toBeUndefined();
  });

  it('names the method on the pre-existing write_memory gate too', async () => {
    const c = fakeClient({ methods: ['emulator/pause', 'emulator/resume', 'emulator/lookup_symbol'] });
    const r = await pushPaletteLine(c as never, 1, line());
    // The GATE VALUE is unchanged, so UI copy that already reads it keeps
    // working; what is new is that the result says which method.
    expect(r.gate).toBe(PaletteGateReason.NoMethod);
    expect(r.unservedMethod).toBe('emulator/write_memory');
    expect(r.error).toContain('emulator/write_memory');
  });

  it('reports a machine left PAUSED when resume is unserved', async () => {
    const c = fakeClient({ methods: ['emulator/write_memory', 'emulator/pause', 'emulator/lookup_symbol'] });
    const r = await pushPaletteLine(c as never, 1, line());
    expect(r.gate).toBe(PaletteGateReason.UnservedMethod);
    expect(r.unservedMethod).toBe('emulator/resume');
    // ANTI-VACUOUS, and the reason this gate is checked up front: refusing here
    // means the machine was never paused in the first place.
    expect(c.calls).toEqual([]);
  });
});
