import React from 'react';
import { T } from './ui';
import { useBusStore } from '../state/busStore';

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
  const connected = status === 'connected';
  const label = connected ? (peer ? `connected · ${peer}` : 'connected') : status;
  return (
    <span title="Aether bus status" style={{ letterSpacing: '0.02em' }}>
      Aether{' '}
      <span style={{ color: connected ? T.accent : T.textFaint }}>◇</span>{' '}
      <span style={{ color: connected ? T.textBase : T.textLo }}>{label}</span>
    </span>
  );
}
