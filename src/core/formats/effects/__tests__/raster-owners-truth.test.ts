// RASTER OWNERSHIP, HELD TO WHAT AEON'S OWN CODE SAYS ABOUT THE SAME BYTES.
//
// Ruling REGION-MODE-RASTER-FALSE-OUTPUT-b1 (2026-09-17), condition 2: the
// section-mode verdicts may change only where aeon's rename made them false, and
// each change is shown against an aeon-current fixture, on a section-mode act AND
// a region-mode act. The first build's SHA golden proved the verdicts did not
// MOVE. These rows prove they are TRUE.
//
// ═══ WHAT "TRUE" IS MEASURED AGAINST ═══
//
// `test/fixtures/effects/raster-owners/*.aeon-truth.json`: the stdout of
// `aeon_truth_probe.py`, which imports aeon's own `tools/effects_gen.py` and
// `tools/effects_seam_gate.py` at aeon `c7ebe7a1` and calls `owner_maps`,
// `raster_call_sites`, `channel_call_sites` and `_rekey_bound_to_record` over
// two trees. No Aurora code produced either record. The trees, and why the
// section-mode one is a CONSTRUCTION (aeon's tree has no section-mode act that
// threads rasters), are in `raster-owners/aeon_truth_probe.provenance.json`.
//
// ⚠ THE RECORDS NAME THEIR INPUTS BY sha256, and the first rows here check those
// against the vendored bytes these rows read. A re-vendored library beside a
// stale truth record fails there, before any comparison can pass on bytes aeon
// was never asked about.
//
// Collected by vitest's `src/**/__tests__/**/*.test.ts` (vitest.config.ts).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  readDescriptorWiring, libraryRasterChooserCalls, libraryChannelCalls,
  libraryPatchedArmBindings, rasterChooserName, rasterOwners, rasterHomes,
  sectionWiringConditions, sectionRasterState, sectionRasterAdvisory, threadedSections,
  ownPresetSections, sectionExtraChannelsCondition, EXTRA_SECTION_CHANNELS,
  type SectionRasterWiring,
} from '../section-wiring';
import { parseSectionMeta } from '../../section-meta';
import { parseRegionsDocument } from '../../regions/document';

const FIX = join(__dirname, '..', '..', '..', '..', '..', 'test', 'fixtures', 'effects');
const OWN = join(FIX, 'raster-owners');

type Truth = {
  has_act_regions: boolean;
  fn_preset_raster: string;
  'owner_maps.raster_refs': Record<string, string>;
  'owner_maps.owner_records': Record<string, string>;
  raster_call_sites: Record<string, string>;
  channel_call_sites: Record<string, Record<string, Record<string, number[]>>>;
  _rekey_bound_to_record: Record<string, string>;
  homes_whose_record_threads_itself: string[];
  sha256_of_inputs: Record<string, string>;
};

const bytes = (p: string): Buffer => readFileSync(p);
const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
const truth = (name: string): Truth => JSON.parse(readFileSync(join(OWN, name), 'utf8')) as Truth;

const LIB_PATH = join(FIX, 'ojz_effects.emp');
const lib = bytes(LIB_PATH).toString('utf8');
const CH = rasterChooserName('ojz', 'act1');

const SECTION_FILES = ['section_0', 'section_4', 'section_5', 'section_6', 'section_7', 'section_8']
  .map((n) => `${n}.meta.json`);

describe('the truth records describe the bytes these rows read', () => {
  it('the section-mode record hashed the vendored library, descriptor and every vendored sidecar', () => {
    const t = truth('section-mode.aeon-truth.json');
    expect(t.has_act_regions, 'the section-mode record says aeon saw a regions.json').toBe(false);
    expect(t.sha256_of_inputs.library).toBe(sha256(bytes(LIB_PATH)));
    expect(t.sha256_of_inputs.descriptor)
      .toBe(sha256(bytes(join(OWN, 'section-mode', 'act_descriptor.emp'))));
    const sidecarKeys = Object.keys(t.sha256_of_inputs).filter((k) => k.endsWith('.meta.json')).sort();
    expect(sidecarKeys, 'aeon read a different set of sidecars than is vendored').toEqual(SECTION_FILES);
    for (const f of SECTION_FILES) {
      expect(t.sha256_of_inputs[f], f).toBe(sha256(bytes(join(OWN, 'section-mode', f))));
    }
  });

  it('the region-mode record hashed the vendored library and regions.json', () => {
    const t = truth('region-mode.aeon-truth.json');
    expect(t.has_act_regions, 'the region-mode record says aeon saw no regions.json').toBe(true);
    expect(t.sha256_of_inputs.library).toBe(sha256(bytes(LIB_PATH)));
    expect(t.sha256_of_inputs['regions.json']).toBe(sha256(bytes(join(FIX, 'ojz_act1.regions.json'))));
  });
});

