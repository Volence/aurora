// THE `In the ROM` PICKER'S TWO LABELS ARE PER TILE ANIMATION, AND MAY NOT
// SPEAK FOR THE ACT.
//
// ═══ THE FINDING (SHIP-SILENT-CLAIMS-THE-ACT, HIGH) ═══
//
// The option an author actually picks read:
//
//     ships silent (the act boots with BG animation off)
//
// which is a false statement about what ships whenever the act has a second,
// live tile animation. aeon's emitter writes the count word as the number of
// tile animations NOT carrying `default_off`:
//
//     live_bands = [b for b in bands if not b['default_off']]
//     pub data BgAnim_Table: u16 = {len(live_bands)}
//
// (aeon `tools/inject_editor_bg.py`, read at `origin/master` `22cf8b37`), so the
// act boots silent only when EVERY tile animation carries the key. The picker is
// a PER-BAND control -- it is inside the band card, beside Demote and Remove --
// and the labels must therefore describe the band and nothing wider.
//
// The correctly-quantified sentence existed the whole time, in
// `src/core/formats/bg-override/bg-override.ts`: *"a SINGLE-BAND act boots with
// BG animation off"*. The label dropped the qualifier and nothing compared the
// two. That is the same class as a paraphrase dropping a scope, and the reason
// this file exists is that neither string had a gate.
//
// ═══ WHAT THIS ROW COVERS, SAID EXACTLY ═══
//
// It reads the panel SOURCE and extracts the JSX text children of the `<option>`
// elements belonging to the ship-silent `<Select>`, identified by their
// `shipSilent` attribute expressions rather than by their text. It therefore
// covers *the authored labels of those two options* and nothing else: the
// `title` tooltips are `SHIP_SILENT_LEAD` and friends, which
// `providers/__tests__/bg-anim-aeon.ship-silent.test.ts` holds, and a label
// composed at runtime would be outside both. The node suite has no DOM, so this
// is source, not a render -- the same shape and the same disclosed limit as
// `band-vocabulary.test.ts` one directory over.
//
// ⚠ THE COUNT IS ASSERTED BEFORE THE TEXT IS. A selector that silently stopped
// matching would give this file zero labels to object to and go green, which is
// the failure mode a wording gate is most exposed to.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { AURORA_DIR } from '../../../../../test/support/sibling-root.mjs';

const PANEL = 'src/renderer/components/effects/BgAnimBandPanel.tsx';

/**
 * The JSX text children of every `<option>` in the panel whose attributes
 * mention `shipSilent` -- the two options of the `In the ROM` picker.
 *
 * KEYED ON THE ATTRIBUTE, NOT ON THE TEXT, because keying a wording gate on the
 * wording it is checking is how it stops matching the moment somebody rewords
 * the thing.
 */
function shipSilentOptionLabels(): string[] {
  const src = readFileSync(join(AURORA_DIR, PANEL), 'utf8');
  const sf = ts.createSourceFile(PANEL, src, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node)
      && node.openingElement.tagName.getText(sf) === 'option'
      && node.openingElement.attributes.getText(sf).includes('shipSilent')) {
      const text = node.children
        .filter(ts.isJsxText)
        .map(c => c.getText(sf).replace(/\s+/g, ' ').trim())
        .filter(s => s !== '')
        .join(' ');
      if (text !== '') out.push(text);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}

describe('the In the ROM picker\'s labels describe one tile animation, not the act', () => {
  const labels = shipSilentOptionLabels();

  it('finds exactly the two options the picker has', () => {
    // ANTI-VACUOUS, and it is the row that matters most here: with zero labels
    // extracted, every assertion below passes over an empty array.
    expect(labels).toHaveLength(2);
    // Both are the picker's own vocabulary, so a selector that had wandered onto
    // some other `<select>` in this file would fail here rather than silently
    // check the wrong control.
    for (const l of labels) expect(l).toMatch(/^ships /);
  });

  /**
   * ⚠ THE RULE IS "DOES NOT MENTION THE ACT", not "mentions the act correctly".
   * A short option label has no room for the quantifier, and a label that tried
   * to carry it would be the wrong fix: the act-level fact belongs in the
   * tooltip and the hint, which are the provider's constants and are gated
   * beside them. So the label's job is to say what happens to THIS tile
   * animation and stop.
   */
  it('neither label makes a claim about the act', () => {
    for (const l of labels) {
      expect(l, `option label: ${l}`).not.toMatch(/\bthe act\b/i);
      expect(l, `option label: ${l}`).not.toMatch(/\bacts?\b/i);
    }
  });

  it('the silencing label still says what it does to THIS tile animation', () => {
    const silent = labels.find(l => /silent/i.test(l));
    expect(silent, 'one label is the silencing one').toBeDefined();
    // It has to name the subject, or "ships silent" alone reads as a preview
    // setting -- the misreading the whole control is built against.
    expect(silent).toMatch(/this tile animation/i);
  });
});
