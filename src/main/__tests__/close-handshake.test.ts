import { describe, it, expect } from 'vitest';
import {
  createCloseHandshake, CLOSE_ANSWER_TIMEOUT_MS, type CloseHandshakeDeps,
} from '../close-handshake';

/**
 * THE MAIN HALF HAD NO TESTS AT ALL. It lived inline in main/index.ts, which
 * imports `electron` at module scope and exported nothing, so no test could
 * reach it — and the five rules on the sole unsaved-work perimeter for the whole
 * window (permitted second close, don't-ask-twice, ignore a foreign sender, a
 * renderer that is already gone, and the fail-open timeout) were asserted by
 * nothing whatsoever.
 *
 * The Electron adapter that remains in main/index.ts is still unmeasured by any
 * behavioural test — it needs a real BrowserWindow. close-guard-seam.test.ts
 * pins its shape with a source gate and says exactly what that does not prove.
 */

interface Rig {
  deps: CloseHandshakeDeps;
  log: string[];
  /** Deliver an answer as if it came over IPC_CHANNELS.CLOSE_RESPONSE. */
  reply(fromThisWindow: boolean, mayClose: unknown): void;
  /** Same, but through the callback even after it was unsubscribed — what a
   *  duplicated or in-flight second message looks like. */
  replyRaw(fromThisWindow: boolean, mayClose: unknown): void;
  /** Fire the armed timeout, or throw if there is none armed. */
  fireTimeout(): void;
  timerMs(): number | null;
  cancels(): number;
  liveListeners(): number;
  answering(): boolean;
}

function rig(state: { rendererGone?: boolean; windowGone?: boolean } = {}): Rig {
  const log: string[] = [];
  let answer: ((fromThisWindow: boolean, mayClose: unknown) => void) | null = null;
  let everAnswer: ((fromThisWindow: boolean, mayClose: unknown) => void) | null = null;
  let fire: (() => void) | null = null;
  let ms: number | null = null;
  let cancelled = 0;
  let listeners = 0;

  const deps: CloseHandshakeDeps = {
    askRenderer: () => { log.push('ask'); },
    rendererGone: () => state.rendererGone === true,
    windowGone: () => state.windowGone === true,
    closeWindow: () => { log.push('close'); },
    listen: (cb) => {
      answer = cb;
      everAnswer = cb;
      listeners += 1;
      return () => { answer = null; listeners -= 1; };
    },
    timer: (millis, fn) => {
      ms = millis;
      fire = fn;
      return { cancel: () => { cancelled += 1; fire = null; } };
    },
    warn: (m) => { log.push(`warn:${m}`); },
  };

  return {
    deps,
    log,
    reply: (fromThisWindow, mayClose) => {
      if (!answer) throw new Error('nothing is listening for an answer');
      answer(fromThisWindow, mayClose);
    },
    replyRaw: (fromThisWindow, mayClose) => {
      if (!everAnswer) throw new Error('no answer callback was ever registered');
      everAnswer(fromThisWindow, mayClose);
    },
    fireTimeout: () => {
      if (!fire) throw new Error('no timeout is armed');
      fire();
    },
    timerMs: () => ms,
    cancels: () => cancelled,
    liveListeners: () => listeners,
    answering: () => answer !== null,
  };
}

