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
 */
export default function AetherStatus(): React.ReactElement {
  const status = useBusStore((s) => s.status);
  const peer = useBusStore((s) => s.peer);
  const error = useAetherStore((s) => s.error);
  const connect = useAetherStore((s) => s.connect);
  const disconnect = useAetherStore((s) => s.disconnect);
  const connected = status === 'connected';
  const busy = status === 'connecting';
  const label = connected ? (peer ? `connected · ${peer}` : 'connected') : status;

  // CLICK TO CONNECT, and never on its own. Aurora must work identically with
  // no emulator in sight, and a tool that opens sockets at launch is one people
  // stop trusting — so the link is a deliberate act, and this is where it is
  // taken back.
  const title = error
    ? `Aether: ${error}`
    : connected ? 'Connected to the emulator. Click to disconnect' : 'Click to connect to the emulator';

  return (
    <button
      type="button"
      title={title}
      aria-label={`Aether bus: ${label}`}
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
    </button>
  );
}
