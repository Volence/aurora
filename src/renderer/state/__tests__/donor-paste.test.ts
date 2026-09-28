/**
 * The paste flow, over fake ports: aeon's validator and bake, the guarded
 * writer, mtime and delete. What these rows hold:
 *
 *   * NOTHING IS WRITTEN unless aeon's loader AND bake both accepted the exact
 *     bytes that are then written (the tools and the file see one text);
 *   * a tool that could not run is not a refusal, and writes nothing either;
 *   * aeon's loader answers in --json (row 213): a refusal carries its rule and
 *     subjects, and a loader that CRASHED (exit 1, no JSON) is its own outcome,
 *     never a refusal. The loader's stdout in these rows is aeon's REAL output
 *     (test/fixtures/clips/aeon-outputs/validate-json.cases.json), not typed here;
 *   * aeon's BAKE answers in the same --json (row 213 open item (a)): a bake
 *     refusal carries its rule and clip, a bake that CRASHED is a crash of the
 *     bake, and the target act's re-bake note says which. The bake's stdout is
 *     aeon's real output too (bake-json.cases.json beside it);
 *   * undo puts back the exact prior bytes, or removes a file the paste created,
 *     and refuses when the file moved since the paste wrote it;
 *   * a guarded-write conflict writes nothing and says why.
 *
 * The REAL tools are exercised by the fidelity rig and the CDP harness.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { usePasteStore, type PastePorts } from '../donor-paste';
import type { ClipToolResult, GuardedWriteFile } from '../../../shared/ipc-types';
import type { NewClip } from '../../../core/formats/donors/clip-manifest-doc';
import { refusedOutlines } from '../../components/donors/target-outlines';
import { subjectsLabelOnPane } from '../../../core/formats/donors/refused-subjects';
import { useDonorDraft } from '../donor-draft';
import { useDonorStore } from '../donorStore';

const PINS = readFileSync(resolve(__dirname, '../../../../test/fixtures/clips/s2_two_clip_pins.clips.json'), 'utf8');
const PINS_PATH = 'games/sonic4/data/clips/s2_two_clip_pins/clips.json';
const CASES = JSON.parse(readFileSync(resolve(__dirname, '../../../../test/fixtures/clips/aeon-outputs/validate-json.cases.json'), 'utf8')) as
  Record<string, { exit: number; stdout: string; stderr: string; manifest?: unknown }>;
/** One of aeon's real validate --json runs, as the clip-tool channel would return it. */
function aeonSaid(name: string): Partial<ClipToolResult> {
  const c = CASES[name];
  return { ok: c.exit === 0, exitCode: c.exit, stdout: c.stdout, stderr: c.stderr };
}
/** aeon's real bake --json runs (row 213 open item (a)): test/fixtures/clips/aeon-outputs/bake-json.cases.json. */
const BAKE_CASES = JSON.parse(readFileSync(resolve(__dirname, '../../../../test/fixtures/clips/aeon-outputs/bake-json.cases.json'), 'utf8')) as
  Record<string, { exit: number; stdout: string; stderr: string }>;
function aeonBaked(name: string): Partial<ClipToolResult> {
  const c = BAKE_CASES[name];
  return { ok: c.exit === 0, exitCode: c.exit, stdout: c.stdout, stderr: c.stderr };
}

interface Disk { files: Map<string, { text: string; mtimeMs: number }>; clock: number }