describe('a SECTION-MODE act (the labelled construction): Aurora\'s derivation equals aeon\'s', () => {
  const t = truth('section-mode.aeon-truth.json');
  const desc = bytes(join(OWN, 'section-mode', 'act_descriptor.emp')).toString('utf8');
  const sidecarRefs: Record<number, string | null> = {};
  for (const f of SECTION_FILES) {
    const n = Number(/section_(\d+)/.exec(f)![1]);
    sidecarRefs[n] = parseSectionMeta(bytes(join(OWN, 'section-mode', f)).toString('utf8')).rasterRef;
  }
  // THE LOAD'S OWN DESCRIPTOR STEP (`readDescriptorWiring` is what load.ts assigns).
  const w: SectionRasterWiring = {
    ...readDescriptorWiring('act_descriptor.emp', desc, 'ojz'),
    threadedBy: libraryRasterChooserCalls(lib, CH),
    channelThreadedBy: libraryChannelCalls(lib, 'ojz', 'act1'),
    patchedArm: libraryPatchedArmBindings(lib),
    library: { path: 'ojz_effects.emp', parsed: true },
  };
  const sectionCount = Object.keys(t['owner_maps.owner_records']).length;
  const homes = t.homes_whose_record_threads_itself.map(Number);

  it('the raster chooser name is aeon\'s fn_preset_raster', () => {
    expect(CH).toBe(t.fn_preset_raster);
  });

  it('the section -> record map equals aeon owner_maps\' owner_records', () => {
    expect(w.descriptor.parsed, `the load's descriptor step refused: ${w.descriptor.reason}`).toBe(true);
    expect(sectionCount, 'aeon reported no owners: the record measured nothing').toBeGreaterThan(0);
    const got = Object.fromEntries(Object.entries(w.bindings).map(([k, v]) => [String(k), v]));
    expect(got).toEqual(t['owner_maps.owner_records']);
  });

  it('the record -> keyed record map equals aeon raster_call_sites', () => {
    expect(Object.keys(t.raster_call_sites).length, 'aeon found no raster call site').toBeGreaterThan(0);
    expect(w.threadedBy).toEqual(t.raster_call_sites);
  });

  it('the patch channel call sites equal aeon channel_call_sites', () => {
    for (const channel of ['patch world-Y', 'patch motion']) {
      expect(Object.keys(t.channel_call_sites[channel]).length, `${channel}: aeon found none`)
        .toBeGreaterThan(0);
      expect(w.channelThreadedBy[channel], channel).toEqual(t.channel_call_sites[channel]);
    }
  });

  it('rasterOwners + rasterHomes give aeon\'s homes as wired and aeon\'s raster_refs owners as bound', () => {
    const owners = rasterOwners({ regionRows: null, bindings: w.bindings, sidecarRasterRefs: sidecarRefs });
    const h = rasterHomes(owners, w.threadedBy);
    expect(h.wired).toEqual(homes);
    expect(h.bound).toEqual(Object.keys(t['owner_maps.raster_refs']).map(Number).sort((a, b) => a - b));
    // The re-key: each bound owner's record maps to its document, as aeon's does.
    const rekeyed = Object.fromEntries(owners.filter((o) => o.rasterRef !== null)
      .map((o) => [o.record, o.rasterRef]));
    expect(rekeyed).toEqual(t._rekey_bound_to_record);
  });

  it('condition 2 says yes on exactly aeon\'s homes, and names the record-keyed call', () => {
    expect(homes.length, 'aeon has no home: nothing to hold condition 2 to').toBeGreaterThan(0);
    for (let s = 0; s < sectionCount; s++) {
      const c = sectionWiringConditions(w, s, CH);
      const record = t['owner_maps.owner_records'][String(s)];
      const isHome = homes.includes(s);
      expect(c.threaded.verdict, `section ${s}`).toBe(isHome ? 'yes' : 'no');
      expect(c.threaded.detail, `section ${s}`).toBe(isHome
        ? `${record} threads ${t.fn_preset_raster}(preset: ${record}_KEY)`
        : `nothing threads ${t.fn_preset_raster}(preset: ${record}_KEY)`);
      expect(sectionRasterState(w, s), `section ${s}`).toBe(isHome ? 'wired' : 'unthreaded');
    }
    expect(threadedSections(w, sectionCount)).toEqual(homes);
  });

  it('condition 1 says yes for every section aeon gives a record', () => {
    const owned = Object.keys(t['owner_maps.owner_records']).map(Number).sort((a, b) => a - b);
    expect(ownPresetSections(w, sectionCount, CH)).toEqual(owned);
  });

  it('an unthreaded section\'s advisory quotes aeon\'s seam-gate message with the record key', () => {
    const s = [...Array(sectionCount).keys()].find((i) => !homes.includes(i))!;
    const record = t['owner_maps.owner_records'][String(s)];
    // effects_seam_gate.seam_faults at aeon c7ebe7a1: `no preset threads {fn}(preset: {rec}_KEY)`.
    expect(sectionRasterAdvisory(w, s, CH))
      .toContain(`no preset threads ${t.fn_preset_raster}(preset: ${record}_KEY)`);
  });

  it('condition 3 on a home is yes for the patch channels at exactly aeon\'s indices, and no one index past', () => {
    const home = homes.find((h) => {
      const r = t['owner_maps.owner_records'][String(h)];
      return (t.channel_call_sites['patch world-Y'][r] ?? {})[r] !== undefined;
    });
    expect(home, 'no home threads a patch channel in aeon\'s record').toBeDefined();
    const r = t['owner_maps.owner_records'][String(home)];
    const wy = t.channel_call_sites['patch world-Y'][r][r];
    const pm = t.channel_call_sites['patch motion'][r][r];
    const yes = sectionExtraChannelsCondition(w, home!, {
      patch_world_ys: wy.map(() => 0), patch_motion: pm.map(() => 0),
    }, 'ojz', 'act1');
    expect(yes.verdict).toBe('yes');
    const no = sectionExtraChannelsCondition(w, home!, {
      patch_world_ys: [...wy, wy.length].map(() => 0),
    }, 'ojz', 'act1');
    expect(no.verdict).toBe('no');
    const suffix = EXTRA_SECTION_CHANNELS.find((c) => c.channel === 'patch world-Y')!.chooserSuffix;
    expect(no.detail).toBe(`ojz_act1_preset_${suffix}(preset: ${r}_KEY) threaded only at ch ${wy.join(',')}`);
  });
});

