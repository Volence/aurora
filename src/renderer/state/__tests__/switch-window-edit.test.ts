// SWITCH-WINDOW-EDIT-DROPPED, remedy (c1): an edit that lands on the resident
// project AFTER the switch was agreed to must not be lost.
//
// Measurement: docs/reviews/2026-09-12-switch-window-measure.md (its probe,
// scratchpad/switch-window-probe.vitest-script.ts, is where these rows come
// from). Delivery: docs/reviews/2026-09-12-switch-window-fix.md.
//
// THE DEFECT, per direction, as the probe measured it: while a project switch
// loads, the project being left stays editable, and an edit made in that window
// landed on it and was then thrown away when the switch committed, with no
// dialog. Classic to classic, classic to aeon and the same-directory re-validate
// unloaded the act; aeon to aeon replaced the project and left its dirty flag on
// the NEW one; aeon to classic stranded the aeon edit behind classic precedence.
//
// THE RULING: at each commit point, if an edit generation moved since consent,
// the open does not commit. It fails the way a failed open fails, and says why on
// the error channel that already exists.
//
// WHAT THESE ROWS DRIVE. The REAL user road (useProject.openProjectPath, with the
// REAL unsaved-work guard answered through the real confirmStore), the REAL
// classic bridge, the REAL createIpcFileAccess and the REAL aeon loader, over the
// real trees. Exactly ONE thing is substituted: `window.api`, the IPC boundary,
// answered from node's fs. Each directory's calls can be HELD, which is what
// makes "inside the window" a state a row can stand in: a row starts the open,
// waits until the new project has been asked for, acts, then releases. (The
// probe substituted createIpcFileAccess itself; the main suite cannot, because
// its setup file has already bound that module before a test's vi.mock exists,
// which the probe's config documents. The IPC boundary is one layer further out,
// so more of the real road runs here than in the probe.)
//
// TREES. Classic: two copies of the pinned s1disasm this repo vendors
// (`referencePath(S1_PINNED)`), copied because an open seeds `.aurora/` into the
// directory. Aeon: a copy of the sibling checkout's `project.json` and
// `games/sonic4/data` as the project being LEFT (it is the one edited), and the
// sibling checkout itself, read only, as a target. Every write on these roads is
// refused outside the work directory. The aeon rows skip, with the reason, on a
// machine without the sibling aeon checkout; the classic rows need nothing
// outside this repo.
//
// ONE PROPERTY PER TEST. Each scenario runs ONCE, in its describe's beforeAll,
// and each row asserts one property of that run; a scenario that cannot run
// fails every row under it.
//
// React does not run here, so session-lifecycle's key-change reset never fires.
// None of these rows needs it: a cancelled open leaves the key where it was.

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import * as os from 'node:os';

import { openProjectPath } from '../../hooks/useProject';
import { useClassicProjectStore } from '../classicProjectStore';
import {
  useClassicLevelStore, classicSetStart, layoutDocIdForCurrentAct,
} from '../classicLevelStore';
import { useProjectStore, getActiveLevel } from '../projectStore';
import { useEditorStore, executeAmbientCommand, commandDocId } from '../editorStore';
import { documentHistoryHub } from '../history-hub';
import { useConfirmStore } from '../confirmStore';
import { useToastStore } from '../toastStore';
import { openEngine, type OpenEngine } from '../open-project';
import { openAeonProject } from '../aeon-open';
import { openCancelledMessage, type EditedSince } from '../edit-consent';
import { useArtStore } from '../artStore';
import { useCanvasStore, openCanvasDoc } from '../canvasStore';
import { useSpriteStore } from '../spriteStore';
import { canvasDocTab } from '../../shell/tabs';
import { handleAgentRequest } from '../../agent/agent-handler';
import { createDoc } from '../../../core/art/composer-buffer';
import { siblingPath } from '../../../../test/support/sibling-root.mjs';
import { referencePath, S1_PINNED, whenPresent } from '../../../../test/support/fixture-tree';

// -- trees -----------------------------------------------------------------------

const S1_PIN_SRC = referencePath(S1_PINNED);
const AEON_LIVE = siblingPath('aeon');
const AEON_MARKER = AEON_LIVE ? nodePath.join(AEON_LIVE, 'project.json') : null;
const AEON_PRESENT = AEON_MARKER !== null && fs.existsSync(AEON_MARKER);
const REQUIRES_AEON = whenPresent(AEON_MARKER, 'an aeon project switch (the sibling aeon checkout)');

