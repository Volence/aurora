import type { Section } from '../model/s4-types';
import { createSection, MAX_ACT_SECTIONS } from '../model/s4-types';

export interface GridState {
  gridWidth: number;
  gridHeight: number;
  sections: (Section | null)[];
}

/** Result of a structural op: a NEW grid snapshot plus the section to activate. */
export interface GridOpResult extends GridState {
  focusIndex: number;
}

/** Deep-clone a section (independent typed arrays + object/ring copies). */
export function cloneSection(sec: Section, index: number, name?: string): Section {
  return {
    index,
    name: name ?? sec.name,
    tileGrid: {
      width: sec.tileGrid.width,
      height: sec.tileGrid.height,
      nametable: new Uint16Array(sec.tileGrid.nametable),
      collision: new Uint8Array(sec.tileGrid.collision),
    },
    objects: sec.objects.map((o) => ({ ...o })),
    rings: sec.rings.map((r) => ({ ...r })),
    tiles: sec.tiles ? sec.tiles.map((t) => ({ pixels: new Uint8Array(t.pixels) })) : null,
    paletteRef: sec.paletteRef,
    parallaxRef: sec.parallaxRef,
    bgLayoutRef: sec.bgLayoutRef,
    flags: sec.flags,
    music: sec.music,
  };
}

/**
 * Fill the requested empty slot; else first empty; else append a ROW
 * (grid_h+1, capped at MAX_ACT_SECTIONS — never grow grid_w). Returns null if
 * at the cap.
 */
export function addSection(g: GridState, atIndex?: number): GridOpResult | null {
  // Pick a target empty slot, preferring an in-range requested empty slot.
  let target = -1;
  if (
    atIndex !== undefined &&
    atIndex >= 0 &&
    atIndex < g.sections.length &&
    g.sections[atIndex] == null
  ) {
    target = atIndex;
  } else {
    target = g.sections.findIndex((s) => s == null);
  }

  if (target >= 0) {
    const sections = g.sections.slice();
    sections[target] = createSection(target, `Section ${target}`);
    return {
      gridWidth: g.gridWidth,
      gridHeight: g.gridHeight,
      sections,
      focusIndex: target,
    };
  }

  // Grid full: append a row (never grow width).
  const newHeight = g.gridHeight + 1;
  if (g.gridWidth * newHeight > MAX_ACT_SECTIONS) return null;

  const sections = g.sections.slice();
  const targetFlat = sections.length; // first slot of the new row
  for (let i = 0; i < g.gridWidth; i++) sections.push(null);
  sections[targetFlat] = createSection(targetFlat, `Section ${targetFlat}`);

  return {
    gridWidth: g.gridWidth,
    gridHeight: newHeight,
    sections,
    focusIndex: targetFlat,
  };
}

/** Clear slot `index` to null. Returns null if out of range or already empty. */
export function removeSection(g: GridState, index: number): GridOpResult | null {
  if (index < 0 || index >= g.sections.length) return null;
  if (g.sections[index] == null) return null;

  const sections = g.sections.slice();
  sections[index] = null;
  return {
    gridWidth: g.gridWidth,
    gridHeight: g.gridHeight,
    sections,
    focusIndex: index,
  };
}

/**
 * Resize to w×h, preserving each section's (col,row) position (only its flat
 * index changes). Returns null if w*h > MAX_ACT_SECTIONS, w<1, h<1, or a
 * non-null section would be dropped off a shrunk edge. `keepActive` is the
 * CURRENT active flat index; it is remapped to its new flat position (clamped
 * to 0 if it falls outside the new grid).
 */
export function resizeGrid(
  g: GridState,
  newWidth: number,
  newHeight: number,
  keepActive?: number,
): GridOpResult | null {
  if (newWidth < 1 || newHeight < 1) return null;
  if (newWidth * newHeight > MAX_ACT_SECTIONS) return null;

  const sections: (Section | null)[] = new Array(newWidth * newHeight).fill(null);

  for (let row = 0; row < g.gridHeight; row++) {
    for (let col = 0; col < g.gridWidth; col++) {
      const oldFlat = row * g.gridWidth + col;
      const sec = g.sections[oldFlat];
      if (sec == null) continue;
      // A populated section that no longer fits the new bounds: refuse.
      if (col >= newWidth || row >= newHeight) return null;
      const newFlat = row * newWidth + col;
      sections[newFlat] = sec.index === newFlat ? sec : { ...sec, index: newFlat };
    }
  }

  // Remap the active index by its (col,row), clamped to 0 if it falls outside.
  let focusIndex = 0;
  if (keepActive !== undefined && keepActive >= 0) {
    const col = keepActive % g.gridWidth;
    const row = Math.floor(keepActive / g.gridWidth);
    if (col < newWidth && row < newHeight) {
      focusIndex = row * newWidth + col;
    }
  }

  return { gridWidth: newWidth, gridHeight: newHeight, sections, focusIndex };
}

/**
 * Swap the sections at `from` and `to` (either may be null). Returns null if
 * either index is out of range, from===to, or BOTH are null. focusIndex = to.
 */
export function moveSection(g: GridState, from: number, to: number): GridOpResult | null {
  if (from === to) return null;
  if (from < 0 || from >= g.sections.length) return null;
  if (to < 0 || to >= g.sections.length) return null;

  const a = g.sections[from];
  const b = g.sections[to];
  if (a == null && b == null) return null;

  const sections = g.sections.slice();
  sections[to] = a == null ? null : a.index === to ? a : { ...a, index: to };
  sections[from] = b == null ? null : b.index === from ? b : { ...b, index: from };

  return {
    gridWidth: g.gridWidth,
    gridHeight: g.gridHeight,
    sections,
    focusIndex: to,
  };
}

/**
 * Deep-clone `clip` into slot `to` (overwriting whatever is there). Returns
 * null if `to` is out of range. focusIndex = to.
 */
export function pasteSection(g: GridState, clip: Section, to: number): GridOpResult | null {
  if (to < 0 || to >= g.sections.length) return null;

  const sections = g.sections.slice();
  sections[to] = cloneSection(clip, to);

  return {
    gridWidth: g.gridWidth,
    gridHeight: g.gridHeight,
    sections,
    focusIndex: to,
  };
}
