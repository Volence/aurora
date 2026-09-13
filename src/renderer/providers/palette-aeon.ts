// Aeon port for the one shared swatch grid
// (components/art-shared/palette-grid-model.ts).
//
// It covers ALL THREE of PaletteEditor's context modes, because the differences
// between them are exactly the two things the port already carries — the policy
// and the preview/commit path — and none of them is a difference the grid itself
// should know about:
//
//   1. Art / Palette facet   — the zone's 4 lines. Line 0 is the shared PLAYER
//                              palette (Sonic and Tails, one file for the whole
//                              game): editable since 2026-09-13, but only after
//                              the warning in providers/palette-line0-gate.ts.
//   2. Sprite pane, zone     — the same 4 lines and the SAME warning. A swatch
//                              pick binds the sprite's zoneLine rather than
//                              artStore's paint line.
//   3. Sprite pane, standalone — one row of the sprite doc's 16 private colours;
//                              writes go to the sprite's own undo stack. NOT a
//                              CRAM line, so no warning applies.
//
// THE PREVIEW MUTATES THE OPEN DOCUMENT. That is deliberate — it is what makes
// the composer canvas repaint per slider tick without spending a history step —
// and it is only sound because `drain` is guaranteed to run. Chrome does not
// fire `blur` when a focused element is REMOVED from the DOM, so a drag ended by
// the app rather than by the user (facet switch, act switch, palette-mode flip,
// the selection simply closing) would otherwise leave the document changed with
// nothing on the undo stack and the dirty flag unset — a state no user action
// can reach or recover. See core/art/palette-drag.ts, and the host contract on
// `PaletteGridPort.drain`.
//
// Every drag-end path is identity-stable (`useCallback` with `[]` and refs, all
// state read through `getState`), so a cleanup that captured the port from an
// earlier render still runs the live ender.
//
// This duplicates the drag machinery that is still inside
// components/art/PaletteEditor.tsx; the rewiring task deletes that copy. Nothing
// mounts this port yet, so the two cannot both be live.

import React from 'react';
import { useProjectStore, getCurrentZone, getActiveLevel } from '../state/projectStore';
import { executeAmbientCommand } from '../state/editorStore';
import { useHistoryVersion } from '../hooks/useHistoryVersion';
import { useArtStore } from '../state/artStore';
import { useAetherStore } from '../state/aetherStore';
import { PAL_BASE_FIRST_LINE as PUSHABLE_FIRST_LINE, PAL_BASE_LAST_LINE as PUSHABLE_LAST_LINE } from '../../core/aether/palette-push';
import { useSpriteStore, patchSpriteDoc } from '../state/spriteStore';
import {
  encodeGenesisColor, decodeGenesisColor, fmtGenesisWord, ZONE_PALETTE_FIRST_LINE,
} from '../../core/formats/palette';
import { resolvePaletteDragEnd } from '../../core/art/palette-drag';
import { admitSharedLineEdit, isSharedLineAcknowledged } from './palette-line0-gate';
import {
  TRANSPARENT_INDEX,
  lineWords,
  type PaletteGridPort,
  type PalettePolicy,
  type SwatchRef,
} from '../components/art-shared/palette-grid-model';
import type { Color, Zone } from '../../core/model/s4-types';

/**
 * The CRAM lines of a zone palette that are NOT in the zone's own palette file:
 * every line below the first one the authored file owns. Today that is line 0,
 * the shared player palette (Sonic and Tails), one file for the whole game.
 *
 * DERIVED from `ZONE_PALETTE_FIRST_LINE`, not typed as `[0]`, because that
 * constant is the single statement of which line the file's first word lands
 * on. If the format ever changed, a hand-typed `[0]` here would put the warning
 * on the wrong line and leave the shared one unguarded.
 */
export const ZONE_SHARED_LINES: readonly number[]
  = Array.from({ length: ZONE_PALETTE_FIRST_LINE }, (_, line) => line);

/** Is this zone line the shared player palette rather than the zone's own? */
export function isZoneSharedLine(line: number): boolean {
  return ZONE_SHARED_LINES.includes(line);
}