function ports(disk: Disk, opts: {
  validate?: (text: string) => Partial<ClipToolResult>;
  bake?: (text: string) => Partial<ClipToolResult>;
} = {}): PastePorts & { seen: { verb: string; text: string }[]; writes: GuardedWriteFile[]; deletes: string[] } {
  const seen: { verb: string; text: string }[] = [];
  const writes: GuardedWriteFile[] = [];
  const deletes: string[] = [];
  return {
    seen, writes, deletes,
    async clipTool(_root, verb, text) {
      seen.push({ verb, text });
      const base: ClipToolResult = {
        verb, ok: true, exitCode: 0, stdout: (verb === 'validate' ? CASES : BAKE_CASES).accept_s2_ehz_cpz.stdout, stderr: '',
        command: `python3 ${verb}`,
      };
      const over = verb === 'validate' ? opts.validate?.(text) : opts.bake?.(text);
      const r = { ...base, ...over };
      if (verb === 'bake' && r.ok && !r.baked) r.baked = { clipact: '{"zone_table":[]}', files: {} };
      return r;
    },
    async readText(_root, rel) { return disk.files.get(rel) ?? null; },
    async writeGuarded(_root, files) {
      for (const f of files) {
        const cur = disk.files.get(f.relPath);
        const curM = cur ? cur.mtimeMs : null;
        if (curM !== f.expectedMtimeMs) return { conflicts: [{ relPath: f.relPath, cause: cur ? 'changed' : 'deleted', reason: null }] };
      }
      const newMtimes: Record<string, number> = {};
      for (const f of files) {
        writes.push(f);
        disk.clock += 1;
        disk.files.set(f.relPath, { text: new TextDecoder().decode(f.bytes), mtimeMs: disk.clock });
        newMtimes[f.relPath] = disk.clock;
      }
      return { written: files.map((f) => f.relPath), newMtimes };
    },
    async fileMtime(_root, rel) { return disk.files.get(rel)?.mtimeMs ?? null; },
    async deleteFile(_root, rel) { deletes.push(rel); const had = disk.files.delete(rel); return { ok: true, deleted: had }; },
    async listDir() { return [...disk.files.keys()].map((k) => k.split('/')[4]); },
  };
}

const CLIP: NewClip = {
  id: 'ehz_x', donor: 's2disasm', zone: 'EHZ',
  src: { x: 0, y: 0, w: 2048, h: 1024 }, dst: { x: 0, y: 2048, w: 2048, h: 1024 },
};

beforeEach(() => {
  usePasteStore.getState().reset();
  usePasteStore.setState({ root: '/aeon' });
});

