// Task B2 / Task 14 — edit-art handoff wiring. Verifies the classic object UI →
// sprite-doc handoff resolves the correct art linkage and opens it through the
// SAME discovered-set path a manual pick uses, with the right absolute base dir +
// disasm-relative paths, frame preselection, and standalone-palette seeding.
// The opener is stubbed via the module's injectable seam (mirrors the classic
// stores' __set…ForTest convention), so no window.api / canvas is needed.
//
// editObjectArtCheckout loads an object's art into the CHECKED-OUT sprite document
// and derives its zone from the open classic level's `ref` (no longer a caller
// argument); the thin editObjectArt wrapper just surfaces the sprite-doc tab and
// lets sprite-doc activation own the document lifecycle.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  editObjectArt,
  editObjectArtCheckout,
  __setSpriteSetOpenerForTest,
  __resetSpriteSetOpenerForTest,
  __setAnimScriptReaderForTest,
  syncedTimelineAnims,
} from '../export-sprite';
import { resolveObjectAnims } from '../../../../core/project/profiles/s1-object-anims';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { DiscoveredSpriteSet } from '../../../../core/import/sprite-discovery';
import type { CompressionKind } from '../../../../core/compress';
import { useClassicProjectStore } from '../../../state/classicProjectStore';
import { useClassicLevelStore } from '../../../state/classicLevelStore';
import { useSpriteStore } from '../../../state/spriteStore';
import { useSessionStore } from '../../../state/sessionStore';
import { useConfirmStore } from '../../../state/confirmStore';
import { getLoadedSpriteDocId, __setSpriteModuleForTest } from '../../../shell/tab-activation';
import { HOME_TAB } from '../../../../core/shell/session';
import { createBuffer } from '../../../../core/art/pixel-ops';

const realAsk = useConfirmStore.getState().ask;

const DIR = '/home/user/s1disasm';

type OpenCall = { baseDir: string; set: DiscoveredSpriteSet; comp: CompressionKind };

/** A stub opener that records its call and loads `frameCount` blank frames so
 *  frame preselection (selectFrame) has real frames to clamp against. Returns
 *  true to mirror a successful real open. */
function stubOpener(calls: OpenCall[], frameCount = 4) {
  return async (baseDir: string, set: DiscoveredSpriteSet, comp: CompressionKind) => {
    calls.push({ baseDir, set, comp });
    const frames = Array.from({ length: frameCount }, () => createBuffer(16, 16));
    useSpriteStore.getState().loadSprite(frames, [], 8, 8);
    return true;
  };
}

/** Point the classic level store at an open act in `zone` (the checkout derives
 *  its zone from this ref). */
function setZone(zone: string): void {
  useClassicLevelStore.setState({ ref: { zone, act: 1, label: `${zone} 1`, available: true }, doc: null });
}

beforeEach(() => {
  useClassicProjectStore.setState({ dir: DIR, status: 'open' });
  setZone('ghz');
  useSpriteStore.getState().closeAll();
  useSessionStore.getState().replace({ tabs: [HOME_TAB], activeId: HOME_TAB.id });
  // editObjectArt goes through sprite-doc activation, which pulls the loaders in
  // by dynamic import; point that at THIS module so the stub opener above is the
  // one that runs (the seam takes a partial module — only these two are used).
  __setSpriteModuleForTest({ editObjectArtCheckout, loadSpriteByName: async () => true });
});

afterEach(() => {
  __setSpriteModuleForTest(null);
  useSpriteStore.getState().closeAll();
  __resetSpriteSetOpenerForTest();
  __setAnimScriptReaderForTest(null);
  useConfirmStore.setState({ ask: realAsk }); // undo any stubbed confirm
  vi.restoreAllMocks();
});

