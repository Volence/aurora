// THE OPEN TOAST SAYS WHAT ACTUALLY HAPPENED TO EACH BACKGROUND.
//
// ═══ THE DEFECT (ABSENT-CAUSE-MISNAMED, lens sweep) ══════════════════════════
//
// `openAeonProject` ended its unresolved-backgrounds toast with one flat assertion
// about the whole list:
//
//     'Their layout/tile files are not in this checkout; ...'
//
// True of the clean-clone case that motivated the toast (aeon tracks the bglib
// manifest and none of the bodies), and FALSE of every other road into
// `bgLibraryUnresolved`: a body present and too short to hold a row, one that would
// not parse, one behind an EACCES, one whose path Aurora refused. For those it names
// a cause that is not the cause and sends the author to `git status` for a file they
// are looking at.
//
// The cause now travels on the entry (`BgUnresolvedCause`, core/formats/bg-library)
// and is rendered per name.
//
// ═══ WHY THESE MATCHERS ══════════════════════════════════════════════════════
//
// The hazard on this parcel is a matcher a different rule satisfies, and 'could not
// be read' is emitted by `readFailureMessage`, by the aeon loader's markUnreadable
// summary AND by this toast's neighbours. So every row here keys on the CAUSE CLAUSE
// text, which `bgUnresolvedCauseText` alone produces, and takes it from that function
// rather than typing it — a clause reworded there must not be able to leave a row
// asserting the old words. The checkout sentence is asserted ABSENT on the three
// causes it is false for, which is the defect itself and cannot be satisfied by a
// producer that says nothing.
//
// RED-FIRST: proven by restoring the flat 'Their layout/tile files are not in this
// checkout' tail in aeon-open.ts (mutation shown on disk in the parcel report).
// Runner: `npx vitest run src/renderer/state/__tests__/aeon-open-bg-cause.test.ts`,
// inside `npm test`'s `vitest run`.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  bgUnresolvedCauseText, type BgUnresolvedCause, type BgLibraryUnresolvedEntry,
} from '../../../core/formats/bg-library';

const openMock = vi.fn();

vi.mock('../../../core/project/aeon', () => ({
  aeonAdapter: { open: (...a: unknown[]) => openMock(...a) },
}));
vi.mock('../classic-file-access', () => ({
  createIpcFileAccess: () => ({ exists: async () => false, read: async () => new Uint8Array(), list: async () => [] }),
}));

import { openAeonProject } from '../aeon-open';
import { useToastStore } from '../toastStore';
import { useProjectStore } from '../projectStore';

const config = {
  name: 'P', engine: 's4', basePath: '/p', zones: [], objectLibraryPath: '', chunkLibraryPath: '',
  raw: { name: 'P', engine: 's4', zones: [], objectLibrary: '', chunkLibrary: '' },
} as never;
const capabilities = { levels: 'aeon', sprites: true, objects: 'json', build: false, facets: ['layout'] } as never;

function handleWith(unresolved: BgLibraryUnresolvedEntry[]) {
  const project = {
    name: 'P', zones: [], objectLibrary: [], chunkLibrary: [], bgLibrary: [],
    bgLibraryUnresolved: unresolved,
    basePath: '/p', effectsScenes: { scenes: [], unreadable: [], notices: [] },
    effectsPresets: { presets: [], unreadable: [], notices: [] },
    bgOverride: { path: null, doc: null, unreadable: null, loadedText: null, notices: [] },
  } as never;
  return {
    capabilities,
    aeon: {
      config, project, collisionProfiles: null, notices: [], legacyAtlasMerged: false,
      scenes: (project as never as { effectsScenes: unknown }).effectsScenes,
      presets: (project as never as { effectsPresets: unknown }).effectsPresets,
      bgOverride: (project as never as { bgOverride: unknown }).bgOverride,
    },
  };
}

const entry = (
  name: string, cause: BgUnresolvedCause, reason: string | null = null,
): BgLibraryUnresolvedEntry => ({ id: `${name}-1`, name, cause, reason });

/** The one toast this feature emits, found by the clause it alone carries. */
async function bgToast(unresolved: BgLibraryUnresolvedEntry[]): Promise<string | undefined> {
  openMock.mockResolvedValue(handleWith(unresolved));
  expect(await openAeonProject('/p')).toBe(true);
  return useToastStore.getState().toasts
    .find((t) => t.message.includes("named by this zone's library could not be opened"))?.message;
}

