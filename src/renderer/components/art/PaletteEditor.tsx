import React, { useEffect, useRef, useState } from 'react';
import { useProjectStore, getCurrentZone, getActiveLevel, getCurrentAct } from '../../state/projectStore';
import { executeAmbientCommand } from '../../state/editorStore';
import { useHistoryVersion } from '../../hooks/useHistoryVersion';
import { useArtStore } from '../../state/artStore';
import { useSpriteStore, patchSpriteDoc } from '../../state/spriteStore';
import { encodeGenesisColor, decodeGenesisColor, fmtGenesisWord } from '../../../core/formats/palette';
import { copySwatchInto, copyLineInto } from '../../../core/art/palette-copy';
import { resolvePaletteDragEnd } from '../../../core/art/palette-drag';
import { paletteLineUsageCounts } from '../../../core/art/usage';
import type { Color, Zone } from '../../../core/model/s4-types';
import { T } from '../ui';
import GenesisColorSliders from '../art-shared/GenesisColorSliders';
import PaletteCopyMenu, { type CopyMenuItem } from './PaletteCopyMenu';

interface SwatchSel {
  line: number;
  idx: number;
}

/** Source carried by an in-progress swatch/line drag (HTML5 DnD; payload in a
 *  module ref, mirroring SectionGridNav — no dataTransfer). */
type DragPayload = { kind: 'swatch'; color: Color } | { kind: 'line'; colors: Color[] };
let dragPayload: DragPayload | null = null;

function sameColors(a: Color[], b: Color[]): boolean {
  return a.length === b.length && a.every((c, i) =>
    encodeGenesisColor(c) === encodeGenesisColor(b[i]) && c.a === b[i].a);
}

/**
 * Genesis palette editor: 4 rows × 16 swatches over zone.palette. The grid
 * doubles as the painting color picker (artStore.selectedColor/paletteLine).
 *
 * Render is context-aware (three modes):
 *  1. Art mode — the 4 zone lines; line 0 is sprite-reserved (locked).
 *  2. Sprite + zone palette — the 4 zone lines, but line 0 (the player palette)
 *     is EDITABLE; the paint-selection outline tracks the sprite's bound line
 *     (spriteStore.zoneLine), and clicking a swatch binds that sprite line.
 *  3. Sprite + standalone palette — a single row of the sprite's 16 private
 *     colors; slider edits commit via setStandalonePalette (one undo step/drag).
 *
 * Index 0 of every line is transparent (locked for editing but clickable as the
 * eraser-equivalent paint color).
 *
 * The `context` prop selects sprite behavior (mode 2/3 above) — the sprite-doc
 * SpriteMode pane passes `context="sprite"`; the Art and Palette facets pass
 * nothing (zone-line editing, mode 1). Mount invariant: PaletteEditor only
 * renders in the Art/Palette facets and the sprite editor.
 *
 * The channel sliders are the SHARED GenesisColorSliders — the same control
 * classic's ClassicPalettePanel renders. This file used to inline a second copy
 * of it (its own to3, word formatter, channel table and six styles) because the
 * shared one deliberately does not blur on commit; the guard that made blurring
 * necessary is gone, and both surviving level-side undo bindings (LevelWorkspace
 * via isTypingTarget, and SpriteMode's own keydown) exempt type:'range'.
 */
