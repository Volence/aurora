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
 *     the only surface: flipping is a thing you do mid-gesture with the cursor
 *     over the map and the ghost under it, and a control 240px away in a side
 *     panel breaks that. The panel gets the SENTENCE instead — an unlisted key
 *     is an undiscoverable feature, which is this repo's recurring complaint —
 *     and `MarqueePasteOptions` prints both bindings in both of its states.
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
