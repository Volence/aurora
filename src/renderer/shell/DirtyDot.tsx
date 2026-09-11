// src/renderer/shell/DirtyDot.tsx
// The emerald "unsaved" dot, ONE definition for every place that shows it: the
// tab strip, and the Explorer's level rows and group headers. It used to be an
// inline span in TabStrip.tsx, which was fine while the tab was the only place
// the app said "unsaved". It no longer is (census B-F3, see TabStrip.tsx), and
// two copies of a state marker are how one of them drifts out of the vocabulary.

import React from 'react';
import { T } from '../components/ui';

/**
 * The dot's two texts, exported so a test can assert the RENDERED name against
 * the one definition rather than against a copy of the string.
 * `DIRTY_DOT_TITLE` is what a pointer user hovers on a TAB; `DIRTY_DOT_LABEL`
 * is the accessible name, and it is deliberately the state alone: a screen
 * reader announces a label, and "Ctrl+S to save" read out as part of an
 * element's NAME is instruction where a name belongs.
 */
export const DIRTY_DOT_LABEL = 'Unsaved changes';
export const DIRTY_DOT_TITLE = 'Unsaved changes. Ctrl+S to save';

/**
 * The hover text for the dot in the EXPLORER, which is not the tab's. The tab's
 * remedy ("Ctrl+S to save") is true on the tab, where Ctrl+S saves that tab's
 * document. In the Explorer it is false in exactly the case this dot exists for:
 * the level's tab is closed, so the active tab is some other one and Ctrl+S
 * saves THAT (or, on Home, nothing). Ctrl+Shift+S is the gesture that reaches a
 * document with no tab, and the qualifier is the one the Ctrl+S toast already
 * uses (dirty-tabs.ts `unsavedElsewhereMessage`), because not every unsaved
 * document has a file to write to.
 */
export const EXPLORER_DIRTY_DOT_TITLE = 'Unsaved changes. Ctrl+Shift+S saves everything that has somewhere to go';

/**
 * `role="img"` + `aria-label` is the minimum that gives the dot a name in the
 * accessibility tree; a bare span with only a `title` is walked past by a
 * screen reader and reads as decoration to a DOM scan (packet
 * docs/reviews/2026-09-09-save-contract.md, receipt R3). The `title` stays
 * because it is what a pointer user gets and it names the remedy.
 */
export function DirtyDot({ title }: { title: string }): React.ReactElement {
  return <span style={dotStyle} role="img" aria-label={DIRTY_DOT_LABEL} title={title} />;
}

const dotStyle: React.CSSProperties = {
  width: 6, height: 6, borderRadius: '50%', background: T.accent, flexShrink: 0,
};
