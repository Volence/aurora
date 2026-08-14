// The sprite document's app bar — EditorShell's `appBar` slot for sprite-doc
// tabs, the counterpart to LevelWorkspace's header for level tabs.
//
// It exists because the legacy components/Toolbar.tsx was, by the end, mounted
// in exactly one place: this slot. Everything else on it had already moved out
// (the aeon zone/act selector in Fix D, the overlay toggles to LevelWorkspace,
// Open/Recents to the Explorer + HomeTab + ⌘K, the "unsaved" badge to the tab
// strip's dirty dot), so the only controls still worth carrying here are the
// two the sprite pane cannot do without: undo/redo for the focused document and
// Save. Deleting the Toolbar and lifting those two is what this file is.
//
// Shape = LevelWorkspace's header minus the facet bar: a spacer, then chips,
// right-aligned. Same `Chip` primitive, same gap, same undo/redo derivation, so
// switching between a level tab and a sprite tab does not move the controls.

import React, { useEffect, useRef, useState } from 'react';
import { focusedHistory } from '../state/editorStore';
import { useHistoryVersion } from '../hooks/useHistoryVersion';
import { useSessionStore } from '../state/sessionStore';
import { useDirtySnapshot } from './dirty-snapshot';
import { tabHasDirtyDot } from './dirty-tabs';
import { canSaveActive } from '../state/project-runtime';
import { Chip } from '../components/ui';

export default function SpriteDocHeader({ onSave }: { onSave: () => Promise<void> | void }) {
  // ONE undo/redo pair, for whichever document has focus — which under this
  // header is the sprite doc, but the derivation is focusedHistory()'s and not
  // this component's, exactly as on the level header. The hub clock
  // (useHistoryVersion) re-evaluates enabledness when a stack changes; the
  // activeId subscription is what re-renders when focus MOVES between documents,
  // which a stack change does not cover.
  const activeId = useSessionStore((s) => s.activeId);
  useHistoryVersion();
  const history = focusedHistory();

  // Save = the ACTIVE document (Ctrl+S), the coordinator's own verdict — not a
  // second definition of dirty. `activeDirty` is only consulted to tell the two
  // disabled cases apart in the tooltip: a dirty document with nowhere to write
  // (an untitled sprite has no save-back file) reads differently from one with
  // nothing to save, and that tooltip is the sole explanation the user gets.
  const dirtySnap = useDirtySnapshot();
  const activeKind = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeId)?.kind);
  const activeDirty = activeKind ? tabHasDirtyDot(activeId, activeKind, dirtySnap) : false;
  const canSave = canSaveActive(activeId);

  // The "Saved!" flash. Worth carrying over verbatim: a sprite save writes files
  // and closes silently, and with no toast and no dirty badge in this header the
  // flash is the ONLY confirmation the sprite pane offers that anything happened.
  const [saveFlash, setSaveFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // SpriteMode is NOT keep-alive (App mounts it only while a sprite-doc tab is
  // active), so a save followed quickly by a tab switch unmounts this mid-flash.
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  return (
    <div style={styles.header}>
      <span style={{ flex: 1 }} />
      <Chip disabled={!history?.canUndo} onClick={() => history?.undo()} title="Undo (Ctrl+Z)">Undo</Chip>
      <Chip disabled={!history?.canRedo} onClick={() => history?.redo()} title="Redo (Ctrl+Y)">Redo</Chip>
      <Chip
        active={saveFlash}
        disabled={!canSave && !saveFlash}
        title={
          canSave ? 'Save this document (Ctrl+S) — Save All is Ctrl+Shift+S'
            : activeDirty ? 'This document has no save-back file — export it from the sprite editor'
              : 'Nothing to save in this document'
        }
        onClick={async () => {
          await onSave();
          setSaveFlash(true);
          if (flashTimer.current) clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setSaveFlash(false), 1500);
        }}
      >
        {saveFlash ? 'Saved!' : 'Save'}
      </Chip>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', alignItems: 'center', gap: 8, width: '100%' },
};
