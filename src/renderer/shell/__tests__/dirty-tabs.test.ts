import { describe, it, expect } from 'vitest';
import { tabHasDirtyDot, levelDocDirty, type DirtySnapshot } from '../dirty-tabs';

const base: DirtySnapshot = {
  classicOpen: false, classicRef: null, classicDirty: false,
  aeonOpen: false, aeonDirty: false, dirtySpriteDocIds: [], dirtyCanvasDocIds: [],
  artDirty: false,
};

describe('tabHasDirtyDot', () => {
  it('home and tool tabs never dot', () => {
    const s = { ...base, classicOpen: true, classicDirty: true, classicRef: { zone: 'ghz', act: 1 } };
    expect(tabHasDirtyDot('home', 'home', s)).toBe(false);
    expect(tabHasDirtyDot('tool:project-setup', 'tool', s)).toBe(false);
  });

  it('classic: only the LOADED act tab dots, and only when dirty', () => {
    const s = { ...base, classicOpen: true, classicDirty: true, classicRef: { zone: 'ghz', act: 1 } };
    expect(tabHasDirtyDot('level:ghz:1', 'level', s)).toBe(true);
    expect(tabHasDirtyDot('level:mz:2', 'level', s)).toBe(false);
    expect(tabHasDirtyDot('level:ghz:1', 'level', { ...s, classicDirty: false })).toBe(false);
  });

  it('classic: a checked-out sprite does NOT dot its origin level tab (it dots the sprite-doc tab instead)', () => {
    // Sprite editor is dirty, but the level itself is clean — the level tab stays undotted.
    const s = {
      ...base, classicOpen: true, classicRef: { zone: 'ghz', act: 1 },
      dirtySpriteDocIds: ['doc:sprite:s1:13'],
    };
    expect(tabHasDirtyDot('level:ghz:1', 'level', s)).toBe(false);
  });

  // Lives here as well as in canvas-save-routing.test.ts on purpose: the RULE is
  // in this file, so this is the test file the next person editing
  // tabHasDirtyDot runs. Covering the branch only from a state/ test meant
  // deleting it left this file entirely green — a green they would believe.
  it("art-doc (canvas): a tab dots exactly when its own document has unsaved edits", () => {
    const s = { ...base, dirtyCanvasDocIds: ['doc:canvas:sky'] };
    expect(tabHasDirtyDot('doc:canvas:sky', 'art-doc', s)).toBe(true);
    expect(tabHasDirtyDot('doc:canvas:rock', 'art-doc', s)).toBe(false);
    expect(tabHasDirtyDot('doc:canvas:sky', 'art-doc', base)).toBe(false);
    // The two doc kinds must not cross-dot: a dirty canvas leaves a sprite tab
    // alone and vice versa (both branches read a list, and swapping which list
    // each reads is a one-character edit).
    expect(tabHasDirtyDot('doc:canvas:sky', 'sprite-doc', s)).toBe(false);
    expect(tabHasDirtyDot('doc:sprite:s1:13', 'art-doc', { ...base, dirtySpriteDocIds: ['doc:sprite:s1:13'] }))
      .toBe(false);
  });

  it('sprite-doc: a tab dots exactly when its own document has unsaved edits', () => {
    const s = { ...base, dirtySpriteDocIds: ['doc:sprite:s1:13'] };
    expect(tabHasDirtyDot('doc:sprite:s1:13', 'sprite-doc', s)).toBe(true);
    // A clean sprite-doc tab never dots.
    expect(tabHasDirtyDot('doc:sprite:aeon:motobug', 'sprite-doc', s)).toBe(false);
    // Nothing dirty at all → no dot.
    expect(tabHasDirtyDot('doc:sprite:s1:13', 'sprite-doc', base)).toBe(false);
  });

  it('sprite-doc: a BACKGROUND (parked) document dots its tab too', () => {
    // The regression this guards: dotting only the checked-out document left a
    // dirty background sprite tab looking saved, so closing it discarded edits
    // with no warning at all.
    const s = { ...base, dirtySpriteDocIds: ['doc:sprite:s1:13', 'doc:sprite:aeon:motobug'] };
    expect(tabHasDirtyDot('doc:sprite:s1:13', 'sprite-doc', s)).toBe(true);
    expect(tabHasDirtyDot('doc:sprite:aeon:motobug', 'sprite-doc', s)).toBe(true);
  });

  it('aeon: project-wide dirtiness dots every level tab (honest aggregate, spec §10)', () => {
    const s = { ...base, aeonOpen: true, aeonDirty: true };
    expect(tabHasDirtyDot('level:ehz:act1', 'level', s)).toBe(true);
    expect(tabHasDirtyDot('level:cpz:act2', 'level', s)).toBe(true);
    expect(tabHasDirtyDot('level:ehz:act1', 'level', { ...s, aeonDirty: false })).toBe(false);
  });

  it('no project → no dots', () => {
    expect(tabHasDirtyDot('level:ghz:1', 'level', base)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The aeon composer document (ART-DIRTY-NOT-IN-SNAPSHOT).
//
// It is the one open document with NO TAB OF ITS OWN: New Tile / Block / Chunk
// lives in the Art facet inside a level tab, so unlike a sprite or a canvas it
// has nowhere else to put a dot. Before this, a whole unsaved drawing was
// resident with nothing on the tab strip saying so, and the only surface that
// admitted it was the facet's own "unsaved" badge — visible only while that
// facet is the one on screen.
//
// Registered for the AEON engine alone (workspace/register-facets.ts registers
// `artFacet` under ['aeon']; classic gets `s1ArtFacet`), so it is an aeon-branch
// rule and the classic branch stays exactly as it was.
// ═══════════════════════════════════════════════════════════════════════════
describe('tabHasDirtyDot: the aeon composer document', () => {
  it('dots every aeon level tab, the same honest aggregate aeonDirty gets', () => {
    const s = { ...base, aeonOpen: true, artDirty: true };
    expect(tabHasDirtyDot('level:ehz:act1', 'level', s)).toBe(true);
    expect(tabHasDirtyDot('level:cpz:act2', 'level', s)).toBe(true);
  });

  it('dots on the composer ALONE, with the project itself clean', () => {
    // The state the row is about: ComposerCanvas calls markOpenDirty() and no
    // command, so editorStore.dirty (aeonDirty) stays false while a drawing is
    // unsaved. If this only passed with aeonDirty also true it would be testing
    // the pre-existing rule.
    const s = { ...base, aeonOpen: true, aeonDirty: false, artDirty: true };
    expect(tabHasDirtyDot('level:ehz:act1', 'level', s)).toBe(true);
  });

  it('CONTROL: a clean composer adds no dot, and dots no non-level tab', () => {
    const s = { ...base, aeonOpen: true, artDirty: false };
    expect(tabHasDirtyDot('level:ehz:act1', 'level', s)).toBe(false);
    const dirty = { ...base, aeonOpen: true, artDirty: true };
    expect(tabHasDirtyDot('home', 'home', dirty)).toBe(false);
    expect(tabHasDirtyDot('doc:sprite:s1:13', 'sprite-doc', dirty)).toBe(false);
    expect(tabHasDirtyDot('doc:canvas:sky', 'art-doc', dirty)).toBe(false);
  });

  it('does NOT dot a classic level tab: the composer is an aeon-only facet', () => {
    // register-facets.ts registers artFacet under ['aeon'] only. A dot here
    // would point a classic author at a document their engine cannot open.
    const s = {
      ...base, classicOpen: true, classicRef: { zone: 'ghz', act: 1 },
      classicDirty: false, artDirty: true,
    };
    expect(tabHasDirtyDot('level:ghz:1', 'level', s)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// `levelDocDirty` — the SAVE-ROUTING half, which must NOT move with the dot.
//
// project-runtime.ts registers the classic-level and aeon-project savers'
// `scope.isDirty` against this, and `saveCoordinator.saveActive` runs the saver
// exactly when it answers true. A composer-only dirt answering true here would
// enable Ctrl+S on a level tab, run `saveAeonProject` (which does not write the
// composer document), and leave the dot standing: an inert Save, which is the
// defect the composer's own saver was extracted to end.
// ═══════════════════════════════════════════════════════════════════════════
describe('levelDocDirty: what Ctrl+S on a level tab would actually write', () => {
  it('is FALSE for a composer-only dirt, where the dot is true', () => {
    const s = { ...base, aeonOpen: true, aeonDirty: false, artDirty: true };
    expect(tabHasDirtyDot('level:ehz:act1', 'level', s)).toBe(true);
    expect(levelDocDirty('level:ehz:act1', s)).toBe(false);
  });

  it('still answers the level document itself, on both engines', () => {
    const aeon = { ...base, aeonOpen: true, aeonDirty: true };
    expect(levelDocDirty('level:ehz:act1', aeon)).toBe(true);
    const classic = {
      ...base, classicOpen: true, classicDirty: true, classicRef: { zone: 'ghz', act: 1 },
    };
    expect(levelDocDirty('level:ghz:1', classic)).toBe(true);
    expect(levelDocDirty('level:mz:2', classic)).toBe(false);
    expect(levelDocDirty('level:ehz:act1', base)).toBe(false);
    expect(levelDocDirty('home', aeon)).toBe(false);
  });
});