describe('editObjectArtCheckout', () => {
  it('opens a base-linked id through the discovered-set path with correct paths', async () => {
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));

    const ok = await editObjectArtCheckout(0x0d); // Signpost (base linkage)

    expect(ok).toBe(true);
    expect(getLoadedSpriteDocId()).toBeNull(); // checkout is load-only — it opens no document of its own
    expect(calls).toHaveLength(1);
    expect(calls[0].baseDir).toBe(DIR);
    expect(calls[0].comp).toBe('nemesis');
    expect(calls[0].set).toMatchObject({
      game: 's1',
      mappings: '_maps/Signpost.asm',
      art: 'artnem/Signpost.nem',
      name: 'Signpost',
    });
  });

  it('resolves a per-zone override id to the zone-specific art', async () => {
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));

    // $1C is GHZ "Bridge stump" but SLZ "Fireball Thrower" — the zone wins.
    setZone('slz');
    await editObjectArtCheckout(0x1c);
    expect(calls[0].set).toMatchObject({ mappings: '_maps/Scenery.asm', art: 'artnem/SLZ Cannon.nem' });

    calls.length = 0;
    setZone('ghz');
    await editObjectArtCheckout(0x1c);
    expect(calls[0].set).toMatchObject({ mappings: '_maps/Bridge.asm', art: 'artnem/GHZ Bridge.nem' });
  });

  it('passes uncompressed compression for an uncompressed linkage', async () => {
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));

    await editObjectArtCheckout(0x4b); // Giant Ring (uncompressed)
    expect(calls[0].comp).toBe('uncompressed');
  });

  it('preselects the objdef declared frame', async () => {
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls, 4));

    await editObjectArtCheckout(0x7d); // Point bonus, declared frame 3
    expect(useSpriteStore.getState().currentIndex).toBe(3);
  });

  it('seeds a standalone palette from the classic doc declared line', async () => {
    __setSpriteSetOpenerForTest(stubOpener([]));
    // Signpost declares pal line 0. Give line 0 a distinctive first non-zero color.
    const line0 = new Uint16Array(16);
    line0[1] = 0x0eee; // near-white
    useClassicLevelStore.setState({ ref: { zone: 'ghz', act: 1, label: 'ghz 1', available: true }, doc: { palettes: [line0] } as never });

    await editObjectArtCheckout(0x0d);

    const s = useSpriteStore.getState();
    expect(s.paletteMode).toBe('standalone');
    expect(s.standalonePalette).toHaveLength(16);
    expect(s.standalonePalette[0].a).toBe(0); // index 0 forced transparent
    expect(s.standalonePalette[1].a).toBe(255);
    expect(s.standalonePalette[1].r).toBeGreaterThan(0);
  });

  it('returns false when the open fails (checkout never marks in either case)', async () => {
    // Opener reports failure (a toast fired in the real path) — the user must be
    // left where they were, not stranded on a blank/stale sprite.
    __setSpriteSetOpenerForTest(async () => false);

    const ok = await editObjectArtCheckout(0x0d);

    expect(ok).toBe(false);
    expect(getLoadedSpriteDocId()).toBeNull();
  });

  it('is a no-op for an unlinked id (no open, no loaded doc)', async () => {
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));

    const ok = await editObjectArtCheckout(0x02); // not linked in any zone

    expect(ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(getLoadedSpriteDocId()).toBeNull();
  });

  it('is a no-op when no classic project dir is open', async () => {
    useClassicProjectStore.setState({ dir: null });
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));

    const ok = await editObjectArtCheckout(0x0d); // linked, but no dir
    expect(ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(getLoadedSpriteDocId()).toBeNull();
  });

  it('is a no-op when no classic level is open (no zone)', async () => {
    useClassicLevelStore.setState({ ref: null, doc: null });
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));

    const ok = await editObjectArtCheckout(0x0d);
    expect(ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(getLoadedSpriteDocId()).toBeNull();
  });
});

