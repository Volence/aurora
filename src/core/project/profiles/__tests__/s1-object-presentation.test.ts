// Presentation over the S1 registries: link-identity dedup, the zone-free /
// zone-scoped section split, and the zone-availability classification behind
// the Object Library's "not loaded here" group and the placement warning.
//
// Every fixture below is HAND-DERIVED from the tables' own transcriptions
// (s1-object-art.ts cites the disasm lines), never read back from the code
// under test:
//   • $3D/$73/$75/$77/$7A all reuse the ONE `EGGMAN` const (Map_Eggman +
//     artnem/Boss - Main.nem) — the five zone bosses on the shared ship art.
//   • $82 (SBZ2 cutscene) and $85 (FZ boss) have SEPARATE `nem()` links that
//     happen to name the same file+frame — distinct objects, must NOT merge.
//   • Ring $25 is base-map only (artnem/Rings.nem via PLC_Main, the cue list
//     every level loads) — zone-free.
//   • Moto Bug $40 is linked ONLY under the ghz zone map (Nem_Motobug is
//     queued only by PLC_GHZ, _inc/Pattern Load Cues.asm:116).
//   • Jaws $2C is linked under lz and sbz only (LZ badnik; SBZ3 is an LZ act
//     slot in the zone maps).
//   • Teleporter $72 is in S1_INVISIBLE_OBJECT_IDS (objSBZ.ini debug=True —
//     a trigger with no art at all).
//   • Ending Animals $28 is named but linked in NO table.

import { describe, it, expect } from 'vitest';
import {
  s1ArtRowGroups,
  mergedRowLabel,
  groupIdsHex,
  s1LinkedZones,
  s1ObjectZoneAvailability,
  s1UnavailableRowNote,
  s1PlacementWarning,
} from '../s1-object-presentation';
import { resolveObjectArt, objectArtIsZoneFree } from '../s1-object-art';
import { S1_OBJECT_LIST } from '../s1-objects';
import { classicObjectRows } from '../../../../renderer/providers/object-list-classic';

describe('s1ArtRowGroups — link-identity dedup', () => {
  const ghz = s1ArtRowGroups('ghz');

  it('collapses the five Eggman ids sharing the one EGGMAN link into one row', () => {
    const eggman = ghz.filter((g) => g.ids.includes(0x3d));
    expect(eggman).toHaveLength(1);
    expect(eggman[0].ids).toEqual([0x3d, 0x73, 0x75, 0x77, 0x7a]);
    expect(eggman[0].id).toBe(0x3d); // canonical = lowest — the doc a click opens
    expect(eggman[0].label).toBe('Eggman (Boss)');
    // None of the swallowed ids surfaces as its own row.
    for (const id of [0x73, 0x75, 0x77, 0x7a]) {
      expect(ghz.filter((g) => g.id === id)).toHaveLength(0);
    }
  });

  it('the grouping is link identity, not id knowledge: every group re-derives from resolveObjectArt', () => {
    for (const g of ghz) {
      for (const id of g.ids) expect(resolveObjectArt(id, 'ghz')).toBe(g.link);
    }
  });

  it('ANTI-VACUOUS: a non-shared row does not group — $48 Wrecking Ball stays alone', () => {
    const ball = ghz.find((g) => g.id === 0x48);
    expect(ball).toBeDefined();
    expect(ball!.ids).toEqual([0x48]);
    expect(ball!.label).toBe('Boss Wrecking Ball');
  });

  it('ANTI-VACUOUS: value-equal but SEPARATE links do not merge — $82/$85 share a file, not a link', () => {
    // Same artFile+mapAsm+frame+pal, distinct objects (SBZ2 cutscene vs FZ
    // boss). Reference identity keeps them apart; a value-keyed dedup would
    // fail exactly here.
    const l82 = resolveObjectArt(0x82, 'ghz')!;
    const l85 = resolveObjectArt(0x85, 'ghz')!;
    expect(l82.artFile).toBe(l85.artFile);
    expect(l82.mapAsm).toBe(l85.mapAsm);
    expect(l82).not.toBe(l85);
    expect(ghz.find((g) => g.id === 0x82)!.ids).toEqual([0x82]);
    expect(ghz.find((g) => g.id === 0x85)!.ids).toEqual([0x85]);
  });

  it('ANTI-VACUOUS: Sonic ($01) is his own row — shares a link with nobody, merges with nobody', () => {
    // The $01 DPLC row (Parcel A) is a fresh link object: if the grouping ever
    // merged him into another row (or another id into his), his doc — the only
    // DPLC doc — would open the wrong art set. The Eggman assertions above
    // prove the merge machinery DOES merge where declared, so this is not
    // vacuously true.
    const sonic = ghz.find((g) => g.ids.includes(0x01));
    expect(sonic).toBeDefined();
    expect(sonic!.ids).toEqual([0x01]);
    expect(sonic!.label).toBe('Sonic');
    expect(sonic!.zoneFree).toBe(true); // one shared file, no zone map claims $01
    expect(sonic!.link.dplcAsm).toBe('_maps/Sonic - Dynamic Gfx Script.asm');
    // No OTHER group's link is Sonic's link object.
    for (const g of ghz) {
      if (g !== sonic) expect(g.link).not.toBe(sonic!.link);
    }
  });

  it('covers every linked id exactly once (dedup loses nothing, invents nothing)', () => {
    const linked = S1_OBJECT_LIST.filter((o) => resolveObjectArt(o.id, 'ghz') !== undefined)
      .map((o) => o.id);
    const covered = ghz.flatMap((g) => g.ids);
    expect([...covered].sort((a, b) => a - b)).toEqual(linked);
    expect(new Set(covered).size).toBe(covered.length);
  });

  it('subtitle helper spells the covered ids', () => {
    expect(groupIdsHex({ ids: [0x3d, 0x73, 0x7a] })).toBe('$3D · $73 · $7A');
  });
});

