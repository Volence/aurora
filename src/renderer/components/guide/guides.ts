// THE GUIDES THE APP CAN OPEN, AND WHERE THEIR TEXT COMES FROM.
//
// ⚠ THE MARKDOWN FILE UNDER `docs/` IS THE ONLY COPY. It is imported with
// Vite's `?raw`, so the page a first-time author reads in Aurora and the
// document a reviewer reads in the repository are the SAME BYTES. The
// alternative — a `.tsx` transcription of the guide — is the shape that goes
// stale silently: the walkthrough this guide came out of already records a
// panel whose prose had been true and was not any more.
//
// `guides.test.ts` parses the real imported text and asserts the sections the
// app deep-links to still exist, so a heading rename in the markdown fails the
// suite rather than producing a `?` button that scrolls nowhere.

import effectsFirstRun from '../../../../docs/guides/effects-first-run.md?raw';
import { parseGuide, guideOutline, type GuideBlock } from './markdown-lite';

export interface Guide {
  /** URL-safe id — also the tab id's suffix, so a restored tab finds its text. */
  slug: string;
  /** Tab title and card label. */
  title: string;
  /** One line, for the Home card. */
  blurb: string;
  /** The markdown, verbatim from `docs/guides/`. */
  source: string;
}

export const EFFECTS_GUIDE_SLUG = 'effects-first-run';

export const GUIDES: readonly Guide[] = Object.freeze([
  Object.freeze({
    slug: EFFECTS_GUIDE_SLUG,
    title: 'Backgrounds that move',
    blurb: 'Parallax, raster bands, palette cycles and tile animations: your first ten minutes.',
    source: effectsFirstRun,
  }),
]);

export function guideBySlug(slug: string): Guide | null {
  return GUIDES.find((g) => g.slug === slug) ?? null;
}

/**
 * The anchors the app deep-links to, by name.
 *
 * NAMED CONSTANTS AND NOT LITERALS AT THE CALL SITES, so a heading rename
 * breaks in ONE place and `guides.test.ts` names which link went dead. The
 * cold walkthrough lost the most time at exactly these four places, which is
 * why they are the four that get a `?` of their own.
 */
export const GUIDE_ANCHORS = Object.freeze({
  whatThisTabDoes: 'what-does-this-tab-do',
  parallaxLayer: 'make-the-background-drift-a-parallax-layer',
  rasterBand: 'make-a-raster-band-a-coloured-stripe',
  paletteCycle: 'make-a-palette-cycle-shimmer',
  bindSection: 'bind-it-to-a-section',
  saveAndBuild: 'save-and-build',
  twoKindsOfBand: 'tile-animations-are-not-raster-bands',
});

/** Parsed once per source string — the tab re-renders far more often than the
 *  document changes, and the guide is thousands of lines of runs. */
const cache = new Map<string, GuideBlock[]>();

export function guideBlocks(guide: Guide): GuideBlock[] {
  const hit = cache.get(guide.slug);
  if (hit) return hit;
  const blocks = parseGuide(guide.source);
  cache.set(guide.slug, blocks);
  return blocks;
}

export function guideSections(guide: Guide): { slug: string; text: string }[] {
  return guideOutline(guideBlocks(guide));
}
