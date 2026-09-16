// LOAD-TIME VALIDATION OF A REGIONS DOCUMENT — editor spec §2.5, rules 2 and 3.
//
// ═══ WHAT THIS IS, AND WHERE RULE 1 LIVES ═════════════════════════════════
//
// §2.5 numbers six rules and says the messages cite the numbers. This module
// owns two of them:
//
//   rule 1  SHAPE: closed schema, unknown key, wrong type, bad id, duplicate id.
//           NOT HERE — it is a REFUSAL, not a notice. `parseRegionsDocument`
//           throws, the load records the file as `unreadable`, and the save then
//           neither overwrites nor removes it. The author's notice for rule 1 is
//           the refusal sentence load.ts pushes, which names the file and the
//           JSON pointer the codec reported.
//   rule 2  EVERY RECT INSIDE THE ACT, `w, h >= 1`. Here.
//   rule 3  EVERY BINDING RESOLVES. Here. §2.5 says in as many words that an
//           unresolvable binding is a NOTICE and that "Aurora reports an
//           unresolvable binding as a notice and does not clear it on save" — so
//           nothing in this file writes to the document, and the save path never
//           consults it. A notice is a sentence, not a repair.
//   rules 4 to 6  NOT HERE, and not by oversight:
//           • rule 4 (minimum span, reachable edges) needs `REGION_MIN_SPAN` and
//             `CENTRE_{X,Y}_{MIN,MAX}` from the act's `.emp` descriptor, which
//             this repository does not read. `region-geometry.ts`'s
//             `validateRect` implements them and takes the constants as an
//             argument, for the day something has them.
//           • rule 5 (a `section_N.meta.json` still carrying refs beside a
//             regions document) is a GENERATOR refusal with an editor status
//             line, and the status line belongs to the facet (§4).
//           • rule 6 (`bg.layoutRef` other than `"@act"`/null while the engine
//             has no consumer) is likewise the generator's, and the editor half
//             is the picker that stays locked until aeon consumes it (step 11).
//           A document green here can still be refused by aeon's build. That
//           sentence is written on both sides of the seam on purpose
//           (docs/reviews/2026-09-16-regions-seam-leg.md).
//
// ═══ COVERAGE AND NON-OVERLAP ARE NOT CHECKED HERE ════════════════════════
//
// The owner's Q1 ruling made them author-visible ENFORCED rules rather than
// properties produced by construction, and `region-geometry.ts` already answers
// both (`coverage`, `disjointness`). They are deliberately not load notices:
// under the ruled model an UNASSIGNED area is a first-class editing state — the
// thing the editor paints red and gives to a region in one action — and turning
// it into an error toast on every open would make an ordinary half-finished act
// shout at its author. It is a facet question (§3.4's status line), not a load
// question. Named here so the silence is not read as coverage.
//
// ═══ LOUD ON UNMEASURABLE ═════════════════════════════════════════════════
//
// The preset vocabulary comes from aeon's own `<zone>_effects.emp`, which a
// trimmed checkout may not have. `presetRecords: null` therefore means "Aurora
// could not read the library", and it produces a notice SAYING the bindings were
// not checked. It must never produce "every preset is unresolvable", which is
// what treating a failed read as an empty vocabulary would produce, and it must
// never produce silence, which would read as "checked, all fine".

import type { RegionsDocument } from './document';
import type { Notice } from '../../project/notice';
import { nameSome } from '../../project/notice';
import { validateRectInAct } from '../../editing/region-geometry';

/**
 * Everything rule 3 needs to answer "does this binding resolve", each half
 * carrying its own "I could not look" where one is possible.
 *
 * ⚠ THE `*Unreadable` LISTS ARE NOT A CONVENIENCE. A scene file that EXISTS and
 * refused is absent from the library's `scenes`, so a region pointing at it
 * would be reported "names no scene in the library" — sending the author to
 * create a file that is already there. The two facts are different and get
 * different sentences.
 */