/** The sentence that was said about every entry and is true of exactly one cause. */
const CHECKOUT_CLAIM = 'not in this checkout';

beforeEach(() => {
  vi.stubGlobal('window', {
    api: {
      addRecentProject: vi.fn(async () => (
        { projects: [], read: 'read', reason: null, path: '/p/recent-projects.json', dropped: 0 }
      )),
    },
  });
  useToastStore.setState({ toasts: [] });
  useProjectStore.getState().reset();
  openMock.mockReset();
});

describe('the unresolved-backgrounds toast names a cause per background', () => {
  it('still says "not in this checkout" for a body that really is absent', async () => {
    // The clean-clone case. This clause was always right HERE; the defect was
    // applying it to everything else, so keeping it is half the fix.
    const msg = await bgToast([entry('Forest', 'absent')]);
    expect(msg, 'the toast did not fire at all').toBeDefined();
    expect(msg).toContain('Forest');
    expect(msg).toContain(CHECKOUT_CLAIM);
  });

  it('does NOT say it for a body that is on disk and would not read', async () => {
    const msg = await bgToast([entry('Forest', 'unreadable', 'EACCES: permission denied')]);
    expect(msg, 'a present, unreadable file was reported as not being in the checkout')
      .not.toContain(CHECKOUT_CLAIM);
    // Taken from the producer, not typed: a reworded clause must not leave this
    // row asserting words nothing emits.
    expect(msg).toContain(bgUnresolvedCauseText('unreadable'));
  });

  it('does NOT say it for a body that read fine and is not usable', async () => {
    // The truncated-layout case, which is the entry the lens row was found on.
    const msg = await bgToast([entry('Forest', 'unusable', "'x.bin' is too short")]);
    expect(msg).not.toContain(CHECKOUT_CLAIM);
    expect(msg).toContain(bgUnresolvedCauseText('unusable'));
  });

  it('does NOT say it for a path Aurora refused to resolve', async () => {
    const msg = await bgToast([entry('Forest', 'refused', 'escapes root')]);
    expect(msg).not.toContain(CHECKOUT_CLAIM);
    expect(msg).toContain(bgUnresolvedCauseText('refused'));
  });

  it('MIXED: each name carries its own clause, so neither over-claims', async () => {
    // The case a single flat tail cannot get right by any wording at all, and the
    // reason the clause had to move onto the entry.
    const msg = await bgToast([
      entry('Gone', 'absent'),
      entry('Locked', 'unreadable', 'EACCES'),
    ]);
    expect(msg).toContain(`Gone (${bgUnresolvedCauseText('absent')})`);
    expect(msg).toContain(`Locked (${bgUnresolvedCauseText('unreadable')})`);
  });

  it('keeps the count, the cap and the warning channel', async () => {
    // The three properties the old toast had that this must not lose: a derived
    // count, a bounded list (nameSome), and the amber channel with a readable dwell.
    const many: BgLibraryUnresolvedEntry[] = Array.from(
      { length: 7 }, (_, i) => entry(`Bg${i}`, 'absent'));
    const msg = await bgToast(many);
    expect(msg).toContain(`${many.length} backgrounds`);
    expect(msg).toContain('more');
    // Not every name: the real manifest has seventeen and a toast is not a list.
    expect(msg).not.toContain('Bg6');
    const t = useToastStore.getState().toasts.find((x) => x.message === msg)!;
    expect(t.type).toBe('warning');
  });

  it('CONTROL: an all-resolved project says nothing about backgrounds', async () => {
    // Without this, a producer that toasted unconditionally would satisfy the rows
    // above. Empty is the ordinary answer.
    expect(await bgToast([])).toBeUndefined();
  });

  it('every cause has its OWN clause, and none of them is the checkout claim twice', async () => {
    // The distinctness row: four causes rendering one string would pass every
    // "contains" row above through sheer coincidence. Derived from the union via a
    // literal list that tsc checks with `satisfies`, so a fifth cause added to the
    // type and not here fails to compile.
    const causes = ['absent', 'unreadable', 'refused', 'unusable'] satisfies BgUnresolvedCause[];
    const texts = causes.map(bgUnresolvedCauseText);
    expect(new Set(texts).size).toBe(causes.length);
    expect(texts.filter((t) => t.includes(CHECKOUT_CLAIM))).toEqual([bgUnresolvedCauseText('absent')]);
  });
});