let WORK = '';
const S1_A = (): string => nodePath.join(WORK, 's1-a');
const S1_B = (): string => nodePath.join(WORK, 's1-b');
const AEON_COPY = (): string => nodePath.join(WORK, 'aeon-copy');
const AEON_TARGET = (): string => AEON_LIVE ?? '(unresolved)';

// -- the IPC boundary, answered from node's fs, each directory holdable ------------

const gates = new Map<string, Promise<void>>();
const asked = new Set<string>();

async function enter(dir: string): Promise<void> {
  asked.add(dir);
  const g = gates.get(dir);
  if (g) await g;
}

/** Hold every IPC call for `dir` until the returned release runs. */
function hold(dir: string): () => void {
  let release!: () => void;
  const p = new Promise<void>((r) => { release = r; });
  gates.set(dir, p);
  return () => { gates.delete(dir); release(); };
}

function errCode(e: unknown): string | undefined {
  return (e as NodeJS.ErrnoException).code;
}

const RECENTS = { projects: [], read: 'read' as const, reason: null, path: '(stub)', dropped: 0 };

function nodeApi() {
  const abs = (dir: string, rel: string): string => nodePath.join(dir, rel);
  return {
    async probePath(dir: string, rel: string) {
      await enter(dir);
      return { presence: fs.existsSync(abs(dir, rel)) ? 'present' : 'absent', reason: null };
    },
    async readBinaryFile(dir: string, rel: string): Promise<ArrayBuffer> {
      await enter(dir);
      const b = fs.readFileSync(abs(dir, rel));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    },
    async probeDir(dir: string, rel: string) {
      await enter(dir);
      try {
        return { outcome: 'listed', entries: fs.readdirSync(abs(dir, rel)), reason: null };
      } catch (e) {
        const code = errCode(e);
        if (code === 'ENOENT' || code === 'ENOTDIR') return { outcome: 'absent', entries: null, reason: null };
        return { outcome: 'unreadable', entries: null, reason: (e as Error).message };
      }
    },
    async fileMtime(dir: string, rel: string): Promise<number | null> {
      await enter(dir);
      try { return fs.statSync(abs(dir, rel)).mtimeMs; } catch { return null; }
    },
    async readManyFiles(dir: string, rels: string[]) {
      await enter(dir);
      return rels.map((relPath) => {
        try {
          const bytes = new Uint8Array(fs.readFileSync(abs(dir, relPath)));
          return { relPath, bytes, mtimeMs: fs.statSync(abs(dir, relPath)).mtimeMs, outcome: 'read', reason: null };
        } catch (e) {
          return {
            relPath, bytes: null, mtimeMs: null,
            outcome: errCode(e) === 'ENOENT' ? 'absent' : 'unreadable', reason: (e as Error).message,
          };
        }
      });
    },
    async getRecentProjects() { return RECENTS; },
    async addRecentProject() { return RECENTS; },
    async writeBinaryFile(dir: string, rel: string, data: ArrayBuffer): Promise<void> {
      const inside = nodePath.resolve(dir).startsWith(nodePath.resolve(WORK) + nodePath.sep);
      if (!inside) throw new Error(`refused: a write outside the work directory (${dir}, ${rel})`);
      fs.mkdirSync(nodePath.dirname(abs(dir, rel)), { recursive: true });
      fs.writeFileSync(abs(dir, rel), new Uint8Array(data));
    },
  };
}

// -- helpers -----------------------------------------------------------------------

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

async function waitFor(what: string, pred: () => boolean, ms = 60_000): Promise<void> {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error(`timed out waiting for: ${what}`);
    await tick();
  }
}

function resetAll(): void {
  if (useConfirmStore.getState().request) useConfirmStore.getState().answer('cancel');
  gates.clear();
  asked.clear();
  useClassicLevelStore.getState().reset();
  useClassicProjectStore.getState().reset();
  useProjectStore.getState().reset();
  useEditorStore.getState().markClean();
  useArtStore.getState().closeDocument();
  useCanvasStore.getState().closeAll();
  useSpriteStore.getState().closeAll();
  documentHistoryHub.clearAll();
  useToastStore.setState({ toasts: [] });
}

type Engine = 'classic' | 'aeon';
const ENGINE_OF: Record<Engine, OpenEngine> = { classic: 's1', aeon: 'aeon' };

