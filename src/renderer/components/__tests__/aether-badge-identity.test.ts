import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type React from 'react';
import { renderHooked, type Hooked } from '../../../test/render-hooked';
import AetherStatus, { IDENTITY_ABSENT, SOCKET_ABSENT, shortSocketLabel } from '../AetherStatus';
import { useAetherStore } from '../../state/aetherStore';
import { useBusStore } from '../../state/busStore';
import type { AetherStatusPayload } from '../../../shared/ipc-types';

/**
 * THE BADGE MUST NOT SPELL A CONSTANT WHERE A READER EXPECTS AN IDENTITY.
 *
 * Until this parcel the bus badge rendered `connected · <serverName>`.
 * `serverName` is a deployment label protocol.md §2.1 forbids discriminating
 * on, oracle's own source says beside the field that it "stops being an
 * identity", and `docs/OVERSEER.md` had already ruled it here. Verified in
 * oracle at `aca9e9a`: nothing sets `server_name` at all, so it is the same
 * hardcoded `oracle-next` on every machine — the badge's identity segment was
 * a constant.
 *
 * ─── WHY THESE ROWS ARE SHAPED AS DIFFERENCES, NOT PRESENCES ───────────────
 *
 * A row asserting the badge "shows something" would pass on the defect: the old
 * badge showed something too, and what it showed was identical everywhere. The
 * property that has teeth is that TWO DIFFERENT MACHINES PRODUCE TWO DIFFERENT
 * DISPLAYED STRINGS, and its mirror — that a payload differing ONLY in
 * `serverName` produces the SAME string, which is the only shape of row that
 * can fail if the field ever creeps back in.
 *
 * ─── HOW THE ROWS REACH THE REAL COMPONENT ─────────────────────────────────
 *
 * This suite has no DOM, and the label is assembled inside the component, so a
 * row that called a helper directly could not see a component that ignored it.
 * Every row here renders the real `AetherStatus` through `renderHooked` (which
 * installs a hook dispatcher, so the component's real zustand subscriptions
 * run), drives it through the real `aetherStore.apply` with a real
 * `AetherStatusPayload`, and reads the text off the tree it actually returned.
 * That is the whole renderer path from the IPC boundary to the pixels, minus
 * the browser.
 *
 * ─── WHAT A GREEN RESULT DOES NOT RULE OUT (bar 2e) ────────────────────────
 *
 * Layout and truncation. Nothing here proves the status bar has room for the
 * label, or that CSS does not ellipsize the socket tail off the right edge; the
 * rendered STRING is what is asserted. That is a foreground question and is
 * tagged as one. Nor does any row here exercise a live bus: the payloads are
 * built by hand from `AetherStatusPayload`, which is the shape the main process
 * sends, and `bridge-socket-path.test.ts` is the row that proves the main
 * process actually fills the socket field in.
 *
 * Runner: `npx vitest run src/renderer/components/__tests__/aether-badge-identity.test.ts`
 * (and the whole file inside `npm test`).
 */

/** Flatten a returned element tree to the text a reader would see. */
function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  const el = node as React.ReactElement<{ children?: unknown }>;
  if (typeof el === 'object' && 'props' in el) return textOf(el.props?.children);
  return '';
}

/** The `title` attribute of the rendered button. */
function titleOf(h: Hooked<Record<string, never>>): string {
  const el = h.el() as React.ReactElement<{ title?: string }>;
  const t = el.props.title;
  if (typeof t !== 'string') {
    throw new Error('AetherStatus rendered no string `title`: the tooltip row is unmeasurable, not passing');
  }
  return t;
}

/**
 * A handshake payload for one running emulator. Fields are the ones
 * `bridge.ts` actually fills; `serverName` is the stale constant every real
 * oracle sends, kept in the fixture precisely so the rows can prove it never
 * reaches the screen.
 */
function machine(over: Partial<AetherStatusPayload> = {}): AetherStatusPayload {
  return {
    status: 'connected',
    serverName: 'oracle-next',
    serverVersion: '0.4.1',
    implementation: 'oracle-rs',
    serverBuild: 'fb72abe (vcs)',
    socketPath: '/tmp/oracle.sock',
    palette: false,
    methodCount: 58,
    ...over,
  };
}

let hooked: Hooked<Record<string, never>> | null = null;

/** Render the badge against one payload and return what it displays. */
function shown(payload: AetherStatusPayload): { text: string; title: string } {
  useAetherStore.getState().apply(payload);
  hooked?.unmount();
  hooked = renderHooked(AetherStatus as (p: Record<string, never>) => React.ReactElement, {});
  return { text: textOf(hooked.el()), title: titleOf(hooked) };
}

beforeEach(() => {
  useAetherStore.setState({
    status: 'disconnected', palette: false, pushing: false,
    serverName: undefined, serverVersion: undefined, implementation: undefined,
    serverBuild: undefined, socketPath: undefined, identityWarning: undefined,
    methodCount: undefined, servedMethods: undefined, error: undefined,
  });
  useBusStore.setState({ status: 'offline' });
});

afterEach(() => { hooked?.unmount(); hooked = null; });

