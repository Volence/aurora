import React from 'react';
import { StatusBar, T } from '../components/ui';
import { useArtStore } from '../state/artStore';

/** Art-mode status bar: open document name on the left, zoom factor on the right. */
export default function ArtStatusBar() {
  const open = useArtStore((s) => s.open);
  const zoom = useArtStore((s) => s.zoom);

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
