// The contract the one chunk grid renders against, plus the only bits of it
// worth testing on their own. Store-free and engine-free by construction: the
// aeon library is a project-global list of string-keyed ChunkDefs rasterized
// from a zone tileset, classic's is a file-order array addressed by 1-based
// ENGINE ids with a synthetic air entry in front, and neither fact belongs here.

import type React from 'react';

/**
 * Why a chunk cell has nothing to show. THREE states, not two, because the
 * engines' "empty" are genuinely different things and collapsing them loses a
 * real distinction:
 *
 *  - `air` — classic's synthetic id $00. It is not a chunk at all; there is no
 *    data behind it. It exists so the Stamp tool can paint "no chunk" over a
 *    layout cell, and it renders as a checkerboard because there is nothing to
 *    render.
 *  - `blank` — an aeon chunk whose every cell references tile 0. It IS a chunk,
 *    with data, deliberately blank ($00/$2A/$2B/$45 in OJZ are legitimately
 *    blank, not corrupt). It still rasterizes — aeon paints colour 0, RGB and
 *    alpha both — and it is flagged only so an empty-looking thumbnail is not
 *    mistaken for a dark one, since stamping it ERASES the area.
 *  - `none` — ordinary content.
 *
 * A port only ever produces one of the two empty kinds; treating them as one
 * would make classic's air stampable-over-nothing and aeon's blank chunks look
 * absent when they are real data.
 */
export type ChunkEmptyKind = 'none' | 'air' | 'blank';

/** Panel: a narrow side dock that wraps onto two header rows and offers S/M/L.
 *  Strip: a wide bottom dock with one header row and a fixed thumbnail size. */
export type ChunkGridLayout = 'panel' | 'strip';

/**
 * Everything `ChunkGrid` needs, supplied per engine by
 * `providers/chunk-grid-{aeon,classic}.ts`. The component subscribes to
 * NOTHING — see ObjectList's header for why that is load-bearing rather than
 * stylistic (aeon's executeCommand throws for a non-aeon document, and the two
 * engines repaint off different clocks).
 */
export interface ChunkGridPort {
  /** Header text, e.g. `Chunks (256)`. The count is the engine's own idea of
   *  how many chunks it has, which is not always `ids.length` — classic's id
   *  space carries a synthetic air entry the file does not. */
  readonly heading: string;
  /** Every cell, in display order. Engine ids stringified — never parsed back
   *  by the neutral side. */
  readonly ids: readonly string[];
  /** Edge of the square buffer `rasterize` returns: aeon 128, classic 256. */
  readonly sourcePx: number;
  /** Offered thumbnail sizes. One entry hides the size control. */
  readonly sizes: readonly number[];
  readonly defaultSize: number;
  readonly layout: ChunkGridLayout;
  readonly selectedId: string | null;
  /** Right-hand status line: the selected chunk's name, and a usage hint. */
  readonly statusBadge: string | null;
  readonly statusHint: string;
  /** Shown instead of the grid when `ids` is empty. */
  readonly emptyState?: { message: string; hint?: string };
  /** Engine-specific header controls (aeon's Import/Clear, classic's loop
   *  toggle). A component, so it may hold its own state and read its own
   *  engine's stores — the neutrality rule binds ChunkGrid, not the port. */
  readonly HeaderExtra?: React.ComponentType;
  /** Props spread on the root element (a facet claim, for instance). */
  readonly rootProps?: React.HTMLAttributes<HTMLElement>;
  /** RGBA bytes for `sourcePx` x `sourcePx`, or null when there is nothing to
   *  paint (classic's air, an unknown id). Goes through core/art/rasterize. */
  rasterize(id: string): Uint8ClampedArray | null;
  /** Changes iff THIS chunk's pixels can have changed. The whole point of the
   *  grid: a key that moves for the library moves every thumbnail. */
  versionKey(id: string): string;
  /** Corner label, e.g. `$1A` or `air`. */
  label(id: string): string;
  /** Tooltip. */
  title(id: string): string;
  emptyKind(id: string): ChunkEmptyKind;
  select(id: string): void;
  /** Optional double-click action (aeon opens the chunk in the composer). */
  activate?(id: string): void;
}

/** `$XX` — the form both engines label chunks with. */
export function hexLabel(n: number): string {
  return `$${n.toString(16).toUpperCase().padStart(2, '0')}`;
}
