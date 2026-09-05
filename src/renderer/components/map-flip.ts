/**
 * WHAT THE MAP'S FLIP KEY MIRRORS, decided out of `.tsx` so the node suite can
 * pin the choice. `MapViewport`'s keydown effect asks this and acts, exactly as
 * it does for `resolveEscape`.
 *
 * ═══ THE KEYS, AND WHAT THEY WERE CHOSEN AGAINST ═══
 *
 * `X` mirrors horizontally, `Y` vertically — which is **Tiled's** binding for
 * the same gesture on a tile brush, and, more decisively, it is THIS ENGINE'S
 * OWN VOCABULARY: `collision-cell-word.ts` names bit 10 `xFlip` and documents
 * it as *"mirror horizontally → the other slope direction"*, and the classic
 * block/chunk composers already ship controls labelled `X flip` / `Y flip`.
 * Row 76 copied that vocabulary into the aeon tile-attribute chips for the same
 * reason. Naming one thing two ways across one app is the defect that rule
 * exists to prevent, so this is not a fourth name.
 *
 * WHAT WAS RULED OUT, and none of it was free:
 *
 *   • `Alt` and `Shift` are SPENT on the paste click — `e.altKey ? 'art' :
 *     e.shiftKey ? 'collision'` — and a modifier meaning "art only" on the
 *     mouse and "mirror" on the keyboard in the same mode is one mode with two
 *     grammars.
 *   • `Ctrl` is claimed as the marquee's snap-grid modifier.
 *   • `H` / `V` were the other mnemonic. `v` is the VIEW tool's letter
 *     (`tool-meta.ts` TOOL_KEYS), across the whole vocabulary, so half of that
 *     pair was never available.
 *   • A dedicated button pair in the paste panel was considered and REJECTED as
 *     THE ONLY SURFACE: flipping is a thing you do mid-gesture with the cursor
 *     over the map and the ghost under it, and a control 240px away in a side
 *     panel breaks that. The panel gets the SENTENCE instead — an unlisted key
 *     is an undiscoverable feature, which is this repo's recurring complaint —
 *     and `MarqueePasteOptions` prints both bindings in both of its states.
 *
 *     ⚠ AND THE OWNER READ THAT SENTENCE AND ASKED FOR THE BUTTONS ANYWAY:
 *     *"I think a button on the right panel would be nice too"* (2026-08-28).
 *     He is right and the rejection above was only ever about "the only
 *     surface" — a line of prose is documentation, not an affordance, and he
 *     found those keys because he was told, not because the UI offered them.
 *     The buttons are now the panel's, the keys are still the map's, and
 *     `performMapFlip` below is the one path both of them take.
 *
 * ═══ WHICH THING THE KEY MIRRORS ═══
 *
 * `clipboard` first, and unconditionally on the tool: paste is a MODE the
 * author explicitly entered, the ghost under the cursor is what he is looking
 * at, and mirroring it is not an edit — nothing is written until he clicks.
 * This is the one that spends "flips are free": copy a slope once, stamp it
 * facing both ways.
 *
 * `selection` second, and ONLY while the marquee TOOL is armed — deliberately
 * narrower than Ctrl+C, which works from any tool. The asymmetry is about
 * CONSEQUENCE, not consistency: a copy is non-destructive, so a stale marquee
 * costs nothing, while a flip REWRITES THE MAP. `s` (save-as-chunk) already
 * draws the line in the same place for the same reason. An author who has
 * switched to paint-tile and types `x` is typing at his paint tool, not at a
 * rectangle he selected several minutes ago.
 */

import type { FlipAxis } from '../../core/editing/region-flip';
import { flipClipboard, flipSectionRegion, flipDescription } from '../../core/editing/region-flip';
import { useEditorStore, executeCommand } from '../state/editorStore';
import { useProjectStore, getCurrentAct, getActiveLevel } from '../state/projectStore';
import { useToastStore } from '../state/toastStore';
import { ensureCollisionPlanes } from '../../core/collision/collision-cell-resolve';
import { selectionSizeLabel, artOnlyReason } from '../../core/editing/map-clipboard';

export type FlipTarget = 'clipboard' | 'selection' | null;

/** The axis this key names, or null when it names no flip. Case-folded: a
 *  Caps-Locked author is still asking for the same thing. Modifier keys are the
 *  CALLER's filter (`MapViewport` bails on ctrl/meta/alt before asking), so a
 *  chord never reaches here. */
export function flipAxisForKey(key: string): FlipAxis | null {
  const k = key.toLowerCase();
  if (k === 'x') return 'h';
  if (k === 'y') return 'v';
  return null;
}

export function resolveFlip(ed: {
  pasting: boolean; mapClipboard: unknown; tool: string; marquee: unknown;
}): FlipTarget {
  if (ed.pasting) return ed.mapClipboard ? 'clipboard' : null;
  if (ed.tool === 'marquee' && ed.marquee) return 'selection';
  return null;
}