describe('a paste writes only what aeon accepted', () => {
  it('validate and bake see the SAME text that is then written, into the named manifest', async () => {
    const disk: Disk = { files: new Map([[PINS_PATH, { text: PINS, mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk);
    await usePasteStore.getState().selectAct('s2_two_clip_pins', p);
    const o = await usePasteStore.getState().paste(CLIP, p);
    expect(o.kind).toBe('pasted');
    const texts = p.seen.filter((s) => s.text.includes('ehz_x')).map((s) => s.text);
    expect(texts.length).toBe(2);
    expect(p.writes.length).toBe(1);
    expect(p.writes[0].relPath).toBe(PINS_PATH);
    expect(p.writes[0].expectedMtimeMs).toBe(7);
    const written = new TextDecoder().decode(p.writes[0].bytes);
    expect(texts.every((t) => t === written)).toBe(true);
    // The two clips that were there are still there, and the new one is last.
    expect(JSON.parse(written).clips.map((c: { id: string }) => c.id)).toEqual(['ehz_s1', 'cpz_s1', 'ehz_x']);
  });

  it('a REFUSAL at the loader writes nothing and carries aeon\'s rule, BOTH subjects and words', async () => {
    const disk: Disk = { files: new Map([[PINS_PATH, { text: PINS, mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk, { validate: () => aeonSaid('refuse_r10_pair') });
    await usePasteStore.getState().selectAct('s2_two_clip_pins', p);
    const o = await usePasteStore.getState().paste(CLIP, p);
    expect(o).toMatchObject({ kind: 'refused', stage: 'validate' });
    const doc = JSON.parse(CASES.refuse_r10_pair.stdout);
    expect(o.kind === 'refused' && o.stage === 'validate' && o.refusals).toEqual(doc.refusals);
    expect(o.kind === 'refused' && o.text).toBe(doc.refusals[0].message);
    expect(p.writes).toEqual([]);
    expect(disk.files.get(PINS_PATH)!.text).toBe(PINS);
    expect(usePasteStore.getState().undoStack.length).toBe(0);
  });

  it('a loader that CRASHED (exit 1, no JSON: aeon\'s traceback) is a crash carrying stderr, NOT a refusal, and writes nothing', async () => {
    const disk: Disk = { files: new Map([[PINS_PATH, { text: PINS, mtimeMs: 7 }]]), clock: 100 };
    let bakes = 0;
    const p = ports(disk, {
      validate: (t) => (t.includes('ehz_x') ? aeonSaid('crash_not_json') : {}),
      bake: (t) => { if (t.includes('ehz_x')) bakes++; return {}; },
    });
    await usePasteStore.getState().selectAct('s2_two_clip_pins', p);
    const o = await usePasteStore.getState().paste(CLIP, p);
    expect(o.kind).toBe('crashed');
    expect(o.kind === 'crashed' && o.stderr).toBe(CASES.crash_not_json.stderr);
    expect(bakes).toBe(0);
    expect(p.writes).toEqual([]);
    expect(usePasteStore.getState().undoStack.length).toBe(0);
  });

  it('an ACCEPTANCE with warnings pastes, and the outcome carries each warning\'s rule and subjects as aeon printed them', async () => {
    const disk: Disk = { files: new Map([[PINS_PATH, { text: PINS, mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk, { validate: (t) => (t.includes('ehz_x') ? aeonSaid('accept_w3') : {}) });
    await usePasteStore.getState().selectAct('s2_two_clip_pins', p);
    const o = await usePasteStore.getState().paste(CLIP, p);
    expect(o.kind).toBe('pasted');
    const want = JSON.parse(CASES.accept_w3.stdout).warnings;
    expect(want.length).toBeGreaterThan(0);
    expect(o.kind === 'pasted' && o.warnings).toEqual(want);
    expect(p.writes.length).toBe(1);
  });

  it('a REFUSAL at the bake writes nothing either, and carries the bake\'s own rule and the clip it names', async () => {
    const disk: Disk = { files: new Map([[PINS_PATH, { text: PINS, mtimeMs: 7 }]]), clock: 100 };
    let bakes = 0;
    const p = ports(disk, { bake: (t) => (t.includes('ehz_x') ? (bakes++, aeonBaked('refuse_c4_bake_own')) : {}) });
    await usePasteStore.getState().selectAct('s2_two_clip_pins', p);
    const o = await usePasteStore.getState().paste(CLIP, p);
    expect(bakes).toBe(1);
    expect(o).toMatchObject({ kind: 'refused', stage: 'bake' });
    const doc = JSON.parse(BAKE_CASES.refuse_c4_bake_own.stdout);
    expect(o.kind === 'refused' && o.refusals).toEqual(doc.refusals);
    expect(o.kind === 'refused' && o.text).toBe(doc.refusals[0].message);
    expect(p.writes).toEqual([]);
    expect(usePasteStore.getState().undoStack.length).toBe(0);
  });

  it('a bake that CRASHED (exit 1, no JSON: aeon\'s traceback) is a crash of the BAKE carrying stderr, NOT a refusal, and writes nothing', async () => {
    const disk: Disk = { files: new Map([[PINS_PATH, { text: PINS, mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk, { bake: (t) => (t.includes('ehz_x') ? aeonBaked('crash_not_json') : {}) });
    await usePasteStore.getState().selectAct('s2_two_clip_pins', p);
    const o = await usePasteStore.getState().paste(CLIP, p);
    expect(o).toMatchObject({ kind: 'crashed', stage: 'bake', exitCode: 1 });
    expect(o.kind === 'crashed' && o.stderr).toBe(BAKE_CASES.crash_not_json.stderr);
    expect(o.kind === 'crashed' && o.why).toMatch(/aeon's bake .*NOT judged/);
    expect(p.writes).toEqual([]);
    expect(usePasteStore.getState().undoStack.length).toBe(0);
  });

  it('a bake that exited 0 with a tree but NO JSON is a crash: the tree is not used and nothing is written', async () => {
    const disk: Disk = { files: new Map([[PINS_PATH, { text: PINS, mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk, { bake: (t) => (t.includes('ehz_x') ? { stdout: 'clip act baked: 872 pool tiles' } : {}) });
    await usePasteStore.getState().selectAct('s2_two_clip_pins', p);
    const o = await usePasteStore.getState().paste(CLIP, p);
    expect(o).toMatchObject({ kind: 'crashed', stage: 'bake', exitCode: 0 });
    expect(p.writes).toEqual([]);
  });

  it('a tool that could not RUN is not a refusal, and writes nothing', async () => {
    const disk: Disk = { files: new Map(), clock: 100 };
    const p = ports(disk, { validate: () => ({ ok: false, exitCode: null, couldNotRun: 'spawn python3 ENOENT' }) });
    usePasteStore.getState().newAct('fx_act', 1, 2);
    const o = await usePasteStore.getState().paste(CLIP, p);
    expect(o.kind).toBe('could-not-run');
    expect(p.writes).toEqual([]);
  });

  it('a guarded-write conflict writes nothing and says why', async () => {
    const disk: Disk = { files: new Map([[PINS_PATH, { text: PINS, mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk);
    await usePasteStore.getState().selectAct('s2_two_clip_pins', p);
    disk.files.set(PINS_PATH, { text: `${PINS} `, mtimeMs: 8 });
    const o = await usePasteStore.getState().paste(CLIP, p);
    expect(o.kind).toBe('conflict');
    expect(p.writes).toEqual([]);
    expect(disk.files.get(PINS_PATH)!.text).toBe(`${PINS} `);
  });
});

/** Row 222's open half: aeon's judged paste manifests (paste-music.cases.json) over the vendored s2_ehz_cpz. */
const EHZ_CPZ = readFileSync(resolve(__dirname, '../../../../test/fixtures/clips/s2_ehz_cpz.clips.json'), 'utf8');
const EHZ_CPZ_PATH = 'games/sonic4/data/clips/s2_ehz_cpz/clips.json';
type MusicClip = { id: string; donor: string; zone: string; src_rect: NewClip['src']; dst_rect: NewClip['dst']; music?: string };
const MUSIC = JSON.parse(readFileSync(resolve(__dirname, '../../../../test/fixtures/clips/aeon-outputs/paste-music.cases.json'), 'utf8')) as
  Record<string, { exit: number; stdout: string; stderr: string; manifest: { clips: MusicClip[] } }>;
function musicPaste(name: string): NewClip {
  const e = MUSIC[name].manifest.clips.at(-1)!;
  return { id: e.id, donor: e.donor, zone: e.zone, src: e.src_rect, dst: e.dst_rect };
}

describe('a paste that inherits its zone\'s song says so (row 222)', () => {
  it('the success summary names the song aeon accepted on the pasted clip, and where it came from', async () => {
    const disk: Disk = { files: new Map([[EHZ_CPZ_PATH, { text: EHZ_CPZ, mtimeMs: 7 }]]), clock: 100 };
    const c = MUSIC.accept_paste_inherits_music;
    const p = ports(disk, { validate: (t) => (t.includes('"ehz_1"') ? { ok: true, exitCode: c.exit, stdout: c.stdout, stderr: c.stderr } : {}) });
    await usePasteStore.getState().selectAct('s2_ehz_cpz', p);
    const o = await usePasteStore.getState().paste(musicPaste('accept_paste_inherits_music'), p);
    const judged = c.manifest.clips.at(-1)!;
    expect(o.kind === 'pasted' && o.song).toBe(`Song: ${judged.music} (from ${judged.donor} ${judged.zone})`);
  });

  it('the song the summary names is the one the paste WROTE onto the clip', async () => {
    const disk: Disk = { files: new Map([[EHZ_CPZ_PATH, { text: EHZ_CPZ, mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk);
    await usePasteStore.getState().selectAct('s2_ehz_cpz', p);
    const o = await usePasteStore.getState().paste(musicPaste('accept_paste_inherits_music'), p);
    const wrote = JSON.parse(new TextDecoder().decode(p.writes[0].bytes)).clips.at(-1) as { music?: string };
    expect(typeof wrote.music).toBe('string');
    expect(o.kind === 'pasted' && o.song.startsWith(`Song: ${wrote.music} (`)).toBe(true);
  });

  it('a zone new to the act: the summary says none was inherited, and why', async () => {
    const disk: Disk = { files: new Map([[EHZ_CPZ_PATH, { text: EHZ_CPZ, mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk);
    await usePasteStore.getState().selectAct('s2_ehz_cpz', p);
    const clip = musicPaste('accept_paste_new_zone_no_music');
    const o = await usePasteStore.getState().paste(clip, p);
    expect(o.kind === 'pasted' && o.song).toBe(`Song: none inherited (this act has no ${clip.donor} ${clip.zone} clip yet)`);
  });
});

describe('the target act\'s re-bake note tells a bake refusal from a bake crash', () => {
  it('a refusal on disk is a REFUSED note naming aeon\'s rule, subjects and sentence; nothing is drawn', async () => {
    const disk: Disk = { files: new Map([[PINS_PATH, { text: PINS, mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk, { bake: () => aeonBaked('refuse_c4_bake_own') });
    await usePasteStore.getState().selectAct('s2_two_clip_pins', p);
    const s = usePasteStore.getState();
    const r = JSON.parse(BAKE_CASES.refuse_c4_bake_own.stdout).refusals[0] as { rule: string; subjects: { index: number; id: string }[]; message: string };
    expect(s.baked).toBeNull();
    expect(s.bakeNoteKind).toBe('refused');
    // aeon's C4 names clip 0 `ehz_cut`, and this act's clip 0 is another clip, so row 213 (b)
    // names the subject as not on this pane rather than outlining the wrong rectangle.
    expect(s.bakeNote).toContain(`${r.rule} (clip ${r.subjects[0].index} ${r.subjects[0].id} (not on this pane)): ${r.message}`);
  });

  it('a crash on disk is a CRASHED note carrying stderr that says it is not a refusal, never "refuses"', async () => {
    const disk: Disk = { files: new Map([[PINS_PATH, { text: PINS, mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk, { bake: () => aeonBaked('crash_missing_path') });
    await usePasteStore.getState().selectAct('s2_two_clip_pins', p);
    const s = usePasteStore.getState();
    expect(s.baked).toBeNull();
    expect(s.bakeNoteKind).toBe('crashed');
    expect(s.bakeNote).toMatch(/CRASHED \(exit 1\).*This is not a refusal/);
    expect(s.bakeNote).not.toMatch(/refuses/);
    expect(s.bakeNote).toContain(BAKE_CASES.crash_missing_path.stderr.trim());
  });

  it('an accepted re-bake draws the act and carries no note', async () => {
    const disk: Disk = { files: new Map([[PINS_PATH, { text: PINS, mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk, { bake: () => aeonBaked('accept_w2') });
    await usePasteStore.getState().selectAct('s2_two_clip_pins', p);
    const s = usePasteStore.getState();
    expect(s.baked).not.toBeNull();
    expect([s.bakeNote, s.bakeNoteKind]).toEqual([null, null]);
  });
});

describe('undo puts the file back exactly', () => {
  it('into an EXISTING manifest: undo restores the prior bytes; redo writes the paste again', async () => {
    const disk: Disk = { files: new Map([[PINS_PATH, { text: PINS, mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk);
    await usePasteStore.getState().selectAct('s2_two_clip_pins', p);
    await usePasteStore.getState().paste(CLIP, p);
    const pasted = disk.files.get(PINS_PATH)!.text;
    expect(pasted).not.toBe(PINS);
    const u = await usePasteStore.getState().undo(p);
    expect(u).toMatchObject({ kind: 'undone', removed: false });
    expect(disk.files.get(PINS_PATH)!.text).toBe(PINS);
    const r = await usePasteStore.getState().redo(p);
    expect(r?.kind).toBe('redone');
    expect(disk.files.get(PINS_PATH)!.text).toBe(pasted);
  });

  it('a paste that CREATED the manifest is undone by removing it, and redone by writing it again', async () => {
    const disk: Disk = { files: new Map(), clock: 100 };
    const p = ports(disk);
    usePasteStore.getState().newAct('fx_act', 1, 2);
    const o = await usePasteStore.getState().paste(CLIP, p);
    expect(o).toMatchObject({ kind: 'pasted', created: true });
    expect(p.writes[0].expectedMtimeMs).toBeNull();
    const path = 'games/sonic4/data/clips/fx_act/clips.json';
    expect(disk.files.has(path)).toBe(true);
    const u = await usePasteStore.getState().undo(p);
    expect(u).toMatchObject({ kind: 'undone', removed: true });
    expect(p.deletes).toEqual([path]);
    expect(disk.files.has(path)).toBe(false);
    await usePasteStore.getState().redo(p);
    expect(disk.files.has(path)).toBe(true);
  });

  it('undo REFUSES when the file changed since the paste wrote it, and writes nothing', async () => {
    const disk: Disk = { files: new Map([[PINS_PATH, { text: PINS, mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk);
    await usePasteStore.getState().selectAct('s2_two_clip_pins', p);
    await usePasteStore.getState().paste(CLIP, p);
    disk.files.set(PINS_PATH, { text: 'someone else', mtimeMs: 555 });
    const writesBefore = p.writes.length;
    const u = await usePasteStore.getState().undo(p);
    expect(u?.kind).toBe('conflict');
    expect(p.writes.length).toBe(writesBefore);
    expect(p.deletes).toEqual([]);
    expect(disk.files.get(PINS_PATH)!.text).toBe('someone else');
    expect(usePasteStore.getState().undoStack.length).toBe(1);
  });
});

describe('undo of a paste that CREATED the manifest', () => {
  it('REFUSES to remove the file once someone else changed it: the delete channel has no guard of its own', async () => {
    // The row the guarded-write rows above cannot be: a restore is a guarded
    // write and would conflict by itself, but a removal goes through deleteFile,
    // which takes no expected mtime. The page's own mtime check is the ONLY
    // thing standing between an undo and deleting someone else's edit.
    const disk: Disk = { files: new Map(), clock: 100 };
    const p = ports(disk);
    usePasteStore.getState().newAct('fx_act', 1, 2);
    await usePasteStore.getState().paste(CLIP, p);
    const path = 'games/sonic4/data/clips/fx_act/clips.json';
    disk.files.set(path, { text: 'edited by hand', mtimeMs: 999 });
    const u = await usePasteStore.getState().undo(p);
    expect(u?.kind).toBe('conflict');
    expect(p.deletes).toEqual([]);
    expect(disk.files.get(path)!.text).toBe('edited by hand');
  });
});

describe('Ctrl+Z on the Donors facet reaches the paste, not the act', () => {
  it('focusedDocId names the paste stack on the donors facet and the act on layout; that stack holds the paste', async () => {
    const { focusedDocId, focusedHistory } = await import('../editorStore');
    const { useSessionStore } = await import('../sessionStore');
    const { useWorkspaceStore } = await import('../../workspace/workspaceStore');
    const { documentHistoryHub } = await import('../history-hub');
    const { DONOR_PASTE_DOC_ID } = await import('../donor-paste');
    documentHistoryHub.clearAll();
    useWorkspaceStore.getState().reset();
    useSessionStore.setState({ activeId: 'level:ojz:act1' });
    useWorkspaceStore.getState().setFacet('level:ojz:act1', 'layout');
    expect(focusedDocId()).toBe('level:ojz:act1');
    useWorkspaceStore.getState().setFacet('level:ojz:act1', 'donors');
    expect(focusedDocId()).toBe(DONOR_PASTE_DOC_ID);

    // The stack that id resolves to is the paste history: after a paste it can
    // undo, which the act's command history (empty here) could not.
    const disk: Disk = { files: new Map([[PINS_PATH, { text: PINS, mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk);
    await usePasteStore.getState().selectAct('s2_two_clip_pins', p);
    const h = focusedHistory()!;
    expect(h.canUndo).toBe(false);
    await usePasteStore.getState().paste(CLIP, p);
    expect(h.canUndo).toBe(true);
  });
});

/**
 * ROW 213 (b): a refusal's subjects are outlined on the target pane (dashed,
 * warning, tagged with the rule) while the refusal stands, and cleared with it.
 * The refusals are aeon's real answers; every expected rectangle is read from
 * the manifest aeon judged or the vendored act, never typed here.
 */
const TWO = readFileSync(resolve(__dirname, '../../../../test/fixtures/clips/s2_two_clip.clips.json'), 'utf8');
const TWO_PATH = 'games/sonic4/data/clips/s2_two_clip/clips.json';
const outlinesNow = () => refusedOutlines(usePasteStore.getState());
const R3 = MUSIC.refuse_r3_paste_pre222;

/** A paste of R3's clip into s2_ehz_cpz that aeon's loader refuses with its real R3 answer. */
async function refusedR3Paste() {
  const disk: Disk = { files: new Map([[EHZ_CPZ_PATH, { text: EHZ_CPZ, mtimeMs: 7 }]]), clock: 100 };
  const p = ports(disk, { validate: (t) => (t.includes('"ehz_1"') ? { ok: false, exitCode: R3.exit, stdout: R3.stdout, stderr: R3.stderr } : {}) });
  await usePasteStore.getState().selectAct('s2_ehz_cpz', p);
  useDonorDraft.getState().reset();
  const o = await usePasteStore.getState().paste(musicPaste('refuse_r3_paste_pre222'), p);
  return { o, p };
}

describe('the target pane outlines what a refusal names (row 213 (b))', () => {
  beforeEach(() => { useDonorDraft.getState().reset(); useDonorStore.setState({ marquee: null }); });

  it('a paste refusal naming the pasted clip: one dashed warning outline, tagged with the rule, at that clip in the manifest aeon judged', async () => {
    const { o } = await refusedR3Paste();
    const r = JSON.parse(R3.stdout).refusals[0] as { rule: string; subjects: Array<{ index: number }> };
    expect(o.kind).toBe('refused');
    expect(outlinesNow()).toEqual([{ rect: R3.manifest.clips[r.subjects[0].index].dst_rect, tone: 'warning', dashed: true, tag: r.rule }]);
  });

  it('a pair rule (R10) outlines BOTH clips it names', async () => {
    const disk: Disk = { files: new Map([[TWO_PATH, { text: TWO, mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk, { validate: (t) => (t.includes('ehz_x') ? aeonSaid('refuse_r10_pair') : {}) });
    await usePasteStore.getState().selectAct('s2_two_clip', p);
    await usePasteStore.getState().paste(CLIP, p);
    const subjects = JSON.parse(CASES.refuse_r10_pair.stdout).refusals[0].subjects as Array<{ index: number }>;
    const clips = JSON.parse(TWO).clips as Array<{ dst_rect: unknown }>;
    expect(outlinesNow().map((x) => [x.rect, x.tag])).toEqual(subjects.map((s) => [clips[s.index].dst_rect, 'R10']));
  });

  it('a pair whose two clips sit on ONE rectangle (a paste placed exactly over a clip) still gives two outlines', async () => {
    // aeon's real R10 pair answer, over s2_two_clip with clip 1 moved onto clip 0's rectangle: the
    // overlap R10 names, in its most extreme form (the harness's DP.7 places its paste exactly so).
    const raw = JSON.parse(TWO) as { clips: Array<{ dst_rect: unknown }> };
    raw.clips[1].dst_rect = raw.clips[0].dst_rect;
    const { parseClipManifest } = await import('../../../core/formats/donors/clip-manifest-doc');
    const refusals = JSON.parse(CASES.refuse_r10_pair.stdout).refusals;
    const got = refusedOutlines({
      outcome: { kind: 'refused', stage: 'validate', refusals, warnings: [], text: '', command: '', judged: parseClipManifest(JSON.stringify(raw)) },
      bakeRefused: null,
    });
    expect(got.map((x) => [x.rect, x.tag])).toEqual([[raw.clips[0].dst_rect, 'R10'], [raw.clips[0].dst_rect, 'R10']]);
  });

  // Rows 232/233: the act on disk is the manifest aeon judged in validate-json.cases.json
  // (the case's `manifest`); the paste appends CLIP after its clips, so every index aeon
  // named still points where aeon meant.
  const WOVEN_PATH = 'games/sonic4/data/clips/s2_woven/clips.json';
  type Woven = { clips: Array<{ id: string; dst_rect: unknown }>; shafts: Array<{ id: string; dst_rect: unknown }> };
  async function wovenRefusal(k: string) {
    const act = CASES[k].manifest as Woven;
    const disk: Disk = { files: new Map([[WOVEN_PATH, { text: JSON.stringify(act, null, 2), mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk, { validate: (t) => (t.includes('ehz_x') ? aeonSaid(k) : {}) });
    await usePasteStore.getState().selectAct('s2_woven', p);
    const o = await usePasteStore.getState().paste(CLIP, p);
    const r = JSON.parse(CASES[k].stdout).refusals[0] as { rule: string; subjects: Array<{ kind: string; index: number; id: string }> };
    return { act, o, p, r };
  }

  it('row 233 (a): aeon\'s real K9 pair on the woven act (a clip and a shaft) is a REFUSAL with TWO outlines, the clip\'s and the shaft\'s, both named plainly', async () => {
    const { act, o, p, r } = await wovenRefusal('refuse_k9_shaft_dup_clip_id');
    const [clip, shaft] = r.subjects;
    expect([clip.kind, shaft.kind]).toEqual(['clip', 'shaft']);
    expect(o.kind === 'crashed' ? o.text : o.kind).toBe('refused');
    expect(outlinesNow()).toEqual([
      { rect: act.clips[clip.index].dst_rect, tone: 'warning', dashed: true, tag: r.rule },
      { rect: act.shafts[shaft.index].dst_rect, tone: 'warning', dashed: true, tag: r.rule },
    ]);
    // The words DonorPasteSection shows beside the refusal (its data-donors-note-subjects span).
    expect(o.kind === 'refused' && subjectsLabelOnPane(o.refusals[0].subjects, o.judged))
      .toBe(`clip ${clip.index} ${clip.id} and shaft ${shaft.index} ${shaft.id}`);
    expect(p.writes).toEqual([]);
  });

  it('row 233 (a): aeon\'s real K9 on a shaft wholly past the act draws NO outline and names the shaft "(not on this pane)"', async () => {
    const { o, p, r } = await wovenRefusal('refuse_k9_shaft_past_act');
    const [shaft] = r.subjects;
    expect(shaft.kind).toBe('shaft');
    expect(o.kind === 'crashed' ? o.text : o.kind).toBe('refused');
    expect(outlinesNow()).toEqual([]);
    expect(o.kind === 'refused' && subjectsLabelOnPane(o.refusals[0].subjects, o.judged))
      .toBe(`shaft ${shaft.index} ${shaft.id} (not on this pane)`);
    expect(p.writes).toEqual([]);
  });

  it('an EDIT of the drafted clip clears the refusal and its outlines', async () => {
    await refusedR3Paste();
    expect(outlinesNow().length).toBe(1);
    useDonorDraft.getState().setClipId('ehz_2');
    expect({ outcome: usePasteStore.getState().outcome, outlines: outlinesNow() }).toEqual({ outcome: null, outlines: [] });
  });

  it('a new MARQUEE clears the refusal and its outlines', async () => {
    await refusedR3Paste();
    expect(outlinesNow().length).toBe(1);
    useDonorStore.getState().setMarquee({ x: 0, y: 0, w: 1024, h: 1024 });
    expect(outlinesNow()).toEqual([]);
  });

  it('a new validate run clears them: the next paste, accepted, leaves no refused outline', async () => {
    const { p } = await refusedR3Paste();
    expect(outlinesNow().length).toBe(1);
    // The same draft pasted again: this time the port answers with aeon's acceptance.
    const again = await usePasteStore.getState().paste(musicPaste('accept_paste_inherits_music'), ports({ files: new Map([[EHZ_CPZ_PATH, { text: EHZ_CPZ, mtimeMs: 7 }]]), clock: 100 }));
    expect({ kind: again.kind, outlines: outlinesNow() }).toEqual({ kind: 'pasted', outlines: [] });
    expect(p.writes).toEqual([]);
  });

  it('clearing a refusal (leaving the page) keeps any other outcome: a pasted summary survives it', async () => {
    const disk: Disk = { files: new Map([[EHZ_CPZ_PATH, { text: EHZ_CPZ, mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk);
    await usePasteStore.getState().selectAct('s2_ehz_cpz', p);
    await usePasteStore.getState().paste(musicPaste('accept_paste_inherits_music'), p);
    usePasteStore.getState().clearRefusal();
    expect(usePasteStore.getState().outcome?.kind).toBe('pasted');
  });

  it('a re-bake refusal of the act on disk outlines the clip it names (R12 on s2_two_clip\'s clip 1)', async () => {
    const disk: Disk = { files: new Map([[TWO_PATH, { text: TWO, mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk, { bake: () => aeonBaked('refuse_r12_after_w2') });
    await usePasteStore.getState().selectAct('s2_two_clip', p);
    const r = JSON.parse(BAKE_CASES.refuse_r12_after_w2.stdout).refusals[0] as { rule: string; subjects: Array<{ index: number }> };
    expect(outlinesNow().map((x) => [x.rect, x.tag])).toEqual([[JSON.parse(TWO).clips[r.subjects[0].index].dst_rect, r.rule]]);
  });

  it('an edit of the draft does NOT clear a re-bake refusal: that one is about the act on disk', async () => {
    const disk: Disk = { files: new Map([[TWO_PATH, { text: TWO, mtimeMs: 7 }]]), clock: 100 };
    await usePasteStore.getState().selectAct('s2_two_clip', ports(disk, { bake: () => aeonBaked('refuse_r12_after_w2') }));
    useDonorDraft.getState().setClipId('anything');
    expect(outlinesNow().length).toBe(1);
  });

  it('the next bake run clears a re-bake refusal\'s outline when aeon now accepts the act', async () => {
    const disk: Disk = { files: new Map([[TWO_PATH, { text: TWO, mtimeMs: 7 }]]), clock: 100 };
    await usePasteStore.getState().selectAct('s2_two_clip', ports(disk, { bake: () => aeonBaked('refuse_r12_after_w2') }));
    expect(outlinesNow().length).toBe(1);
    await usePasteStore.getState().selectAct('s2_two_clip', ports(disk, { bake: () => aeonBaked('accept_w2') }));
    expect({ refused: usePasteStore.getState().bakeRefused, outlines: outlinesNow() }).toEqual({ refused: null, outlines: [] });
  });

  it('an act-level re-bake refusal (C3, no subjects) outlines nothing', async () => {
    const disk: Disk = { files: new Map([[TWO_PATH, { text: TWO, mtimeMs: 7 }]]), clock: 100 };
    await usePasteStore.getState().selectAct('s2_two_clip', ports(disk, { bake: () => aeonBaked('refuse_c3_act_level') }));
    expect({ kind: usePasteStore.getState().bakeNoteKind, outlines: outlinesNow() }).toEqual({ kind: 'refused', outlines: [] });
  });
});