function openFailure(): string {
  return `classic error: ${useClassicProjectStore.getState().error ?? '(none)'}; `
    + `aeon error: ${useProjectStore.getState().error ?? '(none)'}`;
}

// The aeon edit: palette line 1, colour 1, through executeAmbientCommand (undoable),
// exactly the probe's. Its red moves by 36 from whatever the tree holds.
const PAL_LINE = 1;
const PAL_INDEX = 1;

function aeonZoneArtId(): string | null {
  return commandDocId({ type: 'set-palette-line', line: 0, oldColors: [], newColors: [] } as never);
}

/** Open `dir` through the user road as the resident project; returns the undo document id. */
async function openResident(engine: Engine, dir: string): Promise<string | null> {
  const opened = await openProjectPath(dir);
  expect(opened, `premise: ${dir} opens (${openFailure()})`).toBe(true);
  expect(openEngine(), 'premise: the resident engine').toBe(ENGINE_OF[engine]);
  if (engine === 'aeon') {
    expect(getActiveLevel(useProjectStore.getState()), 'premise: an act is current').not.toBeNull();
    return aeonZoneArtId();
  }
  const ref = useClassicProjectStore.getState().zoneTree.find((r) => r.available);
  expect(ref, 'premise: the project lists an available act').toBeTruthy();
  await useClassicLevelStore.getState().openAct(ref!);
  expect(useClassicLevelStore.getState().status, 'premise: the act loaded').toBe('ready');
  return layoutDocIdForCurrentAct();
}

/** A real edit on the resident project; returns the value it wrote. */
function editResident(engine: Engine): number {
  if (engine === 'classic') {
    const doc = useClassicLevelStore.getState().doc!;
    const x = (doc.start.x + 8) & 0xffff;
    expect(classicSetStart(x, doc.start.y), 'premise: the classic edit was accepted').toEqual({ ok: true });
    return x;
  }
  const level = getActiveLevel(useProjectStore.getState())!;
  const old = level.palette!.lines[PAL_LINE].colors.map((c) => ({ ...c }));
  const next = old.map((c, i) => (i === PAL_INDEX ? { ...c, r: (c.r + 36) % 252 } : { ...c }));
  executeAmbientCommand(
    { type: 'set-palette-line', line: PAL_LINE, oldColors: old, newColors: next } as never, level);
  return next[PAL_INDEX].r;
}

function valueOf(engine: Engine): number | null {
  if (engine === 'classic') return useClassicLevelStore.getState().doc?.start.x ?? null;
  return getActiveLevel(useProjectStore.getState())?.palette?.lines[PAL_LINE].colors[PAL_INDEX].r ?? null;
}

function dirtyOf(engine: Engine): boolean {
  return engine === 'classic'
    ? useClassicLevelStore.getState().dirty.start === true
    : useEditorStore.getState().dirty;
}

interface Seen {
  engine: OpenEngine | null;
  classicDir: string | null;
  aeonBase: string | null;
  value: number | null;
  dirty: boolean;
  canUndo: boolean | null;
  classicError: string | null;
  aeonError: string | null;
}

function seen(engine: Engine, undoId: string | null): Seen {
  const c = useClassicProjectStore.getState();
  const p = useProjectStore.getState();
  return {
    engine: openEngine(),
    classicDir: c.status === 'open' ? c.dir : null,
    aeonBase: p.project !== null ? p.config?.basePath ?? null : null,
    value: valueOf(engine),
    dirty: dirtyOf(engine),
    canUndo: undoId ? documentHistoryHub.historyFor(undoId).canUndo : null,
    classicError: c.error,
    aeonError: p.error,
  };
}

// -- the doors ---------------------------------------------------------------------

type Door = (target: string) => Promise<unknown>;
/** The user road: Explorer, Home, recents and the command palette all funnel here. */
const USER_ROAD: Door = (t) => openProjectPath(t);
/** The Project Setup tab's re-open call, minus its own dialog and sidecar write. */
const SETUP_REOPEN: Door = (t) => useClassicProjectStore.getState().openDirectory(t);
/** The agent's `classic-open-project`. */
const AGENT_OPEN: Door = (t) => handleAgentRequest({ kind: 'classic-open-project', dir: t });
/** `__aurora.aeon.open` (debug-hooks.ts): the aeon loader with no guard at all. */
const DEBUG_AEON_OPEN: Door = (t) => openAeonProject(t);

