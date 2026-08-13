import { describe, it, expect } from 'vitest';
import { classicLevelTab, aeonLevelTab, parseLevelTabId, spriteDocTab, parseSpriteDocTabId, isSpriteDocTabId, untitledSpriteTab, UNTITLED_SPRITE_TAB_ID, PROJECT_SETUP_TAB, zoneArtDocId, parseZoneArtDocId } from '../tabs';
import { UNTITLED_SPRITE_DOC_ID } from '../../state/spriteStore';

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

describe('the untitled ("New Sprite…") tab', () => {
  it('IS the spriteStore untitled document — one id, no mapping layer', () => {
    // If these ever diverged, the tab would host one document while undo, the
    // dirty dot and the close confirm all addressed another.
    expect(UNTITLED_SPRITE_TAB_ID).toBe(UNTITLED_SPRITE_DOC_ID);
  });

  it('is a sprite-doc tab, so SpriteMode mounts for it', () => {
    expect(untitledSpriteTab()).toEqual(
      { id: 'doc:sprite:untitled', kind: 'sprite-doc', title: 'Untitled Sprite' });
  });

  it('cannot collide with an engine-bound sprite tab', () => {
    expect(parseSpriteDocTabId(UNTITLED_SPRITE_TAB_ID)).toBeNull();
  });

  it('isSpriteDocTabId covers untitled AND engine-bound ids, nothing else', () => {
    expect(isSpriteDocTabId(UNTITLED_SPRITE_TAB_ID)).toBe(true);
    expect(isSpriteDocTabId('doc:sprite:aeon:motobug')).toBe(true);
    expect(isSpriteDocTabId('doc:sprite:s1:42')).toBe(true);
    expect(isSpriteDocTabId('level:ojz:act1')).toBe(false);
    expect(isSpriteDocTabId('tool:project-setup')).toBe(false);
    expect(isSpriteDocTabId('home')).toBe(false);
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
