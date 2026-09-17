// THE ONE PLACE A `RegionBindingVocabulary` IS BUILT — editor spec §2.5 rule 3.
//
// ═══ WHY THIS IS A MODULE AND NOT TWO CALL SITES ══════════════════════════
//
// Two surfaces answer "does this binding resolve": the LOAD, which turns the
// answer into notices at open time (`project/aeon/load.ts`), and the REGIONS
// FACET's status line, which shows the same rules live while the author edits
// (`renderer/providers/regions-aeon.ts`, editor spec §3.4). Both need the same
// four libraries mapped onto the same seven fields, and mapping them twice is
// exactly how a panel and a load come to disagree about one document — the
// failure `validate.ts` already refuses inside itself by routing rule 2 through
// `validateRectInAct` rather than transcribing it a second time.
//
// So the mapping lives here and both callers pass it their libraries. The load
// additionally owns the ACT EXTENT argument, which is deliberately NOT built
// here: it comes from the act's grid, never from the document under test, and
// keeping it at the call site is what stops a future caller reaching for a bound
// the document itself supplied.
//
// ⚠ `presetRecords` IS NULL, NOT `[]`, WHEN THE LIBRARY WAS NOT PARSED. That
// distinction is the whole reason `SectionRasterWiring.library.parsed` is
// consulted here rather than `presetRecords` being read directly: an empty
// vocabulary means "the library declares no presets", which makes every region
// unresolvable, and an unparsed one means "Aurora could not look". The
// validator says different things about them and must be able to.

import type { RegionBindingVocabulary } from './validate';
import type { SectionRasterWiring } from '../effects/section-wiring';
import { sceneIdFromPath, type EffectsSceneLibrary } from '../effects/scene';
import { presetIdFromPath, type EffectsPresetLibrary } from '../effects/preset';
import type { BgLibraryEntry } from '../../model/s4-types';

/**
 * The ids of a library's REFUSED documents, from the paths it reports them by.
 *
 * ⚠ NARROW JOB, AND THE REASON IT EXISTS. An `unreadable` entry is a PATH,
 * while a region's `sceneRef` / `rasterRef` is an ID, and the validator has to
 * be able to say "that document exists and Aurora could not read it" instead of
 * "no such scene". A refused file is not a missing one and the two sentences
 * send an author to different places.
 *
 * THE PARSE IS THE LIBRARY'S, not this module's: `sceneIdFromPath` and
 * `presetIdFromPath` live beside the builders they invert and share their
 * directory functions (was a basename transcription here until
 * REGIONS-DOCID-TRANSCRIBED-INVERSE).
 *
 * A PATH THAT IS NOT A DOCUMENT OF THE LIBRARY IS DROPPED, never guessed. It
 * names no id, so no ref can be "refused" by it; a guessed basename could only
 * turn a genuinely missing document into a falsely "refused" one. The path is
 * not lost: the library's own notice already names every unreadable path.
 */
function refusedIds(
  unreadable: readonly { path: string }[],
  idFromPath: (path: string) => string | null,
): string[] {
  const ids: string[] = [];
  for (const u of unreadable) {
    const id = idFromPath(u.path);
    if (id !== null) ids.push(id);
  }
  return ids;
}

/** The four libraries rule 3 resolves a region's bindings against. */
export interface RegionVocabularySources {
  /**
   * The data root the two effects libraries were LOADED from — the parse of a
   * refused document's path is relative to it (`projectDataRoot(config.raw)`).
   */
  dataRoot: string;
  /** THIS ACT's wiring — the preset vocabulary is per act, not per project. */
  rasterWiring: SectionRasterWiring;
  effectsScenes: EffectsSceneLibrary;
  effectsPresets: EffectsPresetLibrary;
  bgLibrary: readonly BgLibraryEntry[];
  /** BG entries the manifest names whose bodies this checkout could not open. */
  bgLibraryUnresolved: readonly { id: string }[];
}

/** The vocabulary rule 3 checks against. Pure; no I/O. */
export function regionBindingVocabulary(
  src: RegionVocabularySources,
): RegionBindingVocabulary {
  return {
    // NULL, not [], when the library was not parsed — see the header.
    presetRecords: src.rasterWiring.library.parsed
      ? src.rasterWiring.presetRecords ?? []
      : null,
    presetLibraryPath: src.rasterWiring.library.path,
    sceneIds: src.effectsScenes.scenes.map((s) => s.id),
    sceneUnreadableIds: refusedIds(
      src.effectsScenes.unreadable, (p) => sceneIdFromPath(src.dataRoot, p)),
    rasterIds: src.effectsPresets.presets.map((p) => p.id),
    rasterUnreadableIds: refusedIds(
      src.effectsPresets.unreadable, (p) => presetIdFromPath(src.dataRoot, p)),
    bgLayoutIds: src.bgLibrary.map((b) => b.id),
    bgUnresolvedIds: src.bgLibraryUnresolved.map((b) => b.id),
  };
}
