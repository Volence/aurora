// What a paste click can do where the author is now, while a paste is armed,
// read from ONE place for every surface that says it (PASTE-STATUS-BAR-HINT).
//
// The decision itself is `pasteLayerOffer` (core/editing/map-clipboard.ts),
// built from the commit click's own checks. This hook is only the store reads
// that feed it: the armed clipboard, the Paste layers setting, and the open
// zone's tile set and open project, asked through `pasteFit` exactly as
// MapViewport's commit click asks them. The Paste panel (its Layers buttons, its
// notice, its hint line) and aeon's map status bar both call this, so neither
// makes those reads for itself: two surfaces each deciding which tile set
// counts would be two statements of the same question, free to drift apart.

import { useEditorStore } from '../state/editorStore';
import { useProjectStore, getCurrentZone } from '../state/projectStore';
import { pasteFit, pasteLayerOffer, type PasteLayerOffer } from '../../core/editing/map-clipboard';

/**
 * The armed paste's offer, or null when no paste is armed. Not pasting, the
 * Layers buttons describe the selection (the next Ctrl+C replaces the
 * clipboard anyway), and the status bar says the tool's own hint.
 */
export function useArmedPasteOffer(): PasteLayerOffer | null {
  const pasting = useEditorStore((s) => s.pasting);
  const clipboard = useEditorStore((s) => s.mapClipboard);
  const pasteLayers = useEditorStore((s) => s.pasteLayers);
  const project = useProjectStore((s) => s.project);
  const openTileset = useProjectStore((s) => getCurrentZone(s)?.tileset);
  return pasting && clipboard
    ? pasteLayerOffer(clipboard, pasteFit(clipboard, openTileset, project), pasteLayers)
    : null;
}