describe('createCloseHandshake', () => {
  it('suspends the first close, asks the renderer once, and arms the documented timeout', () => {
    const r = rig();
    const h = createCloseHandshake(r.deps);
    expect(h.onCloseRequested()).toBe('suspend');
    expect(r.log).toEqual(['ask']);
    expect(r.timerMs()).toBe(CLOSE_ANSWER_TIMEOUT_MS);
    expect(r.answering()).toBe(true);
  });

  it('a second close while the question is out does NOT ask twice', () => {
    const r = rig();
    const h = createCloseHandshake(r.deps);
    h.onCloseRequested();
    expect(h.onCloseRequested()).toBe('suspend');
    expect(r.log).toEqual(['ask']);         // one question, not two
    expect(r.liveListeners()).toBe(1);      // and one listener, not two
  });

  it("the renderer's yes closes the window, and THAT close is let through", () => {
    const r = rig();
    const h = createCloseHandshake(r.deps);
    h.onCloseRequested();
    r.reply(true, true);
    expect(r.log).toEqual(['ask', 'close']);
    // The close() above re-raises the window's `close` event; without this the
    // guard would prevent its own permitted close and the window never goes.
    expect(h.onCloseRequested()).toBe('let-through');
    expect(r.log).toEqual(['ask', 'close']); // and it asked nothing further
  });

  it("the renderer's no keeps the window, and a LATER close asks again", () => {
    const r = rig();
    const h = createCloseHandshake(r.deps);
    h.onCloseRequested();
    r.reply(true, false);
    expect(r.log).toEqual(['ask']);
    expect(r.cancels()).toBe(1);            // the timeout cannot fire later
    expect(r.liveListeners()).toBe(0);      // and the listener is not leaked

    expect(h.onCloseRequested()).toBe('suspend');
    expect(r.log).toEqual(['ask', 'ask']);  // a cancel is not a permanent refusal
  });

  it("ANOTHER window's answer is ignored", () => {
    // ipcMain is process-wide: a second window answering its own close question
    // must not settle this one. Before the extraction this rule was one `!==` in
    // an un-exported closure with no test anywhere.
    const r = rig();
    const h = createCloseHandshake(r.deps);
    h.onCloseRequested();
    r.reply(false, true);
    expect(r.log).toEqual(['ask']);         // not closed
    expect(r.liveListeners()).toBe(1);      // and still waiting for OUR answer
    r.reply(true, true);
    expect(r.log).toEqual(['ask', 'close']);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['the string "true"', 'true'],
    ['1', 1],
  ] as const)('anything but a literal true keeps the window open (%s)', (_label, value) => {
    const r = rig();
    const h = createCloseHandshake(r.deps);
    h.onCloseRequested();
    r.reply(true, value);
    expect(r.log).toEqual(['ask']);
  });

  it('a renderer that is already gone closes at once rather than holding the window 15s', () => {
    const r = rig({ rendererGone: true });
    const h = createCloseHandshake(r.deps);
    expect(h.onCloseRequested()).toBe('suspend');
    expect(r.log).toEqual(['close']);       // and it never asked
    expect(r.cancels()).toBe(1);
  });

  it('no answer FAILS OPEN, and says so first', () => {
    // Deliberate: a renderer too wedged to reply is also too wedged to save, and
    // an app that cannot be quit is worse than one that quits. The warning is the
    // only trace this leaves, which is why the renderer side now refuses to fail
    // to register silently.
    const r = rig();
    const h = createCloseHandshake(r.deps);
    h.onCloseRequested();
    r.fireTimeout();
    expect(r.log).toEqual(['ask', 'warn:[close] renderer did not answer; closing anyway', 'close']);
  });

  it('a window destroyed while the question was out is not closed again', () => {
    const state = { windowGone: false };
    const r = rig(state);
    const h = createCloseHandshake(r.deps);
    h.onCloseRequested();
    state.windowGone = true;
    r.reply(true, true);
    expect(r.log).toEqual(['ask']);         // no close() on a destroyed window
  });

  it('the answer is honoured once: a duplicate answer does nothing', () => {
    // A duplicated CLOSE_RESPONSE — the renderer's `respond` called twice, or a
    // retry — must not run finish() twice. `r.replyRaw` keeps the callback past
    // the unsubscribe, which is exactly what an in-flight second message is.
    const r = rig();
    const h = createCloseHandshake(r.deps);
    h.onCloseRequested();
    r.replyRaw(true, true);
    r.replyRaw(true, true);
    expect(r.log).toEqual(['ask', 'close']);
  });

  it('a custom timeout is honoured (the constant is a default, not a hard-code)', () => {
    const r = rig();
    createCloseHandshake(r.deps, 250).onCloseRequested();
    expect(r.timerMs()).toBe(250);
  });
});
