// WHAT THE USER IS TOLD — the point where the gate distinction stops being an
// enum and starts being an instruction someone acts on.
//
// The three failure gates all grey the same key out, and telling them apart is
// the whole reason they are separate values:
//
//   no-symbols      the listing does not describe the running ROM  -> BUILD IT
//   unserved-method this SERVER cannot do it                       -> the ROM is fine
//   no-offsets      the DISASSEMBLY could not be read              -> neither is
//
// A wrong sentence here is worse than no sentence: it is a plausible,
// documented, wrong explanation, and the reader has a reason not to doubt it.
//
// The success wording matters for the same reason. On classic, `landed` is
// where S1 actually put the player after resolving collision against whatever
// position it was handed — reporting the ASK back would be confidently wrong in
// exactly the cases nobody has measured.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAetherStore } from '../aetherStore';
import { useClassicProjectStore } from '../classicProjectStore';
import type { AetherWarpResult } from '../../../shared/ipc-types';

let lastArgs: unknown[] = [];

function serve(result: AetherWarpResult): void {
  lastArgs = [];
  (globalThis as { window?: unknown }).window = {
    api: {
      aetherWarp: (...args: unknown[]) => { lastArgs = args; return Promise.resolve(result); },
    },
  } as never;
}

beforeEach(() => {
  useAetherStore.setState({ status: 'connected' });
  useClassicProjectStore.setState({ dir: '/tmp/s1disasm' } as never);
  vi.restoreAllMocks();
});

describe('the classic play-from-cursor message', () => {
  it('sends the project kind AND the disassembly directory', async () => {
    // obX/obY are equates: without the directory the main process cannot
    // derive them, and the feature gates on a condition the user did not cause.
    serve({ warped: true, landed: { x: 592, y: 1084 } });
    await useAetherStore.getState().warp(592, 1084, 'classic');
    expect(lastArgs).toEqual([592, 1084, 'classic', '/tmp/s1disasm']);
  });

  it('does NOT send a directory on the aeon route', async () => {
    serve({ warped: true, landed: { x: 1, y: 2 } });
    await useAetherStore.getState().warp(1, 2, 'aeon');
    expect(lastArgs).toEqual([1, 2, 'aeon', undefined]);
  });

  it('reports the LANDING, not the ask', async () => {
    serve({ warped: true, landed: { x: 568, y: 1092 }, clamped: true });
    const msg = await useAetherStore.getState().warp(592, 1084, 'classic');
    expect(msg).toContain('(568, 1092)');
    expect(msg).not.toContain('(592, 1084)—');            // never as the destination
    expect(msg).toMatch(/^Warped/);                        // the toast reads it as success
  });

  it('says the GAME moved him, not that the act bounds clamped him', async () => {
    // S1 does not clamp a warp — there is nothing to clamp with. It resolves
    // collision against the position it was handed and may eject him. Borrowing
    // aeon's "clamped to the act bounds" would describe a mechanism that does
    // not exist on this path.
    serve({ warped: true, landed: { x: 568, y: 1092 }, from: { x: 80, y: 1084 }, clamped: true });
    const msg = await useAetherStore.getState().warp(592, 1084, 'classic');
    expect(msg).toMatch(/the game moved him/i);
    expect(msg).not.toMatch(/act bounds/i);
  });

  it('a DISCARDED poke is not reported as "Warp failed"', async () => {
    // "Warp failed" sends the user to the emulator. The truth is that the act
    // was still loading and they should press the key again in a second.
    serve({
      warped: false,
      landed: { x: 80, y: 1084 },
      from: { x: 80, y: 1084 },
      error: 'the poke did not take — the player is back at (80, 1084), where he started.',
    });
    const msg = await useAetherStore.getState().warp(592, 1084, 'classic');
    expect(msg).not.toMatch(/^Warp failed/);
    expect(msg).toContain('did not take');
    expect(msg).toContain('(80, 1084)');
    expect(msg!.startsWith('Warped')).toBe(false);        // the toast must not call it success
  });

  it('no-symbols on classic points at the LISTING, never at a DEBUG build', async () => {
    // There is no DEBUG flavour of s1disasm to build. A sentence that asked for
    // one would send the reader looking for a switch that does not exist.
    serve({ warped: false, gate: 'no-symbols' });
    const msg = await useAetherStore.getState().warp(1, 2, 'classic');
    expect(msg).not.toMatch(/DEBUG/i);
    expect(msg).toMatch(/v_player/);
  });

  it('no-symbols on aeon still asks for the DEBUG build', async () => {
    serve({ warped: false, gate: 'no-symbols' });
    const msg = await useAetherStore.getState().warp(1, 2, 'aeon');
    expect(msg).toMatch(/DEBUG build/);
  });

  it('no-offsets gets its OWN sentence, distinct from no-symbols', async () => {
    serve({ warped: false, gate: 'no-offsets', error: 'could not read obX/obY from /x/_Constants.asm' });
    const msg = await useAetherStore.getState().warp(1, 2, 'classic');
    expect(msg).toMatch(/obX\/obY/);
    // NOT the symbols sentence: the ROM is fine and rebuilding it changes
    // nothing, so pointing at the listing would be a wrong instruction.
    expect(msg).not.toMatch(/v_player did not resolve/);
    // And NOT "Warp failed", which sends the reader to the emulator. The warp
    // never started; the project tree is what could not be read. Without this
    // the row is satisfied by the generic `Warp failed: ${error}` fallback,
    // which is how it passed against the implementation that predates the gate.
    expect(msg).not.toMatch(/^Warp failed/);
  });

  // PRESERVED BEHAVIOUR, not new: the generic fallback already carried the
  // MethodNotServedError's own sentence, which names the server and the method.
  // The row is here so a future tidy-up of the fallback cannot quietly turn the
  // capability gap back into "release ROM, rebuild".
  it('an unserved method names the SERVER, not the ROM', async () => {
    serve({
      warped: false,
      gate: 'unserved-method',
      unservedMethod: 'emulator/run_frames',
      error: 'oracle does not serve the Aether method emulator/run_frames (detected from the advertised-list)',
    });
    const msg = await useAetherStore.getState().warp(1, 2, 'classic');
    expect(msg).toMatch(/does not serve/);
    expect(msg).toMatch(/emulator\/run_frames/);
    // The two wrong answers this gate exists to prevent.
    expect(msg).not.toMatch(/v_player did not resolve/);
    expect(msg).not.toMatch(/DEBUG/i);
  });

  it('returns null and touches nothing when the link is down', async () => {
    useAetherStore.setState({ status: 'disconnected' });
    serve({ warped: true });
    expect(await useAetherStore.getState().warp(1, 2, 'classic')).toBeNull();
    expect(lastArgs).toEqual([]);
  });
});