describe('s1ArtRowGroups — zone-free vs zonal section split', () => {
  it('GHZ: bosses and Ring are zone-free; Moto Bug and Crabmeat are GHZ-scoped', () => {
    const byId = new Map(s1ArtRowGroups('ghz').map((g) => [g.id, g]));
    expect(byId.get(0x3d)!.zoneFree).toBe(true); // Eggman group — base map, no zone override
    expect(byId.get(0x25)!.zoneFree).toBe(true); // Ring — PLC_Main art
    expect(byId.get(0x40)!.zoneFree).toBe(false); // Moto Bug — ghz map only
    expect(byId.get(0x1f)!.zoneFree).toBe(false); // Crabmeat — per-zone maps
  });

  it('the flag agrees with the table predicate for every group (derived, not stored)', () => {
    for (const g of s1ArtRowGroups('ghz')) {
      expect(g.zoneFree).toBe(g.ids.every(objectArtIsZoneFree));
    }
  });
});

describe('mergedRowLabel', () => {
  it('merges the Eggman qualifier family to the common trailing words', () => {
    expect(mergedRowLabel([
      'Eggman (GHZ Boss)', 'Eggman (MZ Boss)', 'Eggman (SYZ Boss)',
      'Eggman (LZ Boss)', 'Eggman (SLZ Boss)',
    ])).toBe('Eggman (Boss)');
  });
  it('drops the parenthetical entirely when qualifiers share no words', () => {
    expect(mergedRowLabel(['Eggman (SBZ2 Cutscene)', 'Eggman (FZ Boss)'])).toBe('Eggman');
  });
  it('falls back to the canonical name when the pattern does not hold', () => {
    expect(mergedRowLabel(['Trapdoor/Spinning Platform', 'Platform Conveyor Belt']))
      .toBe('Trapdoor/Spinning Platform');
  });
  it('passes a single name through', () => {
    expect(mergedRowLabel(['Ring'])).toBe('Ring');
  });
});