export interface RegionBindingVocabulary {
  /**
   * `EffectsPreset` record names the act's effects library declares, or NULL
   * when Aurora could not read the library. Null is not an empty list.
   */
  presetRecords: string[] | null;
  /** The library's path, so a "could not check" sentence can name it. */
  presetLibraryPath: string;
  /** Scene ids the effects-scene library holds. */
  sceneIds: string[];
  /** Scene documents that exist and refused, by id. */
  sceneUnreadableIds: string[];
  /** Raster preset-document ids the preset library holds. */
  rasterIds: string[];
  /** Preset documents that exist and refused, by id. */
  rasterUnreadableIds: string[];
  /** BG-library entry ids whose bodies opened. */
  bgLayoutIds: string[];
  /** BG-library entries the manifest names whose bodies did not open. */
  bgUnresolvedIds: string[];
}

/** The act's own extent, which the document does not carry and must not invent. */
export interface ActExtent {
  actW: number;
  actH: number;
}

/**
 * The sentinel `bg.layoutRef` value meaning "the act's own background".
 *
 * RE-EXPORTED, NOT RESTATED. It is defined in `document.ts` since 2026-09-16 so
 * that `flatten.ts` can collapse it without importing this module (which would
 * drag the editing layer into a pure codec). Every existing importer keeps
 * reading it from here, and there is exactly one definition.
 */
export { BG_ACT_SENTINEL } from './document';
import { BG_ACT_SENTINEL } from './document';

/**
 * Rules 2 and 3 over one document, as notices for the author.
 *
 * PURE: no I/O, no model writes, no repair. Returns `[]` for a clean document,
 * which is what the overwhelming majority of them are.
 *
 * COALESCED PER RULE, not per region, on `notice.ts`'s own bar: a producer that
 * pushes one notice per fault can put an unbounded wall of ten-second error
 * toasts on screen. `nameSome` names three and counts the rest, and every
 * individual fault is still reachable through `findings`.
 */
