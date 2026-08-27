// WHICH play-from-cursor runs — the one routing site.
//
// Two mechanisms now answer F7: aeon's DEBUG mailbox (`warp.ts`) and the
// classic poke-settle-read-back (`s1-warp.ts`). They resolve DIFFERENT symbols
// and would each gate out politely against the other family's ROM, so a routing
// mistake does not crash — it produces "this ROM has no warp mailbox" against a
// disassembly that was never going to have one, which is a documented, wrong
// explanation of a correct machine.
//
// These rows use the symbol each mechanism asks for as the fingerprint.

import { describe, it, expect, vi } from 'vitest';
import { WarpGateReason } from '../warp';
import { WARP_SYMBOLS } from '../warp';
import { S1_PLAYER_SYMBOL } from '../s1-warp';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('electron', () => ({ ipcMain: { handle: () => {} } }));

const { warpForProject } = await import('../bridge');

/** A connected server that serves everything and carries no symbols at all. */
function fakeClient() {
  const resolved: string[] = [];
  const calls: string[] = [];
  return {
    resolved,
    calls,
    status: 'connected' as const,
    server: { name: 'oracle' },
    hasMethod: () => true,
    resolve: async (name: string) => {
      resolved.push(name);
      throw new Error(`no symbol named ${name}`);
    },
    call: async (method: string) => { calls.push(method); return {}; },
  };
}

/**
 * A directory that looks enough like a disassembly to get past the offsets
 * gate. It has to be REAL: the classic route reads `_Constants.asm` off disk
 * before it touches the machine, so a made-up path gates out before any symbol
 * is asked for — which is the right order, and would make a routing row that
 * used one green for the wrong reason.
 */
function constantsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aurora-warp-route-'));
  writeFileSync(join(dir, '_Constants.asm'), 'obX:\t\tequ 8\nobY:\t\tequ $C\n');
  return dir;
}

/**
 * A real-enough S1 machine on a real-enough disassembly: a temp dir holding a
 * `_Constants.asm`, so the classic route's fs read is exercised rather than
 * stubbed away, and RAM that remembers what was poked into it.
 */
function machineClient(start: { x: number; y: number }) {
  const base = 0xffffd000;
  const dir = constantsDir();
  const player = { ...start };
  const w = (v: number) => '0x' + (v & 0xffff).toString(16).padStart(4, '0');
  return {
    dir,
    status: 'connected' as const,
    server: { name: 'oracle' },
    hasMethod: () => true,
    resolve: async (name: string) => {
      if (name !== 'v_player') throw new Error(`no symbol named ${name}`);
      return base;
    },
    call: async (method: string, params: Record<string, unknown> = {}) => {
      if (method === 'emulator/pause') return { wasRunning: true };
      const addr = Number.parseInt(String(params.addr ?? '0'), 16);
      if (method === 'emulator/write_memory') {
        const v = Number.parseInt(String(params.bytes).replace(/^0x/i, ''), 16);
        if (addr === base + 8) player.x = v; else if (addr === base + 0xc) player.y = v;
        return {};
      }
      if (method === 'emulator/read_memory') {
        return { bytes: w(addr === base + 8 ? player.x : player.y) };
      }
      return {};
    },
  };
}

describe('warpForProject routes by the OPEN PROJECT, not by what the ROM carries', () => {
  it('an aeon project asks for the mailbox symbols', async () => {
    const c = fakeClient();
    await warpForProject(c as never, 100, 200, 'aeon', undefined);
    expect(c.resolved).toEqual([...WARP_SYMBOLS]);
    expect(c.resolved).not.toContain(S1_PLAYER_SYMBOL);
  });

  it('no declared kind still routes to aeon, as every existing caller expects', async () => {
    const c = fakeClient();
    await warpForProject(c as never, 100, 200, undefined, undefined);
    expect(c.resolved).toEqual([...WARP_SYMBOLS]);
  });

  it('a classic project asks for v_player and never for the mailbox', async () => {
    const c = fakeClient();
    await warpForProject(c as never, 100, 200, 'classic', constantsDir());
    expect(c.resolved).toEqual([S1_PLAYER_SYMBOL]);
    for (const s of WARP_SYMBOLS) expect(c.resolved).not.toContain(s);
  });

  it('a classic project with no directory gates on the OFFSETS, not on the ROM', async () => {
    // Without the disassembly there is no obX/obY to derive, and saying "no
    // symbols" here would send the user to rebuild a ROM that would come back
    // exactly as unable to help.
    const c = fakeClient();
    const r = await warpForProject(c as never, 100, 200, 'classic', undefined);
    expect(r.warped).toBe(false);
    expect(r.gate).toBe(WarpGateReason.NoOffsets);
    expect(c.resolved).toEqual([]);
    expect(c.calls).toEqual([]);
  });

  it('carries the classic result\'s `from` and `landed` through to the IPC shape', async () => {
    // `from` is half of the read-back comparison — it is what lets the UI say
    // WHERE he still is when a poke does not take. A route that mapped the
    // result field-by-field and forgot it would leave the classic answer
    // strictly less informative than the mechanism that produced it.
    const c = machineClient({ x: 41, y: 42 });
    const r = await warpForProject(c as never, 900, 901, 'classic', c.dir);
    expect(r.warped).toBe(true);
    expect(r.landed).toEqual({ x: 900, y: 901 });
    expect(r.from).toEqual({ x: 41, y: 42 });
  });
});
