// A SECTION-MODE ACT KEEPS EVERY RASTER VERDICT, BYTE FOR BYTE (ruling B, condition 2).
//
// Ruling B suppresses the section-keyed raster verdicts on a REGION-MODE act.
// The other half of the ruling is that an act with no regions.json sees
// exactly what it saw before. This file pins that half as a GOLDEN: every
// verdict the effects strip and the band-preset panel paint, for four sections
// of one hand-built section-mode act, serialised to JSON and compared as a
// string.
//
// ⚠ IT IMPORTS ONLY FUNCTIONS THAT EXISTED BEFORE RULING B, ON PURPOSE. That is
// what lets the same file run against the pre-ruling tree (aurora d838814d)
// and against the tip: the string below was produced at the pre-ruling tree,
// and a green here at the tip means none of these functions moved. That the
// components still CALL them on a section-mode act (the gate is null there) is
// `region-mode-raster.test.ts`'s job, not this file's.
//
// The fixture is built to reach every verdict tier: a section whose record is
// shared (condition 1 no), one whose record threads the chooser (condition 2
// yes), one whose record binds `patched:` (the arm refusal), a bound section
// with no other binder (the rebind note), and a document carrying `cycles` so
// condition 3 has a gap to report.

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  sectionRasterState, sectionRasterAdvisory, sectionWiringConditions, threadedSections,
  ownPresetSections, boundSections, sectionExtraChannelsCondition, extraChannelsAdvisory,
  sectionArmExclusivityRefusal, sectionArmExclusivityUnknownNotice, sectionBindingControlDisabled,
  type SectionRasterWiring,
} from '../../../../core/formats/effects/section-wiring';
import {
  rebindOrphanNotice, deletePresetRefusal, presetRefOptions, unassignablePresetRef,
  sectionPresetCommand, RASTER_REF_ROW, PRESET_LIMITS,
} from '../../../providers/effects-preset';
import type { EffectsPresetLibrary } from '../../../../core/formats/effects/preset';

const CHOOSER = 'zz_act1_sec_raster';

const wiring = (): SectionRasterWiring => ({
  bindings: { 0: 'ZZ_Preset_Sec0', 1: 'ZZ_Preset_Sec1', 2: 'ZZ_Preset_Shared', 3: 'ZZ_Preset_Shared' },
  threadedBy: { ZZ_Preset_Sec1: 1 },
  channelThreadedBy: {},
  patchedArm: { ZZ_Preset_Sec0: 'ZZ_WorldWater' },
  descriptor: { path: 'games/zz/act_descriptor.emp', parsed: true },
  library: { path: 'games/zz/zz_effects.emp', parsed: true },
});

const library = (): EffectsPresetLibrary => ({
  presets: [
    { schema: 1, id: 'glare', name: 'Glare', bands: [] },
    { schema: 1, id: 'dusk', name: 'Dusk', bands: [], cycles: { channels: [] } },
  ] as never,
  unreadable: [],
  notices: [],
  loadedPaths: [],
});

const sections = [
  { rasterRef: null as string | null },
  { rasterRef: 'glare' as string | null },
  { rasterRef: 'dusk' as string | null },
  { rasterRef: null as string | null },
];

/** Every section-keyed raster reading the two surfaces paint, for one section. */
function readings(i: number) {
  const w = wiring();
  const lib = library();
  const ref = sections[i].rasterRef;
  const doc = ref === null ? null : (lib.presets.find((p) => p.id === ref) ?? null);
  const extra = sectionExtraChannelsCondition(w, i, doc as never, 'zz', 'act1', ref);
  return {
    state: sectionRasterState(w, i),
    advisory: sectionRasterAdvisory(w, i, CHOOSER),
    conditions: sectionWiringConditions(w, i, CHOOSER),
    extra,
    extraAdvisory: extraChannelsAdvisory(extra.gaps, i, ref, w.bindings[i]),
    armRefusal: sectionArmExclusivityRefusal(w, i, CHOOSER),
    armUnknown: sectionArmExclusivityUnknownNotice(w, i),
    controlDisabled: sectionBindingControlDisabled(w, i, ref),
    rebindNotice: rebindOrphanNotice(sections, i),
    unassignable: unassignablePresetRef(lib, ref, i),
    command: sectionPresetCommand(i, ref, 'glare'),
  };
}

function actReadings() {
  const w = wiring();
  return {
    threaded: threadedSections(w, sections.length),
    own: ownPresetSections(w, sections.length, CHOOSER),
    bound: boundSections(sections),
    deleteRefusal: deletePresetRefusal(sections, 'glare'),
    options: presetRefOptions(library()),
    row: RASTER_REF_ROW,
    limitKeys: PRESET_LIMITS.map((l) => l.key),
  };
}

/**
 * SHA-256 and length of `snapshot()`, produced at aurora d838814d (before ruling
 * B). A hash rather than the 9 KB string so the pin is exact without pasting
 * aeon-flavoured prose into this file; a mismatch prints the whole snapshot, so
 * the diff is one copy away.
 */
const GOLDEN_SHA256 = '421772df25e699ab5dae35d296eb00324a60a68b615bbfa6eb32a45d5c2de240';
const GOLDEN_LENGTH = 6483;

const snapshot = () => JSON.stringify({
  sections: [0, 1, 2, 3].map(readings),
  act: actReadings(),
});

describe('a section-mode act\'s raster verdicts are the pre-ruling-B bytes', () => {
  it('every verdict tier is reached, so the golden is not a string of nulls', () => {
    const all = [0, 1, 2, 3].map(readings);
    expect(all.some((r) => r.conditions.ownPreset.verdict === 'no'), 'no shared record').toBe(true);
    expect(all.some((r) => r.conditions.threaded.verdict === 'yes'), 'nothing threaded').toBe(true);
    expect(all.some((r) => r.armRefusal !== null), 'no arm refusal').toBe(true);
    expect(all.some((r) => r.rebindNotice !== null), 'no rebind note').toBe(true);
    expect(all.some((r) => r.advisory !== null), 'no advisory').toBe(true);
    expect(actReadings().bound.length).toBeGreaterThan(0);
  });

  it('the serialised verdicts equal the golden, byte for byte', () => {
    const snap = snapshot();
    const sha = createHash('sha256').update(snap, 'utf8').digest('hex');
    expect({ sha, length: snap.length },
      `a section-mode verdict changed. The snapshot now reads:\n${snap}`)
      .toEqual({ sha: GOLDEN_SHA256, length: GOLDEN_LENGTH });
  });
});