// -- one switch --------------------------------------------------------------------

interface SwitchPlan {
  engine: Engine;
  residentDir: () => string;
  target: () => string;
  door?: Door;
  /** 'discard': edit first, and answer the guard's dialog Discard & open.
   *  'no-dialog': edit first, on a door that asks nothing. */
  dirtyBefore?: 'discard' | 'no-dialog';
  /** Runs while the dialog is up, before its answer. */
  duringDialog?: () => void | Promise<void>;
  /** What happens inside the window. Absent: an edit on the resident project.
   *  null: nothing. A function returns the value it wrote, or nothing. */
  inWindow?: null | (() => number | void | Promise<number | void>);
}

type Outcome = { ok: true; value: unknown } | { ok: false; error: string };

interface SwitchRun {
  /** The value the in-window edit wrote; null when the row made none. */
  expected: number | null;
  mid: Seen;
  outcome: Outcome;
  after: Seen;
}

async function runSwitch(plan: SwitchPlan): Promise<SwitchRun> {
  resetAll();
  const undoId = await openResident(plan.engine, plan.residentDir());
  if (plan.dirtyBefore) editResident(plan.engine);
  const target = plan.target();
  asked.clear();
  const release = hold(target);
  const pending: Promise<Outcome> = (plan.door ?? USER_ROAD)(target).then(
    (value) => ({ ok: true as const, value }),
    (e) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
  );
  try {
    if (plan.dirtyBefore === 'discard') {
      await waitFor('the unsaved-changes dialog', () => useConfirmStore.getState().request !== null);
      if (plan.duringDialog) await plan.duringDialog();
      useConfirmStore.getState().answer('discard');
    }
    await waitFor(`the new project to be asked for (${target})`, () => asked.has(target));
    // ---- the window is open: the new project is being read ----
    let expected: number | null = null;
    if (plan.inWindow === undefined) expected = editResident(plan.engine);
    else if (plan.inWindow !== null) {
      const wrote = await plan.inWindow();
      if (typeof wrote === 'number') expected = wrote;
    }
    const mid = seen(plan.engine, undoId);
    release();
    const outcome = await pending;
    return { expected, mid, outcome, after: seen(plan.engine, undoId) };
  } finally {
    release();
  }
}

/** A describe whose beforeAll runs `plan` once; `rows` reads the run. */
function scenario(
  name: string, needsAeon: boolean, plan: SwitchPlan, rows: (run: () => SwitchRun) => void,
): void {
  const body = (): void => {
    let r: SwitchRun | null = null;
    beforeAll(async () => { r = await runSwitch(plan); });
    rows(() => {
      if (r === null) throw new Error('UNMEASURED: the scenario did not run (see its beforeAll)');
      return r;
    });
  };
  if (needsAeon) describe(name, REQUIRES_AEON, body);
  else describe(name, body);
}

// -- the rows a cancelled switch owes ----------------------------------------------

interface Refused {
  engine: Engine;
  residentDir: () => string;
  /** What the cancellation names, in edit-consent's order. */
  cancelled: EditedSince[];
  /** Which store's error carries it. */
  channel: Engine;
  /** How the door reports a failed open: user road `false`, openDirectory 'error', agent a throw. */
  failedAs: { ok: true; value: unknown } | 'thrown';
}

function refusedRows(run: () => SwitchRun, p: Refused): void {
  it('premise: the edit really landed on the resident project inside the window', () => {
    const r = run();
    expect(r.expected, 'the row made an edit').not.toBeNull();
    expect(r.mid.engine, 'the resident project was still the open one').toBe(ENGINE_OF[p.engine]);
    expect(r.mid.value).toBe(r.expected);
    expect(r.mid.dirty).toBe(true);
    expect(r.mid.canUndo).toBe(true);
  });

  it('the open reports the cancellation on the existing error channel', () => {
    const r = run();
    const message = openCancelledMessage(p.cancelled);
    if (p.failedAs === 'thrown') expect(r.outcome).toEqual({ ok: false, error: message });
    else expect(r.outcome).toEqual(p.failedAs);
    expect(p.channel === 'classic' ? r.after.classicError : r.after.aeonError).toBe(message);
  });

  it('the resident project is still the open project', () => {
    const r = run();
    expect(r.after.engine).toBe(ENGINE_OF[p.engine]);
    expect(p.engine === 'classic' ? r.after.classicDir : r.after.aeonBase).toBe(p.residentDir());
  });

  it('the mid-window edit is still there', () => {
    const r = run();
    expect(r.after.value).toBe(r.expected);
  });

  it('the resident project is still marked dirty', () => {
    expect(run().after.dirty).toBe(true);
  });

  it('the mid-window edit can still be undone', () => {
    expect(run().after.canUndo).toBe(true);
  });
}

