import React, { useEffect, useRef, useState } from 'react';
import { useProjectStore, getCurrentZone, getActiveLevel } from '../../state/projectStore';
import { useEditorStore, executeCommand } from '../../state/editorStore';
import { useArtStore } from '../../state/artStore';
import { useSpriteStore } from '../../state/spriteStore';
import { encodeGenesisColor, decodeGenesisColor } from '../../../core/formats/palette';
import type { Color } from '../../../core/model/s4-types';
import { T } from '../ui';

/** 8-bit channel → Genesis 3-bit level (0-7). */
function to3(v: number): number {
  return Math.round(Math.min(255, Math.max(0, v)) / 255 * 7);
}

function fmtWord(word: number): string {
  return '$' + word.toString(16).toUpperCase().padStart(4, '0');
}

interface SwatchSel {
  line: number;
  idx: number;
}

const CHANNELS = ['r', 'g', 'b'] as const;
const CHANNEL_COLORS: Record<string, string> = { r: T.error, g: T.success, b: T.info };

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
 * Mount invariant: PaletteEditor only renders in Art and Sprite modes.
 * MapViewport's keydown handler lacks the INPUT-type guard, so mid-drag Ctrl+Z
 * while a slider has focus is not a reachable code path.
 */
export default function PaletteEditor() {
  // Subscribe to paletteVersion for live-preview repaint during slider drags.
  // historyVersion re-renders swatches after undo/redo restores colors and
  // after committed commands (set-palette-line bumps both).
  useArtStore((s) => s.paletteVersion);
  useEditorStore((s) => s.historyVersion);
  useSpriteStore((s) => s.historyTick); // re-render after sprite undo/redo
  const project = useProjectStore((s) => s.project);
  const zone = getCurrentZone(useProjectStore.getState());
  const paintColor = useArtStore((s) => s.selectedColor);
  const paintLine = useArtStore((s) => s.paletteLine);

  const appMode = useEditorStore((s) => s.appMode);
  const spriteMode = useSpriteStore((s) => s.paletteMode);
  const spriteZoneLine = useSpriteStore((s) => s.zoneLine);
  const standalone = useSpriteStore((s) => s.standalonePalette);
  const inSprite = appMode === 'sprite';

  const [sel, setSel] = useState<SwatchSel | null>(null);
  // Pre-drag deep copy of the edited line so the committed undo snapshot is
  // the true pre-drag state (live preview mutates the palette in place).
  const preDragRef = useRef<{ line: number; colors: Color[] } | null>(null);
  // Separate pre-drag copy for the standalone path (keyed to no zone line — the
  // standalone palette is a flat 16-color array on the sprite store, not the
  // zone). Kept distinct from preDragRef so the two commit paths never collide.
  const preDragStandaloneRef = useRef<Color[] | null>(null);

  const standaloneSprite = inSprite && spriteMode === 'standalone';
  // The open swatch selection (sel) is per-context: a standalone sel (line 0,
  // flat palette) must not leak into the zone/Art render, where line 0 means
  // the zone's first line. Reset it whenever the render context flips so the
  // slider panel and edit highlight never target the wrong palette.
  useEffect(() => { setSel(null); }, [standaloneSprite]);

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

  /** Capture the pre-drag standalone copy (pointerdown, or lazily on first change). */
  function beginStandaloneDrag() {
    if (preDragStandaloneRef.current) return;
    preDragStandaloneRef.current = useSpriteStore.getState().standalonePalette.map((c) => ({ ...c }));
  }

  /**
   * Live preview for the standalone palette: build the edited array and write it
   * straight onto the sprite store WITHOUT recording history (setState, not
   * setStandalonePalette) so a drag is silent per tick. bumpPaletteVersion
   * repaints the canvas + thumbnails. Index 0 stays transparent.
   */
  function previewStandalone(idx: number, channel: 'r' | 'g' | 'b', level3: number) {
    beginStandaloneDrag();
    const cur = useSpriteStore.getState().standalonePalette;
    const prev = cur[idx];
    const channels = { r: to3(prev.r), g: to3(prev.g), b: to3(prev.b), [channel]: level3 };
    const next = decodeGenesisColor(encodeGenesisColor({
      r: channels.r * 255 / 7, g: channels.g * 255 / 7, b: channels.b * 255 / 7,
    }));
    const edited = cur.map((c, i) => (i === idx ? next : { ...c }));
    edited[0] = { ...edited[0], a: 0 }; // index 0 stays transparent
    useSpriteStore.setState({ standalonePalette: edited });
    useArtStore.getState().bumpPaletteVersion();
  }

  /**
   * Commit a standalone drag: restore the pre-drag array FIRST, then call
   * setStandalonePalette ONCE so the sprite history records exactly the
   * pre-drag→edited step (a single undo). Mirrors the zone commitDrag pattern.
   */
  function commitStandalone(e?: React.SyntheticEvent) {
    // Blur the slider so post-commit Ctrl+Z reaches the keydown handler.
    (e?.currentTarget as HTMLElement | undefined)?.blur?.();
    const pre = preDragStandaloneRef.current;
    preDragStandaloneRef.current = null;
    if (!pre) return;
    const edited = useSpriteStore.getState().standalonePalette.map((c) => ({ ...c }));
    edited[0] = { ...edited[0], a: 0 }; // index 0 stays transparent

    const changed = edited.some((c, i) =>
      encodeGenesisColor(c) !== encodeGenesisColor(pre[i]) || c.a !== pre[i].a);
    // Restore the pre-drag array before recording, so the undo step transitions
    // pre-drag → edited and undo restores the true pre-drag colors.
    useSpriteStore.setState({ standalonePalette: pre.map((c) => ({ ...c })) });
    if (!changed) return; // click without movement — no history entry
    useSpriteStore.getState().setStandalonePalette(edited);
  }

  /** Capture the pre-drag line copy (pointerdown, or lazily on first change). */
  function beginDrag(line: number) {
    if (preDragRef.current && preDragRef.current.line === line) return;
    const z = getCurrentZone(useProjectStore.getState());
    if (!z) return;
    preDragRef.current = {
      line,
      colors: z.palette.lines[line].colors.map((c) => ({ ...c })),
    };
  }

  /**
   * Live preview: write the quantized color directly into the palette object
   * and bump docVersion + paletteVersion so the composer canvas (and the
   * swatch grid) repaint immediately without touching historyVersion — keeping
   * TilesetPanel's tile-thumb cache (keyed on historyVersion) silent per tick.
   */
  function previewChange(line: number, idx: number, channel: 'r' | 'g' | 'b', level3: number) {
    const z = getCurrentZone(useProjectStore.getState());
    if (!z) return;
    beginDrag(line);
    const cur = z.palette.lines[line].colors[idx];
    const channels = { r: to3(cur.r), g: to3(cur.g), b: to3(cur.b), [channel]: level3 };
    const next = decodeGenesisColor(encodeGenesisColor({
      r: channels.r * 255 / 7, g: channels.g * 255 / 7, b: channels.b * 255 / 7,
    }));
    z.palette.lines[line].colors[idx] = next;
    useArtStore.getState().bumpDoc();
    useArtStore.getState().bumpPaletteVersion();
  }

  /**
   * Commit on slider release (pointerup), keyboard release (keyup — arrow keys
   * fire onChange but no pointerup), or focus loss (blur). Restore the pre-drag
   * line FIRST, then run the set-palette-line command — so history's undo
   * snapshot is the pre-drag state, not the mid-drag preview.
   *
   * Blurs the active slider after commit so Ctrl+Z (ArtMode's keydown handler)
   * is not blocked by the INPUT early-return guard on the next undo.
   *
   * Note: MapViewport's invalidation listener handles set-palette-line →
   * reloadAllSections for the MAP repaint, but in Art mode it is unmounted —
   * the composer repaints via historyVersion, and the map re-prerenders on
   * remount (MapViewport's mount effect). Established pattern; see ArtMode.
   */
  function commitDrag(e?: React.SyntheticEvent) {
    // Blur the slider so post-commit Ctrl+Z reaches ArtMode's keydown handler
    // without being swallowed by the INPUT guard.
    (e?.currentTarget as HTMLElement | undefined)?.blur?.();
    const pre = preDragRef.current;
    preDragRef.current = null;
    if (!pre) return;
    const state = useProjectStore.getState();
    const z = getCurrentZone(state);
    const level = getActiveLevel(state);
    if (!z || !level) return;

    const edited = z.palette.lines[pre.line].colors.map((c) => ({ ...c }));
    edited[0] = { ...edited[0], a: 0 }; // index 0 stays transparent

    // Restore the pre-drag line before executing, so apply() transitions
    // pre-drag → edited and undo restores the true pre-drag colors.
    z.palette.lines[pre.line].colors = pre.colors.map((c) => ({ ...c }));

    const changed = edited.some((c, i) =>
      encodeGenesisColor(c) !== encodeGenesisColor(pre.colors[i]) || c.a !== pre.colors[i].a);
    if (!changed) return; // click without movement — no history entry

    executeCommand({
      type: 'set-palette-line',
      line: pre.line,
      oldColors: pre.colors,
      newColors: edited,
      sectionIndex: -1,
      description: `art: edit palette line ${pre.line} color ${sel?.idx ?? '?'}`,
    }, level);
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
            {standalone.map((c, ci) => {
              const transparent = ci === 0;
              const isEditSel = sel !== null && sel.idx === ci;
              const isPaintSel = paintColor === ci;
              const title = transparent
                ? 'transparent (index 0)'
                : `sprite palette, index ${ci} — ${fmtWord(encodeGenesisColor(c))}`;
              return (
                <div
                  key={ci}
                  title={title}
                  onClick={() => handleStandaloneClick(ci)}
                  style={{
                    ...styles.swatch,
                    ...(transparent
                      ? styles.checkerboard
                      : { background: `rgb(${c.r},${c.g},${c.b})` }),
                    ...(isPaintSel ? styles.paintSel : {}),
                    ...(isEditSel ? styles.editSel : {}),
                  }}
                />
              );
            })}
          </div>
        ) : (
          lines.map((line, li) => (
            <div key={li} style={styles.row}>
              {line.colors.map((c, ci) => {
                // Line 0 is the editable player palette in Sprite mode; locked
                // (sprite-reserved) only in Art mode.
                const locked = li === 0 && !inSprite;
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
                    : `line ${li}, index ${ci} — ${fmtWord(encodeGenesisColor(c))}`;
                return (
                  <div
                    key={ci}
                    title={title}
                    onClick={() => handleSwatchClick(li, ci)}
                    style={{
                      ...styles.swatch,
                      ...(transparent
                        ? styles.checkerboard
                        : { background: `rgb(${c.r},${c.g},${c.b})` }),
                      ...(locked ? styles.locked : {}),
                      ...(isPaintSel ? styles.paintSel : {}),
                      ...(isEditSel ? styles.editSel : {}),
                    }}
                  />
                );
              })}
            </div>
          ))
        )}
      </div>

      {sel && selColor && (
        <div style={styles.editPanel}>
          <div style={styles.editHeader}>
            <span>
              {standaloneSprite ? `Sprite · Index ${sel.idx}` : `Line ${sel.line} · Index ${sel.idx}`}
            </span>
            <span style={styles.word}>{fmtWord(selWord)}</span>
          </div>
          {CHANNELS.map((ch) => (
            <div key={ch} style={styles.sliderRow}>
              <span style={{ ...styles.channelLabel, color: CHANNEL_COLORS[ch] }}>
                {ch.toUpperCase()}
              </span>
              <input
                type="range"
                min={0}
                max={7}
                step={1}
                value={to3(selColor[ch])}
                onPointerDown={() => (standaloneSprite ? beginStandaloneDrag() : beginDrag(sel.line))}
                onChange={(e) => (standaloneSprite
                  ? previewStandalone(sel.idx, ch, Number(e.target.value))
                  : previewChange(sel.line, sel.idx, ch, Number(e.target.value)))}
                onPointerUp={standaloneSprite ? commitStandalone : commitDrag}
                onKeyUp={standaloneSprite ? commitStandalone : commitDrag}
                onBlur={standaloneSprite ? commitStandalone : commitDrag}
                style={styles.slider}
              />
              <span style={styles.channelValue}>{to3(selColor[ch])}</span>
            </div>
          ))}
        </div>
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
  editPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 6,
    background: T.void,
    border: `1px solid ${T.border}`,
    borderRadius: 4,
  },
  editHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 10,
    color: T.textBase,
    marginBottom: 2,
  },
  word: {
    fontFamily: T.fontMono,
    color: T.warning,
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  channelLabel: {
    fontSize: 10,
    fontWeight: 700,
    width: 10,
  },
  slider: {
    flex: 1,
    minWidth: 0,
  },
  channelValue: {
    fontSize: 10,
    fontFamily: T.fontMono,
    color: T.textHi,
    width: 10,
    textAlign: 'right' as const,
  },
};
