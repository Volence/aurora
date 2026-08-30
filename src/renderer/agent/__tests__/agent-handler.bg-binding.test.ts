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

function fakeProject(): never {
  return {
    zones: [{
      id: 'ojz', name: 'OJZ',
      tileset: { tiles: [] },
      palette: { lines: [line(), line(), line(), line()] },
      acts: [{
        id: 'act1', name: 'act1', gridWidth: 2, gridHeight: 1,
        sections: [section(), section()],
      }],
    }],
    chunkLibrary: [],
    bgLibrary: [bgEntry('sky', 'Sky'), bgEntry('caves', 'Caves')],
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

function open(): void {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useProjectStore.setState({ project: fakeProject() });
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
    expect(actHistory().canUndo, 'the fixture already had history — the row below would measure nothing').toBe(false);
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

  it('and on the no-op reply too — the same conclusion is available either way', async () => {
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
    expect(r.sections).toEqual([
      { index: 0, bgId: null },
      { index: 1, bgId: 'caves' },
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
