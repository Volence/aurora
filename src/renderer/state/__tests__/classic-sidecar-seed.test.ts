// The build-field SEED writer, and the one thing it must never do.
//
// `.aurora/project.json` is a HAND-WRITTEN file: path overrides, a base profile
// id, build fields. Opening a classic project seeds three build keys into it
// (seedClassicBuildConfig) so Build & Run has a visible channel. That seed runs
// at open, before any UI renders, with no gesture and no dialog behind it.
//
// Which makes the read that feeds it load-bearing. A sidecar Aurora could not
// READ used to arrive here as `config: {}` — byte-identical to "there is no
// sidecar file" — and the seed then wrote a fresh 3-key document over the
// user's file. A trailing comma in the JSON was enough to destroy every
// override in it, silently, at open.
//
// So these rows assert on the WRITER, not on a message: given a SidecarState
// that says `read: 'unreadable'`, `bridge.writeSidecar` is not called at all.
// The absent case is here beside them because it is the behaviour that must NOT
// regress — a genuinely missing sidecar is exactly what the seed exists for,
// and "refuse everything" would pass every other row in this file.
//
// Mirrors the canvas rule (canvas-save.ts:72, canvas-file-format.ts:277):
// a sidecar Aurora could not READ is one it must not overwrite.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useClassicProjectStore,
  __setClassicBridgeForTest,
  __resetClassicBridgeForTest,
} from '../classicProjectStore';
import { ipcClassicBridge, type ClassicBridge } from '../classic-bridge';
import type { ProjectHandle, SidecarState } from '../../../core/project/adapter';
import type { ResolutionReport } from '../../../core/project/report';
import { CLASSIC_BUILD_SIDECAR } from '../../../core/project/mapping';
import { useClassicLevelStore } from '../classicLevelStore';
import { useToastStore } from '../toastStore';

const REPORT: ResolutionReport = { entries: [], resolved: 0, total: 0 };

function handleWith(sidecar: SidecarState): ProjectHandle {
  return {
    type: 's1',
    capabilities: {
      levels: 'chunk-hierarchy',
      sprites: true,
      objects: 'objpos',
      build: false,
      facets: ['layout'],
    },
    report: REPORT,
    levels: null,
    sidecar,
  };
}

/** A bridge that records every sidecar write it is asked to perform. */
function bridgeFor(sidecar: SidecarState) {
  const writes: Uint8Array[] = [];
  const writeSidecar = vi.fn(async (_dir: string, bytes: Uint8Array) => {
    writes.push(bytes);
  });
  const bridge: ClassicBridge = {
    async open() {
      return { kind: 'opened', handle: handleWith(sidecar), label: 'Sonic 1 Disassembly' };
    },
    writeSidecar,
  };
  return { bridge, writes, writeSidecar };
}

function decode(bytes: Uint8Array): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

/** The user's file: a base profile and two hand-written path overrides. */
const AUTHORED = {
  base: 's1-github',
  paths: { 'ghz.act1.fgLayout': 'my/layout.bin', 'ghz.act1.tiles.0': 'my/tiles.bin' },
};

beforeEach(() => {
  useClassicProjectStore.getState().reset();
  useClassicLevelStore.getState().reset();
  useToastStore.setState({ toasts: [] });
});
afterEach(() => {
  __resetClassicBridgeForTest();
  useClassicLevelStore.getState().reset();
});

describe('the open-time build-field seed refuses an unreadable sidecar', () => {
  // THE LOAD-BEARING ROW. `read: 'unreadable'` is the parser's answer for a
  // file that is on disk and could not be turned into a config — the seed must
  // treat that as "the user's overrides are still there, I just cannot see
  // them", not as "there is nothing here".
  it('unreadable ⇒ writeSidecar is never called', async () => {
    const { bridge, writeSidecar } = bridgeFor({
      config: {},
      issues: [{ where: '$', message: 'sidecar unreadable; ignoring it' }],
      read: 'unreadable',
    });
    __setClassicBridgeForTest(bridge);

    const outcome = await useClassicProjectStore.getState().openDirectory('/proj/s1');
    expect(outcome).toBe('opened');
    expect(writeSidecar).not.toHaveBeenCalled();
  });

  it('invalid JSON ⇒ writeSidecar is never called', async () => {
    // What readProjectConfig answers for `{"base":"s1-github",}` — the trailing
    // comma that reproduced this defect by hand.
    const { bridge, writeSidecar } = bridgeFor({
      config: {},
      issues: [{ where: '$', message: 'invalid JSON; ignoring the sidecar' }],
      read: 'unreadable',
    });
    __setClassicBridgeForTest(bridge);

    await useClassicProjectStore.getState().openDirectory('/proj/s1');
    expect(writeSidecar).not.toHaveBeenCalled();
  });

  it('a non-object JSON root ⇒ writeSidecar is never called', async () => {
    const { bridge, writeSidecar } = bridgeFor({
      config: {},
      issues: [{ where: '$', message: 'expected a JSON object; ignoring the sidecar' }],
      read: 'unreadable',
    });
    __setClassicBridgeForTest(bridge);

    await useClassicProjectStore.getState().openDirectory('/proj/s1');
    expect(writeSidecar).not.toHaveBeenCalled();
  });

  // NOT a message assertion for its own sake: `issues` is rendered ONLY on the
  // Project Setup tab, which a user opening a project need never visit. Refusing
  // silently would keep the file and still leave the person with a Build & Run
  // that quietly uses planner defaults and no idea why. The toast is the telling.
  it('unreadable ⇒ the user is told, in the session, not only on a tab they may never open', async () => {
    const { bridge } = bridgeFor({
      config: {},
      issues: [{ where: '$', message: 'invalid JSON; ignoring the sidecar' }],
      read: 'unreadable',
    });
    __setClassicBridgeForTest(bridge);

    await useClassicProjectStore.getState().openDirectory('/proj/s1');

    const toasts = useToastStore.getState().toasts;
    // Assert on the phrase only THIS rule emits — "left it alone" is the
    // refusal, and no other toast in Aurora says it about project.json.
    const t = toasts.find((x) => /left it alone/.test(x.message));
    expect(t, `toasts were: ${JSON.stringify(toasts.map((x) => x.message))}`).toBeDefined();
    expect(t!.message).toMatch(/\.aurora\/project\.json/);
    expect(t!.type).toBe('error');
  });
});

