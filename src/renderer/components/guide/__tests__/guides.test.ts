// THE SHIPPED GUIDE, PARSED — against the REAL document, never a fixture.
//
// EFFECTS-W1 defect 1. The guide is imported with Vite's `?raw`, so these rows
// read the same bytes the app renders. A fixture here would prove the parser
// works on text this file wrote, which is the one input that cannot go wrong.
//
// ⚠ WHAT THESE ROWS CANNOT SEE. They prove the document parses into blocks and
// that every anchor the app deep-links to resolves. They do NOT prove the page
// is on screen, reachable, or scrolled to the right place — no DOM exists here.
// `scratchpad/effects-guide-harness.mjs` is the instrument for that, and it is
// where the "a first-time user can reach it" claim is actually measured.

import { describe, it, expect } from 'vitest';
import { GUIDES, GUIDE_ANCHORS, EFFECTS_GUIDE_SLUG, guideBySlug, guideBlocks, guideSections }
  from '../guides';
import { parseGuide, inline, slugify } from '../markdown-lite';
import { planFileNeedsWrite } from '../../../../core/project/aeon/save-skip';

const effects = guideBySlug(EFFECTS_GUIDE_SLUG)!;

describe('the guide reaches the app as text', () => {
  it('the markdown file really imported — this is not an empty string', () => {
    expect(effects).not.toBeNull();
    // ANTI-VACUOUS FLOOR. A `?raw` import that silently resolved to '' would
    // make every row below true of nothing: `parseGuide('')` is `[]`, and `[]`
    // satisfies "no block was dropped" perfectly.
    expect(effects.source.length).toBeGreaterThan(4000);
    expect(effects.source).toContain('# Backgrounds that move');
  });

  it('every guide in the registry has a slug, a title and a blurb', () => {
    const bad = GUIDES.filter((g) => !g.slug || !g.title || !g.blurb || g.source.length < 100);
    expect(bad.map((g) => g.slug)).toEqual([]);
  });
});

describe('the deep links the app wires resolve to real headings', () => {
  // AGGREGATED WITH NAMES. A `?` that scrolls nowhere is a dead help button,
  // and the failure has to name WHICH one — a per-anchor `it` would stop at the
  // first and say nothing about the rest.
  it('every GUIDE_ANCHORS entry is a heading slug in the shipped document', () => {
    const slugs = new Set(
      guideBlocks(effects)
        .filter((b) => b.kind === 'heading')
        .map((b) => (b as { slug: string }).slug),
    );
    const dead = Object.entries(GUIDE_ANCHORS)
      .filter(([, slug]) => !slugs.has(slug))
      .map(([name, slug]) => `${name} → #${slug}`);
    expect(dead, `${dead.length} deep link(s) point at a heading that no longer exists:\n  `
      + `${dead.join('\n  ')}\nheadings present: ${[...slugs].join(', ')}`).toEqual([]);
  });

  it('the contents rail lists the numbered sections, in order', () => {
    const rail = guideSections(effects).map((s) => s.text);
    expect(rail.length).toBeGreaterThan(5);
    expect(rail[0]).toMatch(/^1\./);
    // Each `##` is numbered and they ascend — a renumbering mistake in the
    // document shows up here rather than as a rail that reads out of order.
    const numbers = rail.map((t) => Number(/^(\d+)\./.exec(t)?.[1] ?? NaN));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(numbers.some(Number.isNaN)).toBe(false);
  });

  it('an anchor survives its section being RENUMBERED — the slug carries no number', () => {
    // The property `slugify` exists for, asserted directly rather than left to
    // be inferred from the row above.
    expect(slugify('3. Make a raster band (a coloured stripe)'))
      .toBe(slugify('9. Make a raster band (a coloured stripe)'));
  });
});

