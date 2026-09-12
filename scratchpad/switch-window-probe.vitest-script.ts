// switch-window-probe: SWITCH-WINDOW-EDIT-DROPPED, MEASUREMENT ONLY.
// Packet: docs/reviews/2026-09-12-switch-window-measure.md
//
//   SWITCH_WINDOW_WORK=<an empty directory you own> \
//     npx vitest run --config scratchpad/switch-window-probe.vitest.config.ts
//
// WHY THIS IS NOT A SUITE ROW. The intended behaviour of an edit made while a
// project switch is loading is UNRULED. A suite row would pin either the defect
// or a ruling nobody made, so this lives in scratchpad/ under its own config and
// the main suite never collects it.
//
// WHAT IT DRIVES. The REAL user road, `useProject.openProjectPath`, with the REAL
// unsaved-work guard (`confirmProjectOpen`, answered through the real
// confirmStore), the REAL classic bridge (`ipcClassicBridge`) and the REAL aeon
// loader (`openAeonProject` -> `aeonAdapter.open`), over the REAL reference trees.
// Exactly two things are substituted:
//   1. `createIpcFileAccess` -> a node-fs FileAccess with the same five methods
//      the IPC one has (exists/read/list/mtime/readMany). Each call is COUNTED
//      (in the app every one of them is one IPC round trip) and can be HELD by a
//      per-directory gate, which is what makes "mid-switch" a state a row can
//      stand in.
//   2. `recordRecentProject` / `loadRecents` -> immediate `[]`. They are IPC to
//      the main process; node cannot measure them, and the packet says so.
// `window.api.writeBinaryFile` (the only write on these roads: the classic
// sidecar seed) is stubbed to write ONLY under SWITCH_WINDOW_WORK and to throw
// anywhere else. The FileAccess interface has no write method at all.
//
// TREES. s1disasm: the pinned tree the suite uses (`referencePath(S1_PINNED)`),
// COPIED fresh into the work dir because it has no `.aurora/` and the open seeds
// one; and the sibling checkout (`siblingPath('s1disasm')`), read only. aeon: the
// sibling checkout (`siblingPath('aeon')`), read only, and a fresh copy of its
// `project.json` + `games/sonic4/data` in the work dir, which is the second aeon
// directory an aeon-to-aeon switch needs.
//
// React does not run here, so `session-lifecycle`'s key-change effect
// (`resetProjectRuntime`) never fires. The packet derives what it adds.

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import * as os from 'node:os';

type Method = 'exists' | 'read' | 'list' | 'mtime' | 'readMany';
interface FaCall { dir: string; method: Method; t: number }

// Module-level state the mocked FileAccess reads LAZILY (at call time, never at
// mock-factory time), so the hoisted vi.mock below never touches it early.
const gates = new Map<string, Promise<void>>();
const faCalls: FaCall[] = [];
const writes: { dir: string; rel: string; wrote: boolean }[] = [];

function nodeFa(dir: string) {
  const abs = (rel: string): string => nodePath.join(dir, rel);
  const enter = async (method: Method): Promise<void> => {
    faCalls.push({ dir, method, t: performance.now() });
    const g = gates.get(dir);
    if (g) await g;
  };
  return {
    rootDir: dir,
    async exists(rel: string): Promise<boolean> {
      await enter('exists');
      return fs.existsSync(abs(rel));
    },
    async read(rel: string): Promise<Uint8Array> {
      await enter('read');
      return new Uint8Array(fs.readFileSync(abs(rel)));
    },
    async list(rel: string): Promise<string[]> {
      await enter('list');
      try {
        return fs.readdirSync(abs(rel));
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'ENOTDIR') return [];
        throw e;
      }
    },
    async mtime(rel: string): Promise<number | null> {
      await enter('mtime');
      try { return fs.statSync(abs(rel)).mtimeMs; } catch { return null; }
    },
    async readMany(rels: string[]) {
      await enter('readMany');
      const m = new Map<string, unknown>();
      for (const r of rels) {
        try {
          m.set(r, {
            bytes: new Uint8Array(fs.readFileSync(abs(r))), mtime: fs.statSync(abs(r)).mtimeMs,
            outcome: 'read', reason: null,
          });
        } catch (e) {
          const code = (e as NodeJS.ErrnoException).code;
          m.set(r, {
            bytes: null, mtime: null, outcome: code === 'ENOENT' ? 'absent' : 'unreadable',
            reason: (e as Error).message,
          });
        }
      }
      return m as never;
    },
  };
}

