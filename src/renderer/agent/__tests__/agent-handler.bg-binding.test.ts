// O33 — `assign_section_bg` returned success for a binding NOTHING BAKES.
//
// The assignment is real: the ref is written, one undo step, the sidecar
// persists it, the viewport composites it. What no aeon generator does is read
// it — every section of the shipped act still carries `sec_bg_layout: default`
// — so an agent that reads `changed: true` and stops reasonably concludes the
// background is in the game. That is this parcel's defect class in its fourth
// costume, and the one that shows the class is not only about servers: a reply
// that asserts an effect it cannot know reached anything.
//
// `list_effects_presets` solved the same shape with a SENTENCE where the scene
// tools have a column (`agent-handler.effects-preset.test.ts`, last row of the
// first block). This mirrors it — with one difference that matters: the preset
// tool's column would be all-nulls forever, so it has no column at all, while
// `list_bgs`'s column IS meaningful and stays. The sentence travels BESIDE it.
//
// ⚠ REPLY SHAPE ONLY. Half these rows exist to prove the BEHAVIOUR did not
// move: the same ref lands, the same no-op is reported, the same one undo step
// is consumed. A "fix" that made the tool refuse, gate, or stop writing would
// pass every wording row and be the wrong change.

import { describe, it, expect, beforeEach } from 'vitest';
import { handleAgentRequest } from '../agent-handler';
import { useProjectStore } from '../../state/projectStore';
import { useSessionStore } from '../../state/sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../../state/history-hub';
import type { AgentRequest } from '../../../shared/agent-protocol';
import type { Color } from '../../../core/model/s4-types';
import { BG_SECTION_BINDING_LIMIT } from '../../../core/formats/bg-binding';

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });
const section = () => ({ bgLayoutRef: null, sceneRef: null, objects: [], rings: [] });

const bgEntry = (id: string, name: string) => ({
  id, name,
  layout: new Uint16Array(2048),
  tiles: [{ pixels: new Uint8Array(64) }],
});

/**
 * `unresolved` and `refs` are the O31 half: a checkout where the zone's bglib
 * MANIFEST names entries whose binaries are absent, and a section sidecar that
 * points at one of them. Both default to the whole-library case, so every O33
 * row below is unchanged by their existence.
 */
function fakeProject(opts: {
  unresolved?: { id: string; name: string }[];
  refs?: (string | null)[];
} = {}): never {
  const refs = opts.refs ?? [null, null];
  return {
    zones: [{
      id: 'ojz', name: 'OJZ',
      tileset: { tiles: [] },
      palette: { lines: [line(), line(), line(), line()] },
      acts: [{
        id: 'act1', name: 'act1', gridWidth: 2, gridHeight: 1,
        sections: refs.map((r) => ({ ...section(), bgLayoutRef: r })),
      }],
    }],
    chunkLibrary: [],
    bgLibrary: [bgEntry('sky', 'Sky'), bgEntry('caves', 'Caves')],
    bgLibraryUnresolved: opts.unresolved ?? [],
    effectsScenes: { scenes: [], unreadable: [], notices: [] },
    effectsPresets: { presets: [], unreadable: [], notices: [] },
  } as never;
}

const ask = (req: AgentRequest) => handleAgentRequest(req as never);
/** The act's sections. Non-null by construction — `open()` installs the
 *  fixture — and asserted once below rather than `!`-ed at every use. */
const sections = () => useProjectStore.getState().project!.zones[0].acts[0].sections
  .map((s) => s as { bgLayoutRef: string | null });
const actHistory = () => documentHistoryHub.historyFor('level:ojz:act1');

function open(opts: Parameters<typeof fakeProject>[0] = {}): void {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useProjectStore.setState({ project: fakeProject(opts) });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
  useSessionStore.setState({ activeId: 'tool:project-setup' });
}

