// THE THREE PRIORITY CHIPS — one control, two brushes, ONE set of words.
//
// The map's tile brush (TileBrushOptions, Layout facet) and the composer's
// tile-stamp (ArtToolOptions, Art facet) both arm a `BrushPriority`, and they
// are DIFFERENT brushes — different store, different tile, different flips, and
// an author may well want the map painting `on` while the composer keeps. What
// they must never differ in is what the three states are CALLED, because they
// are three states of one rule (core/editing/brush-word.ts) and this app's
// standing rule is that two surfaces meaning the same thing must not say it
// differently.
//
// So the labels and the titles live here, shared verbatim, rather than being
// typed a second time next to the second mount. TileBrushOptions' own docblock
// carries the argument for why chips beat a modifier key and an attribute tool;
// that argument is unchanged and is not repeated here.
//
// ⚠ THE `title` IS THE CONTROL'S IDENTITY, NOT DECORATION. It carries the
// three-way state into the accessibility tree and it is what the CDP harnesses
// address each chip by (scratchpad/tile-attribute-harness.mjs, and O17's
// composer harness). KEEP THESE STRINGS STABLE. The two mounts share them
// deliberately and that is safe: LevelWorkspace mounts ONE facet at a time, so
// the map's chips and the composer's are never in the document together.

import React from 'react';
import type { BrushPriority } from '../../../core/editing/brush-word';
import { Chip } from '../ui';

export interface PriorityChipSpec {
  value: BrushPriority;
  label: string;
  title: string;
}

export const PRIORITY_CHIPS: readonly PriorityChipSpec[] = [
  {
    value: 'keep', label: 'Keep',
    title: 'Priority: keep — leave each cell\'s existing priority bit alone (default)',
  },
  {
    value: 'on', label: 'On',
    title: 'Priority: on — painted tiles draw IN FRONT of the player',
  },
  {
    value: 'off', label: 'Off',
    title: 'Priority: off — painted tiles draw BEHIND the player',
  },
];

/** The three chips, wired to whichever brush the host owns. */
export default function PriorityChips(
  { value, onChange }: { value: BrushPriority; onChange: (p: BrushPriority) => void },
) {
  return (
    <>
      {PRIORITY_CHIPS.map((c) => (
        <Chip key={c.value} active={value === c.value} onClick={() => onChange(c.value)} title={c.title}>
          {c.label}
        </Chip>
      ))}
    </>
  );
}

/**
 * The one sentence that says what the armed state will do to the cells a stroke
 * touches — shared for the same reason the labels are.
 *
 * `verb` is the host's word for its own gesture ("Painting" / "Stamping"): the
 * two surfaces do genuinely different things, and a composer that claimed
 * "painting" would be describing the pixel tools sitting next to it.
 */
export function priorityBrushExplainer(priority: BrushPriority, verb: string): string {
  if (priority === 'keep') {
    return `${verb} leaves each cell's priority as it found it. Pick On or Off to author it — `
      + 'the priority lens comes on so you can see what you are changing.';
  }
  return `${verb} sets priority ${priority === 'on' ? 'ON' : 'OFF'} on every cell it touches.`;
}