vi.mock('../src/renderer/state/classic-file-access', () => ({
  createIpcFileAccess: (dir: string) => nodeFa(dir),
}));
vi.mock('../src/renderer/state/recents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/renderer/state/recents')>()),
  loadRecents: vi.fn(async () => []),
  recordRecentProject: vi.fn(async () => []),
}));

import { openProjectPath } from '../src/renderer/hooks/useProject';
import { useClassicProjectStore } from '../src/renderer/state/classicProjectStore';
import {
  useClassicLevelStore, classicSetStart, layoutDocIdForCurrentAct,
} from '../src/renderer/state/classicLevelStore';
import { useProjectStore, getActiveLevel } from '../src/renderer/state/projectStore';
import { useEditorStore, executeAmbientCommand, commandDocId } from '../src/renderer/state/editorStore';
import { documentHistoryHub } from '../src/renderer/state/history-hub';
import { useConfirmStore } from '../src/renderer/state/confirmStore';
import { useToastStore } from '../src/renderer/state/toastStore';
import { openEngine } from '../src/renderer/state/open-project';
import { currentOpenDirtySnapshot, planProjectOpen } from '../src/renderer/shell/project-open-guard';
import { registerHistoryFactories } from '../src/renderer/state/history-factories';
import { siblingPath } from '../test/support/sibling-root.mjs';
import { referencePath, S1_PINNED } from '../test/support/fixture-tree';

// What src/test/register-history-factories.ts does for the main suite, done
// HERE, after the mocks above exist (see the config's header for why).
registerHistoryFactories();

// -- trees ---------------------------------------------------------------------

const WORK = process.env.SWITCH_WINDOW_WORK ?? '';
const S1_PIN_SRC = referencePath(S1_PINNED);
const S1_LIVE = siblingPath('s1disasm') ?? '';
const AEON_LIVE = siblingPath('aeon') ?? '';
const S1_COPY = nodePath.join(WORK, 's1-pinned-copy');
const AEON_COPY = nodePath.join(WORK, 'aeon-copy');

function out(key: string, v: unknown): void {
  process.stdout.write(`\nSWITCH-WINDOW ${key} ${JSON.stringify(v)}\n`);
}

// -- helpers -------------------------------------------------------------------

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(what: string, pred: () => boolean, ms = 60_000): Promise<void> {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error(`timed out waiting for: ${what}`);
    await tick();
  }
}

/** Hold every FileAccess call for `dir` until the returned release is called. */
function hold(dir: string): () => void {
  let release!: () => void;
  const p = new Promise<void>((r) => { release = r; });
  gates.set(dir, p);
  return () => { gates.delete(dir); release(); };
}

const askedFor = (dir: string): boolean => faCalls.some((c) => c.dir === dir);

async function resetAll(): Promise<void> {
  if (useConfirmStore.getState().request) useConfirmStore.getState().answer('cancel');
  gates.clear();
  useClassicLevelStore.getState().reset();
  useClassicProjectStore.getState().reset();
  useProjectStore.getState().reset();
  useEditorStore.getState().markClean();
  documentHistoryHub.clearAll();
  useToastStore.setState({ toasts: [] });
  faCalls.length = 0;
  writes.length = 0;
}

/** Count the confirm dialogs that open from now on. */
function watchDialogs(): { titles: string[]; stop: () => void } {
  const titles: string[] = [];
  const stop = useConfirmStore.subscribe((s, prev) => {
    if (s.request && s.request !== prev.request) titles.push(s.request.title);
  });
  return { titles, stop };
}

const toastsNow = (): string[] => useToastStore.getState().toasts.map((t) => `[${t.type}] ${t.message}`);

// -- classic helpers --

/** Why an open did not happen, from the stores that report it. */
function openFailure(): string {
  return `classic error: ${useClassicProjectStore.getState().error ?? '(none)'}; `
    + `aeon error: ${useProjectStore.getState().error ?? '(none)'}; `
    + `FileAccess calls so far: ${faCalls.length}`;
}

async function openClassicResident(dir: string): Promise<void> {
  const opened = await openProjectPath(dir);
  expect(opened, `premise: ${dir} opens (${openFailure()})`).toBe(true);
  expect(openEngine(), 'premise: classic is the open engine').toBe('s1');
  expect(useClassicProjectStore.getState().dir).toBe(dir);
  const ref = useClassicProjectStore.getState().zoneTree.find((r) => r.available);
  expect(ref, 'premise: the project lists an available act').toBeTruthy();
  await useClassicLevelStore.getState().openAct(ref!);
  expect(useClassicLevelStore.getState().status, 'premise: the act loaded').toBe('ready');
}

