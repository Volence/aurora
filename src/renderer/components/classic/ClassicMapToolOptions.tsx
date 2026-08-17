// Classic's contextual hint line for the map facets — what the tool under the
// cursor does RIGHT NOW, with the live stamp id folded in.
//
// It used to be the trailing span of ClassicLevelViewport's own OptionBar,
// beside a Tool chip row, a Plane group and an Overlay group. Those three were
// duplicates of controls the shared workspace header and tool dock already
// render from the same stores, so they were deleted; this was not. Nothing else
// in either engine says "right-click eyedrops" or "objects are FG-only", and the
// hint is per-TOOL rather than per-engine, so it earns the slot the duplicates
// vacated.
//
// A LEAF, not a column: it subscribes to four store fields and renders text.
// Mounted in the facet module's `toolOptions` slot (workspace/facets/s1-facets),
// which is where the shell puts a bar of this shape (shell/ArtToolOptions,
// shell/SpriteToolOptions do the same).
//
// READ-ONLY. It issues no classic edit command, so it is not a COMMAND_SITE in
// classic-surface.test.ts and does not spread classicSurfaceProps — it has
// nothing clickable to claim a facet with, and the map root it sits above still
// claims 'map' for every pointer-down that lands in the canvas.

import React from 'react';
import { T, OptionBar } from '../ui';
import { useEditorStore } from '../../state/editorStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { armedPlacementId } from '../../state/classic-placement';
import { s1ObjectName } from '../../../core/project/profiles/s1-objects';

export default function ClassicMapToolOptions(): React.ReactElement {
  const tool = useEditorStore((s) => s.tool);
  // The plane IS aeon's editingLayer (same 'fg' | 'bg' union) — the header's
  // FG/BG chips write it, and classic's object editing is gated on it, which is
  // why the BG case has a hint of its own.
  const plane = useEditorStore((s) => s.editingLayer);
  const selectedChunkId = useClassicLevelStore((s) => s.selectedChunkId);
  const stampLoop = useClassicLevelStore((s) => s.stampLoop);
  const armedObjectId = useClassicLevelStore((s) => s.armedObjectId);
  // Collision facet (Task 5): the shape armed by the picker, and the Link |
  // Isolate mode it will be written under. Read here rather than trusting
  // the shared tool-meta hint (tool-meta.ts:46, "Click to set the collision
  // type on tiles") — that sentence is aeon's model, a TYPE assigned per
  // TILE. Classic assigns a SHAPE to a BLOCK, so the wording belongs in this
  // branch chain, where classic already overrides per-tool copy.
  const collisionShape = useClassicLevelStore((s) => s.collisionShape);
  const collisionDiverge = useClassicLevelStore((s) => s.collisionDiverge);
  // Through the derivation, never the raw field: the armed id is a payload that
  // a tool switch leaves behind, so reading it raw would keep announcing a
  // placement the map has already stopped offering (state/classic-placement.ts).
  const armedId = armedPlacementId(tool, armedObjectId);

  return (
    <OptionBar>
      <span style={{ flex: 1 }} />
      <span style={{ color: T.textFaint }}>
        {tool === 'stamp-chunk'
          ? `stamp $${selectedChunkId.toString(16).toUpperCase().padStart(2, '0')}${stampLoop && selectedChunkId >= 1 && selectedChunkId <= 0x7f ? ' ∞loop' : ''} · drag to paint · right-click eyedrops · scroll to zoom`
          : tool === 'paint-collision'
            ? (collisionShape != null
                ? `click to write shape ${collisionShape} (${collisionDiverge === 'link' ? 'Link' : 'Isolate'}) to the block under the cursor`
                : 'no shape armed — pick one in the Collision panel')
            : armedId != null
            ? `click to place ${s1ObjectName(armedId)} · Esc cancels`
            : tool === 'place-object'
              ? 'no object armed — pick one from the Objects panel · Esc cancels'
              : tool === 'select'
                ? (plane === 'fg'
                    // THE LAST CLAUSE HAS TO BE TRUE ON EVERY FACET THIS BAR
                    // MOUNTS ON, which is the constraint it has failed twice.
                    // `select` is on Layout AND on Objects, and this component
                    // reads only editorStore — it cannot tell them apart — so a
                    // clause naming a location is a gamble on which one you are:
                    //   · "switch to Objects to place" was right on Layout and
                    //     told an Objects user to go where they already were;
                    //   · "arm an object below to place" (the 2026-08-14 merge,
                    //     when the library was in Layout's own column) is right
                    //     on Objects and points at empty column on Layout.
                    // Naming the PANEL rather than a direction is true on both,
                    // and matches the `place-object` branch three lines up,
                    // which already says "the Objects panel".
                    ? 'click selects · drag moves · drag START to move spawn · Del removes · arm from the Objects panel to place'
                    : 'objects are FG-only — switch to FG to edit · drag to pan')
                : 'drag to pan · right-click eyedrops · scroll to zoom'}
      </span>
    </OptionBar>
  );
}