describe('the bus badge displays an identity, not a deployment label', () => {
  /**
   * THE PROPERTY THE PARCEL EXISTS FOR. Two windows, two emulators, same
   * server software. `implementation` is identical by construction, so a badge
   * that showed only the software would render these two identically and a
   * person could not tell which machine they were driving.
   *
   * COULD THIS FAIL WRONGLY? It fails if the socket path stops reaching the
   * label, and it also fails if `shortSocketLabel` collapses two distinct paths
   * to one string — which is the reason it keeps two segments rather than the
   * basename, and why the two fixtures below share a basename.
   */
  it('renders two emulators of the SAME implementation as two different strings', () => {
    const a = shown(machine({ socketPath: '/run/user/1000/oracle.sock' }));
    const b = shown(machine({ socketPath: '/tmp/oracle.sock' }));

    // Anti-vacuous: both really rendered a connected badge naming the software.
    expect(a.text).toContain('oracle-rs');
    expect(b.text).toContain('oracle-rs');
    // The discriminating assertion. Not "each shows something" — they differ.
    expect(a.text).not.toBe(b.text);
    expect(a.text).toContain('1000/oracle.sock');
    expect(b.text).toContain('tmp/oracle.sock');
    // And the whole path is one hover away in both.
    expect(a.title).toContain('/run/user/1000/oracle.sock');
    expect(b.title).toContain('/tmp/oracle.sock');
  });

  /**
   * THE MIRROR ROW, and the one that goes red if `serverName` ever creeps
   * back. Two payloads that differ in NOTHING BUT the deployment label must be
   * indistinguishable on screen, because that label distinguishes nothing.
   */
  it('is unmoved by serverName, and never prints it', () => {
    const a = shown(machine({ serverName: 'oracle-next' }));
    const b = shown(machine({ serverName: 'a totally different deployment' }));

    expect(a.text).toBe(b.text);
    expect(a.title).toBe(b.title);
    expect(a.text).not.toContain('oracle-next');
    expect(b.text).not.toContain('a totally different deployment');
    expect(a.title).not.toContain('oracle-next');
  });

  /**
   * ABSENCE IS SAID, NOT SUBSTITUTED. The replaced code answered a missing
   * `serverName` with the literal `'oracle'` — a plausible-looking name for a
   * server that had not identified itself. A row asserting only "something is
   * shown" would have passed on that, so this asserts the shown string is the
   * one that ADMITS the gap and is not mistakeable for a registry value.
   */
  it('says a missing implementation is missing rather than naming a server', () => {
    const s = shown(machine({ implementation: undefined }));
    expect(s.text).toContain(IDENTITY_ABSENT);
    expect(s.text).not.toContain('oracle-rs');
    expect(s.text).not.toContain('oracle-next');
    // Anti-vacuous: the connected badge still rendered, and the machine it is
    // attached to is still named, so this is an admitted gap and not a blank.
    expect(s.text).toContain('connected');
    expect(s.text).toContain('tmp/oracle.sock');
  });

  it('says a missing socket path is missing rather than showing a default', () => {
    const s = shown(machine({ socketPath: undefined }));
    expect(s.text).toContain(SOCKET_ABSENT);
    // The two chain defaults are the plausible substitutes; neither is invented.
    expect(s.text).not.toContain('/tmp/oracle.sock');
    expect(s.text).not.toContain('oracle.sock');
    expect(s.title).toContain('Socket: not reported');
    // Anti-vacuous: an absent socket is a DIFFERENT string from a present one.
    expect(s.text).not.toBe(shown(machine()).text);
  });

  /**
   * THE CLIENT ALREADY KNEW. `identityWarning` is set by `identifyServer`
   * whenever the lineage is one this build has never heard of, or the server
   * identified itself but sent no `serverBuild`. It reached the store months
   * ago and nothing displayed it: a client that knows the identity is
   * untrustworthy and says nothing is the same defect as one that shows a
   * label that cannot identify.
   */
  it('surfaces the identity warning the store already held', () => {
    const warned = shown(machine({
      implementation: 'oracle-zz',
      identityWarning: 'The Aether server reports implementation "oracle-zz", which this build does not know.',
    }));
    expect(warned.title).toContain('Identity warning:');
    expect(warned.title).toContain('oracle-zz');
    // Visible without a hover too, or a warning is only as loud as a tooltip.
    expect(warned.text).toContain('!');

    // And it is not always on: a clean handshake carries no warning line.
    const clean = shown(machine());
    expect(clean.title).not.toContain('Identity warning');
    expect(clean.text).not.toContain('!');
  });

  it('shows the status alone when nothing is connected, and invents no machine', () => {
    const s = shown({ status: 'disconnected', palette: false });
    expect(s.text).toContain('offline');
    expect(s.text).not.toContain('oracle');
    expect(s.text).not.toContain(IDENTITY_ABSENT);
  });
});

describe('shortSocketLabel', () => {
  /**
   * DERIVED FROM THE RESOLVER, not from taste: `socket-path.ts` can produce
   * `$XDG_RUNTIME_DIR/oracle.sock` and `/tmp/oracle.sock`, which share a
   * basename. A one-segment label would render two different machines the same
   * way, so the population below is the resolver's own four outcomes.
   */
  it('separates the two chain defaults, which share a basename', () => {
    expect(shortSocketLabel('/run/user/1000/oracle.sock'))
      .not.toBe(shortSocketLabel('/tmp/oracle.sock'));
  });

  it('keeps an explicit ORACLE_SOCKET distinguishable from its neighbour', () => {
    expect(shortSocketLabel('/tmp/oracle-a.sock')).not.toBe(shortSocketLabel('/tmp/oracle-b.sock'));
  });

  it('reports absence rather than guessing a path', () => {
    expect(shortSocketLabel(undefined)).toBe(SOCKET_ABSENT);
    expect(shortSocketLabel('')).toBe(SOCKET_ABSENT);
  });

  it('is a true suffix of the path it labels', () => {
    for (const p of ['/run/user/1000/oracle.sock', '/tmp/oracle.sock', '/oracle.sock', 'oracle.sock']) {
      expect(p.endsWith(shortSocketLabel(p))).toBe(true);
    }
  });
});
