// THE ACT ROW SAYS WHY IT CANNOT BE EDITED, IN TEXT, ON SCREEN.
//
// THE RULING. `docs/superpowers/notes/2026-09-16-regions-panel-three-calls.md`
// CALL 3: the act row stays, is called `act`, and stays read-only, but the
// sentence explaining that lived only in a `title=` on its `Card`. A tooltip is
// not a representation: an author who never hovers never learns why the row
// takes no click, and "the control is absent" plus "the reason is invisible" is
// the state-by-absence shape this panel refuses everywhere else.
//
// ⚠ WHY THIS ROW CANNOT BE A STRING SEARCH, AND CANNOT BE THE PROVIDER'S.
// `ACT_ROW_NOTE` existing in `regions-aeon.ts` proves nothing about the screen,
// and a query that matches a `title` attribute is green against exactly the
// defect being fixed. So this row takes the element tree `ActRow` really
// returns and collects its TEXT CHILDREN ONLY, never a prop. Move the sentence
// back into `title` alone and the row goes red, which is the plant it was
// written against.
//
// The instrument is checked before it is trusted, two ways: a control element
// carrying the sentence in an ATTRIBUTE must NOT be found (so the walker cannot
// be fooled by the defect), and the row's other known text must be found (so a
// walker that silently returns nothing cannot read as "the sentence is absent"
// for the wrong reason).
//
// NO DOM, NO REACT RENDERER, NO APP. `ActRow` takes no hooks, so it is called as
// the plain function it is, the way `object-inspector-field-bounds.test.ts`
// calls `FieldRow`. That the app MOUNTS this row is the CDP harness's claim
// (`scratchpad/regions-facet-harness.mjs`), not this file's.

import { describe, it, expect } from 'vitest';
import React from 'react';
import { ActRow } from '../RegionsPanel';
import {
  ACT_ROW_NOTE,
  actBindingDefaults,
  actListRow,
  regionListRows,
  regionStatusRows,
  type RegionsPanelState,
} from '../../../providers/regions-aeon';
import type { RegionBindingVocabulary } from '../../../../core/formats/regions/validate';
import type { RegionsDocument } from '../../../../core/formats/regions/document';
import { SECTION_PIXEL_SIZE } from '../../../../core/model/s4-types';
import { regionRulesNotRead } from '../../../../core/formats/regions/act-constants';

const ACT = { actW: SECTION_PIXEL_SIZE, actH: SECTION_PIXEL_SIZE };
const ACT_SCENE = 'ojz_act1_start';

const VOCAB: RegionBindingVocabulary = {
  presetRecords: ['OJZ_Preset_Plain'],
  presetLibraryPath: 'games/sonic4/data/effects/ojz_effects.emp',
  sceneIds: [ACT_SCENE],
  sceneUnreadableIds: [],
  rasterIds: [],
  rasterUnreadableIds: [],
  bgLayoutIds: [],
  bgUnresolvedIds: [],
};

function openState(): Extract<RegionsPanelState, { kind: 'open' }> {
  const doc: RegionsDocument = {
    schema: 1,
    act: 'ojz_act1',
    regions: [{
      id: 'forest', name: 'Forest', preset: 'OJZ_Preset_Plain',
      rect: { x: 0, y: 0, w: ACT.actW, h: ACT.actH },
    }],
  };
  const defaults = actBindingDefaults(ACT_SCENE);
  return {
    kind: 'open',
    actId: doc.act,
    doc,
    defaults,
    act: ACT,
    rows: regionListRows(doc, defaults, []),
    actRow: actListRow(doc, defaults, []),
    status: regionStatusRows({
      doc, act: ACT, vocab: VOCAB, sidecarsWithRefs: 0,
      rules: regionRulesNotRead('this test builds no aeon files'),
    }),
    selected: null,
    presetRecords: VOCAB.presetRecords,
  };
}

/**
 * Every STRING the tree would put on screen, and nothing else.
 *
 * Props are never read. `title`, `aria-label` and every other attribute are
 * invisible to this function BY CONSTRUCTION, which is the property the rows
 * below are about; the control test proves it rather than asserting it.
 */
function visibleText(node: unknown): string {
  if (node === null || node === undefined || node === false || node === true) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(visibleText).join('');
  if (typeof node !== 'object') return '';
  const el = node as React.ReactElement<{ children?: unknown }>;
  return el.props ? visibleText(el.props.children) : '';
}

describe('the act row carries its read-only reason in VISIBLE TEXT (ruling CALL 3)', () => {
  it('CONTROL: the walker reads text children and is blind to attributes', () => {
    // If this row is ever green for the wrong reason, every row below it is
    // measuring nothing. The sentence is placed in a `title` exactly as the
    // defect placed it, and must not be found.
    const planted = React.createElement(
      'div', { title: ACT_ROW_NOTE }, React.createElement('span', null, 'on screen'),
    );
    expect(visibleText(planted)).toContain('on screen');
    expect(visibleText(planted)).not.toContain(ACT_ROW_NOTE);
  });

  it('ANTI-VACUOUS: the row renders text at all, including the act it is about', () => {
    const text = visibleText(ActRow({ state: openState() }));
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('act');
    expect(text).toContain(openState().actRow.actId);
  });

  it('the reason is in the rendered text, not only in the tooltip', () => {
    // Derived from the provider's constant, never retyped: a retyped
    // expectation goes green against a panel showing different words.
    expect(visibleText(ActRow({ state: openState() }))).toContain(ACT_ROW_NOTE);
  });

  it('and the sentence itself says the two things the ruling owes the reader', () => {
    // The row is about WHOSE values these are and WHY they are not editable.
    // Asserted on the constant, so a sentence rewritten into something that no
    // longer answers either question fails here rather than on screen.
    expect(ACT_ROW_NOTE).toMatch(/inherit/i);
    expect(ACT_ROW_NOTE).toMatch(/cannot be edited|read-only|not edited/i);
  });

  it('the tooltip is KEPT: a hover still answers, and it answers the same words', () => {
    // The ruling said the visible line is owed, not that the title is wrong.
    // Reading the prop here is correct: this row IS about the attribute.
    const el = ActRow({ state: openState() }) as React.ReactElement<{ title?: string }>;
    expect(el.props.title).toBe(ACT_ROW_NOTE);
  });
});
