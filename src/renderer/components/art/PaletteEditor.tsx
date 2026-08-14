import React, { useState } from 'react';
import { useProjectStore, getCurrentZone, getActiveLevel, getCurrentAct } from '../../state/projectStore';
import { executeAmbientCommand } from '../../state/editorStore';
import { useSpriteStore } from '../../state/spriteStore';
import { encodeGenesisColor } from '../../../core/formats/palette';
import { copySwatchInto, copyLineInto } from '../../../core/art/palette-copy';
import { paletteLineUsageCounts } from '../../../core/art/usage';
import type { Color } from '../../../core/model/s4-types';
import { T } from '../ui';
import PaletteGrid, { type PaletteGridShell, type PaletteSwatchProps } from '../art-shared/PaletteGrid';
import { useAeonPaletteGridPort } from '../../providers/palette-aeon';
import PaletteCopyMenu, { type CopyMenuItem } from './PaletteCopyMenu';

/** Source carried by an in-progress swatch/line drag (HTML5 DnD; payload in a
 *  module ref, mirroring SectionGridNav — no dataTransfer). */
type DragPayload = { kind: 'swatch'; color: Color } | { kind: 'line'; colors: Color[] };
let dragPayload: DragPayload | null = null;

function sameColors(a: Color[], b: Color[]): boolean {
  return a.length === b.length && a.every((c, i) =>
    encodeGenesisColor(c) === encodeGenesisColor(b[i]) && c.a === b[i].a);
}

/**
 * Aeon's palette editor: the SHARED swatch grid (art-shared/PaletteGrid) plus the
 * two things that are aeon's alone — drag-and-drop copy grips and the right-click
 * "Copy to ▸" menu.
 *
 * The grid, the selection, the sliders and the whole preview/commit/teardown path
 * are no longer here: they are the component classic renders too, driven by
 * providers/palette-aeon.ts. That port covers all three of this editor's context
 * modes, because the differences between them are exactly the two things a port
 * already carries — the policy and the commit path:
 *
 *  1. Art / Palette facet   — the 4 zone lines; line 0 is sprite-reserved (locked).
 *  2. Sprite pane, zone     — the same 4 lines with line 0 UNLOCKED, and a click
 *                             binding the sprite's zoneLine.
 *  3. Sprite pane, standalone — ONE row of the sprite doc's 16 private colours,
 *                             committed to the sprite's own undo stack. The port
 *                             models it as a one-line grid, so nothing here or in
 *                             the grid special-cases it.
 *
 * WHAT STAYS IS WHAT IS AEON-SHAPED. The copy machinery speaks in aeon `Color`
 * objects, aeon zone lines and aeon sprite documents; classic has no version of
 * it, so it does not belong in art-shared/. It reaches the swatches as render
 * props (PaletteGridShell) instead of moving.
 */