// ═════════════════════════ THE ACTION, ONCE ═════════════════════════
//
// `performMapFlip` is the whole gesture — resolve the target, apply the
// transform, batch the undo entry, say what happened, repaint the ghost — and
// it exists because there are now TWO surfaces that ask for a flip: the map's
// `X`/`Y` keys and the panel's buttons.
//
// It reads the STORES rather than taking them as arguments, and that is the
// load-bearing choice. The obvious alternative — each call site assembling the
// act, the level and the command runner and handing them in — is the shape that
// lets the two drift: `MapViewport` deliberately uses `getActiveLevel`, whose
// level carries the ZONE's tileset and palette so the commands issued below can
// reach zone data as well as the act's, and a panel that reached for the act
// alone would look identical at the call site and quietly write less. One
// assembly, one place to be wrong.
//
// Everything a caller may need to decide with is in the RETURN value; nothing
// is inferred by a caller re-reading state after the fact.

/** What one `performMapFlip` call did. `kind: 'none'` is the "nothing was
 *  eligible" answer — the same verdict `resolveFlip` gives a disabled button. */
export type FlipOutcome =
  | { kind: 'none'; ghostRepainted: false }
  /** The pending paste was mirrored. Nothing is written until the click. */
  | { kind: 'clipboard'; ghostRepainted: boolean }
  /** A committed marquee was mirrored in place. `changed` is false for a
   *  rectangle that is already its own mirror — a real outcome, not a failure,
   *  and deliberately NOT an empty undo step. */
  | { kind: 'selection'; changed: boolean; ghostRepainted: false };

/**
 * THE PASTE GHOST'S REPAINT, REGISTERED RATHER THAN PASSED.
 *
 * `mapClipboard` is not a redraw dependency and the ghost lives on
 * `MapViewport`'s preview overlay, so mirroring the clipboard changes NOTHING
 * on screen until that canvas is redrawn. The key path always had this line;
 * a button that flipped without it would leave the old art under the cursor and
 * paste something else — worse than having no button.
 *
 * `MapViewport` is the only thing that can perform that repaint and the panel
 * cannot reach it, so it registers the callback here on mount and clears it on
 * unmount. Any flip path then gets the repaint, which is the property that
 * matters; whether the caller remembered to ask for one is not a question this
 * module leaves open.
 *
 * The outcome reports `ghostRepainted`, so an unregistered repainter is a
 * visible answer rather than a silence.
 */
let ghostRepaint: (() => void) | null = null;

export function setFlipGhostRepaint(fn: (() => void) | null): void {
  ghostRepaint = fn;
}

export function performMapFlip(axis: FlipAxis): FlipOutcome {
  const ed = useEditorStore.getState();
  const target = resolveFlip(ed);
  if (target === null) return { kind: 'none', ghostRepainted: false };

  const toast = useToastStore.getState().addToast;

  if (target === 'clipboard') {
    const clip = ed.mapClipboard;
    if (!clip) return { kind: 'none', ghostRepainted: false };
    ed.setMapClipboard(flipClipboard(clip, axis));
    // The ghost's raster cache is keyed on the clipboard's object identity, and
    // `flipClipboard` returns a NEW object — which is what invalidates it.
    const repainted = !!ghostRepaint;
    ghostRepaint?.();
    return { kind: 'clipboard', ghostRepainted: repainted };
  }

  const state = useProjectStore.getState();
  const level = getActiveLevel(state);
  const act = getCurrentAct(state);
  const m = ed.marquee;
  const section = m ? act?.sections[m.sectionIndex] : undefined;
  if (!m || !level || !section) return { kind: 'none', ghostRepainted: false };

  ensureCollisionPlanes(section);
  const label = selectionSizeLabel(m.col, m.row, m.w, m.h);
  const cmd = flipSectionRegion({
    section, sectionIndex: m.sectionIndex,
    col: m.col, row: m.row, w: m.w, h: m.h, axis,
    description: flipDescription(axis, label),
  });
  if (!cmd) {
    // A rectangle that is already its own mirror. An empty undo step would be
    // worse than a sentence.
    toast(`Nothing to flip: this selection already reads the same ${
      axis === 'h' ? 'left to right' : 'top to bottom'}.`, 'info');
    return { kind: 'selection', changed: false, ghostRepainted: false };
  }
  // ONE batch command, so ONE undo entry — and the renderer-cache invalidation
  // listener walks batches, so the canvas repaints with the model rather than
  // keeping the old picture.
  executeCommand(cmd, level);
  useEditorStore.getState().setActiveSectionIndex(m.sectionIndex);
  // SAY WHAT WAS FLIPPED, and — for a non-block-aligned selection — that
  // collision was NOT, at the moment the author would otherwise assume it came
  // along. Same rule and same sentence as the Ctrl+C toast: art-only is a
  // normal outcome of a tile-granular selection, and what it must never be is
  // silent.
  const reason = artOnlyReason(m.col, m.row, m.w, m.h);
  toast(
    reason ? `${flipDescription(axis, label)}: art only. ${reason}`
      : flipDescription(axis, label),
    reason ? 'info' : 'success');
  return { kind: 'selection', changed: true, ghostRepainted: false };
}
