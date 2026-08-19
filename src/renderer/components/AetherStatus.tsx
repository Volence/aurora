import React from 'react';
import { T } from './ui';
import { useBusStore } from '../state/busStore';
import { useAetherStore } from '../state/aetherStore';

/**
 * Aether bus indicator — `Aether ◇ <status>`; emerald diamond when connected.
 *
 * Aeon-only: the Aether bus is the aeon engine's link to Oracle/Seraph, and
 * classic has no bus at all. It lived inside the old shell/MapStatusBar; when
 * that bar became neutral (it may not import a store) the indicator moved here
 * so `providers/map-status-aeon.ts` can hand it to the bar through the `right`
 * slot while staying JSX-free like its sibling providers.
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
    : connected ? 'Connected to the emulator — click to disconnect' : 'Click to connect to the emulator';

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
