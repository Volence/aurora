import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { installCloseGuard } from '../close-guard';
import { createCloseHandshake } from '../../../main/close-handshake';
import { IPC_CHANNELS } from '../../../shared/ipc-types';
import { useEditorStore } from '../../state/editorStore';
import { useConfirmStore } from '../../state/confirmStore';
import { useArtStore } from '../../state/artStore';

/**
 * A SEAM HAS NO AUTHOR.
 *
 * The window-close guard is two halves joined by an IPC handshake: main suspends
 * the close and asks (main/close-handshake.ts), the renderer answers
 * (shell/close-guard.ts) through the preload's `onCloseRequest`. Each half now
 * has its own tests. Nothing crossed the JOIN — and the join is where it failed,
 * in the OPEN direction: the renderer registered through two optional chains
 * (`window.api?.onCloseRequest?.(…)`), so if that channel was ever absent —
 * preload drift, a stubbed window — it registered NOTHING, silently, main's
 * timeout fired, and the window closed taking every unsaved document. A test per
 * half and none across the join is how a chain of individually sound links holds
 * nothing.
 *
 * WHAT THIS DOES AND DOES NOT DRIVE. It drives the REAL main-half state machine,
 * the REAL renderer-half registration, the REAL `confirmAppClose` and the REAL
 * channel constants, over a fake bus whose two directions mirror
 * preload/index.ts's `onCloseRequest` — and the last row asserts that mirroring
 * against the preload source, so the fake cannot quietly become a fiction. It
 * does NOT drive Electron: no BrowserWindow, no ipcMain, no contextBridge. The
 * Electron adapter left in main/index.ts is pinned by a source gate below, which
 * says what it cannot prove.
 */

type AnyFn = (...args: never[]) => void;

/** The two-process message bus, with this window's webContents as `SENDER`. */
function bus() {
  const SENDER = { id: 'this-window' };
  const toMain = new Map<string, ((sender: object, ...a: unknown[]) => void)[]>();
  const toRenderer = new Map<string, ((...a: unknown[]) => void)[]>();
  return {
    SENDER,
    /** preload: `ipcRenderer.on` */
    rendererOn(channel: string, cb: (...a: unknown[]) => void) {
      toRenderer.set(channel, [...(toRenderer.get(channel) ?? []), cb]);
    },
    /** preload: `ipcRenderer.send` */
    rendererSend(channel: string, ...args: unknown[]) {
      for (const l of toMain.get(channel) ?? []) l(SENDER, ...args);
    },
    /** The same message from ANOTHER window's webContents (ipcMain is
     *  process-wide, so this really can arrive). */
    sendAs(sender: object, channel: string, ...args: unknown[]) {
      for (const l of toMain.get(channel) ?? []) l(sender, ...args);
    },
    /** main: `ipcMain.on` (returns the removal, as the adapter does) */
    mainOn(channel: string, cb: (sender: object, ...a: unknown[]) => void) {
      toMain.set(channel, [...(toMain.get(channel) ?? []), cb]);
      return () => toMain.set(channel, (toMain.get(channel) ?? []).filter((x) => x !== cb));
    },
    /** main: `win.webContents.send` */
    mainSend(channel: string, ...args: unknown[]) {
      for (const l of toRenderer.get(channel) ?? []) l(...args);
    },
    rendererListenerCount(channel: string) { return (toRenderer.get(channel) ?? []).length; },
  };
}

/**
 * The preload's close-handshake surface, built to the same two channels in the
 * same two directions as preload/index.ts's `onCloseRequest`. `expose: false`
 * models the drift: the bridge is there, this method is not.
 */
function preloadApi(b: ReturnType<typeof bus>, expose: boolean): Record<string, AnyFn> {
  if (!expose) return { perfLog: () => {} }; // a bridge, minus the close channel
  return {
    perfLog: () => {},
    onCloseRequest: ((callback: (respond: (mayClose: boolean) => void) => void) => {
      b.rendererOn(IPC_CHANNELS.CLOSE_REQUEST, () => {
        callback((mayClose: boolean) => {
          b.rendererSend(IPC_CHANNELS.CLOSE_RESPONSE, mayClose);
        });
      });
    }) as unknown as AnyFn,
  };
}