describe('s1ObjectZoneAvailability — hand-derived PLC cases', () => {
  it('Moto Bug ($40): available in GHZ (Nem_Motobug via PLC_GHZ), art-elsewhere in LZ', () => {
    expect(s1ObjectZoneAvailability(0x40, 'ghz')).toEqual({ kind: 'available' });
    expect(s1ObjectZoneAvailability(0x40, 'lz')).toEqual({ kind: 'art-elsewhere', zones: ['ghz'] });
  });

  it('Jaws ($2C) in GHZ: art-elsewhere, naming lz and sbz — the zones whose maps link it', () => {
    const a = s1ObjectZoneAvailability(0x2c, 'ghz');
    expect(a.kind).toBe('art-elsewhere');
    expect((a as { zones: string[] }).zones.sort()).toEqual(['lz', 'sbz']);
    expect(s1LinkedZones(0x2c).sort()).toEqual(['lz', 'sbz']);
  });

  it('Ring ($25): available in every zone — one base link via PLC_Main', () => {
    for (const z of ['ghz', 'lz', 'mz', 'slz', 'syz', 'sbz']) {
      expect(s1ObjectZoneAvailability(0x25, z)).toEqual({ kind: 'available' });
    }
  });

  it('Teleporter ($72): invisible trigger, not "missing art"', () => {
    expect(s1ObjectZoneAvailability(0x72, 'ghz')).toEqual({ kind: 'invisible' });
  });

  it('Ending Animals ($28): named but linked nowhere — no-art-link', () => {
    expect(s1ObjectZoneAvailability(0x28, 'ghz')).toEqual({ kind: 'no-art-link' });
  });
});

describe('s1PlacementWarning', () => {
  it('is silent for an available id and for an invisible trigger', () => {
    expect(s1PlacementWarning(0x40, 'ghz', 'Moto Bug')).toBeNull();
    expect(s1PlacementWarning(0x72, 'ghz', 'Teleporter')).toBeNull();
  });

  it('names the object, the zone, and where the art DOES load', () => {
    const w = s1PlacementWarning(0x2c, 'ghz', 'Jaws')!;
    expect(w).toContain('Jaws ($2C)');
    expect(w).toContain("GHZ's Pattern Load Cues never load its art");
    expect(w).toContain('LZ, SBZ');
  });

  it('stays honest for an id no table links: says what Aurora cannot vouch for', () => {
    const w = s1PlacementWarning(0x28, 'ghz', 'Ending Animals')!;
    expect(w).toContain('Ending Animals ($28)');
    expect(w).toContain('GHZ');
    expect(w).toContain('no table links art');
  });
});

describe('s1UnavailableRowNote', () => {
  it('zone open: names the zone and the zones that do load it', () => {
    const n = s1UnavailableRowNote(0x2c, 'ghz');
    expect(n).toContain('Not loaded in GHZ');
    expect(n).toContain('LZ, SBZ');
  });
  it('no zone open: explains the zone-scoping instead of blaming a zone', () => {
    expect(s1UnavailableRowNote(0x40, null)).toContain('GHZ');
    expect(s1UnavailableRowNote(0x40, null)).toContain('open one of those acts');
  });
  it('invisible ids get the trigger note, not a missing-art claim', () => {
    expect(s1UnavailableRowNote(0x72, 'ghz')).toContain('Invisible trigger');
  });
});

describe('placement rows are untouched by the display-side dedup', () => {
  it('classicObjectRows offers no id past $7F — objpos bit 7 is the remember-state flag', () => {
    const rows = classicObjectRows('ghz');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(Number(r.key)).toBeLessThanOrEqual(0x7f);
    // Anti-vacuous: the ids exist in the registry, so the filter did real work.
    expect(S1_OBJECT_LIST.some((o) => o.id > 0x7f)).toBe(true);
  });

  it('every per-zone boss id keeps its OWN placement row — the merge is display-only', () => {
    // $3D places the GHZ boss and $73 the MZ boss; collapsing them in a
    // placement surface would remove the ability to place four of the five.
    const keys = new Set(classicObjectRows('ghz').map((r) => Number(r.key)));
    for (const id of [0x3d, 0x73, 0x75, 0x77, 0x7a]) expect(keys.has(id)).toBe(true);
  });
});
