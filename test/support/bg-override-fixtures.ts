/**
 * THE REAL BG-OVERRIDE FIXTURE, AND THE ONE FACT ABOUT IT NOBODY KNEW.
 *
 * `test/fixtures/bg-override/editor_bg_override.b0e5a661.json` is aeon's
 * historical two-band act, kept with provenance because it is real data: real
 * art, a real 4096-word nametable, two bands whose phase-0 banks are genuinely
 * prefix-identical to the blob, an unknown top-level key and an illegal
 * `palette`. Dozens of rows in this repo edit it, and that is the right thing
 * to edit.
 *
 * ⚠ IT DOES NOT FIT ITS ROM SECTION, AND IT NEVER DID. Its two bands cover 192
 * animated slots, and an animated slot is stored once per phase bank, so the
 * emitted `ojz_bg_anim` section is about two and a half times aeon's ruled
 * ceiling. aeon's own source names this exact act when it records a per-band
 * cap being tried and refuted ("this zone's own shipped content (32x4 + 16x4,
 * recoverable at b0e5a661) passes any generous per-band limit while its SUM is
 * 49,242 B"), and aeon deleted it for that reason. Aurora modelled only the
 * TILE budget until 2026-09-06, so nothing here could see it.
 *
 * WHAT THAT MEANS FOR A TEST. Aurora will now not let an author GROW a section
 * that is already over the ceiling — the doors that add or promote a tile
 * animation refuse, which is the whole point of the parcel that found this. So
 * a row that wants to exercise ADDING or PROMOTING on real data needs a real
 * document with room in its section, and this module is where that document is
 * derived. Rows that READ, round-trip, renumber or REMOVE keep the fixture
 * exactly as it is: none of those grow anything, and the fixture's own
 * over-budget state is part of what makes it a good subject.
 *
 * THE DERIVATION IS THE CODEC'S OWN DEMOTION, not a hand-edit. Demoting a band
 * turns its slots back into static art: `tiles` and `layout` are untouched in
 * content, the blob does not shrink, and the document stays coherent by
 * construction — which is exactly the property a fixture needs and a hand-built
 * JSON would not have. What changes is that the slots stop being ANIMATED, and
 * animated is the only thing the section budget charges for.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  bgOverrideSectionIssues,
  parseBgOverride,
  type BgOverrideDocument,
} from '../../src/core/formats/bg-override/bg-override';
import {
  demoteBand,
  documentBands,
  planBandDemotion,
} from '../../src/core/formats/bg-override/bg-anim-band';

/** Repo-relative, resolved from this file so a test's cwd cannot decide it. */
export const B0E5A661_FIXTURE = resolve(
  __dirname, '../fixtures/bg-override/editor_bg_override.b0e5a661.json',
);

/** The fixture exactly as it ships: two bands, and over its ROM section. */
export function b0e5a661Doc(): BgOverrideDocument {
  return parseBgOverride(readFileSync(B0E5A661_FIXTURE, 'utf8')).doc;
}

/**
 * The same document with `keepBands` of its tile animations left, the rest
 * demoted back to static art — so its ROM section has room to grow into.
 *
 * `keepBands` defaults to zero, which is the shape most editing rows want: all
 * the real art and layout, no animated slots spent, the whole section budget
 * available. Pass 1 for a row that needs a tile animation to already be there
 * (the fixture's SECOND band is the smaller one, so keeping one keeps that).
 *
 * THROWS IF THE RESULT STILL DOES NOT FIT, rather than handing back a document
 * that would make every row using it refuse for a reason the row does not
 * mention. A fixture helper that can silently fail to do its job is how a
 * whole file goes red for one reason and gets debugged for another.
 */
export function sectionRoomyDoc(keepBands = 0): BgOverrideDocument {
  let doc = b0e5a661Doc();
  while (documentBands(doc).length > keepBands) {
    // Demote the FIRST band each time: it is the largest, and demoting from the
    // front is the renumbering-heaviest case, so the document that comes out has
    // been through the codec's hardest path rather than its easiest.
    doc = demoteBand(doc, planBandDemotion(doc, 0));
  }
  const over = bgOverrideSectionIssues(doc);
  if (over.length > 0) {
    throw new Error(
      `sectionRoomyDoc(${keepBands}) did not produce a document with section room: ${over[0]}`);
  }
  return doc;
}
