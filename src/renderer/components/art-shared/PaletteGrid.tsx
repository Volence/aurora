import React from 'react';
import { T } from '../ui';
import GenesisColorSliders from './GenesisColorSliders';
import {
  swatchClick,
  swatchCss,
  swatchState,
  type PaletteGridPort,
  type SwatchRef,
  type SwatchState,
} from './palette-grid-model';

/**
 * THE ONE Genesis swatch grid — 4 lines x 16 colours, an edit selection, and the
 * shared R/G/B sliders over it. Mounted on four screens (classic's Art column and
 * Palette facet, aeon's Art column and Palette facet) plus the sprite pane, from
 * two hosts: components/classic/ClassicPalettePanel and components/art/PaletteEditor.
 *
 * IT IMPORTS NO STORE AND NO COMMAND, for the same reason shared/ObjectList does
 * not (aeon's executeCommand throws when the focused document is not aeon, so a
 * direct import here would hard-crash classic on the first click) and for one
 * more of its own: `classicSetPalette` is a CLASSIC EDITING COMMAND, and every
 * file that names one has to claim a classic surface for undo routing
 * (classic/__tests__/classic-surface.test.ts). A shared file has no engine of its
 * own to claim for, so the command — and the claim, via `port.rootProps` — stay
 * in providers/palette-classic.ts.
 *
 * Everything the two engines disagree about arrives as DATA on the port: which
 * lines are locked, what index 0 does when clicked, what the tooltip and the
 * heading say, whether there is a gutter label, and what a preview and a commit
 * mean. See palette-grid-model.ts.
 */