export default function PaletteEditor({ context }: { context?: 'sprite' }): React.ReactElement | null {
  // The port subscribes both repaint clocks (artStore.paletteVersion for the live
  // preview, the history hub for undo/redo) as well as the project, so this file
  // re-renders with the grid and needs no subscription of its own beyond the
  // sprite state its copy menu reads.
  const port = useAeonPaletteGridPort({ context });
  const spriteMode = useSpriteStore((s) => s.paletteMode);
  const standalone = useSpriteStore((s) => s.standalonePalette);
  const inSprite = context === 'sprite';
  const standaloneSprite = inSprite && spriteMode === 'standalone';

  const [menu, setMenu] = useState<{ x: number; y: number; heading: string; items: CopyMenuItem[] } | null>(null);
  // Highlighted drop target during a drag: `${kind}:${line}:${idx}`.
  const [dropKey, setDropKey] = useState<string | null>(null);

  const project = useProjectStore((s) => s.project);
  const zone = getCurrentZone(useProjectStore.getState());
  // Standalone mode reads the sprite's private palette, not the zone — so it
  // renders without a zone. Every other path needs the zone's palette lines.
  const lines = zone ? zone.palette.lines : [];

  /** Copy a single color into a zone line index, via the undoable set-palette-line command. */
  function applyZoneSwatchCopy(line: number, idx: number, src: Color): void {
    if (idx <= 0) return;
    const state = useProjectStore.getState();
    const z = getCurrentZone(state);
    const level = getActiveLevel(state);
    if (!z || !level) return;
    const old = z.palette.lines[line].colors.map((c) => ({ ...c }));
    const edited = copySwatchInto(old, idx, src);
    if (sameColors(edited, old)) return;
    executeAmbientCommand({
      type: 'set-palette-line', line, oldColors: old, newColors: edited,
      sectionIndex: -1, description: `copy color into line ${line} idx ${idx}`,
    }, level);
  }

  /** Copy 16 colors (1-15) into a zone line, via set-palette-line.
   *
   *  AMBIENT, not focused, here and above: the "Copy to ▸ Zone line N" bridge
   *  writes zone CRAM from inside the SPRITE pane, where focus is the sprite
   *  document — which owns no aeon command history, so routing by focus threw
   *  inside the event handler. */
  function applyZoneLineCopy(line: number, src: Color[]): void {
    const state = useProjectStore.getState();
    const z = getCurrentZone(state);
    const level = getActiveLevel(state);
    if (!z || !level) return;
    const old = z.palette.lines[line].colors.map((c) => ({ ...c }));
    const edited = copyLineInto(old, src);
    if (sameColors(edited, old)) return;
    executeAmbientCommand({
      type: 'set-palette-line', line, oldColors: old, newColors: edited,
      sectionIndex: -1, description: `copy palette line into ${line}`,
    }, level);
  }

  /** Copy a single color into the standalone palette, via setStandalonePalette (sprite undo). */
  function applyStandaloneSwatchCopy(idx: number, src: Color): void {
    if (idx <= 0) return;
    const cur = useSpriteStore.getState().standalonePalette;
    const edited = copySwatchInto(cur, idx, src);
    if (sameColors(edited, cur)) return;
    useSpriteStore.getState().setStandalonePalette(edited);
  }

  /** Copy 16 colors into the standalone palette. */
  function applyStandaloneLineCopy(src: Color[]): void {
    const cur = useSpriteStore.getState().standalonePalette;
    const edited = copyLineInto(cur, src);
    if (sameColors(edited, cur)) return;
    useSpriteStore.getState().setStandalonePalette(edited);
  }

  /** Usage note for a zone line: line 0 always shared; 1-3 show tile counts.
   *  Takes precomputed counts so a menu open scans the act's nametables once. */
  function zoneLineNote(line: number, counts: Map<number, number>): string | undefined {
    if (line === 0) return 'player';
    const uses = counts.get(line) ?? 0;
    return uses > 0 ? `${uses.toLocaleString()} tiles` : undefined;
  }

  /** Per-line tile usage for the active act (one nametable scan) — for menu notes. */
  function actLineCounts(): Map<number, number> {
    const act = getCurrentAct(useProjectStore.getState());
    return act ? paletteLineUsageCounts(act) : new Map<number, number>();
  }

  /** A zone line is off-limits as a copy participant when it is the Art-mode
   *  sprite-reserved line 0 — the same rule the port's policy states per swatch,
   *  so the copy bridge cannot overwrite the player palette outside sprite mode. */
  function zoneLineLocked(line: number): boolean {
    return line === 0 && !inSprite;
  }

  /** Build "Copy to ▸" targets for a single swatch (index-preserving). `srcLine`
   *  is the source zone line, or -1 when the source is the standalone palette.
   *  The standalone palette is a target only in sprite mode. */
  function swatchMenuItems(srcLine: number, idx: number, src: Color): CopyMenuItem[] {
    const items: CopyMenuItem[] = [];
    const counts = actLineCounts();
    for (let l = 0; l < lines.length; l++) {
      if (l === srcLine || zoneLineLocked(l)) continue; // skip source + locked line 0
      items.push({ label: `Zone line ${l} · idx ${idx}`, note: zoneLineNote(l, counts), onSelect: () => applyZoneSwatchCopy(l, idx, src) });
    }
    if (inSprite && srcLine !== -1) {
      items.push({ label: `Standalone · idx ${idx}`, onSelect: () => applyStandaloneSwatchCopy(idx, src) });
    }
    return items;
  }

  /** Build "Copy to ▸" targets for a whole line. */
  function lineMenuItems(srcLine: number, src: Color[]): CopyMenuItem[] {
    const items: CopyMenuItem[] = [];
    const counts = actLineCounts();
    for (let l = 0; l < lines.length; l++) {
      if (l === srcLine || zoneLineLocked(l)) continue;
      items.push({ label: `Zone line ${l}`, note: zoneLineNote(l, counts), onSelect: () => applyZoneLineCopy(l, src) });
    }
    if (inSprite && srcLine !== -1) {
      items.push({ label: 'Standalone', onSelect: () => applyStandaloneLineCopy(src) });
    }
    return items;
  }

  function openSwatchMenu(e: React.MouseEvent, srcLine: number, idx: number, src: Color): void {
    e.preventDefault(); // suppress the native menu even on a non-source (idx 0) swatch
    if (idx <= 0) return; // transparent backdrop isn't a copy source
    setMenu({ x: e.clientX, y: e.clientY, heading: 'Copy color to', items: swatchMenuItems(srcLine, idx, src) });
  }
  function openLineMenu(e: React.MouseEvent, srcLine: number, src: Color[]): void {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, heading: 'Copy line to', items: lineMenuItems(srcLine, src) });
  }

  function onSwatchDragStart(color: Color): void { dragPayload = { kind: 'swatch', color }; }
  function onLineDragStart(colors: Color[]): void { dragPayload = { kind: 'line', colors: colors.map((c) => ({ ...c })) }; }
  function onSwatchDragOver(e: React.DragEvent, key: string, idx: number, locked: boolean): void {
    if (dragPayload?.kind !== 'swatch' || idx <= 0 || locked) return;
    e.preventDefault();
    if (dropKey !== key) setDropKey(key);
  }
  function onLineDragOver(e: React.DragEvent, key: string, locked = false): void {
    if (dragPayload?.kind !== 'line' || locked) return;
    e.preventDefault();
    if (dropKey !== key) setDropKey(key);
  }
  function endDrag(): void { dragPayload = null; setDropKey(null); }
  /** Drop a swatch onto a target. `destLine` is the zone line, or -1 for standalone.
   *  `locked` (Art-mode line 0) rejects the drop so the player palette is safe. */
  function onSwatchDrop(destLine: number, idx: number, locked: boolean): void {
    const p = dragPayload;
    endDrag();
    if (p?.kind !== 'swatch' || idx <= 0 || locked) return;
    if (destLine === -1) applyStandaloneSwatchCopy(idx, p.color);
    else applyZoneSwatchCopy(destLine, idx, p.color);
  }
  function onLineDrop(destLine: number, locked = false): void {
    const p = dragPayload;
    endDrag();
    if (p?.kind !== 'line' || locked) return;
    if (destLine === -1) applyStandaloneLineCopy(p.colors);
    else applyZoneLineCopy(destLine, p.colors);
  }

  /** The colours behind row `li` — the sprite's private palette in standalone
   *  mode, the zone line otherwise. The grid renders CRAM words; the copy paths
   *  need the `Color` objects they came from. */
  function rowColors(li: number): Color[] {
    return standaloneSprite ? standalone : (lines[li]?.colors ?? []);
  }
  /** The copy machinery's name for a row: -1 means "the standalone palette". */
  const srcLine = (li: number): number => (standaloneSprite ? -1 : li);
  const keyPrefix = standaloneSprite ? 'sa' : 'z';

  /**
   * Aeon's decoration, handed to the shared grid rather than moved into it: a
   * drag grip per row, DnD + context-menu props per swatch, and the floating copy
   * menu. Classic passes no shell at all.
   */
  const shell: PaletteGridShell = {
    renderLineGrip: (li, locked) => (
      <div
        key="grip"
        style={{ ...styles.grip, ...(locked ? styles.locked : {}), ...(dropKey === `${keyPrefix}-line:${li}` ? styles.dropTarget : {}) }}
        title={locked
          ? 'sprite-reserved (line 0)'
          : standaloneSprite
            ? 'Drag to copy this palette · right-click to copy to a zone line'
            : `Drag to copy line ${li} · right-click to copy elsewhere`}
        draggable={!locked}
        onDragStart={() => onLineDragStart(rowColors(li))}
        onDragOver={(e) => onLineDragOver(e, `${keyPrefix}-line:${li}`, locked)}
        onDrop={() => onLineDrop(srcLine(li), locked)}
        onDragEnd={endDrag}
        onContextMenu={(e) => { e.preventDefault(); if (!locked) openLineMenu(e, srcLine(li), rowColors(li)); }}
      />
    ),
    swatchProps: (li, ci, state): PaletteSwatchProps => {
      const color = rowColors(li)[ci];
      const key = `${keyPrefix}:${li}:${ci}`;
      return {
        draggable: ci > 0 && !state.locked,
        onDragStart: () => { if (color) onSwatchDragStart(color); },
        onDragOver: (e) => onSwatchDragOver(e, key, ci, state.locked),
        onDrop: () => onSwatchDrop(srcLine(li), ci, state.locked),
        onDragEnd: endDrag,
        onContextMenu: (e) => {
          if (state.locked || !color) { e.preventDefault(); return; }
          openSwatchMenu(e, srcLine(li), ci, color);
        },
        style: dropKey === key ? styles.dropTarget : undefined,
      };
    },
    overlay: menu ? (
      <PaletteCopyMenu
        x={menu.x} y={menu.y} heading={menu.heading} items={menu.items}
        onClose={() => setMenu(null)}
      />
    ) : null,
  };

  if (!project) return null;
  if (!standaloneSprite && !zone) return null;

  // KEYED ON THE MODE. A standalone selection (line 0 of a flat 16-colour
  // palette) must not leak into the zone render, where line 0 is the zone's first
  // line — and the remount is also what makes the grid's drain effect run on a
  // palette-mode flip, which is one of the ways a slider drag gets ended by the
  // app rather than by the user.
  return <PaletteGrid key={keyPrefix} port={port} shell={shell} />;
}

const styles: Record<string, React.CSSProperties> = {
  grip: {
    width: 6,
    alignSelf: 'stretch',
    minHeight: 16,
    borderRadius: 2,
    background: T.borderStrong,
    cursor: 'grab',
    flex: '0 0 auto',
  },
  dropTarget: {
    outline: `2px solid ${T.accent}`,
    outlineOffset: -1,
  },
  locked: {
    opacity: 0.35,
    cursor: 'not-allowed',
  },
  // No swatch, grid or slider-panel styles here: the grid is PaletteGrid and the
  // sliders are GenesisColorSliders, which own theirs. A second copy of them is
  // what made the two palette panels drift in the first place.
};
