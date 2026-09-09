import React from 'react';
import { T } from './ui';
import { useBusStore } from '../state/busStore';
import { useAetherStore } from '../state/aetherStore';

/**
 * Aether bus indicator — `Aether ◇ <status>`; emerald diamond when connected.
 *
 * Both engines mount it now: the outbound link serves classic's Build & Run
 * and live palette push as well as aeon's (the classic playtest-loop parcel),
 * so both map-status ports hand it to the neutral bar through the `right`
 * slot. It lived inside the old shell/MapStatusBar; when that bar became
 * neutral (it may not import a store) the indicator moved here so the
 * JSX-free provider files can hoist a single element.
 *
 * ═══ WHAT THIS BADGE DISPLAYS, AND THE FIELD IT NO LONGER DISPLAYS ═══
 *
 * It used to read `connected · <serverName>`. `serverName` is not an identity
 * and its own producer says so: protocol.md §2.1 makes it a DEPLOYMENT label a
 * config may set and forbids discriminating on it, and oracle's own source
 * carries the sentence "`serverName` beside them stays a deployment label, and
 * stops being an identity". `docs/OVERSEER.md` had already ruled it for this
 * repo — read `implementation`, never `serverName` — and this component was
 * the surface violating that ruling. Worse, verified in oracle at `aca9e9a`:
 * nothing anywhere sets `server_name`, so the string every deployment sends is
 * the hardcoded default `oracle-next`, which is the repo's pre-rename name. The
 * badge's identity segment was the same stale constant on every machine on
 * earth. `busStore.ts` carries the full argument.
 *
 * ═══ TWO QUESTIONS, TWO FIELDS, AND ONLY ONE OF THEM ANSWERS THE HARD ONE ═══
 *
 * WHICH SERVER SOFTWARE answered is `implementation` (§2.1's closed registry:
 * `oracle-rs` | `oracle-cpp`), classified in `server-identity.ts`. It is the
 * right thing to show and it is NOT sufficient, because two Aurora windows
 * attached to two different `oracle-rs` emulators both read `oracle-rs`.
 *
 * WHICH MACHINE answered is the SOCKET PATH, and nothing else. There is no
 * probe and no server selector: `resolveSocketPath` (`socket-path.ts`) picks
 * one unix path off the env chain and whoever holds it first answers, which is
 * why `docs/OVERSEER.md` calls the socket chain the only arbiter. The path is
 * not on the wire — `initialize` never mentions it — but it does not need to
 * be: THIS side chose it, and `bridge.ts` now carries it out on every status
 * push. So the badge shows a short tail of it inline and the whole path in the
 * tooltip, and two windows on two emulators read differently on screen.
 *
 * ═══ AN ABSENT FIELD IS SAID TO BE ABSENT ═══
 *
 * No substitute, no plausible default, no `'oracle'` invented out of nothing.
 * A field that did not arrive renders as a sentence that could not be mistaken
 * for a value. Reporting blindness as a clean result is this repo's dominant
 * defect class and the replaced fallback was an instance of it.
 */

/** Shown in place of `implementation` when the handshake carried none. */
export const IDENTITY_ABSENT = 'unidentified server';
/** Shown in place of the socket path when the payload carried none. */
export const SOCKET_ABSENT = 'socket not reported';

/**
 * The last two segments of a socket path, which is what fits in a status bar.
 *
 * WHY TWO AND NOT THE BASENAME. The realistic two-emulator setups differ in
 * either half: an author running `ORACLE_SOCKET=/tmp/oracle-a.sock` and
 * `/tmp/oracle-b.sock` differs in the basename, but the DEFAULT chain's own two
 * entries are `$XDG_RUNTIME_DIR/oracle.sock` and `/tmp/oracle.sock`, which share
 * a basename and differ only in the directory. A basename-only label would
 * render those two machines identically, which is the whole property this
 * exists to hold. Two segments separate both cases; the tooltip always carries
 * the full path, so nothing here is the last word.
 */
export function shortSocketLabel(path: string | undefined): string {
  if (path === undefined || path.length === 0) return SOCKET_ABSENT;
  const parts = path.split('/').filter((p) => p.length > 0);
  return parts.slice(-2).join('/') || path;
}

export default function AetherStatus(): React.ReactElement {
  const status = useBusStore((s) => s.status);
  const implementation = useAetherStore((s) => s.implementation);
  const serverBuild = useAetherStore((s) => s.serverBuild);
  const socketPath = useAetherStore((s) => s.socketPath);
  const identityWarning = useAetherStore((s) => s.identityWarning);
  const methodCount = useAetherStore((s) => s.methodCount);
  const error = useAetherStore((s) => s.error);
  const connect = useAetherStore((s) => s.connect);
  const disconnect = useAetherStore((s) => s.disconnect);
  const connected = status === 'connected';
  const busy = status === 'connecting';

  const label = connected
    ? `connected · ${implementation ?? IDENTITY_ABSENT} · ${shortSocketLabel(socketPath)}`
    : status;

  // CLICK TO CONNECT, and never on its own. Aurora must work identically with
  // no emulator in sight, and a tool that opens sockets at launch is one people
  // stop trusting — so the link is a deliberate act, and this is where it is
  // taken back.
  //
  // THE TOOLTIP IS THE PROVENANCE, one line per question, each naming its own
  // absence rather than being omitted: a missing line reads as "I did not think
  // to say", an explicit one reads as "the server did not tell me".
  const lines: string[] = [];
  if (connected) {
    lines.push(`Server: ${implementation ?? IDENTITY_ABSENT}`);
    lines.push(`Build: ${serverBuild ?? 'not reported'}`);
    lines.push(`Socket: ${socketPath ?? 'not reported'}`);
    if (methodCount !== undefined) lines.push(`Methods served: ${methodCount}`);
  } else if (socketPath !== undefined) {
    lines.push(`Socket: ${socketPath}`);
  }
  if (identityWarning !== undefined) lines.push(`Identity warning: ${identityWarning}`);
  if (error !== undefined) lines.push(`Error: ${error}`);
  lines.push(connected ? 'Click to disconnect' : 'Click to connect to the emulator');
  const title = lines.join('\n');

  const ariaLabel = identityWarning !== undefined
    ? `Aether bus: ${label}, identity warning: ${identityWarning}`
    : `Aether bus: ${label}`;

  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      disabled={busy}
      onClick={() => { void (connected ? disconnect() : connect()); }}
      style={{
        letterSpacing: '0.02em', background: 'none', border: 'none', padding: 0,
        font: 'inherit', color: 'inherit', cursor: busy ? 'default' : 'pointer',
      }}
    >
      Aether{' '}
      <span style={{ color: connected ? T.accent : error ? T.error : T.textFaint }}>◇</span>{' '}
      <span style={{ color: connected ? T.textBase : T.textLo }}>{label}</span>
      {identityWarning !== undefined
        ? <span style={{ color: T.warning }}>{' !'}</span>
        : null}
    </button>
  );
}
