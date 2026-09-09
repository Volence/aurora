// WHAT THE BUILD TOAST SAYS IT RELOADED.
//
// The 2026-09-09 field defect: the owner edited a chunk, pressed Ctrl+Shift+B,
// saw "Build succeeded ... emulator reloaded", and the chunk was not in the
// game. Every link in that chain was individually honest. The build DID
// succeed. The reload DID happen. The toast was accurate about both. The
// composite still told him his edit had vanished, because the file that was
// reloaded came from an unrelated experiment directory and no link in the chain
// named its object.
//
// The gate in `build-run.ts` is the half that stops it happening. This is the
// other half, and it is separable: a reload that NAMES ITS PATH makes the whole
// class self diagnosing in one glance instead of a process sweep. It is worth
// having even when the gate is right, because the gate can only refuse the
// cases it can see.
//
// AND IT MUST BE THE PATH, NOT THE BASENAME. Both ROMs in the incident were
// called `s4.debug.bin`. A toast naming the basename would have read exactly
// the same on the good day and the bad one, which is the definition of a link
// that names nothing.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAetherStore } from '../aetherStore';
import type { AetherBuildResult } from '../../../shared/ipc-types';

const OK: AetherBuildResult = {
  ok: true, exitCode: 0, output: [], reloaded: true, missingEnv: [],
  command: './build.sh', debugBuild: true, fast: true,
};

function serve(result: AetherBuildResult): void {
  (globalThis as { window?: unknown }).window = {
    api: {
      aetherBuild: () => Promise.resolve(result),
      perfLog: () => undefined,
    },
  } as never;
}

beforeEach(() => {
  useAetherStore.setState({ buildState: 'idle', buildSummary: null });
  vi.restoreAllMocks();
});

describe('the Build & Run success toast', () => {
  it('names the ROM that was reloaded, in full', async () => {
    serve({ ...OK, romPath: '/home/v/sonic_hacks/aeon/s4.debug.bin' });
    await useAetherStore.getState().build('/home/v/sonic_hacks/aeon');
    expect(useAetherStore.getState().buildSummary)
      .toContain('/home/v/sonic_hacks/aeon/s4.debug.bin');
  });

  it('is DIFFERENT for two ROMs that share a name', async () => {
    // The whole point, and the row a basename would pass while saying nothing.
    // Same flavour, same file name, different project: the two toasts must not
    // be the same string.
    serve({ ...OK, romPath: '/home/v/sonic_hacks/aeon/s4.debug.bin' });
    await useAetherStore.getState().build('/home/v/sonic_hacks/aeon');
    const good = useAetherStore.getState().buildSummary;

    useAetherStore.setState({ buildState: 'idle', buildSummary: null });
    serve({ ...OK, romPath: '/tmp/scroll-experiment/s4.debug.bin' });
    await useAetherStore.getState().build('/home/v/sonic_hacks/aeon');
    const bad = useAetherStore.getState().buildSummary;

    expect(good).not.toBe(bad);
    expect(bad).toContain('/tmp/scroll-experiment/s4.debug.bin');
  });

  it('still names the flavour and the restored position beside it', async () => {
    // The path is an addition, not a replacement: the flavour decides which
    // file was written and the position is what the artist came back for.
    serve({
      ...OK, romPath: '/home/v/sonic_hacks/aeon/s4.debug.bin',
      restoredTo: { x: 1234, y: 560 }, restoredVia: 'boot-override',
    });
    await useAetherStore.getState().build('/home/v/sonic_hacks/aeon');
    const s = useAetherStore.getState().buildSummary ?? '';
    expect(s).toContain('debug');
    expect(s).toContain('(1234, 560)');
    expect(s).toContain('/home/v/sonic_hacks/aeon/s4.debug.bin');
  });

  it('falls back to the old wording rather than an empty gap when no path came back', async () => {
    // A main process that reported a reload without a path is a bug, but the
    // toast must not read "reloaded ." over it.
    serve({ ...OK, romPath: undefined });
    await useAetherStore.getState().build('/home/v/sonic_hacks/aeon');
    expect(useAetherStore.getState().buildSummary).toContain('emulator reloaded');
  });
});
