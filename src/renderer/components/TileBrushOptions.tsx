// THE TILE BRUSH'S ATTRIBUTE CONTROLS — the owner's actual ask, which was
// "is there a way to draw the higher priority and such?"
//
// ═══ WHY CHIPS BESIDE THE PICKER, AND NOT THE TWO ALTERNATIVES ═══
//
// MODIFIER KEYS WHILE PAINTING — rejected. The map already spends Alt on two
// different things (paint-collision's propagate latch, stamp-chunk's art-only),
// so the free modifiers are scarce and the ones that are left are not
// mnemonic. Worse, a modifier is INVISIBLE: there is no way to look at the
// editor and see what the next click will do to a field that is itself
// invisible. That is the exact property that let the bug live, so reproducing
// it in the fix would be perverse.
//
// A DEDICATED "ATTRIBUTE BRUSH" TOOL — rejected, though it was the closest
// call. It would compose beautifully with the priority lens, but it adds an
// EIGHTH tool to a facet that already carries seven, and it cannot do the thing
// an author most often wants, which is to lay a tile AND say what depth it sits
// at in one stroke. It is also very nearly redundant here: with the brush armed
// to `Priority: on` and the destination's own tile re-picked, a stroke changes
// only the attribute — the attribute-only edit exists, it just does not need
// its own tool to reach.
//
// CHIPS THAT ARM THE BRUSH — chosen, and the deciding argument is that THIS APP
// ALREADY TEACHES IT. Classic's chunk composer has had exactly this control
// (`X flip` / `Y flip` chips that arm the next stroke, ChunkTab.tsx) since it
// shipped, and classic's block composer spells the third one `Priority`
// (BlockTab.tsx). An author who has learned the vocabulary in one half of the
// app has learned it in the other, so the words here are deliberately the SAME
// WORDS — "X flip", "Y flip", "Priority" — rather than the model's own hFlip /
// vFlip spelling. Two surfaces in one app that mean the same thing must not say
// it differently; that is the rule the priority lens itself was built on.
//
// ═══ WHY PRIORITY GETS THREE CHIPS AND THE FLIPS GET ONE EACH ═══
//
// Not an inconsistency — it is the preservation rule made visible. A flip is
// part of the PICTURE the picker is showing, so it is a mode: on or off. Depth
// is a property of the CELL, and "don't touch it" is a real third intent that a
// checkbox cannot express. See core/editing/brush-word.ts for the full argument
// and for why `Keep` is the default.
//
// NOTHING HERE TOUCHES MORE THAN THE NEXT STROKE. There is deliberately no
// "apply to selection" button: a control that rewrote attributes across a
// marquee would be a bulk mutation of an invisible field, which is the very
// shape of the defect this panel repairs.

import React from 'react';
import { useEditorStore } from '../state/editorStore';
import { Chip, SectionBody, T } from './ui';
import type { BrushPriority } from '../../core/editing/brush-word';

/** `title` is the control's identity here, not decoration: it carries the
 *  three-way state into the accessibility tree and is what the CDP harness
 *  addresses each chip by. Keep them stable. */
const PRIORITY_CHIPS: { value: BrushPriority; label: string; title: string }[] = [
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: T.s2, flexWrap: 'wrap' }}>
      <span style={{ fontSize: T.tXs, color: T.textLo, minWidth: 52 }}>{label}</span>
      {children}
    </div>
  );
}

export default function TileBrushOptions() {
  const hFlip = useEditorStore((s) => s.selectedTileHFlip);
  const vFlip = useEditorStore((s) => s.selectedTileVFlip);
  const priority = useEditorStore((s) => s.selectedTilePriority);
  const setH = useEditorStore((s) => s.setSelectedTileHFlip);
  const setV = useEditorStore((s) => s.setSelectedTileVFlip);
  const setP = useEditorStore((s) => s.setSelectedTilePriority);

  return (
    <SectionBody>
      <div style={{ display: 'flex', flexDirection: 'column', gap: T.s3 }}>
        <Row label="Flip">
          <Chip
            active={hFlip}
            onClick={() => setH(!hFlip)}
            title="Brush: horizontal flip — mirror the painted tile left-to-right"
          >X flip</Chip>
          <Chip
            active={vFlip}
            onClick={() => setV(!vFlip)}
            title="Brush: vertical flip — mirror the painted tile top-to-bottom"
          >Y flip</Chip>
        </Row>
        <Row label="Priority">
          {PRIORITY_CHIPS.map((c) => (
            <Chip key={c.value} active={priority === c.value} onClick={() => setP(c.value)} title={c.title}>
              {c.label}
            </Chip>
          ))}
        </Row>
        <p style={{ margin: 0, fontSize: T.tXs, color: T.textLo, lineHeight: 1.4 }}>
          {priority === 'keep'
            ? 'Painting leaves each cell\'s priority as it found it. Pick On or Off to author it — '
              + 'the priority lens comes on so you can see what you are changing.'
            : `Painting sets priority ${priority === 'on' ? 'ON' : 'OFF'} on every cell it touches.`}
        </p>
      </div>
    </SectionBody>
  );
}