/**
 * THE ZONE PALETTE LOCKS NOTHING. LINE 0 IS GUARDED BY A WARNING INSTEAD.
 *
 * `Zone.palette` is assembled from TWO files (core/project/aeon/load.ts): the
 * zone's own authored palette into CRAM lines 1 to 3, and the shared player
 * palette (Sonic and Tails; core/project/aeon/player-palette.ts) into line 0,
 * ONE file for the entire game. So a line 0 edit is not a zone edit at all: it
 * recolours Sonic and Tails in every zone there is.
 *
 * ═══ LOCKED 2026-09-10, WARNED 2026-09-13 ═════════════════════════════════
 *
 * From 2026-09-10 this policy LOCKED line 0, the `refuse_line0` build of owner
 * card PALETTE-LINE0-BLAST-RADIUS: the save could not write it, and an
 * editable control whose edits evaporate was the defect that parcel removed.
 * On 2026-09-13 the owner chose `write_shared_file` ("we should allow the top
 * row with just a warning"), so:
 *
 *   • the lock is gone: `lockedLines` is empty and line 0 draws like any line;
 *   • every line 0 edit goes through ONE door first, `admitZoneLine` below,
 *     which asks providers/palette-line0-gate.ts: a warning naming the shared
 *     file and what else is built from it, once per open project;
 *   • the save writes line 0 back to the file the load read (save.ts, THE
 *     SHARED PLAYER PALETTE), and never creates or grows it;
 *   • a running game is NOT recoloured live: `Pal_Base` covers lines 1 to 3,
 *     `palBaseOffset` throws on line 0 (core/aether/palette-push.ts), and the
 *     live push below never sends it. The warning says so.
 *
 * Still refused: the AGENT tool's line 0 write (core/agent/validation.ts),
 * because there is no person there to warn.
 */
export const AEON_ZONE_PALETTE_POLICY: PalettePolicy = {
  lockedLines: [],
  transparent: 'paint',
};

/**
 * The sprite document's own 16 private colours, which the grid draws as a
 * single row and therefore indexes as "line 0".
 *
 * ⚠ THAT ZERO IS NOT A CRAM LINE, and the two must not be conflated: these
 * colours are a working palette belonging to one sprite document, they are
 * committed to that document's own undo stack, and nothing about
 * SonicAndTails.bin or `Pal_Base` applies to them. Locking line 0 here would
 * make the standalone sprite palette uneditable, which is the whole feature.
 */
export const AEON_SPRITE_STANDALONE_PALETTE_POLICY: PalettePolicy = {
  lockedLines: [],
  transparent: 'paint',
};

/**
 * What a shared-line swatch says about itself, in its tooltip, its heading and
 * its grip. ONE phrase in one place, so the three cannot come to describe the
 * line differently. The dialog is the loud half; this is the half that is on
 * screen before anyone clicks.
 */
export const ZONE_SHARED_LINE_NOTE = 'Sonic and Tails, shared by every zone';

/**
 * May a write to zone line `line` go ahead WITHOUT asking? Pure, so the
 * decision runs in the node suite (the hook needs a DOM, the grid a screen):
 * the zone's own lines always may; the shared line only once the warning was
 * accepted for the project that is open.
 */
export function zonePaletteWriteAdmitted(line: number, acknowledged: boolean): boolean {
  return !isZoneSharedLine(line) || acknowledged;
}

/**
 * THE ONE DOOR for any gesture about to change a zone palette line: `true` at
 * once for the zone's own lines and for an acknowledged shared line, otherwise
 * the warning (providers/palette-line0-gate.ts), resolving with the answer.
 *
 * Every writer asks it: the swatch grid through `PaletteGridPort.admit`, and the
 * COPY BRIDGE in components/art/PaletteEditor.tsx (the "Copy to" menu and the
 * drag-and-drop), through `whenZoneLineAdmitted`. The copy bridge is the one
 * that matters most, because a copy lands in a single gesture with no slider to
 * notice; until 2026-09-10 it computed its own rule (`line === 0 && !inSprite`)
 * and was a second, quieter door, so it must not decide for itself again.
 */
export function admitZoneLine(line: number): true | Promise<boolean> {
  return zonePaletteWriteAdmitted(line, isSharedLineAcknowledged()) ? true : admitSharedLineEdit();
}