export default function PaletteGrid({ port, shell }: {
  port: PaletteGridPort;
  /** Aeon's decoration — see PaletteGridShell. Classic passes nothing. */
  shell?: PaletteGridShell;
}): React.ReactElement {
  // The EDIT selection: the swatch whose sliders (or note) are open. Local to the
  // grid in both engines — the PAINT selection is the engine's and lives on the
  // port (`paintSel`).
  const [sel, setSel] = React.useState<SwatchRef | null>(null);
  // The live-preview word for the open swatch during a slider drag, or null for
  // "read the committed value". This IS classic's whole preview (nothing is
  // written until release); under aeon the preview also mutates the document, so
  // the draft and the committed word simply agree.
  const [draft, setDraft] = React.useState<number | null>(null);

  const committed = sel ? port.lines[sel.line]?.[sel.idx] ?? 0 : 0;
  // Resync on a selection change or on an external write (undo/redo, an MCP edit,
  // the command the release just ran), so the sliders never show a stale draft.
  React.useEffect(() => { setDraft(null); }, [sel?.line, sel?.idx, committed]);

  /**
   * THE TEARDOWN GUARANTEE, and the reason it is shaped exactly like this.
   *
   * An engine that previews by MUTATING the open document (aeon) owes that
   * mutation an ending, and Chrome does not fire `blur` when a focused element is
   * REMOVED from the DOM — so a drag ended by the app rather than by the user
   * leaves the document changed with no undo entry and the dirty flag unset, a
   * state no user action can reach or recover (core/art/palette-drag.ts).
   *
   * Keyed on the OPEN SWATCH, not `[]`: `[]` deps only fire on unmount, which
   * misses both in-place endings — the selection moving to another swatch, and
   * the selection CLOSING (the `setSel(null)` below, which a click on a
   * non-editable swatch takes).
   *
   * Through a REF, not the captured `port.drain`: the effect cleanup would
   * otherwise run whichever drain the render that armed it happened to see, and
   * by teardown time the port may have rebuilt.
   */
  const drainRef = React.useRef(port.drain);
  drainRef.current = port.drain;
  const openKey = sel ? `${sel.line}:${sel.idx}` : null;
  React.useEffect(() => () => { drainRef.current(); }, [openKey]);

  /**
   * The click rule is `swatchClick`'s, not this component's. A click that may do
   * NEITHER thing (a locked line) is fully inert — it must not close an editor
   * open elsewhere. A click that selects but may not edit (aeon's index-0 eraser)
   * binds the brush and CLOSES the sliders, because leaving them open over a
   * swatch the user just navigated away from is what makes a stranded drag
   * possible in the first place.
   */
  function clickSwatch(line: number, idx: number): void {
    const act = swatchClick(line, idx, port.policy);
    if (!act.select && !act.edit) return;
    if (act.select) port.select(line, idx);
    setSel(act.edit ? { line, idx } : null);
  }

  const note = sel && port.note ? port.note(sel.line, sel.idx) : null;
  const previewWord = draft ?? committed;

  return (
    // rootProps first: a port contributes BEHAVIOUR (classic's facet claim), not
    // layout, and must not be able to override the grid's own styling.
    <div {...port.rootProps} style={styles.root}>
      <div style={styles.grid}>
        {port.lines.map((words, li) => (
          <div key={li} style={styles.row}>
            {port.lineLabel && <span style={styles.lineLabel}>{port.lineLabel(li)}</span>}
            {shell?.renderLineGrip?.(li, port.policy.lockedLines.includes(li))}
            {words.map((word, ci) => {
              const state = swatchState(li, ci, port.policy, { edit: sel, paint: port.paintSel });
              const shown = state.editSelected ? previewWord : word;
              const { style: shellStyle, ...shellProps } = shell?.swatchProps?.(li, ci, state) ?? {};
              return (
                <button
                  key={ci}
                  type="button"
                  title={port.title(li, ci)}
                  {...shellProps}
                  onClick={() => clickSwatch(li, ci)}
                  style={{
                    ...styles.swatch,
                    ...(state.transparent ? styles.checker : { background: swatchCss(shown) }),
                    ...(state.locked ? styles.locked : {}),
                    ...(state.paintSelected ? styles.paintSel : {}),
                    ...(state.editSelected ? styles.editSel : {}),
                    ...shellStyle,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {sel && (note !== null ? (
        <div style={styles.note}>{note}</div>
      ) : (
        <GenesisColorSliders
          word={previewWord}
          heading={port.heading(sel.line, sel.idx)}
          onChange={(w) => { setDraft(w); port.preview(sel.line, sel.idx, w); }}
          onCommit={(w) => port.commit(sel.line, sel.idx, w)}
        />
      ))}

      {port.hint && <div style={styles.hint}>{port.hint}</div>}
      {shell?.overlay}
    </div>
  );
}

/**
 * The host's own decoration, threaded through as render props so it stays in the
 * host's file.
 *
 * Aeon's palette editor has drag-and-drop copy grips and a right-click "Copy to ▸"
 * menu, both of which speak in aeon's `Color` objects, aeon's zone lines and
 * aeon's sprite documents. None of that belongs in art-shared/ — it is not a
 * thing classic has a version of — so the grid renders the SHAPE (a gutter cell
 * per row, extra props per swatch, an overlay after the panel) and aeon fills it.
 */
export interface PaletteGridShell {
  /** A cell at the head of each row — aeon's line drag grip. */
  renderLineGrip?(line: number, locked: boolean): React.ReactNode;
  /** Extra props spread on one swatch (DnD handlers, a context menu, a drop
   *  outline via `style`). Applied BEFORE the grid's own `onClick`, so the click
   *  rule cannot be overridden; `style` is applied last, so a drop highlight can
   *  sit over the selection outlines. */
  swatchProps?(line: number, idx: number, state: SwatchState): PaletteSwatchProps;
  /** Rendered after the grid and the sliders — aeon's floating copy menu. */
  overlay?: React.ReactNode;
}

export type PaletteSwatchProps = React.HTMLAttributes<HTMLElement> & {
  draggable?: boolean;
  style?: React.CSSProperties;
};

// No `overflow: auto` anywhere below, and this is a rule rather than an
// oversight: all four mounts are `content` sections, which give a scroller no
// height to shrink into (components/__tests__/panel-scrollers.test.ts). The dead
// space under aeon's palette editor is a column-layout question, not this
// component's to solve with a nested scrollbar.
const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 6, padding: 8, flexShrink: 0 },
  grid: { display: 'flex', flexDirection: 'column', gap: 2 },
  row: { display: 'flex', gap: 2, alignItems: 'stretch' },
  lineLabel: {
    fontSize: T.t2xs, color: T.textLo, width: 10, fontFamily: T.fontMono,
    flexShrink: 0, alignSelf: 'center',
  },
  // `flex: 1 1 0` over a fixed width: the four columns this renders in are
  // between ~230px and ~320px wide, so the row divides whatever it is given.
  swatch: {
    width: 16, height: 16, minWidth: 0, flex: '1 1 0', padding: 0,
    borderWidth: 1, borderStyle: 'solid', borderColor: T.border, borderRadius: 2,
    cursor: 'pointer', boxSizing: 'border-box',
  },
  checker: {
    background: `repeating-conic-gradient(${T.textLo} 0% 25%, ${T.borderStrong} 0% 50%) 0 0 / 8px 8px`,
  },
  locked: { opacity: 0.35, cursor: 'not-allowed' },
  paintSel: { outline: `2px solid ${T.accent}`, outlineOffset: -1 },
  editSel: { borderWidth: 2, borderColor: T.textHi },
  note: { fontSize: T.t2xs, color: T.textLo, padding: '4px 2px' },
  hint: { fontSize: T.t2xs, color: T.textFaint },
};