// S1 anim Parcel 1 — the checkout auto-loads the object's `_anim` script into
// the timeline/picker. The reader seam feeds REAL s1disasm text from fs (the
// tree is read-only), so these are integration-grade without window.api.
describe('editObjectArtCheckout — animation auto-load', () => {
  const S1DIR = '/home/volence/sonic_hacks/s1disasm';
  const realReader = async (_base: string, rel: string) => readFileSync(join(S1DIR, rel), 'utf8');
  const treePresent = existsSync(join(S1DIR, '_anim'));

  (treePresent ? it : it.skip)('Crabmeat: loads all 8 anims with flips into the picker + timeline', async () => {
    __setSpriteSetOpenerForTest(stubOpener([], 7)); // Crabmeat art has 7 frames (0..6)
    const reads: string[] = [];
    __setAnimScriptReaderForTest(async (base, rel) => { reads.push(`${base}|${rel}`); return realReader(base, rel); });

    const ok = await editObjectArtCheckout(0x1f); // Crabmeat (ghz)

    expect(ok).toBe(true);
    expect(reads).toEqual([`${DIR}|_anim/Crabmeat.asm`]);
    const s = useSpriteStore.getState();
    // Table order hand-transcribed from _anim/Crabmeat.asm's dc.w rows.
    expect(s.characterAnims.map((a) => a.name)).toEqual([
      'stand', 'standslope', 'standsloperev', 'walk', 'walkslope', 'walksloperev', 'firing', 'ball',
    ]);
    // .standsloperev is `dc.b 15 / 2|aniXFlip / afEnd` — frame INDEX 2, xFlip
    // (the old parsers read that byte as 34 and dropped it).
    expect(s.characterAnims[2].steps).toEqual([{ frameIndex: 2, duration: 15, xFlip: true, yFlip: false }]);
    // The first animation is pre-loaded into the playable timeline.
    expect(s.steps).toEqual([{ frameIndex: 0, duration: 15, xFlip: false, yFlip: false }]);
    // A fresh load-from-disk is not unsaved work.
    expect(s.unsavedEdits).toBe(false);
  });

  it('an art-linked object with NO anim script stays empty-but-honest', async () => {
    __setSpriteSetOpenerForTest(stubOpener([]));
    const reads: string[] = [];
    __setAnimScriptReaderForTest(async (base, rel) => { reads.push(rel); return ''; });

    const ok = await editObjectArtCheckout(0x11); // GHZ Bridge — art link, no anim link

    expect(ok).toBe(true);
    expect(reads).toEqual([]); // no script was even read
    expect(useSpriteStore.getState().characterAnims).toEqual([]);
    expect(useSpriteStore.getState().steps).toEqual([]);
  });

  (treePresent ? it : it.skip)('Ring: the synced spin LEADS the picker, then the scripted sparkle', async () => {
    __setSpriteSetOpenerForTest(stubOpener([], 9)); // Map_Ring (REV01) has 9 frames (4 spin + 4 sparkle + blank)
    __setAnimScriptReaderForTest(realReader);

    const ok = await editObjectArtCheckout(0x25); // Ring

    expect(ok).toBe(true);
    const s = useSpriteStore.getState();
    // Spin is the SynchroAnimate channel-1 cycle (transcribed data, no file
    // read): frames 0-3 ascending at 8 game frames per step, labeled synced.
    // The scripted collect-sparkle follows from _anim/Rings.asm.
    expect(s.characterAnims.map((a) => `${a.name}${a.synced ? '!' : ''}`)).toEqual(['spin!', 'sparkle']);
    // duration 7 = the true 8-frame period minus 1: AnimStepUI stores the
    // engine's raw byte and the timeline holds (duration + 1) ticks.
    expect(s.characterAnims[0].steps).toEqual([0, 1, 2, 3].map((f) => (
      { frameIndex: f, duration: 7, xFlip: false, yFlip: false })));
    // Hand-transcribed from _anim/Rings.asm: dc.b 5 / 4,5,6,7 / afRoutine.
    expect(s.characterAnims[1].steps).toEqual([4, 5, 6, 7].map((f) => (
      { frameIndex: f, duration: 5, xFlip: false, yFlip: false })));
    // The at-rest look (spin) is what pre-loads into the playable timeline.
    expect(s.steps).toEqual(s.characterAnims[0].steps);
    expect(s.unsavedEdits).toBe(false);
  });

  it('a sync-only object (Giant Ring) gets its synced entry with NO script read', async () => {
    __setSpriteSetOpenerForTest(stubOpener([]));
    const reads: string[] = [];
    __setAnimScriptReaderForTest(async (_base, rel) => { reads.push(rel); return ''; });

    const ok = await editObjectArtCheckout(0x4b); // Giant Ring — sync channel 1, no _anim script

    expect(ok).toBe(true);
    expect(reads).toEqual([]); // pure table data — no file was read
    const s = useSpriteStore.getState();
    expect(s.characterAnims).toHaveLength(1);
    expect(s.characterAnims[0]).toMatchObject({ name: 'spin', synced: true });
    // duration 7 = the true 8-frame period minus 1: AnimStepUI stores the
    // engine's raw byte and the timeline holds (duration + 1) ticks.
    expect(s.characterAnims[0].steps).toEqual([0, 1, 2, 3].map((f) => (
      { frameIndex: f, duration: 7, xFlip: false, yFlip: false })));
    expect(s.steps).toEqual(s.characterAnims[0].steps);
  });

  it('the approximate accumulator channel carries its disclosure note', () => {
    // Obj37 (scattered rings) is not art-linked, so its row rides the SAME
    // conversion the checkout uses — tested on the exported helper directly.
    const rows = syncedTimelineAnims(resolveObjectAnims(0x37)?.sync, 9);
    expect(rows).toHaveLength(1);
    const spin = rows[0];
    expect(spin.synced).toBe(true);
    // 4 = the measured AVERAGE of the decelerating accumulator (derivation in
    // profiles/__tests__/s1-sync-anims.test.ts) — and the caveat must ride
    // along where the UI can disclose it, never be silently dropped.
    expect(spin.steps.every((st) => st.duration === 3)).toBe(true); // 3+1 ticks = the 4-frame average
    expect(spin.note).toMatch(/decelerat/i);
  });

  it('sync frames past the loaded frame count clamp, same as scripted anims', () => {
    // A 3-frame doc cannot show frame 3 of the ring spin — the step drops
    // instead of pointing at a nonexistent frame (toTimelineAnims rule).
    const rows = syncedTimelineAnims(resolveObjectAnims(0x25)?.sync, 3);
    expect(rows[0].steps.map((st) => st.frameIndex)).toEqual([0, 1, 2]);
  });

  it('a failed script read keeps the art open usable with an empty timeline', async () => {
    __setSpriteSetOpenerForTest(stubOpener([]));
    __setAnimScriptReaderForTest(async () => { throw new Error('ENOENT'); });

    const ok = await editObjectArtCheckout(0x1f);

    expect(ok).toBe(true);
    expect(useSpriteStore.getState().characterAnims).toEqual([]);
  });
});