describe('the open-time build-field seed still writes when it should', () => {
  // THE NON-REGRESSION ROW — this is why the seed code exists at all. Delete
  // the three-way distinction and gate on "config is empty" instead, and this
  // row goes red while every refusal row above stays green.
  it('genuinely absent ⇒ the seed writes the three build fields', async () => {
    const { bridge, writes, writeSidecar } = bridgeFor({ config: {}, issues: [], read: 'absent' });
    __setClassicBridgeForTest(bridge);

    await useClassicProjectStore.getState().openDirectory('/proj/s1');

    expect(writeSidecar).toHaveBeenCalledTimes(1);
    expect(decode(writes[0]!)).toEqual({ ...CLASSIC_BUILD_SIDECAR });
    // And the seeded config feeds the session, so the plan and the file agree.
    expect(useClassicProjectStore.getState().sidecar!.config).toMatchObject(CLASSIC_BUILD_SIDECAR);
  });

  it('read-and-empty (a valid `{}` on disk) ⇒ the seed writes too', async () => {
    const { bridge, writeSidecar } = bridgeFor({ config: {}, issues: [], read: 'read' });
    __setClassicBridgeForTest(bridge);

    await useClassicProjectStore.getState().openDirectory('/proj/s1');
    expect(writeSidecar).toHaveBeenCalledTimes(1);
  });

  it('a readable file with authored overrides ⇒ the seed ADDS, never replaces', async () => {
    const { bridge, writes } = bridgeFor({ config: { ...AUTHORED }, issues: [], read: 'read' });
    __setClassicBridgeForTest(bridge);

    await useClassicProjectStore.getState().openDirectory('/proj/s1');

    expect(decode(writes[0]!)).toEqual({ ...AUTHORED, ...CLASSIC_BUILD_SIDECAR });
  });

  it('an already-seeded readable file ⇒ nothing is written at all', async () => {
    const { bridge, writeSidecar } = bridgeFor({
      config: { ...AUTHORED, ...CLASSIC_BUILD_SIDECAR },
      issues: [],
      read: 'read',
    });
    __setClassicBridgeForTest(bridge);

    await useClassicProjectStore.getState().openDirectory('/proj/s1');
    expect(writeSidecar).not.toHaveBeenCalled();
  });

  // A readable file can carry per-entry issues (one dropped `paths` entry) and
  // still be perfectly safe to write back — the rest of the document parsed.
  // Gating on `issues.length` instead of on the read kind would refuse here and
  // strand the seed for a project with one typo'd override.
  it('readable WITH per-entry issues ⇒ still writes (issues are not unreadability)', async () => {
    const { bridge, writeSidecar } = bridgeFor({
      config: { base: 's1-github', paths: {} },
      issues: [{ where: 'paths.ghz.act1.tiles.0', message: 'expected a string path, got number; entry ignored' }],
      read: 'read',
    });
    __setClassicBridgeForTest(bridge);

    await useClassicProjectStore.getState().openDirectory('/proj/s1');
    expect(writeSidecar).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// The REAL bridge's write, not the fake one above.
//
// `window.api.writeBinaryFile` returns Promise<boolean> and answers `false`
// when the main process refuses the path — its own contract says the renderer
// treats that as a failed write and reports it. ipcClassicBridge.writeSidecar
// assigned the result nowhere, so a refused write was indistinguishable from a
// landed one and the seed's try/catch never fired.
//
// Booked for the other nine call sites as REFUSED-WRITE-REPORTED-SAVED; this
// row covers the one on the path being fixed here.
// ---------------------------------------------------------------------------

describe('ipcClassicBridge.writeSidecar reads the answer the write gives', () => {
  afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

  it('a refused write (false) is reported, not swallowed', async () => {
    (globalThis as unknown as { window: unknown }).window = {
      api: { writeBinaryFile: async () => false },
    };
    await expect(
      ipcClassicBridge.writeSidecar!('/proj/s1', new Uint8Array([1, 2, 3])),
    ).rejects.toThrow(/refused by the main process/);
  });

  it('an accepted write (true) resolves', async () => {
    (globalThis as unknown as { window: unknown }).window = {
      api: { writeBinaryFile: async () => true },
    };
    await expect(
      ipcClassicBridge.writeSidecar!('/proj/s1', new Uint8Array([1, 2, 3])),
    ).resolves.toBeUndefined();
  });
});