/** Run `write` once `line` is admitted; do nothing at all when it is declined. */
export function whenZoneLineAdmitted(line: number, write: () => void): void {
  const gate = admitZoneLine(line);
  if (gate === true) { write(); return; }
  void gate.then((ok) => { if (ok) write(); });
}

/**
 * The repaint key. THREE parts, and each covers something the others cannot:
 *
 *  • `scope` — which palette is on screen (the zone, or a specific sprite doc).
 *    Neither clock below moves when the act or the open sprite changes.
 *  • `paletteVersion` — artStore's live-preview counter, bumped per slider tick.
 *    It exists SPECIFICALLY so a drag repaints the swatches and the composer
 *    without touching the history clock, which is what TilesetPanel's and
 *    ChunkLibrary's caches are keyed on. Keying those off a slider tick is the
 *    regression it was introduced to prevent.
 *  • `historyVersion` — the document-history hub. Undo/redo restores colours
 *    without going anywhere near paletteVersion, so without this the grid shows
 *    the pre-undo colours until something else re-renders it.
 *
 * The hub-wide clock is used rather than the aeon-scoped one on purpose: mode 3
 * commits to the SPRITE document's stack, and useAeonHistoryVersion deliberately
 * drops sprite documents.
 */
export function aeonPaletteVersionKey(
  scope: string,
  paletteVersion: number,
  historyVersion: number,
): string {
  return `${scope}:${paletteVersion}:${historyVersion}`;
}

/** A zone palette as the neutral CRAM words. */
export function aeonPaletteLines(
  palette: { readonly lines: readonly { readonly colors: readonly Color[] }[] } | null | undefined,
): number[][] {
  if (!palette) return [];
  return palette.lines.map((l) => lineWords(l.colors));
}

/** Index 0 of any line is the VDP backdrop, so a committed line always carries
 *  it as fully transparent whatever the drag left behind. */
export function keepIndex0Transparent(colors: readonly Color[]): Color[] {
  const out = colors.map((c) => ({ ...c }));
  if (out[TRANSPARENT_INDEX]) out[TRANSPARENT_INDEX] = { ...out[TRANSPARENT_INDEX], a: 0 };
  return out;
}

/**
 * Did the previewed line actually move? Compared on the QUANTIZED word plus
 * alpha, not on raw RGB: the sliders work in 3-bit levels, so two different
 * 8-bit triples that encode to the same CRAM word are the same colour to the
 * hardware and must not record an undo step.
 */
export function paletteLineChanged(edited: readonly Color[], pre: readonly Color[]): boolean {
  if (edited.length !== pre.length) return true;
  return edited.some((c, i) =>
    encodeGenesisColor(c) !== encodeGenesisColor(pre[i]) || c.a !== pre[i].a);
}

const EMPTY_LINES: number[][] = [];

