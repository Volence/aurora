// The inert face of a canvas tab that has no document behind it — the canvas
// counterpart of SpriteDocUnloaded, and here for the same reason: App used to
// have only two choices, mount the editor or mount nothing, and mounting the
// editor over a document that is not this tab's shows someone else's art (or a
// blank surface) under this tab's name. For a document whose whole content is
// pixels the user drew, a blank surface under a real canvas's name reads as
// "your art is gone".
//
// A canvas tab id names a FILE, so the state is reachable in one way the sprite
// pane's is not: the file was deleted, moved or made unreadable while the tab
// was open. That is permanent, not a boot-order accident, so the copy says what
// happened rather than "try again in a moment" — and Retry re-runs the ordinary
// activation the tab strip would run, so there is exactly one code path that
// loads a canvas document.

import React from 'react';
import { T } from '../ui';
import { requestFocusTabId } from '../../shell/tab-activation';
import { parseCanvasDocTabId } from '../../shell/tabs';

export default function CanvasDocUnloaded({ tabId, title }: { tabId: string; title: string }) {
  const name = parseCanvasDocTabId(tabId)?.name ?? null;

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.title}>{title}</div>
        <div style={styles.body}>
          This canvas could not be loaded, so the tab has no document. Its files
          are {name ? <code style={styles.code}>.aurora/canvas/{name}.png</code> : 'under .aurora/canvas/'}
          {' '}and the sidecar beside them. Check they are still there and readable.
        </div>
        <button style={styles.button} onClick={() => { void requestFocusTabId(tabId); }}>Retry</button>
        <div style={styles.hint}>Closing this tab is always safe: nothing is loaded to lose.</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    flex: 1, minWidth: 0, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    background: T.surface, padding: T.s6,
  },
  card: {
    maxWidth: 460, display: 'flex', flexDirection: 'column', gap: T.s3,
    textAlign: 'center', alignItems: 'center',
  },
  title: { fontSize: T.tLg, fontWeight: T.wSemibold, color: T.textHi, fontFamily: T.fontUi },
  body: { fontSize: T.tBase, lineHeight: 1.5, color: T.textLo, fontFamily: T.fontUi },
  code: { fontFamily: T.fontMono, color: T.textBase },
  button: {
    padding: '6px 14px', background: T.raised, border: `1px solid ${T.border}`,
    color: T.textBase, borderRadius: T.rMd, cursor: 'pointer',
    fontSize: T.tBase, fontFamily: T.fontUi,
  },
  hint: { fontSize: T.tSm, color: T.textFaint, fontFamily: T.fontUi },
};