describe('a REGION-MODE act (aeon c7ebe7a1\'s OJZ act 1): Aurora\'s derivation equals aeon\'s', () => {
  const t = truth('region-mode.aeon-truth.json');
  const doc = parseRegionsDocument(bytes(join(FIX, 'ojz_act1.regions.json')).toString('utf8'));
  const threadedBy = libraryRasterChooserCalls(lib, CH);

  it('the region -> record map equals aeon owner_maps\' owner_records', () => {
    const owners = rasterOwners({ regionRows: doc.regions, bindings: {}, sidecarRasterRefs: {} });
    expect(owners.length, 'the document parsed with no regions').toBeGreaterThan(0);
    expect(Object.fromEntries(owners.map((o) => [String(o.owner), o.record])))
      .toEqual(t['owner_maps.owner_records']);
  });

  it('rasterOwners + rasterHomes give aeon\'s homes as wired and aeon\'s raster_refs owners as bound', () => {
    const owners = rasterOwners({ regionRows: doc.regions, bindings: {}, sidecarRasterRefs: {} });
    const h = rasterHomes(owners, threadedBy);
    expect(t.homes_whose_record_threads_itself.length, 'aeon has no home').toBeGreaterThan(0);
    expect(h.wired.map(String).sort()).toEqual([...t.homes_whose_record_threads_itself].sort());
    expect(h.bound.map(String).sort()).toEqual(Object.keys(t['owner_maps.raster_refs']).sort());
    expect(Object.fromEntries(owners.filter((o) => o.rasterRef !== null)
      .map((o) => [o.record, o.rasterRef]))).toEqual(t._rekey_bound_to_record);
  });

  it('the library\'s record -> keyed record map equals aeon raster_call_sites here too', () => {
    expect(threadedBy).toEqual(t.raster_call_sites);
  });
});