/** Main's half, wired to the bus exactly as main/index.ts wires it to Electron. */
function mainHalf(b: ReturnType<typeof bus>, timeoutMs = 15_000) {
  const closed = { value: false };
  let fireTimeout: (() => void) | null = null;
  const warnings: string[] = [];
  const handshake = createCloseHandshake({
    askRenderer: () => b.mainSend(IPC_CHANNELS.CLOSE_REQUEST),
    rendererGone: () => false,
    windowGone: () => closed.value,
    closeWindow: () => { closed.value = true; },
    listen: (cb) => b.mainOn(IPC_CHANNELS.CLOSE_RESPONSE,
      (sender, mayClose) => cb(sender === b.SENDER, mayClose)),
    timer: (_ms, fn) => { fireTimeout = fn; return { cancel: () => { fireTimeout = null; } }; },
    warn: (m) => { warnings.push(m); },
  }, timeoutMs);
  return {
    handshake,
    closed,
    warnings,
    timeoutArmed: () => fireTimeout !== null,
    fireTimeout: () => {
      if (!fireTimeout) throw new Error('no timeout armed');
      fireTimeout();
    },
  };
}

/** Let the renderer's promise chain (confirmAppClose → respond) settle. */
const flush = () => new Promise<void>((r) => { setTimeout(r, 0); });

describe('the window-close seam, both halves joined', () => {
  const HAD_WINDOW = 'window' in globalThis;

  beforeEach(() => {
    useEditorStore.getState().markClean();
    useArtStore.getState().closeDocument();
    useConfirmStore.getState().answer('cancel');
  });
  afterEach(() => {
    useConfirmStore.getState().answer('cancel');
    useEditorStore.getState().markClean();
    useArtStore.getState().closeDocument();
    if (!HAD_WINDOW) delete (globalThis as { window?: unknown }).window;
  });

  function install(expose: boolean) {
    const b = bus();
    (globalThis as { window?: unknown }).window = { api: preloadApi(b, expose) };
    return { b, result: installCloseGuard() };
  }

  it('CLEAN: main asks, the renderer answers yes, the window closes', async () => {
    const { b, result } = install(true);
    expect(result).toEqual({ kind: 'armed' });
    const m = mainHalf(b);

    expect(m.handshake.onCloseRequested()).toBe('suspend'); // the close is held
    await flush();

    expect(useConfirmStore.getState().request).toBeNull();  // nothing dirty, no dialog
    expect(m.closed.value).toBe(true);
    expect(m.timeoutArmed()).toBe(false);                   // answered, not timed out
    expect(m.warnings).toEqual([]);
  });

  it('DIRTY + cancel: the answer travels back and the window stays open', async () => {
    const { b, result } = install(true);
    expect(result).toEqual({ kind: 'armed' });
    useEditorStore.setState({ dirty: true });
    const m = mainHalf(b);

    m.handshake.onCloseRequested();
    await flush();
    expect(useConfirmStore.getState().request).not.toBeNull(); // the dialog is up
    expect(m.closed.value).toBe(false);                        // and the close is held

    useConfirmStore.getState().answer('cancel');
    await flush();

    expect(m.closed.value).toBe(false);      // the NO crossed the seam
    expect(m.timeoutArmed()).toBe(false);    // and cancelled the fail-open timer
    expect(useEditorStore.getState().dirty).toBe(true);
  });

  it('DIRTY + discard: the yes travels back and the window closes', async () => {
    const { b } = install(true);
    useEditorStore.setState({ dirty: true });
    const m = mainHalf(b);

    m.handshake.onCloseRequested();
    await flush();
    useConfirmStore.getState().answer('discard');
    await flush();

    expect(m.closed.value).toBe(true);
  });

  it('THE DEFECT: an absent close channel registers nothing, and the window closes over unsaved work', async () => {
    // This is the failure the seam had no test for. The renderer half went
    // through `window.api?.onCloseRequest?.(…)`, so a missing channel was a
    // silent no-op: main asked into the void, the timeout fired, and every
    // unsaved document went with the window. Both facts are asserted — the
    // fail-open is REAL and unchanged, and it is no longer silent.
    const { b, result } = install(false);
    useEditorStore.setState({ dirty: true });

    // 1. The registration now REFUSES, by name, instead of quietly doing nothing.
    expect(result.kind).toBe('drift');
    expect(result.kind === 'drift' && result.why).toMatch(/onCloseRequest/);
    expect(result.kind === 'drift' && result.why).toMatch(/close over\s+unsaved work/);
    expect(b.rendererListenerCount(IPC_CHANNELS.CLOSE_REQUEST)).toBe(0);

    // 2. …and the consequence, measured: nobody answers, so the window goes.
    const m = mainHalf(b);
    m.handshake.onCloseRequested();
    await flush();
    expect(useConfirmStore.getState().request).toBeNull();  // no dialog was ever raised
    expect(m.closed.value).toBe(false);                     // still held, waiting
    m.fireTimeout();
    expect(m.closed.value).toBe(true);
    expect(m.warnings).toEqual(['[close] renderer did not answer; closing anyway']);
    expect(useEditorStore.getState().dirty).toBe(true);     // the work was never saved
  });

  it('CONTROL: no bridge at all is the documented no-op, not drift — and does not throw', () => {
    // The node suite and any non-Electron host. Reporting this as drift would
    // make the loud case indistinguishable from the ordinary one. (The old code
    // claimed to no-op here and would have thrown: `window` is undefined in this
    // suite, so `window.api?.` is a ReferenceError, not a short circuit.)
    if (!HAD_WINDOW) delete (globalThis as { window?: unknown }).window;
    expect(installCloseGuard().kind).toBe('no-bridge');

    (globalThis as { window?: unknown }).window = {};
    expect(installCloseGuard().kind).toBe('no-bridge');
  });

  it('CONTROL: another window answering yes does not close THIS window', async () => {
    // ipcMain is process-wide, so this message really can arrive. The sender check
    // that filters it is computed in main/index.ts and enforced in the handshake;
    // this row is the seam's version of it, on the real channel.
    const { b } = install(true);
    useEditorStore.setState({ dirty: true });
    const m = mainHalf(b);
    m.handshake.onCloseRequested();
    await flush();
    expect(useConfirmStore.getState().request).not.toBeNull(); // our dialog is up

    b.sendAs({ id: 'some-other-window' }, IPC_CHANNELS.CLOSE_RESPONSE, true);

    expect(m.closed.value).toBe(false);      // ignored
    expect(m.timeoutArmed()).toBe(true);     // still waiting for OUR answer

    useConfirmStore.getState().answer('cancel');
    await flush();
    expect(m.closed.value).toBe(false);
  });
});

