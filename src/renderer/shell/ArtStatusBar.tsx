import React from 'react';
import { StatusBar, T } from '../components/ui';
import { useArtStore, selectArtZoom } from '../state/artStore';

/**
 * Art-mode status bar: open document name on the left, zoom factor on the right.
 *
 * THE NUMBER SHOWN IS THE STORE'S, NOT ALWAYS THE ONE DRAWN. Each surface passes
 * its zoom through `cappedZoom` (art-shared/zoom-cap.ts) so the canvas never
 * exceeds the ~16000px the browser will back — past that a canvas comes back
 * blank rather than failing. The two diverge only at the ceiling: a 256px chunk
 * at the store's max 64 draws at 62. Hit-testing uses the DRAWN value, so clicks
 * still land correctly and only this label is off. Left as is deliberately —
 * publishing an effective zoom back to the store would add a second writer for a
 * two-unit discrepancy at one extreme.
 */
export default function ArtStatusBar() {
  const open = useArtStore((s) => s.open);
  const zoom = useArtStore(selectArtZoom);

  const left = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      {open ? (
        <>
          <span style={{ color: T.accent, fontWeight: 600 }}>{open.name}</span>
          {open.dirty && <span style={{ color: T.warning }}>unsaved</span>}
        </>
      ) : (
        <span style={{ color: T.textLo }}>no document</span>
      )}
    </span>
  );

  const right = (
    <span style={{ color: T.textBase }}>{zoom}× zoom</span>
  );

  return <StatusBar left={left} right={right} />;
}