export default function PaletteEditor({ context }: { context?: 'sprite' }) {
  // Subscribe to paletteVersion for live-preview repaint during slider drags.
  // The history clock re-renders swatches after undo/redo restores colors and
  // after committed commands, for the zone AND the sprite palettes alike — both
  // documents' stacks report through the same hub.
  useArtStore((s) => s.paletteVersion);
  useHistoryVersion();
  const project = useProjectStore((s) => s.project);
  const zone = getCurrentZone(useProjectStore.getState());
  const paintColor = useArtStore((s) => s.selectedColor);
  const paintLine = useArtStore((s) => s.paletteLine);

  const spriteMode = useSpriteStore((s) => s.paletteMode);
  const spriteZoneLine = useSpriteStore((s) => s.zoneLine);
  const standalone = useSpriteStore((s) => s.standalonePalette);
  const inSprite = context === 'sprite';

  const [sel, setSel] = useState<SwatchSel | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; heading: string; items: CopyMenuItem[] } | null>(null);
  // Highlighted drop target during a drag: `${kind}:${line}:${idx}`.
  const [dropKey, setDropKey] = useState<string | null>(null);
  // Pre-drag deep copy of the edited line so the committed undo snapshot is
  // the true pre-drag state (live preview mutates the palette in place). It
  // carries the ZONE OBJECT it was taken from, not just the line index: a drag
  // that ends after the act/zone switched must restore the line it actually
  // mutated, never whatever line N of the newly-current zone happens to be.
  const preDragRef = useRef<{ zone: Zone; line: number; idx: number; colors: Color[] } | null>(null);
  // Separate pre-drag copy for the standalone path (keyed to no zone line — the
  // standalone palette is a flat 16-color array on the sprite store, not the
  // zone). Kept distinct from preDragRef so the two commit paths never collide.
  // Carries the sprite doc id for the same reason preDragRef carries the zone.
  const preDragStandaloneRef = useRef<{ docId: string; colors: Color[] } | null>(null);

  const standaloneSprite = inSprite && spriteMode === 'standalone';
  // The open swatch selection (sel) is per-context: a standalone sel (line 0,
  // flat palette) must not leak into the zone/Art render, where line 0 means
  // the zone's first line. Reset it whenever the render context flips so the
  // slider panel and edit highlight never target the wrong palette.
  useEffect(() => { setSel(null); }, [standaloneSprite]);

  /**
   * EVERY WAY A DRAG CAN END, including the ones the DOM never announces.
   *
   * The sliders commit on pointerup/keyup/blur, and that covers a drag the user
   * finishes. It does NOT cover a drag the app ends for them: Chrome does not
   * fire `blur` when a focused element is REMOVED from the DOM, so unmounting the
   * slider panel mid-drag used to strand the preview mutation — the palette kept
   * the change with no undo entry and no dirty flag, unreachable by any user
   * action. There are three such removals and this one effect catches all of
   * them, because all three change `panelKey` or unmount the editor: the swatch
   * selection closing (the setSel(null) directly above, on a sprite palette-mode
   * flip), the selection moving to another swatch, and a facet/act/tab change
   * taking the whole editor away.
   *
   * It drains BOTH paths unconditionally rather than picking by the current mode:
   * at cleanup time `standaloneSprite` may already have flipped to the value that
   * unmounted the panel, so choosing by it would run the wrong ender. Each is a
   * no-op with no snapshot outstanding, and only one is ever outstanding.
   *
   * This cannot double-commit a normal release: the first ender clears its
   * snapshot, so the blur that follows a pointerup — and this teardown after it —
   * both take the 'noop' branch.
   */
  const drainRef = useRef<() => void>(() => {});
  drainRef.current = () => { endZoneDrag(); endStandaloneDrag(); };
  const panelKey = sel ? `${standaloneSprite ? 'sa' : 'z'}:${sel.line}:${sel.idx}` : null;
  useEffect(() => () => { drainRef.current(); }, [panelKey]);

  // Standalone mode reads the sprite's private palette, not the zone — so it
  // renders without a zone. Every other path needs the zone's palette lines.
  if (!project) return null;
  if (!standaloneSprite && !zone) return null;
  const lines = zone ? zone.palette.lines : [];

  function handleSwatchClick(line: number, idx: number) {
    // Art mode: line 0 is sprite-reserved. Sprite mode: line 0 is the editable
    // player palette, so don't early-return on it.
    if (line === 0 && !inSprite) return;
    // Any clickable swatch sets the paint color (index 0 = eraser-equivalent)…
    useArtStore.getState().setSelectedColor(idx);
    if (inSprite) {
      // Bind the SPRITE's zone line (not artStore's paint line) so the canvas
      // colors against the chosen line; the highlight tracks spriteZoneLine.
      useSpriteStore.getState().setZoneLine(line);
    } else {
      useArtStore.getState().setPaletteLine(line);
    }
    // …but only editable swatches (indices 1-15) open the sliders.
    if (idx > 0) setSel({ line, idx });
  }

  /** Standalone palette: clicking sets the paint color (index 0 = eraser);
   *  editable swatches (1-15) open the sliders. No zone line to bind. */
  function handleStandaloneClick(idx: number) {
    useArtStore.getState().setSelectedColor(idx);
    if (idx > 0) setSel({ line: 0, idx });
  }

  /** Capture the pre-drag standalone copy, lazily on the first previewed tick. */
  function beginStandaloneDrag() {
    const docId = useSpriteStore.getState().activeDocId;
    const cur = preDragStandaloneRef.current;
    if (cur) {
      if (cur.docId === docId) return; // the same drag continuing
      endStandaloneDrag();             // another doc's snapshot must not be dropped
    }
    preDragStandaloneRef.current = {
      docId,
      colors: useSpriteStore.getState().standalonePalette.map((c) => ({ ...c })),
    };
  }

  /**
   * Live preview for the standalone palette: build the edited array and write it
   * straight onto the sprite store WITHOUT recording history (setState, not
   * setStandalonePalette) so a drag is silent per tick. bumpPaletteVersion
   * repaints the canvas + thumbnails. Index 0 stays transparent.
   */
  function previewStandalone(idx: number, word: number) {
    beginStandaloneDrag();
    const cur = useSpriteStore.getState().standalonePalette;
    const edited = cur.map((c, i) => (i === idx ? decodeGenesisColor(word) : { ...c }));
    edited[0] = { ...edited[0], a: 0 }; // index 0 stays transparent
    useSpriteStore.setState({ standalonePalette: edited });
    useArtStore.getState().bumpPaletteVersion();
  }

  /**
   * End a standalone drag. Restores the pre-drag array FIRST in every outcome,
   * then — when the drag is committable — calls setStandalonePalette ONCE so the
   * sprite history records exactly the pre-drag→edited step (a single undo).
   * Mirrors endZoneDrag; see resolvePaletteDragEnd for the commit/revert rule.
   *
   * The restore goes through patchSpriteDoc rather than setState because a doc
   * switch mid-drag PARKS the previewed palette into the outgoing doc — the
   * active store field would then be a different sprite's, and setState would
   * paint this drag's pre-drag colors onto it.
   */
  function endStandaloneDrag() {
    const pre = preDragStandaloneRef.current;
    preDragStandaloneRef.current = null;
    if (!pre) return;
    const sameDocument = useSpriteStore.getState().activeDocId === pre.docId;
    const edited = sameDocument
      ? useSpriteStore.getState().standalonePalette.map((c) => ({ ...c }))
      : null;
    if (edited) edited[0] = { ...edited[0], a: 0 }; // index 0 stays transparent
    const changed = edited !== null && edited.some((c, i) =>
      encodeGenesisColor(c) !== encodeGenesisColor(pre.colors[i]) || c.a !== pre.colors[i].a);

    const outcome = resolvePaletteDragEnd({ hasSnapshot: true, sameDocument, changed });
    patchSpriteDoc(pre.docId, { standalonePalette: pre.colors.map((c) => ({ ...c })) });
    if (outcome === 'commit' && edited) {
      useSpriteStore.getState().setStandalonePalette(edited);
    } else if (changed) {
      useArtStore.getState().bumpPaletteVersion(); // repaint away the dropped preview
    }
  }

  /** Capture the pre-drag line copy, lazily on the first previewed tick. */
  function beginDrag(line: number, idx: number) {
    const z = getCurrentZone(useProjectStore.getState());
    if (!z) return;
    const cur = preDragRef.current;
    if (cur) {
      if (cur.zone === z && cur.line === line) return; // the same drag continuing
      endZoneDrag();                                   // another line's snapshot must not be dropped
    }
    preDragRef.current = {
      zone: z,
      line,
      idx,
      colors: z.palette.lines[line].colors.map((c) => ({ ...c })),
    };
  }

  /**
   * Live preview: write the quantized color directly into the palette object
   * and bump docVersion + paletteVersion so the composer canvas (and the
   * swatch grid) repaint immediately without touching the history clock — keeping
   * TilesetPanel's tile-thumb cache (keyed on that clock) silent per tick.
   *
   * This MUTATES THE OPEN DOCUMENT outside the command system, which is only
   * sound because endZoneDrag is guaranteed to run — see the drain effect above.
   */
  function previewChange(line: number, idx: number, word: number) {
    const z = getCurrentZone(useProjectStore.getState());
    if (!z) return;
    beginDrag(line, idx);
    z.palette.lines[line].colors[idx] = decodeGenesisColor(word);
    useArtStore.getState().bumpDoc();
    useArtStore.getState().bumpPaletteVersion();
  }

  /**
   * End a zone-line drag: on slider release (pointerup), keyboard release (keyup
   * — arrow keys fire onChange but no pointerup), focus loss (blur), or the drain
   * effect's teardown. Restores the pre-drag line FIRST in every outcome, then
   * runs the set-palette-line command when committable — so history's undo
   * snapshot is the pre-drag state, not the mid-drag preview.
   *
   * COMMIT vs REVERT is resolvePaletteDragEnd's call, and the interesting input is
   * `sameDocument`: the zone object the snapshot came from must still be the
   * current one. If the act switched under the drag there is no stack this step
   * belongs on (commandDocId reads the CURRENT zone), so the preview is rolled
   * back off the zone it was written to instead of being recorded onto the wrong
   * document — or, worse, left stranded.
   *
   * No blur() here. The sliders deliberately keep focus (GenesisColorSliders
   * explains why), and the INPUT guard that once made a blur necessary now exempts
   * type:'range' in both level-side undo bindings.
   *
   * AMBIENT, not focused: this editor edits ZONE palette lines from inside the
   * sprite pane too (SpriteMode mounts it with context="sprite", where line 0 is
   * unlocked and the "Copy to ▸ Zone line N" bridge writes zone CRAM). Focus
   * there is the sprite DOCUMENT, which owns no command history — routing by
   * focus threw inside the event handler. executeAmbientCommand records on the
   * zone-art document the colors actually live in. Same reasoning for
   * applyZoneSwatchCopy / applyZoneLineCopy below.
   *
   * Note: MapViewport's invalidation listener handles set-palette-line →
   * reloadAllSections for the MAP repaint, but in Art mode it is unmounted —
   * the composer repaints via the history clock, and the map re-prerenders on
   * remount (MapViewport's mount effect).
   */
  function endZoneDrag() {
    const pre = preDragRef.current;
    preDragRef.current = null;
    if (!pre) return;
    const state = useProjectStore.getState();
    const level = getActiveLevel(state);
    const sameDocument = getCurrentZone(state) === pre.zone && level !== null;

    // Read the previewed line off the zone the snapshot was taken from, never
    // off whatever zone is current now.
    const edited = pre.zone.palette.lines[pre.line].colors.map((c) => ({ ...c }));
    edited[0] = { ...edited[0], a: 0 }; // index 0 stays transparent
    const changed = edited.some((c, i) =>
      encodeGenesisColor(c) !== encodeGenesisColor(pre.colors[i]) || c.a !== pre.colors[i].a);

    const outcome = resolvePaletteDragEnd({ hasSnapshot: true, sameDocument, changed });
    // Restore before executing, so apply() transitions pre-drag → edited and undo
    // restores the true pre-drag colors. On a revert this IS the whole job.
    pre.zone.palette.lines[pre.line].colors = pre.colors.map((c) => ({ ...c }));

    if (outcome === 'commit' && level) {
      executeAmbientCommand({
        type: 'set-palette-line',
        line: pre.line,
        oldColors: pre.colors,
        newColors: edited,
        sectionIndex: -1,
        description: `art: edit palette line ${pre.line} color ${pre.idx}`,
      }, level);
    } else if (changed) {
      useArtStore.getState().bumpDoc();            // repaint away the dropped preview
      useArtStore.getState().bumpPaletteVersion();
    }
  }

  /** Copy a single color into a zone line index, via the undoable set-palette-line command. */
  function applyZoneSwatchCopy(line: number, idx: number, src: Color) {
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

  /** Copy 16 colors (1-15) into a zone line, via set-palette-line. */
  function applyZoneLineCopy(line: number, src: Color[]) {
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
  function applyStandaloneSwatchCopy(idx: number, src: Color) {
    if (idx <= 0) return;
    const cur = useSpriteStore.getState().standalonePalette;
    const edited = copySwatchInto(cur, idx, src);
    if (sameColors(edited, cur)) return;
    useSpriteStore.getState().setStandalonePalette(edited);
  }

  /** Copy 16 colors into the standalone palette. */
  function applyStandaloneLineCopy(src: Color[]) {
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

  /** A zone line is off-limits as a copy participant when it's the Art-mode
   *  sprite-reserved line 0 — mirrors the per-swatch `locked` so the copy bridge
   *  can't overwrite the player palette outside sprite mode. */
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

  function openSwatchMenu(e: React.MouseEvent, srcLine: number, idx: number, src: Color) {
    e.preventDefault(); // suppress the native menu even on a non-source (idx 0) swatch
    if (idx <= 0) return; // transparent backdrop isn't a copy source
    setMenu({ x: e.clientX, y: e.clientY, heading: 'Copy color to', items: swatchMenuItems(srcLine, idx, src) });
  }
  function openLineMenu(e: React.MouseEvent, srcLine: number, src: Color[]) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, heading: 'Copy line to', items: lineMenuItems(srcLine, src) });
  }

  function onSwatchDragStart(color: Color) { dragPayload = { kind: 'swatch', color }; }
  function onLineDragStart(colors: Color[]) { dragPayload = { kind: 'line', colors: colors.map((c) => ({ ...c })) }; }
  function onSwatchDragOver(e: React.DragEvent, key: string, idx: number, locked = false) {
    if (dragPayload?.kind !== 'swatch' || idx <= 0 || locked) return;
    e.preventDefault();
    if (dropKey !== key) setDropKey(key);
  }
  function onLineDragOver(e: React.DragEvent, key: string, locked = false) {
    if (dragPayload?.kind !== 'line' || locked) return;
    e.preventDefault();
    if (dropKey !== key) setDropKey(key);
  }
  function endDrag() { dragPayload = null; setDropKey(null); }
  /** Drop a swatch onto a target. `destLine` is the zone line, or -1 for standalone.
   *  `locked` (Art-mode line 0) rejects the drop so the player palette is safe. */
  function onSwatchDrop(destLine: number, idx: number, locked = false) {
    const p = dragPayload;
    endDrag();
    if (p?.kind !== 'swatch' || idx <= 0 || locked) return;
    if (destLine === -1) applyStandaloneSwatchCopy(idx, p.color);
    else applyZoneSwatchCopy(destLine, idx, p.color);
  }
  function onLineDrop(destLine: number, locked = false) {
    const p = dragPayload;
    endDrag();
    if (p?.kind !== 'line' || locked) return;
    if (destLine === -1) applyStandaloneLineCopy(p.colors);
    else applyZoneLineCopy(destLine, p.colors);
  }

  const selColor = sel
    ? (standaloneSprite ? standalone[sel.idx] : lines[sel.line]?.colors[sel.idx])
    : null;
  const selWord = selColor ? encodeGenesisColor(selColor) : 0;

  return (
    <div style={styles.root}>
      <div style={styles.grid}>
        {standaloneSprite ? (
          <div style={styles.row}>
            <div
              style={styles.grip}
              title="Drag to copy this palette · right-click to copy to a zone line"
              draggable
              onDragStart={() => onLineDragStart(standalone)}
              onDragOver={(e) => onLineDragOver(e, 'sa-line')}
              onDrop={() => onLineDrop(-1)}
              onDragEnd={endDrag}
              onContextMenu={(e) => openLineMenu(e, -1, standalone)}
            />
            {standalone.map((c, ci) => {
              const transparent = ci === 0;
              const isEditSel = sel !== null && sel.idx === ci;
              const isPaintSel = paintColor === ci;
              const title = transparent
                ? 'transparent (index 0)'
                : `sprite palette, index ${ci} — ${fmtGenesisWord(encodeGenesisColor(c))}`;
              return (
                <div
                  key={ci}
                  title={title}
                  draggable={ci > 0}
                  onDragStart={() => onSwatchDragStart(c)}
                  onDragOver={(e) => onSwatchDragOver(e, `sa:0:${ci}`, ci)}
                  onDrop={() => onSwatchDrop(-1, ci)}
                  onDragEnd={endDrag}
                  onContextMenu={(e) => openSwatchMenu(e, -1, ci, c)}
                  onClick={() => handleStandaloneClick(ci)}
                  style={{
                    ...styles.swatch,
                    ...(transparent
                      ? styles.checkerboard
                      : { background: `rgb(${c.r},${c.g},${c.b})` }),
                    ...(isPaintSel ? styles.paintSel : {}),
                    ...(isEditSel ? styles.editSel : {}),
                    ...(dropKey === `sa:0:${ci}` ? styles.dropTarget : {}),
                  }}
                />
              );
            })}
          </div>
        ) : (
          lines.map((line, li) => {
            // Line 0 is the editable player palette in Sprite mode; locked
            // (sprite-reserved) only in Art mode. Gates the grip + every swatch.
            const rowLocked = li === 0 && !inSprite;
            return (
            <div key={li} style={styles.row}>
              <div
                style={{ ...styles.grip, ...(rowLocked ? styles.locked : {}), ...(dropKey === `z-line:${li}` ? styles.dropTarget : {}) }}
                title={rowLocked ? 'sprite-reserved (line 0)' : `Drag to copy line ${li} · right-click to copy elsewhere`}
                draggable={!rowLocked}
                onDragStart={() => onLineDragStart(line.colors)}
                onDragOver={(e) => onLineDragOver(e, `z-line:${li}`, rowLocked)}
                onDrop={() => onLineDrop(li, rowLocked)}
                onDragEnd={endDrag}
                onContextMenu={(e) => { e.preventDefault(); if (!rowLocked) openLineMenu(e, li, line.colors); }}
              />
              {line.colors.map((c, ci) => {
                const locked = rowLocked;
                const transparent = ci === 0;
                const isEditSel = sel !== null && sel.line === li && sel.idx === ci;
                // In Sprite mode the paint-selection outline tracks the sprite's
                // bound line; in Art mode it tracks artStore.paletteLine.
                const selLine = inSprite ? spriteZoneLine : paintLine;
                const isPaintSel = !locked && selLine === li && paintColor === ci;
                const title = locked
                  ? 'sprite-reserved (line 0)'
                  : transparent
                    ? 'transparent (index 0)'
                    : `line ${li}, index ${ci} — ${fmtGenesisWord(encodeGenesisColor(c))}`;
                return (
                  <div
                    key={ci}
                    title={title}
                    draggable={ci > 0 && !locked}
                    onDragStart={() => onSwatchDragStart(c)}
                    onDragOver={(e) => onSwatchDragOver(e, `z:${li}:${ci}`, ci, locked)}
                    onDrop={() => onSwatchDrop(li, ci, locked)}
                    onDragEnd={endDrag}
                    onContextMenu={(e) => { if (locked) { e.preventDefault(); return; } openSwatchMenu(e, li, ci, c); }}
                    onClick={() => handleSwatchClick(li, ci)}
                    style={{
                      ...styles.swatch,
                      ...(transparent
                        ? styles.checkerboard
                        : { background: `rgb(${c.r},${c.g},${c.b})` }),
                      ...(locked ? styles.locked : {}),
                      ...(isPaintSel ? styles.paintSel : {}),
                      ...(isEditSel ? styles.editSel : {}),
                      ...(dropKey === `z:${li}:${ci}` ? styles.dropTarget : {}),
                    }}
                  />
                );
              })}
            </div>
            );
          })
        )}
      </div>

      {sel && selColor && (
        <GenesisColorSliders
          word={selWord}
          heading={standaloneSprite ? `Sprite · Index ${sel.idx}` : `Line ${sel.line} · Index ${sel.idx}`}
          onChange={(w) => (standaloneSprite
            ? previewStandalone(sel.idx, w)
            : previewChange(sel.line, sel.idx, w))}
          onCommit={() => (standaloneSprite ? endStandaloneDrag() : endZoneDrag())}
        />
      )}

      {menu && (
        <PaletteCopyMenu
          x={menu.x} y={menu.y} heading={menu.heading} items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    flexShrink: 0,
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  row: {
    display: 'flex',
    gap: 2,
  },
  swatch: {
    width: 20,
    height: 20,
    minWidth: 0,
    flex: '1 1 0',
    border: `1px solid ${T.border}`,
    borderRadius: 2,
    cursor: 'pointer',
    boxSizing: 'border-box' as const,
  },
  grip: {
    width: 6,
    alignSelf: 'stretch',
    minHeight: 20,
    borderRadius: 2,
    background: T.borderStrong,
    cursor: 'grab',
    flex: '0 0 auto',
  },
  dropTarget: {
    outline: `2px solid ${T.accent}`,
    outlineOffset: -1,
  },
  checkerboard: {
    background: `repeating-conic-gradient(${T.textLo} 0% 25%, ${T.borderStrong} 0% 50%) 0 0 / 8px 8px`,
  },
  locked: {
    opacity: 0.35,
    cursor: 'not-allowed',
  },
  paintSel: {
    outline: `2px solid ${T.accent}`,
    outlineOffset: -1,
  },
  editSel: {
    border: `2px solid ${T.textHi}`,
  },
  // No slider-panel styles here: the panel is GenesisColorSliders, which owns
  // its own. A second copy of them is what made the two palette panels drift.
};
