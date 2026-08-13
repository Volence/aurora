import React, { useState, useEffect } from 'react';
import { T } from '../ui';
import { useClassicLevelStore, classicSetPalette } from '../../state/classicLevelStore';
import { useToastStore } from '../../state/toastStore';
import { decodeGenesisColor } from '../../../core/formats/palette';
import GenesisColorSliders from '../art-shared/GenesisColorSliders';
import { COMPOSER_SWATCH_A, COMPOSER_SWATCH_B } from '../../canvas/canvas-colors';
import { classicSurfaceProps } from './classic-surface';

// The classic (Sonic 1) palette panel (Task B4): a 4×16 swatch grid over the open
// act's four CRAM lines. Clicking an editable swatch (index 1-15) opens the shared
// Genesis color-picker control; a channel release commits ONE classicSetPalette
// for that line, which bumps chunkEpoch — so the viewport chunk art, the object
// sprites, and every composer thumbnail refresh live off the single command.
//
// Index 0 of every line is transparent (like the tile-composer color row): shown
// as a checker, selectable to read but not editable.

const hex2 = (n: number) => '$' + n.toString(16).toUpperCase().padStart(2, '0');

export default function ClassicPalettePanel() {
  // Subscribe to `doc` (identity churns on every command incl. undo/redo) so the
  // swatches repaint from the committed palette after any edit.
  const doc = useClassicLevelStore((s) => s.doc);
  const [sel, setSel] = useState<{ line: number; idx: number } | null>(null);
  // Live preview word for the selected swatch during a slider drag (no history);
  // null means "read the committed value". Reset whenever the selection or the
  // committed color changes so the picker never shows a stale draft.
  const [draft, setDraft] = useState<number | null>(null);

  const committedWord = sel ? doc?.palettes[sel.line]?.[sel.idx] ?? 0 : 0;
  // Resync the draft to the committed value on selection change or an external
  // doc change (undo/redo, MCP edit). Keyed on the committed word so a fresh
  // command result clears the just-previewed draft.
  useEffect(() => { setDraft(null); }, [sel?.line, sel?.idx, committedWord]);

  if (!doc) return null;

  const previewWord = draft ?? committedWord;

  function selectSwatch(line: number, idx: number) {
    setSel({ line, idx });
  }

  function commitColor(word: number) {
    if (!sel || !doc) return;
    const line = doc.palettes[sel.line] ?? new Uint16Array(16);
    const next = new Uint16Array(line);
    next[sel.idx] = word & 0xffff;
    const res = classicSetPalette(sel.line, next);
    if (!res.ok) useToastStore.getState().addToast(`Palette edit failed: ${res.error}`, 'error');
  }

  return (
    // Palette edits belong to the ZONE-ART document, so working here claims the
    // art facet for undo routing (see classic-surface.ts).
    <div {...classicSurfaceProps('art')} style={styles.body}>
      <div style={styles.grid}>
        {doc.palettes.map((line, li) => (
          <div key={li} style={styles.row}>
            <span style={styles.lineLabel}>{li}</span>
            {Array.from({ length: 16 }, (_, ci) => {
              const word = li === (sel?.line ?? -1) && ci === (sel?.idx ?? -1) ? previewWord : (line[ci] ?? 0);
              const transparent = ci === 0;
              const c = decodeGenesisColor(word);
              const selected = sel?.line === li && sel?.idx === ci;
              return (
                <button
                  key={ci}
                  onClick={() => selectSwatch(li, ci)}
                  title={transparent ? 'index 0 — transparent' : `line ${li}, index ${ci}`}
                  style={{
                    ...styles.swatch,
                    background: transparent ? undefined : `rgb(${c.r},${c.g},${c.b})`,
                    backgroundImage: transparent
                      ? `linear-gradient(45deg,${COMPOSER_SWATCH_A} 25%,transparent 25%,transparent 75%,${COMPOSER_SWATCH_A} 75%),linear-gradient(45deg,${COMPOSER_SWATCH_A} 25%,${COMPOSER_SWATCH_B} 25%,${COMPOSER_SWATCH_B} 75%,${COMPOSER_SWATCH_A} 75%)`
                      : undefined,
                    backgroundSize: transparent ? '6px 6px' : undefined,
                    backgroundPosition: transparent ? '0 0,3px 3px' : undefined,
                    ...(selected ? styles.swatchSel : {}),
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      {sel && (
        sel.idx === 0 ? (
          <div style={styles.note}>Line {sel.line} · index 0 is transparent — not editable.</div>
        ) : (
          <GenesisColorSliders
            word={previewWord}
            heading={`Line ${sel.line} · Index ${sel.idx}`}
            onChange={(w) => setDraft(w)}
            onCommit={commitColor}
          />
        )
      )}
      <div style={styles.hint}>click a swatch to edit · line 0 index 0 = transparent</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: { display: 'flex', flexDirection: 'column', gap: 6, padding: 8 },
  grid: { display: 'flex', flexDirection: 'column', gap: 2 },
  row: { display: 'flex', gap: 2, alignItems: 'center' },
  lineLabel: { fontSize: 10, color: T.textLo, width: 10, fontFamily: T.fontMono, flexShrink: 0 },
  swatch: {
    width: 13, height: 16, minWidth: 0, flex: '1 1 0', padding: 0,
    border: `1px solid ${T.border}`, borderRadius: 2, cursor: 'pointer', boxSizing: 'border-box',
  },
  swatchSel: { outline: `2px solid ${T.accent}`, outlineOffset: -1, borderColor: T.accent },
  note: { fontSize: 10, color: T.textLo, padding: '4px 2px' },
  hint: { fontSize: 9, color: T.textFaint },
};
