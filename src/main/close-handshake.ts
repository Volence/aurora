// THE MAIN-PROCESS HALF OF THE WINDOW-CLOSE HANDSHAKE, with Electron kept out
// of it so that it can be tested at all.
//
// WHY IT MOVED OUT OF main/index.ts. That file imports `electron` at module
// scope, so the node suite cannot import it — and `installCloseGuard` was not
// exported anyway. The result was four guards on the sole unsaved-work perimeter
// for the window, asserted by nothing:
//
//   1. the permitted second close passes through (`closing`);
//   2. a close arriving while the question is out does not ask twice (`pending`);
//   3. another window's answer is ignored (the sender check);
//   4. a renderer that is already gone does not hold the window hostage.
//
// ...plus the timeout, which is the one that FAILS OPEN: no answer ⇒ close. That
// is deliberate (a renderer too wedged to reply is also too wedged to save, and
// an app that cannot be quit is worse than one that quits), and it is why the
// RENDERER side registering nothing is so expensive — see installCloseGuard in
// renderer/shell/close-guard.ts, which now names an absent channel instead of
// no-oping through an optional chain.
//
// The rules live here; main/index.ts holds only the Electron adapter that
// supplies them with `win`/`ipcMain`/`setTimeout`, and the seam between this
// half and the renderer's is driven end to end in
// renderer/shell/__tests__/close-guard-seam.test.ts.

/** How long main waits for the renderer's answer before closing anyway. */
export const CLOSE_ANSWER_TIMEOUT_MS = 15_000;

export interface CloseTimer {
  cancel(): void;
}

export interface CloseHandshakeDeps {
  /** `win.webContents.send(IPC_CHANNELS.CLOSE_REQUEST)` — put the question out. */
  askRenderer(): void;
  /** `win.webContents.isDestroyed()` — a renderer that can never answer. */
  rendererGone(): boolean;
  /** `win.isDestroyed()` — the window went while the question was out. */
  windowGone(): boolean;
  /** `win.close()` — the second, permitted close. */
  closeWindow(): void;
  /**
   * `ipcMain.on(IPC_CHANNELS.CLOSE_RESPONSE, …)`, returning the removal.
   *
   * `fromThisWindow` is `event.sender === win.webContents`, computed by the
   * caller because only it holds the Electron objects — but the RULE that a
   * foreign window's answer is ignored lives here, where it can be tested.
   */
  listen(cb: (fromThisWindow: boolean, mayClose: unknown) => void): () => void;
  timer(ms: number, fn: () => void): CloseTimer;
  warn(message: string): void;
}

/** What the window's `close` handler must do with the event. */
export type CloseVerdict = 'let-through' | 'suspend';

export interface CloseHandshake {
  /**
   * Call from the window's `close` event. `'suspend'` means preventDefault and
   * wait: the question is now out (or was already). `'let-through'` means this
   * close is the one the guard itself asked for.
   */
  onCloseRequested(): CloseVerdict;
}

export function createCloseHandshake(
  deps: CloseHandshakeDeps,
  timeoutMs: number = CLOSE_ANSWER_TIMEOUT_MS,
): CloseHandshake {
  let closing = false;   // the answer said yes; let this close through
  let pending = false;   // a question is out; don't ask twice

  return {
    onCloseRequested(): CloseVerdict {
      if (closing) return 'let-through';
      if (pending) return 'suspend';   // asked already; do not ask twice
      pending = true;

      let timer: CloseTimer | null = null;
      let unlisten: (() => void) | null = null;

      const finish = (mayClose: boolean): void => {
        if (!pending) return;          // an answer already settled this round
        pending = false;
        timer?.cancel();
        unlisten?.();
        if (mayClose && !deps.windowGone()) {
          closing = true;
          deps.closeWindow();
        }
      };

      timer = deps.timer(timeoutMs, () => {
        // FAIL OPEN, deliberately and loudly. See the header.
        deps.warn('[close] renderer did not answer; closing anyway');
        finish(true);
      });
      unlisten = deps.listen((fromThisWindow, mayClose) => {
        if (!fromThisWindow) return;   // another window's answer
        finish(mayClose === true);     // anything but a literal true keeps it open
      });

      // A renderer that is already gone will never answer, so waiting the full
      // timeout would just make the window look stuck for 15 seconds.
      if (deps.rendererGone()) {
        finish(true);
        return 'suspend';
      }
      deps.askRenderer();
      return 'suspend';
    },
  };
}