describe('editObjectArt wrapper', () => {
  it('opens and focuses a sprite-doc tab after a successful checkout', async () => {
    __setSpriteSetOpenerForTest(stubOpener([]));

    const ok = await editObjectArt(0x0d); // Signpost

    expect(ok).toBe(true);
    expect(getLoadedSpriteDocId()).toBe('doc:sprite:s1:13'); // activation checked the document out
    const session = useSessionStore.getState();
    expect(session.activeId).toBe('doc:sprite:s1:13');
    expect(session.tabs.find((t) => t.id === 'doc:sprite:s1:13')).toMatchObject({
      kind: 'sprite-doc', title: 'Signpost',
    });
  });

  it('opens no tab when the checkout fails', async () => {
    __setSpriteSetOpenerForTest(async () => false);

    const ok = await editObjectArt(0x0d);

    expect(ok).toBe(false);
    expect(useSessionStore.getState().tabs.some((t) => t.kind === 'sprite-doc')).toBe(false);
  });
});

// Multi-document (Task 11): a second object's art opens ALONGSIDE the first
// instead of retargeting a singleton editor, so "Edit art…" never discards and
// never asks. The old dirty-discard confirm this block used to cover is gone
// with the singleton it protected.
describe('editObjectArt with several objects open', () => {
  it('opens a second object without asking, keeping the first document intact', async () => {
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));
    await editObjectArt(0x0d);                  // Signpost (13)
    useSpriteStore.getState().clearCanvas();    // edit it → dirty
    const askSpy = vi.fn(async () => 'cancel');
    useConfirmStore.setState({ ask: askSpy });

    const ok = await editObjectArt(0x1c);       // Bridge (28) — a DIFFERENT object

    expect(ok).toBe(true);
    expect(askSpy).not.toHaveBeenCalled();      // nothing is being discarded
    expect(getLoadedSpriteDocId()).toBe('doc:sprite:s1:28');
    const s = useSpriteStore.getState();
    expect(s.isOpen('doc:sprite:s1:13')).toBe(true);   // the first sprite is parked, not gone
    expect(s.isDirty('doc:sprite:s1:13')).toBe(true);  // with its unsaved edits
  });

  it('re-clicking an already-open object checks it back out without reloading', async () => {
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));
    await editObjectArt(0x0d);
    await editObjectArt(0x1c);
    calls.length = 0;

    const ok = await editObjectArt(0x0d); // back to the first object

    expect(ok).toBe(true);
    expect(calls).toHaveLength(0);        // no checkout re-ran
    expect(getLoadedSpriteDocId()).toBe('doc:sprite:s1:13');
  });

  it('re-clicking the CHECKED-OUT object is a no-op reload that still surfaces its tab', async () => {
    const calls: OpenCall[] = [];
    __setSpriteSetOpenerForTest(stubOpener(calls));
    await editObjectArt(0x0d);
    useSpriteStore.getState().clearCanvas(); // dirty
    calls.length = 0;

    const ok = await editObjectArt(0x0d); // SAME object

    expect(ok).toBe(true);
    expect(calls).toHaveLength(0);        // never reloaded over its own edits
    expect(useSpriteStore.getState().unsavedEdits).toBe(true);
    expect(useSessionStore.getState().activeId).toBe('doc:sprite:s1:13');
  });
});