export function useAeonPaletteGridPort(opts?: { context?: 'sprite' }): PaletteGridPort {
  // Two clocks, both required — see aeonPaletteVersionKey for why neither
  // subsumes the other.
  const paletteVersion = useArtStore((s) => s.paletteVersion);
  const historyVersion = useHistoryVersion();
  const project = useProjectStore((s) => s.project);
  const zoneId = useProjectStore((s) => s.currentZoneId);
  const paintColor = useArtStore((s) => s.selectedColor);
  const paintLine = useArtStore((s) => s.paletteLine);
  const spriteMode = useSpriteStore((s) => s.paletteMode);
  const spriteZoneLine = useSpriteStore((s) => s.zoneLine);
  const standalonePalette = useSpriteStore((s) => s.standalonePalette);
  const activeDocId = useSpriteStore((s) => s.activeDocId);

  const inSprite = opts?.context === 'sprite';
  const standaloneMode = inSprite && spriteMode === 'standalone';

  // Pre-drag deep copies, one per commit path. Each carries the DOCUMENT it was
  // taken from — the zone object, the sprite doc id — not just an index: a drag
  // that ends after the act or the sprite switched must restore the line it
  // actually mutated, never whatever line N of the new document happens to be.
  const preDragRef = React.useRef<{ zone: Zone; line: number; idx: number; colors: Color[] } | null>(null);
  const preDragStandaloneRef = React.useRef<{ docId: string; colors: Color[] } | null>(null);

  /**
   * End a zone-line drag. Restores the pre-drag line FIRST in every outcome,
   * then runs the command when committable — so history's undo snapshot is the
   * pre-drag state and not the mid-drag preview.
   *
   * COMMIT vs REVERT is resolvePaletteDragEnd's call, and the interesting input
   * is `sameDocument`: if the act switched under the drag there is no stack this
   * step belongs on, so the preview is rolled back off the zone it was written
   * to rather than recorded onto the wrong document — or left stranded.
   *
   * AMBIENT, not focused: this grid edits ZONE palette lines from inside the
   * sprite pane too, where focus is the sprite DOCUMENT, which owns no aeon
   * command history — routing by focus throws inside the event handler.
   */
  const endZoneDrag = React.useCallback((): void => {
    const pre = preDragRef.current;
    preDragRef.current = null;
    if (!pre) return;
    const state = useProjectStore.getState();
    const level = getActiveLevel(state);
    const sameDocument = getCurrentZone(state) === pre.zone && level !== null;

    // Read the previewed line off the zone the snapshot came from, never off
    // whatever zone is current now.
    const edited = keepIndex0Transparent(pre.zone.palette.lines[pre.line].colors);
    const changed = paletteLineChanged(edited, pre.colors);

    const outcome = resolvePaletteDragEnd({ hasSnapshot: true, sameDocument, changed });
    // Restore before executing, so apply() transitions pre-drag → edited. On a
    // revert this IS the whole job.
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
  }, []);

  /** Capture the pre-drag line copy, lazily on the first previewed tick. */
  const beginZoneDrag = React.useCallback((line: number, idx: number): void => {
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
  }, [endZoneDrag]);

  /**
   * Live preview: write the quantized colour straight into the palette object
   * and bump docVersion + paletteVersion, so the composer canvas and the
   * swatches repaint immediately without touching the history clock.
   *
   * THIS MUTATES THE OPEN DOCUMENT outside the command system, which is only
   * sound because `drain` is guaranteed to run.
   */
  const previewZone = React.useCallback((line: number, idx: number, word: number): void => {
    // THE SECOND LOCK, at the one place a zone colour is actually written.
    //
    // The grid asks `admit` before it opens a swatch, and this is deliberately
    // a second check rather than a redundant one: `preview` is a public port
    // method, and this preview writes straight into the open document outside
    // the command system. A shared-line write the warning has not admitted for
    // THIS project is refused here, whatever called it. LOUD rather than a bare
    // return: a control that does nothing and says nothing is a defect.
    if (!zonePaletteWriteAdmitted(line, isSharedLineAcknowledged())) {
      console.warn(`palette line ${line} is ${ZONE_SHARED_LINE_NOTE}, and its warning has not `
        + 'been accepted for this project, so this preview was refused');
      return;
    }
    const z = getCurrentZone(useProjectStore.getState());
    if (!z) return;
    beginZoneDrag(line, idx);
    z.palette.lines[line].colors[idx] = decodeGenesisColor(word);
    useArtStore.getState().bumpDoc();
    useArtStore.getState().bumpPaletteVersion();
  }, [beginZoneDrag]);

  /**
   * End a standalone drag. Mirrors endZoneDrag; the one difference is that the
   * restore goes through patchSpriteDoc rather than setState, because a doc
   * switch mid-drag PARKS the previewed palette into the outgoing doc — the
   * active store field would then be a different sprite's, and setState would
   * paint this drag's pre-drag colours onto it.
   */
  const endStandaloneDrag = React.useCallback((): void => {
    const pre = preDragStandaloneRef.current;
    preDragStandaloneRef.current = null;
    if (!pre) return;
    const sameDocument = useSpriteStore.getState().activeDocId === pre.docId;
    const edited = sameDocument
      ? keepIndex0Transparent(useSpriteStore.getState().standalonePalette)
      : null;
    const changed = edited !== null && paletteLineChanged(edited, pre.colors);

    const outcome = resolvePaletteDragEnd({ hasSnapshot: true, sameDocument, changed });
    patchSpriteDoc(pre.docId, { standalonePalette: pre.colors.map((c) => ({ ...c })) });
    if (outcome === 'commit' && edited) {
      useSpriteStore.getState().setStandalonePalette(edited);
    } else if (changed) {
      useArtStore.getState().bumpPaletteVersion(); // repaint away the dropped preview
    }
  }, []);

  /** Capture the pre-drag standalone copy, lazily on the first previewed tick. */
  const beginStandaloneDrag = React.useCallback((): void => {
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
  }, [endStandaloneDrag]);

  /** Live preview for the sprite's private palette: written onto the store
   *  WITHOUT recording history (setState, not setStandalonePalette), so a drag is
   *  silent per tick. Index 0 stays transparent. */
  const previewStandalone = React.useCallback((idx: number, word: number): void => {
    beginStandaloneDrag();
    const cur = useSpriteStore.getState().standalonePalette;
    const edited = keepIndex0Transparent(
      cur.map((c, i) => (i === idx ? decodeGenesisColor(word) : c)));
    useSpriteStore.setState({ standalonePalette: edited });
    useArtStore.getState().bumpPaletteVersion();
  }, [beginStandaloneDrag]);

  /**
   * THE TEARDOWN GUARANTEE. Drains BOTH paths unconditionally rather than
   * picking by the current mode: at cleanup time the mode may already have
   * flipped to the value that unmounted the panel, so choosing by it would run
   * the wrong ender. Each is a no-op with no snapshot outstanding, and only one
   * is ever outstanding.
   *
   * It cannot double-commit a normal release either: the first ender clears its
   * snapshot, so the blur that follows a pointerup — and this teardown after it —
   * both take the 'noop' branch.
   */
  const drain = React.useCallback((): void => {
    endZoneDrag();
    endStandaloneDrag();
  }, [endZoneDrag, endStandaloneDrag]);

  const select = React.useCallback((line: number, idx: number): void => {
    // Every clickable swatch sets the paint colour; index 0 is the eraser.
    useArtStore.getState().setSelectedColor(idx);
    if (standaloneMode) return; // a flat 16-colour palette — no line to bind
    if (inSprite) {
      // Bind the SPRITE's zone line (not artStore's paint line) so the sprite
      // canvas colours against the chosen line.
      useSpriteStore.getState().setZoneLine(line);
    } else {
      useArtStore.getState().setPaletteLine(line);
    }
  }, [standaloneMode, inSprite]);

  const zone = getCurrentZone(useProjectStore.getState());
  // The zone policy covers the sprite pane's zone mode too: its line 0 is the
  // same shared player palette, behind the same warning (`admit` below). The
  // STANDALONE row is not a CRAM line at all, so nothing guards it.
  const policy = standaloneMode ? AEON_SPRITE_STANDALONE_PALETTE_POLICY : AEON_ZONE_PALETTE_POLICY;

  /* eslint-disable-next-line react-hooks/exhaustive-deps -- the palette object is
     MUTATED in place by the preview and by the command layer, so its identity is
     not the signal; the two clocks are (see aeonPaletteVersionKey). */
  const lines = React.useMemo(
    (): number[][] => {
      if (standaloneMode) return [lineWords(standalonePalette)];
      if (!project || !zone) return EMPTY_LINES;
      return aeonPaletteLines(zone.palette);
    },
    [standaloneMode, standalonePalette, project, zone, paletteVersion, historyVersion],
  );

  const paintSel = React.useMemo((): SwatchRef => (standaloneMode
    ? { line: 0, idx: paintColor }
    : { line: inSprite ? spriteZoneLine : paintLine, idx: paintColor }),
  [standaloneMode, inSprite, spriteZoneLine, paintLine, paintColor]);

  /**
   * Push the zone line to a running game, if one is connected.
   *
   * ZONE ONLY. A standalone sprite palette is not CRAM state — it is a private
   * working palette for a sprite document — so pushing it would recolour the
   * game from something the game never had.
   *
   * Read AFTER the preview has mutated the document, so the pushed words are
   * exactly the ones on screen. The store coalesces, so calling this on every
   * slider tick is safe; see its MIN_PUSH_INTERVAL comment for why it must.
   */
  const preview = React.useCallback((line: number, idx: number, word: number): void => {
    if (standaloneMode) previewStandalone(idx, word);
    else previewZone(line, idx, word);
  }, [standaloneMode, previewStandalone, previewZone]);

  // The released word is ignored: the preview already wrote it into the document
  // the ender reads, and the ender is what decides commit vs revert.
  const commit = React.useCallback((): void => {
    if (standaloneMode) endStandaloneDrag();
    else endZoneDrag();
  }, [standaloneMode, endStandaloneDrag, endZoneDrag]);

  /**
   * LIVE PUSH, DRIVEN BY THE PALETTE'S CONTENT rather than by the edit gesture.
   *
   * This used to hang off `preview` and `commit`, which meant UNDO changed the
   * editor and left the running game showing the colour you had just undone —
   * found by the owner within minutes of trying it. Undo goes through the
   * history system, not through the port's edit path, and so does redo, and so
   * does an agent edit.
   *
   * Watching `lines` catches all of them, because every one of those paths ends
   * by bumping the version this memo depends on. Only lines whose WORDS
   * actually changed are pushed, so a drag on line 2 does not re-send lines 1
   * and 3, and a no-op re-render sends nothing at all.
   *
   * Zone only: a standalone sprite palette is a private working palette, not
   * CRAM state, and pushing it would recolour the game from something it never
   * had.
   *
   * LINE 0 IS NEVER SENT, not even after an admitted edit: the loop starts at
   * `PUSHABLE_FIRST_LINE`, because `Pal_Base` does not hold line 0 and
   * `palBaseOffset` throws on it (the engine never writes the character's
   * line). A line 0 edit shows in the editor and reaches the game only through
   * a save and a rebuild; the warning says so, and nothing here claims more.
   */
  const lastPushedRef = React.useRef(new Map<number, string>());
  // Kind-gated: `palette` alone would light up against a CLASSIC ROM, whose
  // listing resolves v_palette_line_N but has no Pal_Base to write.
  const aetherReady = useAetherStore((s) => s.status === 'connected' && s.paletteKind === 'aeon');
  React.useEffect(() => {
    if (standaloneMode || !aetherReady) {
      // Forget what was pushed, so reconnecting re-sends the current palette
      // rather than assuming the game still holds it. A reload_rom or a restart
      // puts ROM colours back.
      lastPushedRef.current.clear();
      return;
    }
    const push = useAetherStore.getState().pushPaletteLine;
    for (let line = PUSHABLE_FIRST_LINE; line <= PUSHABLE_LAST_LINE; line++) {
      const words = lines[line];
      if (!words) continue;
      const key = words.join(',');
      if (lastPushedRef.current.get(line) === key) continue;
      lastPushedRef.current.set(line, key);
      push(line, [...words]);
    }
  }, [lines, standaloneMode, aetherReady]);

  const scope = standaloneMode ? `sprite:${activeDocId}` : `zone:${zoneId ?? ''}`;

  return React.useMemo((): PaletteGridPort => ({
    lines,
    policy,
    paintSel,
    versionKey: aeonPaletteVersionKey(scope, paletteVersion, historyVersion),
    select,
    preview,
    commit,
    drain,
    // A standalone row is not a CRAM line, so nothing there is shared; a zone
    // line that is gets the warning before its sliders open.
    admit: (line) => (standaloneMode ? true : admitZoneLine(line)),
    title: (line, idx) => {
      if (idx === TRANSPARENT_INDEX) return 'transparent (index 0)';
      const word = fmtGenesisWord(lines[line]?.[idx] ?? 0);
      if (standaloneMode) return `sprite palette, index ${idx}: ${word}`;
      // The shared line says whose it is on every swatch, before any click.
      return isZoneSharedLine(line)
        ? `line ${line}, index ${idx}: ${word} · ${ZONE_SHARED_LINE_NOTE}`
        : `line ${line}, index ${idx}: ${word}`;
    },
    heading: (line, idx) => (standaloneMode
      ? `Sprite · Index ${idx}`
      : isZoneSharedLine(line)
        ? `Line ${line} · Index ${idx} · every zone`
        : `Line ${line} · Index ${idx}`),
  }), [
    lines, policy, paintSel, scope, paletteVersion, historyVersion,
    select, preview, commit, drain, standaloneMode,
  ]);
}