describe('the parser handles everything the shipped guide actually uses', () => {
  const blocks = parseGuide(effects.source);

  it('produces every block kind the document contains, and no unknown one', () => {
    const kinds = new Set(blocks.map((b) => b.kind));
    for (const k of ['heading', 'para', 'list', 'code', 'table', 'rule', 'quote']) {
      expect(kinds.has(k as never), `the guide has no ${k} block — either the document `
        + 'dropped that construct or the parser stopped recognising it').toBe(true);
    }
  });

  it('NO PROSE IS DROPPED: every non-blank source line reaches a block', () => {
    // THE ROW THAT MATTERS. A hand-rolled parser's real failure mode is not a
    // crash, it is a silently swallowed paragraph — a guide that reads fine and
    // is missing the sentence that would have saved the reader. Measured by
    // word count rather than line count, because paragraphs are re-wrapped.
    const words = (s: string): string[] =>
      s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);
    const rendered: string[] = [];
    for (const b of blocks) {
      if (b.kind === 'code') rendered.push(...words(b.text));
      else if (b.kind === 'table') {
        for (const c of b.head) rendered.push(...words(c.map((r) => r.text).join(' ')));
        for (const row of b.rows) {
          for (const c of row) rendered.push(...words(c.map((r) => r.text).join(' ')));
        }
      } else if (b.kind === 'list') {
        for (const it of b.items) rendered.push(...words(it.map((r) => r.text).join(' ')));
      } else if (b.kind !== 'rule') {
        rendered.push(...words(b.runs.map((r) => r.text).join(' ')));
      }
    }
    // ⚠ ORDERED-LIST MARKERS ARE NOT PROSE, and the first draft of this row
    // counted them: `1.` `2.` `3.` are consumed by the list parser on purpose
    // and re-supplied by the `<ol>`, so they show up as nine "swallowed" words
    // that the reader in fact still sees. Stripped from the SOURCE side rather
    // than allowed on the rendered side, so a genuinely dropped number inside a
    // sentence would still fail.
    const source = words(
      effects.source.replace(/```/g, ' ').replace(/^\s*\d+\.\s+/gm, ' '),
    );
    const have = new Map<string, number>();
    for (const w of rendered) have.set(w, (have.get(w) ?? 0) + 1);
    const missing: string[] = [];
    for (const w of source) {
      const n = have.get(w) ?? 0;
      if (n === 0) missing.push(w);
      else have.set(w, n - 1);
    }
    expect(missing, `${missing.length} source word(s) never reached a block — the parser `
      + `swallowed them: ${missing.slice(0, 30).join(' ')}`).toEqual([]);
  });

  it('inline marks never eat text, even when unclosed', () => {
    expect(inline('a **b** c').map((r) => r.text).join('')).toBe('a b c');
    expect(inline('a `b` c').map((r) => r.text).join('')).toBe('a b c');
    // The unclosed cases — a parser that dropped the tail here would lose the
    // rest of a sentence on one typo in the document.
    expect(inline('a **b c').map((r) => r.text).join('')).toBe('a **b c');
    expect(inline('a `b c').map((r) => r.text).join('')).toBe('a `b c');
    expect(inline('').length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §7's SAVE SENTENCE, TIED TO THE SAVE PATH THAT HAS TO MAKE IT TRUE.
// ═══════════════════════════════════════════════════════════════════════════
//
// The sentence this replaced — "Saving rewrites every editor file in the act,
// not just the ones you touched, so expect a large `git status`" — was true of
// the save path until `save-skip.ts` landed on 2026-09-02, and was still on the
// page on 2026-09-05 when a cold reader's real save moved TWO files
// (docs/reviews/2026-09-05-effects-cold-read.md, C6). A label that outlived its
// defect; its cost is that it teaches an author to discount the NEXT warning.
//
// It went stale because nothing connected the prose to the predicate. These
// rows are that connection, in the direction that matters: if someone weakens
// `planFileNeedsWrite` back to byte identity, this file goes red and names the
// guide sentence that would then be a lie. The prose row is the other direction
// and is deliberately narrow — it pins the CLAIM, not the wording.
describe("§7's save claim is the save path's actual rule", () => {
  const enc = (s: string) => new TextEncoder().encode(s);

  /** §7's own text, so a row cannot pass by matching a word somewhere else. */
  const saveSection = (() => {
    const from = effects.source.indexOf('## 7. Save, and build');
    if (from < 0) throw new Error('the guide has no "## 7. Save, and build" heading');
    const to = effects.source.indexOf('\n## ', from + 1);
    return effects.source.slice(from, to === -1 ? undefined : to);
  })();

  it('a document whose MEANING did not move is not written', () => {
    // Same parsed value, different bytes on every axis the retracted sentence
    // called "re-serialisation": key order, indentation, and the trailing
    // newline aeon's `json.dumps` writers do not emit.
    const onDisk = enc('{"sceneRef":"ojz_act1_start","paletteRef":null}');
    const planned = enc('{\n  "paletteRef": null,\n  "sceneRef": "ojz_act1_start"\n}\n');
    expect(planFileNeedsWrite('json', onDisk, planned)).toBe(false);
  });

  it('a document whose meaning DID move is still written — the floor', () => {
    // Without this row the one above is satisfied by a predicate that returns
    // false for everything, which would make the guide's sentence true and the
    // editor useless.
    const onDisk = enc('{"sceneRef":"ojz_act1_start","paletteRef":null}');
    const changed = enc('{"sceneRef":"coldread_drift","paletteRef":null}');
    expect(planFileNeedsWrite('json', onDisk, changed)).toBe(true);
  });

  it('§7 states that rule, and no longer promises a large git status', () => {
    expect(saveSection, 'the retracted over-warning is back in §7 — see C6')
      .not.toMatch(/large `git status`/);
    expect(saveSection, '§7 no longer tells the author what a save writes')
      .toMatch(/only when that file's\s+meaning changed/);
  });
});