export function regionsValidationNotices(
  doc: RegionsDocument,
  label: string,
  act: ActExtent,
  vocab: RegionBindingVocabulary,
): Notice[] {
  const notices: Notice[] = [];

  // ── Rule 2: every rect inside the act, w and h at least 1 ────────────────
  //
  // Through `validateRectInAct` rather than a second transcription: the editor's
  // geometry module is where these three rules are written, and two copies is
  // how the panel and the load come to disagree about the same rectangle.
  const outside: string[] = [];
  for (const region of doc.regions) {
    for (const f of validateRectInAct(region.rect, act, { regionId: region.id })) {
      outside.push(`${region.id} (${f.code})`);
    }
  }
  if (outside.length > 0) {
    notices.push({
      severity: 'warning',
      message:
        `${label}: ${outside.length} ${outside.length === 1 ? 'region lies' : 'regions lie'} `
        + `outside the act, which is ${act.actW} by ${act.actH} pixels: `
        + `${nameSome(outside)}. Regions rule 2. The build refuses these rows; fix them in the `
        + 'Regions panel.',
    });
  }

  // ── Rule 3: every binding resolves ───────────────────────────────────────
  //
  // Four bindings, four independent answers, each with its own sentence. They
  // are not folded into one "N bindings do not resolve" line because the repair
  // is different for each: a preset is aeon's `.emp`, a scene and a raster ref
  // are editor documents, a layout is the BG library.
  const unresolvedPresets: string[] = [];
  const unresolvedScenes: string[] = [];
  const refusedScenes: string[] = [];
  const unresolvedRasters: string[] = [];
  const refusedRasters: string[] = [];
  const unresolvedLayouts: string[] = [];
  const bodylessLayouts: string[] = [];

  const presets = vocab.presetRecords === null ? null : new Set(vocab.presetRecords);
  const scenes = new Set(vocab.sceneIds);
  const scenesRefused = new Set(vocab.sceneUnreadableIds);
  const rasters = new Set(vocab.rasterIds);
  const rastersRefused = new Set(vocab.rasterUnreadableIds);
  const layouts = new Set(vocab.bgLayoutIds);
  const layoutsBodyless = new Set(vocab.bgUnresolvedIds);

  for (const region of doc.regions) {
    if (presets !== null && !presets.has(region.preset)) {
      unresolvedPresets.push(`${region.id} → ${region.preset}`);
    }
    if (region.sceneRef != null) {
      if (scenesRefused.has(region.sceneRef)) refusedScenes.push(`${region.id} → ${region.sceneRef}`);
      else if (!scenes.has(region.sceneRef)) unresolvedScenes.push(`${region.id} → ${region.sceneRef}`);
    }
    if (region.rasterRef != null) {
      if (rastersRefused.has(region.rasterRef)) refusedRasters.push(`${region.id} → ${region.rasterRef}`);
      else if (!rasters.has(region.rasterRef)) unresolvedRasters.push(`${region.id} → ${region.rasterRef}`);
    }
    const layoutRef = region.bg?.layoutRef;
    if (layoutRef != null && layoutRef !== BG_ACT_SENTINEL) {
      if (layoutsBodyless.has(layoutRef)) bodylessLayouts.push(`${region.id} → ${layoutRef}`);
      else if (!layouts.has(layoutRef)) unresolvedLayouts.push(`${region.id} → ${layoutRef}`);
    }
  }

  // LOUD ON UNMEASURABLE. `presetRecords: null` is "the library could not be
  // read", and the author is told the presets went UNCHECKED — never that they
  // are fine (silence) and never that they are all broken (an empty vocabulary).
  if (presets === null && doc.regions.length > 0) {
    notices.push({
      severity: 'warning',
      message:
        `${label}: the effects library ${vocab.presetLibraryPath} could not be read, so the `
        + `\`preset\` binding of ${doc.regions.length} `
        + `${doc.regions.length === 1 ? 'region was' : 'regions were'} NOT CHECKED. `
        + 'Regions rule 3: a region whose preset names no record in that library is refused by '
        + 'the build.',
    });
  }
  if (unresolvedPresets.length > 0) {
    notices.push({
      severity: 'warning',
      message:
        `${label}: ${unresolvedPresets.length} region `
        + `${unresolvedPresets.length === 1 ? 'binding names' : 'bindings name'} an EffectsPreset `
        + `record that ${vocab.presetLibraryPath} does not declare: ${nameSome(unresolvedPresets)}. `
        + 'Regions rule 3. Aurora does not clear the binding; the build refuses it.',
    });
  }
  if (unresolvedScenes.length > 0) {
    notices.push({
      severity: 'warning',
      message:
        `${label}: ${unresolvedScenes.length} \`sceneRef\` `
        + `${unresolvedScenes.length === 1 ? 'names a scene' : 'name scenes'} the effects library `
        + `does not hold: ${nameSome(unresolvedScenes)}. Regions rule 3. Aurora does not clear `
        + 'the binding on save.',
    });
  }
  if (refusedScenes.length > 0) {
    notices.push({
      severity: 'warning',
      message:
        `${label}: ${nameSome(refusedScenes)}: the scene document EXISTS and Aurora could not `
        + 'read it, so this binding could not be checked. It is not missing; fix the scene file.',
    });
  }
  if (unresolvedRasters.length > 0) {
    notices.push({
      severity: 'warning',
      message:
        `${label}: ${unresolvedRasters.length} \`rasterRef\` `
        + `${unresolvedRasters.length === 1 ? 'names a preset document' : 'name preset documents'} `
        + `the library does not hold: ${nameSome(unresolvedRasters)}. Regions rule 3. Aurora does `
        + 'not clear the binding on save.',
    });
  }
  if (refusedRasters.length > 0) {
    notices.push({
      severity: 'warning',
      message:
        `${label}: ${nameSome(refusedRasters)}: the preset document EXISTS and Aurora could not `
        + 'read it, so this binding could not be checked. It is not missing; fix the preset file.',
    });
  }
  if (unresolvedLayouts.length > 0) {
    notices.push({
      severity: 'warning',
      message:
        `${label}: ${unresolvedLayouts.length} \`bg.layoutRef\` `
        + `${unresolvedLayouts.length === 1 ? 'names a background' : 'name backgrounds'} the BG `
        + `library does not hold: ${nameSome(unresolvedLayouts)}. Regions rule 3. Aurora does not `
        + 'clear the binding on save.',
    });
  }
  if (bodylessLayouts.length > 0) {
    // C hazard A, the UNTRACKED-BODY class: the manifest names the entry and one
    // of its binaries did not open. The id is not wrong — the checkout is
    // incomplete — so the sentence must not send the author to rename anything.
    notices.push({
      severity: 'warning',
      message:
        `${label}: ${nameSome(bodylessLayouts)}: the BG library NAMES this background and this `
        + 'checkout could not open its body, so the binding could not be checked. The reference '
        + 'is not wrong; the files are missing.',
    });
  }

  return notices;
}