/** A real classic edit: move the spawn point 8px right (commitLayout, undoable). */
function classicEdit(): { x: number; y: number } {
  const doc = useClassicLevelStore.getState().doc!;
  const x = (doc.start.x + 8) & 0xffff;
  const r = classicSetStart(x, doc.start.y);
  expect(r, 'premise: the classic edit was accepted').toEqual({ ok: true });
  return { x, y: doc.start.y };
}

function classicState(layoutId: string | null) {
  const s = useClassicLevelStore.getState();
  return {
    projectDir: useClassicProjectStore.getState().dir,
    engine: openEngine(),
    actStatus: s.status,
    start: s.doc ? { ...s.doc.start } : null,
    dirty: { ...s.dirty },
    // The stack Ctrl+Z would reach for this act's layout document. After a
    // dispose, historyFor builds a fresh empty one, which is what a user meets.
    canUndo: layoutId ? documentHistoryHub.historyFor(layoutId).canUndo : null,
  };
}

// -- aeon helpers --

async function openAeonResident(dir: string): Promise<void> {
  const opened = await openProjectPath(dir);
  expect(opened, `premise: ${dir} opens (${openFailure()})`).toBe(true);
  expect(openEngine(), 'premise: aeon is the open engine').toBe('aeon');
  expect(useProjectStore.getState().config?.basePath).toBe(dir);
  expect(getActiveLevel(useProjectStore.getState()), 'premise: an act is current').not.toBeNull();
}

const PAL_LINE = 1;
const PAL_INDEX = 1;

/** A real aeon edit: one palette colour, through executeAmbientCommand (undoable). */
function aeonEdit(): { r: number } {
  const level = getActiveLevel(useProjectStore.getState())!;
  const old = level.palette!.lines[PAL_LINE].colors.map((c) => ({ ...c }));
  const next = old.map((c, i) => (i === PAL_INDEX ? { ...c, r: (c.r + 36) % 252 } : { ...c }));
  executeAmbientCommand(
    { type: 'set-palette-line', line: PAL_LINE, oldColors: old, newColors: next } as never, level);
  return { r: next[PAL_INDEX].r };
}

function aeonState(zoneArtId: string | null) {
  const p = useProjectStore.getState();
  const level = getActiveLevel(p);
  const e = useEditorStore.getState();
  return {
    projectDir: p.config?.basePath ?? null,
    engine: openEngine(),
    colorR: level?.palette?.lines[PAL_LINE].colors[PAL_INDEX].r ?? null,
    editorDirty: e.dirty,
    dirtyActs: { ...e.dirtyActs },
    canUndo: zoneArtId ? documentHistoryHub.historyFor(zoneArtId).canUndo : null,
  };
}

function aeonZoneArtId(): string | null {
  return commandDocId({ type: 'set-palette-line', line: 0, oldColors: [], newColors: [] } as never);
}

/** What the NEXT open (or a window close) would be told, from the guard's own planner. */
function guardVerdict() {
  const snap = currentOpenDirtySnapshot();
  const plan = planProjectOpen(snap);
  return plan.kind === 'proceed' ? { kind: 'proceed' } : { ...plan };
}

// -- the probe -----------------------------------------------------------------