describe('assign_section_bg still does exactly what it did', () => {
  beforeEach(() => open());

  /**
   * THE ANTI-VACUOUS CONTROL FOR EVERY WORDING ROW BELOW. If the tool had been
   * gated or disabled, the sentence would still be in the reply and every
   * wording row would still pass — so the binding has to be shown LANDING
   * first, read back off the act rather than out of the reply that claims it.
   */
  it('writes the ref, reports changed, and consumes one undo step', async () => {
    expect(actHistory().canUndo, 'the fixture already had history: the row below would measure nothing').toBe(false);
    const r = await ask({ kind: 'assign-section-bg', section: 1, bgId: 'sky' }) as Record<string, unknown>;
    expect(r.changed).toBe(true);
    expect(r.section).toBe(1);
    expect(r.bgId).toBe('sky');
    // The MACHINE, not the reply: the section really carries the ref now.
    expect(sections()[1].bgLayoutRef).toBe('sky');
    expect(sections()[0].bgLayoutRef).toBeNull();      // and only that one
    expect(actHistory().canUndo).toBe(true);
    actHistory().undo();
    expect(sections()[1].bgLayoutRef, 'one undo step, and it puts the ref back').toBeNull();
    expect(actHistory().canUndo).toBe(false);
  });

  it('reverting to the act default is null, and still one step', async () => {
    await ask({ kind: 'assign-section-bg', section: 0, bgId: 'caves' });
    const r = await ask({ kind: 'assign-section-bg', section: 0, bgId: null }) as Record<string, unknown>;
    expect(r.changed).toBe(true);
    expect(sections()[0].bgLayoutRef).toBeNull();
    // Two steps, so undoing once puts `caves` back rather than reaching the
    // pre-run state — a revert that collapsed into the first command would look
    // identical from the reply.
    actHistory().undo();
    expect(sections()[0].bgLayoutRef).toBe('caves');
  });

  it('a same-ref call is a no-op and burns no undo slot', async () => {
    await ask({ kind: 'assign-section-bg', section: 0, bgId: 'sky' });
    const r = await ask({ kind: 'assign-section-bg', section: 0, bgId: 'sky' }) as Record<string, unknown>;
    expect(r.changed).toBe(false);
    // ONE undo puts it back to the act default: the re-send added no step.
    actHistory().undo();
    expect(sections()[0].bgLayoutRef).toBeNull();
    expect(actHistory().canUndo, 'the unchanged re-send consumed an undo slot').toBe(false);
  });

  it('still refuses an id that is not in the library, and an out-of-range section', async () => {
    await expect(ask({ kind: 'assign-section-bg', section: 0, bgId: 'nope' })).rejects.toThrow(/not found in the library/);
    await expect(ask({ kind: 'assign-section-bg', section: 9, bgId: 'sky' })).rejects.toThrow(/out of range/);
  });
});

describe('the reply says where the success stops', () => {
  beforeEach(() => open());

  /**
   * ONLY WITNESS FOR: the successful path carrying the limit. A reply that
   * announced it only on the refusal or the no-op would leave the one case that
   * misleads — "changed: true" — exactly as silent as before.
   */
  it('assign_section_bg carries the binding limit on the SUCCESS reply', async () => {
    const r = await ask({ kind: 'assign-section-bg', section: 1, bgId: 'sky' }) as Record<string, unknown>;
    expect(r.changed).toBe(true);
    expect(r.binding).toBe(BG_SECTION_BINDING_LIMIT);
  });

  it('and on the no-op reply too: the same conclusion is available either way', async () => {
    await ask({ kind: 'assign-section-bg', section: 1, bgId: 'sky' });
    const r = await ask({ kind: 'assign-section-bg', section: 1, bgId: 'sky' }) as Record<string, unknown>;
    expect(r.changed).toBe(false);
    expect(r.binding).toBe(BG_SECTION_BINDING_LIMIT);
  });

  /**
   * ONLY WITNESS FOR: the column staying. The preset tool's answer was to omit
   * a `sections` key; copying that here would DELETE information an agent uses,
   * because these refs are real and the editor reads them. The sentence is an
   * addition, never a replacement.
   */
  it('list_bgs keeps its per-section column AND gains the sentence', async () => {
    await ask({ kind: 'assign-section-bg', section: 1, bgId: 'caves' });
    const r = await ask({ kind: 'list-bgs' }) as Record<string, unknown>;
    // `dangling` joined the row for O31 (last block). It is asserted here too,
    // rather than loosened to a partial match, because this row's whole job is
    // that the column KEEPS what it had — a `toMatchObject` would go on passing
    // if a later change dropped `bgId` for a differently-named field.
    expect(r.sections).toEqual([
      { index: 0, bgId: null, dangling: false },
      { index: 1, bgId: 'caves', dangling: false },
    ]);
    expect(r.sectionBinding).toBe(BG_SECTION_BINDING_LIMIT);
    // and the library is still reported as it was
    expect(r.entries).toEqual([
      { id: 'sky', name: 'Sky', tiles: 1 },
      { id: 'caves', name: 'Caves', tiles: 1 },
    ]);
  });

  /**
   * ONE CONSTANT, TWO TOOLS, AND THE PUBLISHED DESCRIPTIONS. Two hand-written
   * near-identical sentences is how a limit ends up stated two different ways,
   * and an agent that reads the description before calling must not be told
   * something the reply then contradicts.
   *
   * ANTI-VACUOUS: an empty or trivial constant would satisfy every `toBe`
   * above, so the content is checked to be a real sentence naming the two
   * things a reader needs — that it stops at the editor, and what DOES bake.
   */
  it('the sentence is one constant and actually says the two load-bearing things', async () => {
    const a = await ask({ kind: 'assign-section-bg', section: 0, bgId: 'sky' }) as Record<string, unknown>;
    const l = await ask({ kind: 'list-bgs' }) as Record<string, unknown>;
    expect(a.binding).toBe(l.sectionBinding);
    expect(BG_SECTION_BINDING_LIMIT.length).toBeGreaterThan(80);
    expect(BG_SECTION_BINDING_LIMIT).toMatch(/sec_bg_layout: default/);
    expect(BG_SECTION_BINDING_LIMIT).toMatch(/inject_editor_bg/);
    expect(BG_SECTION_BINDING_LIMIT).toMatch(/assign_section_scene/);
  });
});

