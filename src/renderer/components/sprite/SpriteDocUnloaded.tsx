// The inert face of a sprite-doc tab that has no document behind it.
//
// A sprite-doc tab is a DOCUMENT tab, but the document is only created when the
// tab's art actually loads (tab-activation.ts). Two states leave a legitimate,
// still-open tab with nothing loaded:
//
//   DEFERRED — an s1 object-art tab restored before any classic act is open,
//     WITHOUT a persisted zone key to self-serve from (a legacy session) and
//     with zone-scoped art. s1 art resolves against a ZONE, so this checkout
//     genuinely cannot run yet. Tabs saved since the S1ZoneKey work carry their
//     zone in the workspace record and restore straight into their document, so
//     this pane is now the legacy/edge path, not every boot's landing.
//
//   FAILED — the checkout ran and could not read the art.
//
// Before this pane existed, App mounted SpriteMode regardless, and SpriteMode
// renders whatever document IS checked out — which after a rolled-back load is
// the blank untitled one. The user got an empty "NewSprite" editor under a tab
// labelled "Signpost" and no idea why.
//
// This is deliberately a dead end with one way forward, not a second loader:
// Retry re-runs the ordinary activation the tab strip would run, so there is
// exactly one code path that loads a sprite document.

import React from 'react';
import { T } from '../ui';
import { requestFocusTabId } from '../../shell/tab-activation';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { parseSpriteDocTabId } from '../../shell/tabs';
import { objectArtIsZoneFree, resolveNamedArtDoc } from '../../../core/project/profiles/s1-object-art';

export default function SpriteDocUnloaded({ tabId, title }: { tabId: string; title: string }) {
  const actLoaded = useClassicLevelStore((s) => s.ref !== null);
  // Selected as the record VALUE (not the s1ZoneFor getter — see the store's
  // usage note): a persisted zone key means the checkout could run without an
  // act, so an unloaded tab here means it RAN and failed — the DEFERRED copy
  // would promise that opening a level fixes it, which is a promise the failed
  // case can't keep. Same for zone-free art (Ring): no act was ever needed.
  const persistedZone = useWorkspaceStore((s) => s.record[tabId]?.s1Zone ?? null);
  const parsed = parseSpriteDocTabId(tabId);
  const isS1 = parsed?.engine === 's1';
  const selfServes = isS1 && (persistedZone !== null || objectArtIsZoneFree(Number(parsed?.ref))
    || (parsed !== null && resolveNamedArtDoc(parsed.ref) !== undefined)); // named docs are zone-free
  const waitingForAct = isS1 && !actLoaded && !selfServes;

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.title}>{title}</div>
        <div style={styles.body}>
          {waitingForAct ? (
            <>
              This object&rsquo;s art is stored per zone, so it can only be opened
              alongside a level. Open one of the level tabs (or pick a level in the
              Explorer), then come back here.
            </>
          ) : (
            <>This sprite&rsquo;s art could not be loaded, so the tab has no document.</>
          )}
        </div>
        <button style={styles.button} onClick={() => { void requestFocusTabId(tabId); }}>
          {waitingForAct ? 'Try again' : 'Retry'}
        </button>
        <div style={styles.hint}>Closing this tab is always safe — nothing is loaded to lose.</div>
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
    maxWidth: 420, display: 'flex', flexDirection: 'column', gap: T.s3,
    textAlign: 'center', alignItems: 'center',
  },
  title: { fontSize: T.tLg, fontWeight: T.wSemibold, color: T.textHi, fontFamily: T.fontUi },
  body: { fontSize: T.tBase, lineHeight: 1.5, color: T.textLo, fontFamily: T.fontUi },
  button: {
    padding: '6px 14px', background: T.raised, border: `1px solid ${T.border}`,
    color: T.textBase, borderRadius: T.rMd, cursor: 'pointer',
    fontSize: T.tBase, fontFamily: T.fontUi,
  },
  hint: { fontSize: T.tSm, color: T.textFaint, fontFamily: T.fontUi },
};