describe('SWITCH-WINDOW-EDIT-DROPPED probe', () => {
  beforeAll(() => {
    // LOUD WHEN IT CANNOT MEASURE. Every row below needs these trees; a missing
    // one is a stop with its name, never a quiet zero.
    if (!WORK) throw new Error('SWITCH_WINDOW_WORK is not set: name an empty directory you own');
    for (const [name, p, marker] of [
      ['pinned s1disasm', S1_PIN_SRC, 'sonic.asm'], ['sibling s1disasm', S1_LIVE, 'sonic.asm'],
      ['sibling aeon', AEON_LIVE, 'project.json'],
    ] as const) {
      if (!p || !fs.existsSync(nodePath.join(p, marker))) {
        throw new Error(`UNMEASURABLE: ${name} not found at ${p || '(unresolved)'} (no ${marker})`);
      }
    }
    fs.rmSync(S1_COPY, { recursive: true, force: true });
    fs.rmSync(AEON_COPY, { recursive: true, force: true });
    fs.cpSync(S1_PIN_SRC, S1_COPY, { recursive: true });
    fs.mkdirSync(nodePath.join(AEON_COPY, 'games', 'sonic4'), { recursive: true });
    fs.copyFileSync(nodePath.join(AEON_LIVE, 'project.json'), nodePath.join(AEON_COPY, 'project.json'));
    fs.cpSync(nodePath.join(AEON_LIVE, 'games', 'sonic4', 'data'),
      nodePath.join(AEON_COPY, 'games', 'sonic4', 'data'), { recursive: true });
    out('trees', { S1_PIN_SRC, S1_COPY, S1_LIVE, AEON_LIVE, AEON_COPY });
  });

  beforeEach(async () => {
    vi.stubGlobal('window', {
      api: {
        writeBinaryFile: async (dir: string, rel: string, buf: ArrayBuffer): Promise<void> => {
          const inside = nodePath.resolve(dir).startsWith(nodePath.resolve(WORK) + nodePath.sep);
          writes.push({ dir, rel, wrote: inside });
          if (!inside) throw new Error(`probe refuses a write outside the work dir: ${dir}/${rel}`);
          fs.mkdirSync(nodePath.dirname(nodePath.join(dir, rel)), { recursive: true });
          fs.writeFileSync(nodePath.join(dir, rel), new Uint8Array(buf));
        },
      },
    });
    await resetAll();
  });
  afterAll(async () => {
    await resetAll();
    vi.unstubAllGlobals();
  });

  // ==== CLASSIC ================================================================

  it('CLASSIC CONTROL: an edit with no switch in flight survives', async () => {
    await openClassicResident(S1_COPY);
    const id = layoutDocIdForCurrentAct();
    const edited = classicEdit();
    await sleep(500);
    const after = classicState(id);
    out('classic-control', { edited, after, toasts: toastsNow() });
    expect(after.start).toEqual(edited);
    expect(after.dirty.start).toBe(true);
    expect(after.canUndo).toBe(true);
  });

  async function classicMidWindow(
    target: string, opts: { dirtyBefore: boolean },
  ): Promise<void> {
    await openClassicResident(S1_COPY);
    const id = layoutDocIdForCurrentAct();
    const original = { ...useClassicLevelStore.getState().doc!.start };
    const preEdit = opts.dirtyBefore ? classicEdit() : null;
    const dialogs = watchDialogs();
    faCalls.length = 0;
    const release = hold(target);
    const pending = openProjectPath(target);
    let dialogBody: string | null = null;
    if (opts.dirtyBefore) {
      await waitFor('the unsaved-changes dialog', () => useConfirmStore.getState().request !== null);
      dialogBody = useConfirmStore.getState().request!.body;
      useConfirmStore.getState().answer('discard');
    }
    await waitFor(`the bridge to be asked for ${target}`, () => askedFor(target));
    const dialogsBeforeWindow = dialogs.titles.length;
    // ---- the window is open: the bridge is reading the new project ----
    const midEdit = classicEdit();
    const mid = classicState(id);
    release();
    const outcome = await pending;
    const after = classicState(id);
    dialogs.stop();
    const res = {
      target, original, preEdit, dialogBody, dialogsBeforeWindow,
      dialogsDuringOrAfterWindow: dialogs.titles.length - dialogsBeforeWindow,
      midEdit, mid, outcome, after, guardAfter: guardVerdict(), toasts: toastsNow(),
      writes: [...writes],
    };
    out(`classic-to-${target === AEON_LIVE ? 'aeon' : target === S1_COPY ? 'same-dir' : 's1'}`
      + (opts.dirtyBefore ? '-dirty-before' : '-clean-before'), res);
    // The premise: the mid-window edit really landed on the resident act.
    expect(mid.start).toEqual(midEdit);
    expect(mid.dirty.start).toBe(true);
    expect(mid.canUndo).toBe(true);
    expect(outcome).toBe(true);
    // The measurement. (Recorded above in full; these lines only make a
    // regression in the PROBE loud.)
    expect(res.dialogsDuringOrAfterWindow).toBe(0);
  }

  it('CLASSIC to CLASSIC, clean before: the mid-window edit', async () => {
    await classicMidWindow(S1_LIVE, { dirtyBefore: false });
  });

  it('CLASSIC to CLASSIC, dirty before, Discard & open: the mid-window edit', async () => {
    await classicMidWindow(S1_LIVE, { dirtyBefore: true });
  });

  it('CLASSIC to AEON, clean before: the mid-window edit', async () => {
    await classicMidWindow(AEON_LIVE, { dirtyBefore: false });
  });

  it('CLASSIC re-validate of the SAME directory (Project Setup door): the mid-window edit', async () => {
    await openClassicResident(S1_COPY);
    const id = layoutDocIdForCurrentAct();
    faCalls.length = 0;
    const release = hold(S1_COPY);
    // Exactly the Setup tab's call (ProjectSetupTab.tsx `apply`), minus its own
    // pre-dialog and its sidecar write.
    const pending = useClassicProjectStore.getState().openDirectory(S1_COPY);
    await waitFor('the bridge to be asked', () => askedFor(S1_COPY));
    const midEdit = classicEdit();
    const mid = classicState(id);
    release();
    const outcome = await pending;
    const after = classicState(id);
    out('classic-same-dir-revalidate', { midEdit, mid, outcome, after, toasts: toastsNow() });
    expect(mid.start).toEqual(midEdit);
    expect(outcome).toBe('opened');
  });

  // ==== AEON ===================================================================

  it('AEON CONTROL: an edit with no switch in flight survives', async () => {
    await openAeonResident(AEON_COPY);
    const id = aeonZoneArtId();
    const before = aeonState(id);
    const edited = aeonEdit();
    await sleep(500);
    const after = aeonState(id);
    out('aeon-control', { before, edited, after, toasts: toastsNow() });
    expect(after.colorR).toBe(edited.r);
    expect(after.editorDirty).toBe(true);
    expect(after.canUndo).toBe(true);
  });

  async function aeonMidWindow(target: string, opts: { dirtyBefore: boolean }): Promise<void> {
    await openAeonResident(AEON_COPY);
    const id = aeonZoneArtId();
    const oldLevel = getActiveLevel(useProjectStore.getState())!;
    const original = oldLevel.palette!.lines[PAL_LINE].colors[PAL_INDEX].r;
    const preEdit = opts.dirtyBefore ? aeonEdit() : null;
    const dialogs = watchDialogs();
    faCalls.length = 0;
    const release = hold(target);
    const pending = openProjectPath(target);
    let dialogBody: string | null = null;
    if (opts.dirtyBefore) {
      await waitFor('the unsaved-changes dialog', () => useConfirmStore.getState().request !== null);
      dialogBody = useConfirmStore.getState().request!.body;
      useConfirmStore.getState().answer('discard');
    }
    await waitFor(`the bridge to be asked for ${target}`, () => askedFor(target));
    const dialogsBeforeWindow = dialogs.titles.length;
    const midEngine = openEngine();
    const midEdit = aeonEdit();
    const mid = aeonState(id);
    release();
    const outcome = await pending;
    const after = aeonState(id);
    dialogs.stop();
    const res = {
      target, original, preEdit, dialogBody, dialogsBeforeWindow,
      dialogsDuringOrAfterWindow: dialogs.titles.length - dialogsBeforeWindow,
      midEngine, midEdit, mid, outcome, after,
      // The OLD project object, which held the edit: is any store still pointing at it?
      oldProjectStillReferenced: useProjectStore.getState().project !== null
        && getActiveLevel(useProjectStore.getState())?.palette === oldLevel.palette,
      oldObjectColorR: oldLevel.palette!.lines[PAL_LINE].colors[PAL_INDEX].r,
      classicAfter: {
        engine: openEngine(), dir: useClassicProjectStore.getState().dir,
        status: useClassicProjectStore.getState().status,
      },
      guardAfter: guardVerdict(), toasts: toastsNow(), writes: [...writes],
    };
    out(`aeon-to-${target === S1_COPY ? 's1' : 'aeon'}${opts.dirtyBefore ? '-dirty-before' : '-clean-before'}`, res);
    expect(mid.colorR).toBe(midEdit.r);
    expect(mid.editorDirty).toBe(true);
    expect(mid.canUndo).toBe(true);
    expect(outcome).toBe(true);
    expect(res.dialogsDuringOrAfterWindow).toBe(0);
  }

  it('AEON to AEON, clean before: the mid-window edit', async () => {
    await aeonMidWindow(AEON_LIVE, { dirtyBefore: false });
  });

  it('AEON to AEON, dirty before, Discard & open: the mid-window edit', async () => {
    await aeonMidWindow(AEON_LIVE, { dirtyBefore: true });
  });

  it('AEON to CLASSIC, clean before: the mid-window edit', async () => {
    await aeonMidWindow(S1_COPY, { dirtyBefore: false });
  });

  // ==== TIMING =================================================================
  //
  // The window runs from the call of openProjectPath (the guard answers
  // "proceed" at once on a clean project, with no dialog) to the COMMIT, which is
  // the store set a subscriber sees: classicProjectStore's status 'open' with the
  // new dir, or projectStore's `project` replaced. `askedMs` is when the first
  // FileAccess call for the target left. Every FileAccess call in the window is
  // counted by method: in the app each one is an IPC round trip, which node does
  // not pay, so these wall-clock figures are a FLOOR for the app's window.

  interface Sample {
    i: number; target: string; totalMs: number; askedToCommitMs: number;
    fa: Record<string, number>; faTotal: number; sidecarWrites: number;
    load1: number; load5: number; load15: number; uptimeS: number;
  }

  async function timeOneSwitch(i: number, target: string, commitKind: 'classic' | 'aeon'): Promise<Sample> {
    faCalls.length = 0;
    writes.length = 0;
    let commitT = -1;
    const unsub = commitKind === 'classic'
      ? useClassicProjectStore.subscribe((s, prev) => {
        if (commitT < 0 && s.status === 'open' && s.dir === target && (s.handle !== prev.handle)) commitT = performance.now();
      })
      : useProjectStore.subscribe((s, prev) => {
        if (commitT < 0 && s.project && s.project !== prev.project) commitT = performance.now();
      });
    const t0 = performance.now();
    const ok = await openProjectPath(target);
    unsub();
    if (ok !== true || commitT < 0) throw new Error(`timing sample ${i}: open of ${target} did not commit (${ok})`);
    const mine = faCalls.filter((c) => c.t <= commitT);
    const fa: Record<string, number> = {};
    for (const c of mine) fa[c.method] = (fa[c.method] ?? 0) + 1;
    const asked = mine.find((c) => c.dir === target)?.t ?? t0;
    const [l1, l5, l15] = os.loadavg();
    return {
      i, target, totalMs: +(commitT - t0).toFixed(1), askedToCommitMs: +(commitT - asked).toFixed(1),
      fa, faTotal: mine.length, sidecarWrites: writes.length,
      load1: +l1.toFixed(2), load5: +l5.toFixed(2), load15: +l15.toFixed(2), uptimeS: Math.round(os.uptime()),
    };
  }

  function summary(samples: Sample[]) {
    const xs = samples.map((s) => s.totalMs).sort((a, b) => a - b);
    const med = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
    return { n: xs.length, minMs: xs[0], medianMs: med, maxMs: xs[xs.length - 1] };
  }

  const N = 6;

  it('TIMING classic to classic (alternating the pinned copy and the sibling checkout)', async () => {
    await openClassicResident(S1_COPY);
    const samples: Sample[] = [];
    for (let i = 0; i < 2 * N; i++) {
      samples.push(await timeOneSwitch(i, i % 2 === 0 ? S1_LIVE : S1_COPY, 'classic'));
    }
    out('timing-classic-to-classic', { samples, all: summary(samples),
      toSibling: summary(samples.filter((s) => s.target === S1_LIVE)),
      toPinnedCopy: summary(samples.filter((s) => s.target === S1_COPY)) });
  });

  it('TIMING classic to aeon (sibling aeon checkout)', async () => {
    const samples: Sample[] = [];
    for (let i = 0; i < N; i++) {
      await resetAll();
      await openProjectPath(S1_LIVE);
      expect(openEngine()).toBe('s1');
      samples.push(await timeOneSwitch(i, AEON_LIVE, 'aeon'));
    }
    out('timing-classic-to-aeon', { samples, all: summary(samples) });
  });

  it('TIMING aeon to aeon (alternating the sibling checkout and its copy)', async () => {
    await openAeonResident(AEON_COPY);
    const samples: Sample[] = [];
    for (let i = 0; i < 2 * N; i++) {
      samples.push(await timeOneSwitch(i, i % 2 === 0 ? AEON_LIVE : AEON_COPY, 'aeon'));
    }
    out('timing-aeon-to-aeon', { samples, all: summary(samples),
      toSibling: summary(samples.filter((s) => s.target === AEON_LIVE)),
      toCopy: summary(samples.filter((s) => s.target === AEON_COPY)) });
  });

  it('TIMING aeon to classic (sibling s1disasm checkout)', async () => {
    const samples: Sample[] = [];
    for (let i = 0; i < N; i++) {
      await resetAll();
      await openProjectPath(AEON_LIVE);
      expect(openEngine()).toBe('aeon');
      samples.push(await timeOneSwitch(i, S1_LIVE, 'classic'));
    }
    out('timing-aeon-to-classic', { samples, all: summary(samples) });
  });
});