// O31 — A LIBRARY THAT PROMISES SEVENTEEN ENTRIES AND SHIPS NONE OF THEM.
//
// Measured in aeon 2026-08-30: `games/sonic4/data/editor/ojz_bglib.json` is
// TRACKED and names 17 entries; all 34 body files (`ojz_bg_<id>.bin` and
// `..._tiles.bin`) are untracked, caught by a `.gitignore` rule whose own
// comment aims at "dead timestamped bg experiments"; and the TRACKED sidecar
// `ojz/act1/section_0.meta.json` carries `bgLayoutRef:
// "ingame-forest-v15-1786630615596"` — one of the seventeen.
//
// So a clean clone reads a manifest of seventeen names, opens none of them, and
// paints a section whose sidecar asks for one of them with the act default. The
// authoring machine resolves everything, which is why the failure is invisible
// to exactly the person who could fix it.
//
// WHAT THESE ROWS ASSERT IS THE HONESTY, NOT A REFUSAL. A missing body must stay
// workable — the author on a clean clone is told, never stopped — so the first
// row here is the control that says the tool still writes.
describe('a ref the library cannot answer is reported, not swallowed', () => {
  it('CONTROL: a dangling ref does not stop the tool from working', async () => {
    open({ unresolved: [{ id: 'ghost', name: 'Ghost Forest' }], refs: ['ghost', null] });
    // The section carrying the dangling ref can still be re-pointed at a real
    // entry, in one undo step, exactly as if nothing were missing. A change that
    // made a dangling ref an error would pass every wording row below.
    const r = await ask({ kind: 'assign-section-bg', section: 0, bgId: 'sky' }) as Record<string, unknown>;
    expect(r.changed).toBe(true);
    expect(sections()[0].bgLayoutRef).toBe('sky');
  });

  it('list_bgs names the manifest entries this checkout could not open', async () => {
    open({ unresolved: [{ id: 'ghost', name: 'Ghost Forest' }] });
    const l = await ask({ kind: 'list-bgs' }) as Record<string, unknown>;
    // ANTI-VACUOUS: the loaded entries are still there and are a DIFFERENT set,
    // so a reply that merged the two columns would fail here rather than pass
    // by accident.
    expect((l.entries as { id: string }[]).map((e) => e.id)).toEqual(['sky', 'caves']);
    expect(l.unresolved).toEqual([{ id: 'ghost', name: 'Ghost Forest' }]);
  });

  it('the unresolved column is EMPTY on a whole checkout, not merely present', async () => {
    open();
    const l = await ask({ kind: 'list-bgs' }) as Record<string, unknown>;
    expect(l.unresolved).toEqual([]);
  });

  it('list_bgs flags the section whose ref nothing answers, and only that one', async () => {
    open({ unresolved: [{ id: 'ghost', name: 'Ghost Forest' }], refs: ['ghost', 'sky'] });
    const l = await ask({ kind: 'list-bgs' }) as Record<string, unknown>;
    const rows = l.sections as { index: number; bgId: string | null; dangling: boolean }[];
    // The whole point: both rows print an id, and without the flag they read
    // the same. Section 1 resolves and section 0 does not.
    expect(rows[0]).toEqual({ index: 0, bgId: 'ghost', dangling: true });
    expect(rows[1]).toEqual({ index: 1, bgId: 'sky', dangling: false });
  });

  it('a section on the act default is NOT dangling: unbound and broken are different', async () => {
    open({ refs: [null, null] });
    const rows = (await ask({ kind: 'list-bgs' }) as Record<string, unknown>)
      .sections as { dangling: boolean }[];
    expect(rows.map((r) => r.dangling)).toEqual([false, false]);
  });

  it('assigning a manifest-named id says the BYTES are missing, not that the id is unknown', async () => {
    open({ unresolved: [{ id: 'ghost', name: 'Ghost Forest' }] });
    // The refusal an agent can act on. "not found in the library" is the wrong
    // sentence for an id `list_bgs` just printed in its own `unresolved`
    // column, and it is what this used to say.
    await expect(ask({ kind: 'assign-section-bg', section: 0, bgId: 'ghost' }))
      .rejects.toThrow(/binaries are not in this checkout/);
    await expect(ask({ kind: 'assign-section-bg', section: 0, bgId: 'ghost' }))
      .rejects.toThrow(/Ghost Forest/);
    // ...and the OTHER refusal still exists, unchanged, for an id nobody made.
    await expect(ask({ kind: 'assign-section-bg', section: 0, bgId: 'nope' }))
      .rejects.toThrow(/not found in the library/);
  });
});