// -- the rows a committed switch owes (the controls) ---------------------------------

function committedRows(
  run: () => SwitchRun, p: { engine: Engine; target: () => string; openedAs: unknown | 'agent' },
): void {
  it('the switch commits: the new project is the open project', () => {
    const r = run();
    expect(r.after.engine).toBe(ENGINE_OF[p.engine]);
    expect(p.engine === 'classic' ? r.after.classicDir : r.after.aeonBase).toBe(p.target());
  });

  it('and reports success, with no cancellation', () => {
    const r = run();
    if (p.openedAs === 'agent') expect(r.outcome.ok, JSON.stringify(r.outcome)).toBe(true);
    else expect(r.outcome).toEqual({ ok: true, value: p.openedAs });
    expect(r.after.classicError ?? '').not.toMatch(/Open cancelled/);
    expect(r.after.aeonError ?? '').not.toMatch(/Open cancelled/);
  });
}

// -- the documents ---------------------------------------------------------------------

const CANVAS_ID = canvasDocTab('switch-window').id;

/** Open a blank canvas document, unedited. */
function openCleanCanvas(): void {
  openCanvasDoc(CANVAS_ID, { name: 'switch-window', width: 8, height: 8, profileId: 'none' });
  expect(useCanvasStore.getState().isDirty(CANVAS_ID), 'premise: opened clean').toBe(false);
}

/** Open a canvas and edit it (a palette write, which records and dirties). */
function editCanvas(): void {
  openCleanCanvas();
  const pal = useCanvasStore.getState().docs.get(CANVAS_ID)!.doc.palette;
  useCanvasStore.getState().setPalette(CANVAS_ID, pal.map((c, i) => (i === 1 ? c ^ 0x0e : c)));
  expect(useCanvasStore.getState().isDirty(CANVAS_ID), 'premise: the canvas edit dirtied it').toBe(true);
}

/** Open a new composer document and stroke it (what ComposerCanvas does). */
function editComposer(): void {
  useArtStore.getState().openDocument({
    doc: createDoc(1, 1), liveTileIndex: null, chunkId: null, name: 'New Tile (1x1)', dirty: false,
  });
  useArtStore.getState().markOpenDirty();
  expect(useArtStore.getState().open?.dirty, 'premise: the composer stroke dirtied it').toBe(true);
}

// ====================================================================================