/**
 * The Electron adapter in main/index.ts cannot be driven here (it needs a real
 * BrowserWindow), so its SHAPE is pinned instead.
 *
 * WHAT THIS PROVES: that the adapter still delegates to the extracted state
 * machine, still computes the sender check main/close-handshake.ts documents as
 * the caller's job, and still uses the same two channel constants as the
 * preload — i.e. the seam's two ends have not drifted apart in source.
 *
 * WHAT IT DOES NOT PROVE: that Electron delivers on those channels, that
 * `e.preventDefault()` actually suspends a real close, or that `win.close()`
 * re-raises the event the 'let-through' verdict exists for. Those are measured
 * only by running the app; the file's own header records the CDP measurement of
 * the one path that does NOT raise `close` at all.
 */
describe('the seam is wired to the same two channels at both ends', () => {
  const src = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
  /** Executable source: comments stripped, so prose cannot answer for code. */
  const code = (p: string) => src(p)
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('main/index.ts delegates to the handshake and computes the sender check', () => {
    const main = code('../../../main/index.ts');
    expect(main).toMatch(/from '\.\/close-handshake'/);
    expect(main).toContain('createCloseHandshake({');
    expect(main).toContain('IPC_CHANNELS.CLOSE_REQUEST');
    expect(main).toContain('IPC_CHANNELS.CLOSE_RESPONSE');
    // The rule lives in the handshake; the COMPUTATION has to stay here.
    expect(main).toContain('event.sender === win.webContents');
    // And the verdict has to reach preventDefault, or nothing is suspended.
    expect(main).toMatch(/onCloseRequested\(\) === 'suspend'\) e\.preventDefault\(\)/);
    // No second, inline copy of the state machine left behind.
    expect(main).not.toContain('let pending = false');
  });

  it('the preload listens on CLOSE_REQUEST and replies on CLOSE_RESPONSE', () => {
    // The fake bus above is only honest if the real preload bridges these two
    // channels in these two directions.
    const pre = code('../../../preload/index.ts');
    const body = pre.slice(pre.indexOf('onCloseRequest:'));
    const on = body.indexOf('ipcRenderer.on(IPC_CHANNELS.CLOSE_REQUEST');
    const send = body.indexOf('ipcRenderer.send(IPC_CHANNELS.CLOSE_RESPONSE');
    expect(on).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(on); // the reply is inside the request handler
  });

  it('the renderer half no longer reaches the channel through an optional chain', () => {
    // The two `?.`s WERE the defect: they turned a broken contract into a silent
    // no-op on the one perimeter whose failure mode is closing the window.
    //
    // EXECUTABLE SOURCE ONLY. The first version of this row read the whole file
    // and went red on close-guard.ts's own docblock, which QUOTES the expression
    // it replaced — a comment outbidding the code in a grep, and it would equally
    // have passed on a file that reverted the code and deleted the comment.
    const guard = code('../close-guard.ts');
    expect(guard).not.toContain('window.api?.onCloseRequest?.');
    expect(guard).toContain("kind: 'drift'");
  });

  it('App.tsx acts on a guard that did not arm', () => {
    // A console line in a renderer nobody is watching is not a report.
    const app = code('../../App.tsx');
    const at = app.indexOf('installCloseGuard()');
    expect(at).toBeGreaterThan(-1);
    const after = app.slice(at, at + 700);
    expect(after).toContain("=== 'drift'");
    expect(after).toContain('addToast(');
  });
});
