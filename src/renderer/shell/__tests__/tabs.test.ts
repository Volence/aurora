import { describe, it, expect } from 'vitest';
import { classicLevelTab, aeonLevelTab, parseLevelTabId, spriteDocTab, parseSpriteDocTabId, PROJECT_SETUP_TAB, zoneArtDocId, parseZoneArtDocId } from '../tabs';

describe('level tab helpers', () => {
  it('classicLevelTab builds id from zone + act number and titles from the ref label', () => {
    expect(classicLevelTab({ zone: 'ghz', act: 1, label: 'Green Hill Act 1', available: true }))
      .toEqual({ id: 'level:ghz:1', kind: 'level', title: 'Green Hill Act 1' });
  });

  it('aeonLevelTab builds id from zone + act ids and titles from zone name + act id', () => {
    expect(aeonLevelTab('ehz', 'Emerald Hill', 'act1'))
      .toEqual({ id: 'level:ehz:act1', kind: 'level', title: 'Emerald Hill · act1' });
  });

  it('parseLevelTabId round-trips both id shapes', () => {
    expect(parseLevelTabId('level:ghz:1')).toEqual({ zone: 'ghz', act: '1' });
    expect(parseLevelTabId('level:ehz:act1')).toEqual({ zone: 'ehz', act: 'act1' });
  });

  it('parseLevelTabId rejects non-level and malformed ids', () => {
    expect(parseLevelTabId('home')).toBeNull();
    expect(parseLevelTabId('tool:project-setup')).toBeNull();
    expect(parseLevelTabId('level:ghz')).toBeNull();
    expect(parseLevelTabId('level::1')).toBeNull();
    expect(parseLevelTabId('level:ghz:')).toBeNull();
  });

  it('exposes the Project Setup tool tab descriptor', () => {
    expect(PROJECT_SETUP_TAB).toEqual({ id: 'tool:project-setup', kind: 'tool', title: 'Project Setup' });
  });

  it('builds and parses sprite-doc tab ids for both engines', () => {
    expect(spriteDocTab('s1', '42', 'Buzz Bomber')).toEqual(
      { id: 'doc:sprite:s1:42', kind: 'sprite-doc', title: 'Buzz Bomber' });
    expect(parseSpriteDocTabId('doc:sprite:aeon:motobug')).toEqual({ engine: 'aeon', ref: 'motobug' });
    expect(parseSpriteDocTabId('doc:sprite:s1:42')).toEqual({ engine: 's1', ref: '42' });
    expect(parseSpriteDocTabId('level:ojz:act1')).toBeNull();
    expect(parseSpriteDocTabId('doc:sprite:s1:')).toBeNull();
  });
});

describe('zone-art doc ids', () => {
  it('builds an id from a zone', () => {
    expect(zoneArtDocId('ghz')).toBe('zoneart:ghz');
  });

  it('round-trips', () => {
    expect(parseZoneArtDocId(zoneArtDocId('ojz'))).toEqual({ zone: 'ojz' });
  });

  it('rejects other doc kinds', () => {
    expect(parseZoneArtDocId('level:ghz:1')).toBeNull();
    expect(parseZoneArtDocId('zoneart:')).toBeNull();
  });
});