describe('SWITCH-WINDOW-EDIT-DROPPED · an edit made while a project switch loads', () => {
  beforeAll(() => {
    // LOUD WHEN IT CANNOT MEASURE. The pinned tree is vendored in this repo, so
    // its absence is a defect here, never a skip.
    if (!fs.existsSync(nodePath.join(S1_PIN_SRC, 'sonic.asm'))) {
      throw new Error(`UNMEASURABLE: the pinned s1disasm is not at ${S1_PIN_SRC} (no sonic.asm)`);
    }
    WORK = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'aurora-switch-window-'));
    fs.cpSync(S1_PIN_SRC, S1_A(), { recursive: true });
    fs.cpSync(S1_PIN_SRC, S1_B(), { recursive: true });
    if (AEON_PRESENT) {
      fs.mkdirSync(nodePath.join(AEON_COPY(), 'games', 'sonic4'), { recursive: true });
      fs.copyFileSync(nodePath.join(AEON_LIVE!, 'project.json'), nodePath.join(AEON_COPY(), 'project.json'));
      fs.cpSync(nodePath.join(AEON_LIVE!, 'games', 'sonic4', 'data'),
        nodePath.join(AEON_COPY(), 'games', 'sonic4', 'data'), { recursive: true });
    }
    vi.stubGlobal('window', { api: nodeApi() });
  });
  afterAll(() => {
    resetAll();
    vi.unstubAllGlobals();
    if (WORK) fs.rmSync(WORK, { recursive: true, force: true });
  });

  // ==== the reproduction rows: each direction the packet measured =================

  describe('REFUSED: an edit on the resident project inside the window', () => {
    scenario('classic to classic, clean before', false,
      { engine: 'classic', residentDir: S1_A, target: S1_B },
      (run) => refusedRows(run, {
        engine: 'classic', residentDir: S1_A, cancelled: ['level'], channel: 'classic',
        failedAs: { ok: true, value: false },
      }));

    scenario('classic to classic, dirty before, Discard & open', false,
      { engine: 'classic', residentDir: S1_A, target: S1_B, dirtyBefore: 'discard' },
      (run) => refusedRows(run, {
        engine: 'classic', residentDir: S1_A, cancelled: ['level'], channel: 'classic',
        failedAs: { ok: true, value: false },
      }));

    scenario('classic to aeon, clean before', true,
      { engine: 'classic', residentDir: S1_A, target: AEON_TARGET },
      (run) => refusedRows(run, {
        engine: 'classic', residentDir: S1_A, cancelled: ['level'], channel: 'aeon',
        failedAs: { ok: true, value: false },
      }));

    scenario('classic re-validate of the same directory (the Project Setup door)', false,
      { engine: 'classic', residentDir: S1_A, target: S1_A, door: SETUP_REOPEN },
      (run) => refusedRows(run, {
        engine: 'classic', residentDir: S1_A, cancelled: ['level'], channel: 'classic',
        failedAs: { ok: true, value: 'error' },
      }));

    scenario('aeon to aeon, clean before', true,
      { engine: 'aeon', residentDir: AEON_COPY, target: AEON_TARGET },
      (run) => refusedRows(run, {
        engine: 'aeon', residentDir: AEON_COPY, cancelled: ['aeon'], channel: 'aeon',
        failedAs: { ok: true, value: false },
      }));

    scenario('aeon to aeon, dirty before, Discard & open', true,
      { engine: 'aeon', residentDir: AEON_COPY, target: AEON_TARGET, dirtyBefore: 'discard' },
      (run) => refusedRows(run, {
        engine: 'aeon', residentDir: AEON_COPY, cancelled: ['aeon'], channel: 'aeon',
        failedAs: { ok: true, value: false },
      }));

    // Committed at the CLASSIC commit point, with an AEON edit: the token has to
    // span both engines for this one.
    scenario('aeon to classic, clean before', true,
      { engine: 'aeon', residentDir: AEON_COPY, target: S1_A },
      (run) => refusedRows(run, {
        engine: 'aeon', residentDir: AEON_COPY, cancelled: ['aeon'], channel: 'classic',
        failedAs: { ok: true, value: false },
      }));
  });

  // ==== the agent door: the packet's likeliest hitter ===============================

  describe('REFUSED: an agent edit inside a switch', () => {
    const agentSetStart = async (): Promise<number> => {
      const doc = useClassicLevelStore.getState().doc!;
      const x = (doc.start.x + 8) & 0xffff;
      await handleAgentRequest({ kind: 'classic-set-start', x, y: doc.start.y });
      return x;
    };

    scenario('an agent edit lands inside the user\'s classic to classic switch', false,
      { engine: 'classic', residentDir: S1_A, target: S1_B, inWindow: agentSetStart },
      (run) => refusedRows(run, {
        engine: 'classic', residentDir: S1_A, cancelled: ['level'], channel: 'classic',
        failedAs: { ok: true, value: false },
      }));

    scenario('an agent edit lands inside the agent\'s own classic-open-project', false,
      { engine: 'classic', residentDir: S1_A, target: S1_B, door: AGENT_OPEN, inWindow: agentSetStart },
      (run) => refusedRows(run, {
        engine: 'classic', residentDir: S1_A, cancelled: ['level'], channel: 'classic',
        failedAs: 'thrown',
      }));
  });

  // ==== documents: lost at a key change, and at every aeon commit ===================

  describe('REFUSED: a document edited inside the window, where the commit would lose it', () => {
    scenario('a canvas edited inside a classic to classic switch', false,
      { engine: 'classic', residentDir: S1_A, target: S1_B, inWindow: editCanvas },
      (run) => {
        it('the open reports the cancellation, naming a document', () => {
          const message = openCancelledMessage(['document']);
          expect(run().outcome).toEqual({ ok: true, value: false });
          expect(run().after.classicError).toBe(message);
        });
        it('the resident project is still the open project', () => {
          expect(run().after.classicDir).toBe(S1_A());
        });
        it('the canvas edit is still open and unsaved', () => {
          expect(useCanvasStore.getState().isDirty(CANVAS_ID)).toBe(true);
        });
      });

    scenario('a composer document stroked inside an aeon to aeon switch', true,
      { engine: 'aeon', residentDir: AEON_COPY, target: AEON_TARGET, inWindow: editComposer },
      (run) => {
        it('the open reports the cancellation, naming a document', () => {
          const message = openCancelledMessage(['document']);
          expect(run().outcome).toEqual({ ok: true, value: false });
          expect(run().after.aeonError).toBe(message);
        });
        it('the resident project is still the open project', () => {
          expect(run().after.aeonBase).toBe(AEON_COPY());
        });
        it('the composer stroke is still open and unsaved', () => {
          expect(useArtStore.getState().open?.dirty).toBe(true);
        });
      });
  });

  // ==== CONTROLS: nothing edited in the window, so every direction commits ===========
  //
  // c1 must never refuse a clean open. These are the same scenarios with the
  // in-window edit taken out.

  describe('CONTROL: no edit inside the window, so the switch commits', () => {
    scenario('classic to classic, clean before', false,
      { engine: 'classic', residentDir: S1_A, target: S1_B, inWindow: null },
      (run) => committedRows(run, { engine: 'classic', target: S1_B, openedAs: true }));

    // THE CONSENT POINT: these edits moved the classic serial BEFORE the answer,
    // and the answer covered them. A token taken before the dialog would refuse.
    scenario('classic to classic, dirty before, Discard & open', false,
      { engine: 'classic', residentDir: S1_A, target: S1_B, dirtyBefore: 'discard', inWindow: null },
      (run) => committedRows(run, { engine: 'classic', target: S1_B, openedAs: true }));

    scenario('classic to aeon', true,
      { engine: 'classic', residentDir: S1_A, target: AEON_TARGET, inWindow: null },
      (run) => committedRows(run, { engine: 'aeon', target: AEON_TARGET, openedAs: true }));

    scenario('classic re-validate of the same directory', false,
      { engine: 'classic', residentDir: S1_A, target: S1_A, door: SETUP_REOPEN, inWindow: null },
      (run) => committedRows(run, { engine: 'classic', target: S1_A, openedAs: 'opened' }));

    scenario('aeon to aeon, clean before', true,
      { engine: 'aeon', residentDir: AEON_COPY, target: AEON_TARGET, inWindow: null },
      (run) => committedRows(run, { engine: 'aeon', target: AEON_TARGET, openedAs: true }));

    scenario('aeon to aeon, dirty before, Discard & open', true,
      { engine: 'aeon', residentDir: AEON_COPY, target: AEON_TARGET, dirtyBefore: 'discard', inWindow: null },
      (run) => committedRows(run, { engine: 'aeon', target: AEON_TARGET, openedAs: true }));

    scenario('aeon to classic', true,
      { engine: 'aeon', residentDir: AEON_COPY, target: S1_A, inWindow: null },
      (run) => committedRows(run, { engine: 'classic', target: S1_A, openedAs: true }));

    scenario('the agent door, classic to classic', false,
      { engine: 'classic', residentDir: S1_A, target: S1_B, door: AGENT_OPEN, inWindow: null },
      (run) => committedRows(run, { engine: 'classic', target: S1_B, openedAs: 'agent' }));
  });

  // ==== CONTROLS: every NON-edit writer the token could see ===========================
  //
  // The risk the packet names: a generation that moves for a non-edit reason
  // refuses a legitimate open. Each row runs one such writer inside the window
  // and requires the switch to commit anyway.

  describe('CONTROL: a non-edit write inside the window does not refuse the switch', () => {
    // openAct resets `domainGen` (and dirty) to {}. After Discard & open,
    // domainGen is non-empty, so a token built from it would see a change here.
    let genBefore: Record<string, number> = {};
    let genAfter: Record<string, number> = {};
    scenario('a classic act switch (openAct)', false,
      {
        engine: 'classic', residentDir: S1_A, target: S1_B, dirtyBefore: 'discard',
        inWindow: async () => {
          const s = useClassicLevelStore.getState();
          genBefore = { ...s.domainGen } as Record<string, number>;
          const other = useClassicProjectStore.getState().zoneTree
            .find((r) => r.available && (r.zone !== s.ref!.zone || r.act !== s.ref!.act));
          expect(other, 'premise: the project has a second available act').toBeTruthy();
          await s.openAct(other!);
          expect(useClassicLevelStore.getState().status, 'premise: the act loaded').toBe('ready');
          genAfter = { ...useClassicLevelStore.getState().domainGen } as Record<string, number>;
        },
      },
      (run) => {
        it('premise: the act switch reset domainGen, which is why the token does not use it', () => {
          run();
          expect(Object.keys(genBefore).length).toBeGreaterThan(0);
          expect(genAfter).toEqual({});
        });
        committedRows(run, { engine: 'classic', target: S1_B, openedAs: true });
      });

    // A classic save's clearing step. After Discard & open the act is still dirty
    // (the guard's Discard leaves classicDirty for the commit to drop).
    let cleared = false;
    scenario('a classic save clearing the level (markDomainsClean)', false,
      {
        engine: 'classic', residentDir: S1_A, target: S1_B, dirtyBefore: 'discard',
        inWindow: () => {
          const s = useClassicLevelStore.getState();
          expect(s.dirty.start, 'premise: dirty before the save').toBe(true);
          const withheld = s.markDomainsClean(s.ref!, ['start'], { ...s.domainGen });
          cleared = withheld.length === 0 && useClassicLevelStore.getState().dirty.start !== true;
        },
      },
      (run) => {
        it('premise: the save cleared the flag', () => { run(); expect(cleared).toBe(true); });
        committedRows(run, { engine: 'classic', target: S1_B, openedAs: true });
      });

    // An aeon save's clearing step, and a discard. The debug door asks nothing, so
    // the dirt made before it is still there inside the window to be cleared.
    let actsCleared = false;
    scenario('an aeon save clearing the act (markActsClean)', true,
      {
        engine: 'aeon', residentDir: AEON_COPY, target: AEON_TARGET, door: DEBUG_AEON_OPEN,
        dirtyBefore: 'no-dialog',
        inWindow: () => {
          const e = useEditorStore.getState();
          expect(e.dirty, 'premise: dirty before the save').toBe(true);
          const withheld = e.markActsClean(Object.keys(e.dirtyActs), { ...e.dirtyActs });
          actsCleared = withheld.length === 0 && !useEditorStore.getState().dirty;
        },
      },
      (run) => {
        it('premise: the save cleared the act', () => { run(); expect(actsCleared).toBe(true); });
        committedRows(run, { engine: 'aeon', target: AEON_TARGET, openedAs: true });
      });

    let discarded = false;
    scenario('an aeon discard (markClean)', true,
      {
        engine: 'aeon', residentDir: AEON_COPY, target: AEON_TARGET, door: DEBUG_AEON_OPEN,
        dirtyBefore: 'no-dialog',
        inWindow: () => {
          expect(useEditorStore.getState().dirty, 'premise: dirty before the discard').toBe(true);
          useEditorStore.getState().markClean();
          discarded = !useEditorStore.getState().dirty;
        },
      },
      (run) => {
        it('premise: the discard cleared it', () => { run(); expect(discarded).toBe(true); });
        committedRows(run, { engine: 'aeon', target: AEON_TARGET, openedAs: true });
      });

    scenario('a canvas document opened and left unedited', false,
      { engine: 'classic', residentDir: S1_A, target: S1_B, inWindow: openCleanCanvas },
      (run) => committedRows(run, { engine: 'classic', target: S1_B, openedAs: true }));

    // The consent is the ANSWER: an edit made while the dialog is still up is one
    // the answer covers.
    scenario('an edit made while the dialog is up, then Discard & open', false,
      {
        engine: 'classic', residentDir: S1_A, target: S1_B, dirtyBefore: 'discard',
        duringDialog: () => { editResident('classic'); }, inWindow: null,
      },
      (run) => committedRows(run, { engine: 'classic', target: S1_B, openedAs: true }));

    // A re-validate keeps the session key, so resetProjectRuntime never runs and
    // the document survives it: refusing would lose nothing and cost the re-open.
    scenario('a canvas edited inside a same-directory re-validate', false,
      { engine: 'classic', residentDir: S1_A, target: S1_A, door: SETUP_REOPEN, inWindow: editCanvas },
      (run) => {
        committedRows(run, { engine: 'classic', target: S1_A, openedAs: 'opened' });
        it('and the canvas edit is still there', () => {
          run();
          expect(useCanvasStore.getState().isDirty(CANVAS_ID)).toBe(true);
        });
      });
  });
});
