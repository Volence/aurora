/**
 * The paste flow, over fake ports: aeon's validator and bake, the guarded
 * writer, mtime and delete. What these rows hold:
 *
 *   * NOTHING IS WRITTEN unless aeon's loader AND bake both accepted the exact
 *     bytes that are then written (the tools and the file see one text);
 *   * a tool that could not run is not a refusal, and writes nothing either;
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

const PINS = readFileSync(resolve(__dirname, '../../../../test/fixtures/clips/s2_two_clip_pins.clips.json'), 'utf8');
const PINS_PATH = 'games/sonic4/data/clips/s2_two_clip_pins/clips.json';

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
      const base: ClipToolResult = { verb, ok: true, exitCode: 0, stdout: 'clips.json OK', stderr: '', command: `python3 ${verb}` };
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

  it('a REFUSAL at the loader writes nothing and carries aeon\'s words', async () => {
    const disk: Disk = { files: new Map([[PINS_PATH, { text: PINS, mtimeMs: 7 }]]), clock: 100 };
    const p = ports(disk, { validate: () => ({ ok: false, exitCode: 1, stdout: 'clips.json REFUSED R10 clips overlap' }) });
    await usePasteStore.getState().selectAct('s2_two_clip_pins', p);
    const o = await usePasteStore.getState().paste(CLIP, p);
    expect(o).toMatchObject({ kind: 'refused', stage: 'validate' });
    expect(o.kind === 'refused' && o.text).toMatch(/R10/);
    expect(p.writes).toEqual([]);
    expect(disk.files.get(PINS_PATH)!.text).toBe(PINS);
    expect(usePasteStore.getState().undoStack.length).toBe(0);
  });

  it('a REFUSAL at the bake writes nothing either', async () => {
    const disk: Disk = { files: new Map([[PINS_PATH, { text: PINS, mtimeMs: 7 }]]), clock: 100 };
    let bakes = 0;
    const p = ports(disk, { bake: (t) => (t.includes('ehz_x') ? (bakes++, { ok: false, exitCode: 1, stdout: 'C2 over 255' }) : {}) });
    await usePasteStore.getState().selectAct('s2_two_clip_pins', p);
    const o = await usePasteStore.getState().paste(CLIP, p);
    expect(bakes).toBe(1);
    expect(o).toMatchObject({ kind: 'refused', stage: 'bake' });
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
