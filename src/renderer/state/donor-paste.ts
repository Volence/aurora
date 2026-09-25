// The paste half of the Donors page: the target clip act, the paste, and its
// undo. Plan: docs/superpowers/plans/2026-09-25-s2-donor-page.md, S3.
//
// ═══ WHAT A PASTE IS, AGAINST AEON AS IT STANDS AT f4f1a32e ═══════════════
//
// A clip act is a MANIFEST (`games/sonic4/data/clips/<id>/clips.json`), and
// aeon builds everything else from it: `clip_act_bake.py` composes the act's
// section files (the words AND both collision planes, from the same rectangle)
// and `clip_rom_bake.py` builds its region rows and per-zone presets. Neither
// reads an editor act's section files or a regions.json. So a paste:
//
//   1. appends the clip to the manifest (clip-manifest-doc.ts), in memory;
//   2. asks aeon's LOADER about those exact bytes (clip_manifest.py validate
//      --json): a refusal is shown in aeon's words, naming the rule and the clip
//      or corridor, and nothing is written. A loader that CRASHED (exit 1 and no
//      JSON, aeon's traceback case) is its own outcome, never a refusal: the
//      manifest was not judged (core/formats/donors/clip-validate-json.ts);
//   3. asks aeon's BAKE to compose them (clip_act_bake.py bake --out <temp>):
//      a refusal is shown likewise; the composed section files come back, and
//      the target pane is drawn from them, so the author sees what the ROM bake
//      composes and not Aurora's opinion of it;
//   4. writes clips.json through the guarded writer (a file changed under the
//      page since it was read is a conflict, never overwritten).
//
// The design's §8 also lists writing the clip into "the target act's section
// files" and a regions.json row. Against aeon's landed rows 6 and 7 those have
// no reader (and aimed at OJZ act 1 they would put Sonic 2 tile indices into
// the shipped act's section files). They are BLOCKED on an aeon ruling, booked
// in docs/reviews/2026-09-25-s2-donor-page.md, not approximated here.
//
// ═══ UNDO ════════════════════════════════════════════════════════════════
//
// A paste WRITES (step 4), so its undo writes too: it puts back the exact bytes
// the file held before, or removes the file when the paste created it. Both
// are refused if the file changed since the paste wrote it: an undo must not
// overwrite someone else's edit. Ctrl+Z reaches this stack whenever the Donors
// facet is showing (editorStore.focusedDocId routes it), and the header's
// Undo/Redo buttons with it.

import { create } from 'zustand';
import type {
  ClipToolBaked, ClipToolResult, ClipToolVerb, DeleteOutcome, GuardedWriteFile, GuardedWriteResult,
} from '../../shared/ipc-types';
import type { UndoStack } from '../../core/editing/undo-stack';
import {
  clipsManifestPath, CLIPS_ROOT_REL, newClipManifest, parseClipManifest, serializeClipManifest, withClip,
  type ClipManifestDoc, type NewClip,
} from '../../core/formats/donors/clip-manifest-doc';
import { saveConflictCauses } from '../../core/project/conflict-message';
import { readValidateJson, type ClipNote } from '../../core/formats/donors/clip-validate-json';

/** The undo document the Donors facet owns (editorStore.focusedDocId). */
export const DONOR_PASTE_DOC_ID = 'doc:donor-paste';

export interface PastePorts {
  clipTool(root: string, verb: ClipToolVerb, text: string): Promise<ClipToolResult>;
  /** The file's text and mtime, or null when it is known absent. Throws when it cannot tell. */
  readText(root: string, rel: string): Promise<{ text: string; mtimeMs: number } | null>;
  writeGuarded(root: string, files: GuardedWriteFile[]): Promise<GuardedWriteResult>;
  fileMtime(root: string, rel: string): Promise<number | null>;
  deleteFile(root: string, rel: string): Promise<DeleteOutcome>;
  /** Directory entries, or 'absent'. Throws when it cannot tell. */
  listDir(root: string, rel: string): Promise<string[] | 'absent'>;
}

export const ipcPastePorts: PastePorts = {
  clipTool: (root, verb, text) => window.api.clipTool(root, verb, text),
  async readText(root, rel) {
    const probe = await window.api.probePath(root, rel);
    if (probe.presence === 'absent') return null;
    if (probe.presence === 'unknown') throw new Error(`cannot tell whether ${rel} exists: ${probe.reason ?? 'unknown'}`);
    const buf = await window.api.readBinaryFile(root, rel);
    const mtimeMs = await window.api.fileMtime(root, rel);
    if (mtimeMs === null) throw new Error(`read ${rel} but could not stat it`);
    return { text: new TextDecoder().decode(new Uint8Array(buf)), mtimeMs };
  },
  writeGuarded: (root, files) => window.api.writeGuarded(root, files),
  fileMtime: (root, rel) => window.api.fileMtime(root, rel),
  deleteFile: (root, rel) => window.api.deleteFile(root, rel),
  async listDir(root, rel) {
    const l = await window.api.probeDir(root, rel);
    if (l.outcome === 'listed') return l.entries;
    if (l.outcome === 'absent') return 'absent';
    throw new Error(`cannot list ${rel}: ${l.reason ?? l.outcome}`);
  },
};

export interface TargetAct {
  actId: string;
  path: string;
  doc: ClipManifestDoc;
  /** What is on disk now as far as the page knows: null = no file. */
  onDisk: { text: string; mtimeMs: number } | null;
}

/** The composed act, as aeon's bake wrote it, parsed enough to draw and report. */
export interface BakedAct {
  clipact: Record<string, unknown>;
  files: Record<string, Uint8Array>;
  /** The manifest text the bake composed; the pane is stale when it differs. */
  forText: string;
}

export type PasteOutcome =
  | { kind: 'pasted'; clipId: string; path: string; created: boolean; warnings: ClipNote[] }
  /** aeon's loader refused: `refusals` as its --json names them; `text` is their messages. */
  | { kind: 'refused'; stage: 'validate'; refusals: ClipNote[]; warnings: ClipNote[]; text: string; command: string }
  | { kind: 'refused'; stage: 'bake'; text: string; command: string }
  /** aeon's loader ran and CRASHED (or answered outside its contract): not judged, not a refusal. */
  | { kind: 'crashed'; stage: 'validate'; why: string; exitCode: number | null; stdout: string; stderr: string; text: string; command: string }
  | { kind: 'could-not-run'; stage: 'validate' | 'bake'; text: string; command: string }
  | { kind: 'conflict'; text: string }
  | { kind: 'undone' | 'redone'; path: string; removed: boolean }
  | { kind: 'error'; text: string };

interface HistoryEntry {
  path: string;
  label: string;
  before: string | null;
  after: string;
  /** mtime of the file after the paste (or redo) wrote `after`. */
  afterMtimeMs: number;
  /** mtime after an undo restored `before` (null when the undo removed the file). */
  beforeMtimeMs: number | null;
}

export interface PasteState {
  root: string | null;
  acts: string[] | null;
  actsError: string | null;
  target: TargetAct | null;
  targetError: string | null;
  baked: BakedAct | null;
  bakeNote: string | null;
  busy: boolean;
  outcome: PasteOutcome | null;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  loadActs(root: string, ports?: PastePorts): Promise<void>;
  selectAct(actId: string, ports?: PastePorts): Promise<void>;
  newAct(actId: string, gridW: number, gridH: number): void;
  paste(clip: NewClip, ports?: PastePorts): Promise<PasteOutcome>;
  undo(ports?: PastePorts): Promise<PasteOutcome | null>;
  redo(ports?: PastePorts): Promise<PasteOutcome | null>;
  reset(): void;
}

const INITIAL = {
  root: null, acts: null, actsError: null, target: null, targetError: null, baked: null, bakeNote: null,
  busy: false, outcome: null, undoStack: [] as HistoryEntry[], redoStack: [] as HistoryEntry[],
};

function toolText(r: ClipToolResult): string {
  const body = [r.stdout.trim(), r.stderr.trim()].filter(Boolean).join('\n');
  return r.couldNotRun ? `${r.couldNotRun}${body ? `\n${body}` : ''}` : body;
}

function bakedFrom(b: ClipToolBaked, forText: string): BakedAct {
  let clipact: Record<string, unknown> = {};
  try { clipact = JSON.parse(b.clipact) as Record<string, unknown>; } catch { clipact = {}; }
  return { clipact, files: b.files, forText };
}

const encoder = new TextEncoder();

export const usePasteStore = create<PasteState>((set, get) => {
  /** Re-bake the manifest on disk for display; never blocks and never writes. */
  async function refreshBake(ports: PastePorts): Promise<void> {
    const { root, target } = get();
    if (!root || !target || target.doc.clips.length === 0) { set({ baked: null, bakeNote: null }); return; }
    const text = target.onDisk?.text ?? serializeClipManifest(target.doc);
    const r = await ports.clipTool(root, 'bake', text);
    if (r.ok && r.baked) set({ baked: bakedFrom(r.baked, text), bakeNote: null });
    else {
      set({
        baked: null,
        bakeNote: r.couldNotRun
          ? `Aurora could not run aeon's bake, so the act is not drawn: ${toolText(r)}`
          : `aeon's bake refuses this act as it stands on disk:\n${toolText(r)}`,
      });
    }
  }

  async function reloadTarget(ports: PastePorts, actId: string): Promise<void> {
    const root = get().root;
    if (!root) return;
    const path = clipsManifestPath(actId);
    const got = await ports.readText(root, path);
    if (got === null) { set({ target: null, targetError: `${path} is not there` }); return; }
    set({ target: { actId, path, doc: parseClipManifest(got.text, path), onDisk: got }, targetError: null });
  }

  return {
    ...INITIAL,

    async loadActs(root, ports = ipcPastePorts) {
      if (get().root !== root) set({ ...INITIAL, root });
      try {
        const entries = await ports.listDir(root, CLIPS_ROOT_REL);
        const acts: string[] = [];
        if (entries !== 'absent') {
          for (const e of [...entries].sort()) {
            if ((await ports.readText(root, clipsManifestPath(e))) !== null) acts.push(e);
          }
        }
        set({ acts, actsError: null });
      } catch (e) {
        set({ acts: null, actsError: (e as Error).message });
      }
    },

    async selectAct(actId, ports = ipcPastePorts) {
      set({ busy: true, outcome: null, baked: null, bakeNote: null });
      try {
        await reloadTarget(ports, actId);
        await refreshBake(ports);
      } catch (e) {
        set({ target: null, targetError: (e as Error).message });
      } finally {
        set({ busy: false });
      }
    },

    newAct(actId, gridW, gridH) {
      set({
        target: { actId, path: clipsManifestPath(actId), doc: newClipManifest(actId, gridW, gridH), onDisk: null },
        targetError: null, baked: null, bakeNote: null, outcome: null,
      });
    },

    async paste(clip, ports = ipcPastePorts) {
      const { root, target } = get();
      if (!root || !target) {
        const o: PasteOutcome = { kind: 'error', text: 'No target clip act is chosen.' };
        set({ outcome: o });
        return o;
      }
      set({ busy: true, outcome: null });
      try {
        const next = withClip(target.doc, clip);
        const text = serializeClipManifest(next);
        const v = await ports.clipTool(root, 'validate', text);
        if (v.couldNotRun) {
          const o: PasteOutcome = { kind: 'could-not-run', stage: 'validate', text: toolText(v), command: v.command };
          set({ outcome: o });
          return o;
        }
        const verdict = readValidateJson(v.exitCode, v.stdout, v.stderr);
        if (verdict.kind === 'crashed') {
          const o: PasteOutcome = {
            kind: 'crashed', stage: 'validate', why: verdict.why, exitCode: verdict.exitCode,
            stdout: verdict.stdout, stderr: verdict.stderr, text: `${verdict.why}\n${toolText(v)}`.trim(), command: v.command,
          };
          set({ outcome: o });
          return o;
        }
        if (verdict.kind === 'refused') {
          const o: PasteOutcome = {
            kind: 'refused', stage: 'validate', refusals: verdict.refusals, warnings: verdict.warnings,
            text: verdict.refusals.map((n) => n.message).join('\n'), command: v.command,
          };
          set({ outcome: o });
          return o;
        }
        const b = await ports.clipTool(root, 'bake', text);
        if (!b.ok || !b.baked) {
          const o: PasteOutcome = b.couldNotRun
            ? { kind: 'could-not-run', stage: 'bake', text: toolText(b), command: b.command }
            : { kind: 'refused', stage: 'bake', text: toolText(b), command: b.command };
          set({ outcome: o });
          return o;
        }
        const w = await ports.writeGuarded(root, [{
          relPath: target.path, bytes: encoder.encode(text), expectedMtimeMs: target.onDisk?.mtimeMs ?? null,
        }]);
        if ('conflicts' in w) {
          const o: PasteOutcome = { kind: 'conflict', text: saveConflictCauses(w.conflicts, { lead: 'Paste refused:' }) };
          set({ outcome: o });
          return o;
        }
        const mtime = w.newMtimes[target.path];
        if (w.failed || !w.written.includes(target.path) || typeof mtime !== 'number') {
          const o: PasteOutcome = { kind: 'error', text: `The write of ${target.path} did not land${w.failed ? `: ${w.failed.message}` : ''}.` };
          set({ outcome: o });
          return o;
        }
        const entry: HistoryEntry = {
          path: target.path, label: `Paste ${clip.id}`, before: target.onDisk?.text ?? null, after: text,
          afterMtimeMs: mtime, beforeMtimeMs: target.onDisk?.mtimeMs ?? null,
        };
        const o: PasteOutcome = {
          kind: 'pasted', clipId: clip.id, path: target.path, created: target.onDisk === null,
          warnings: verdict.warnings,
        };
        const acts = get().acts ?? [];
        set({
          target: { ...target, doc: next, onDisk: { text, mtimeMs: mtime } },
          baked: bakedFrom(b.baked, text), bakeNote: null, outcome: o,
          undoStack: [...get().undoStack, entry], redoStack: [],
          acts: acts.includes(target.actId) ? acts : [...acts, target.actId].sort(),
        });
        return o;
      } catch (e) {
        const o: PasteOutcome = { kind: 'error', text: (e as Error).message };
        set({ outcome: o });
        return o;
      } finally {
        set({ busy: false });
      }
    },

    async undo(ports = ipcPastePorts) {
      const { root, undoStack } = get();
      const entry = undoStack[undoStack.length - 1];
      if (!root || !entry || get().busy) return null;
      set({ busy: true });
      try {
        const now = await ports.fileMtime(root, entry.path);
        if (now !== entry.afterMtimeMs) {
          const o: PasteOutcome = {
            kind: 'conflict',
            text: `Undo refused: ${entry.path} changed since the paste wrote it (${now === null ? 'it is gone' : 'its time stamp moved'}), `
              + 'and putting the old bytes back would overwrite that change. Nothing was written.',
          };
          set({ outcome: o });
          return o;
        }
        let removed = false;
        let restoredMtime: number | null = null;
        if (entry.before === null) {
          const d = await ports.deleteFile(root, entry.path);
          if (!d.ok) {
            const o: PasteOutcome = { kind: 'error', text: `Undo could not remove ${entry.path}: ${d.reason}` };
            set({ outcome: o });
            return o;
          }
          removed = true;
        } else {
          const w = await ports.writeGuarded(root, [{
            relPath: entry.path, bytes: encoder.encode(entry.before), expectedMtimeMs: entry.afterMtimeMs,
          }]);
          if ('conflicts' in w) {
            const o: PasteOutcome = { kind: 'conflict', text: saveConflictCauses(w.conflicts, { lead: 'Undo refused:' }) };
            set({ outcome: o });
            return o;
          }
          restoredMtime = w.newMtimes[entry.path] ?? null;
        }
        const done = { ...entry, beforeMtimeMs: restoredMtime };
        set({ undoStack: get().undoStack.slice(0, -1), redoStack: [...get().redoStack, done] });
        const target = get().target;
        if (target && target.path === entry.path) {
          if (entry.before === null) {
            set({ target: { ...target, doc: newClipManifest(target.actId, target.doc.gridW, target.doc.gridH), onDisk: null } });
          } else {
            set({ target: { ...target, doc: parseClipManifest(entry.before, entry.path), onDisk: { text: entry.before, mtimeMs: restoredMtime ?? 0 } } });
          }
          await refreshBake(ports);
        }
        const o: PasteOutcome = { kind: 'undone', path: entry.path, removed };
        set({ outcome: o });
        return o;
      } catch (e) {
        const o: PasteOutcome = { kind: 'error', text: (e as Error).message };
        set({ outcome: o });
        return o;
      } finally {
        set({ busy: false });
      }
    },

    async redo(ports = ipcPastePorts) {
      const { root, redoStack } = get();
      const entry = redoStack[redoStack.length - 1];
      if (!root || !entry || get().busy) return null;
      set({ busy: true });
      try {
        const w = await ports.writeGuarded(root, [{
          relPath: entry.path, bytes: encoder.encode(entry.after), expectedMtimeMs: entry.beforeMtimeMs,
        }]);
        if ('conflicts' in w) {
          const o: PasteOutcome = { kind: 'conflict', text: saveConflictCauses(w.conflicts, { lead: 'Redo refused:' }) };
          set({ outcome: o });
          return o;
        }
        const mtime = w.newMtimes[entry.path];
        if (typeof mtime !== 'number') {
          const o: PasteOutcome = { kind: 'error', text: `The redo write of ${entry.path} did not land.` };
          set({ outcome: o });
          return o;
        }
        set({ redoStack: get().redoStack.slice(0, -1), undoStack: [...get().undoStack, { ...entry, afterMtimeMs: mtime }] });
        const target = get().target;
        if (target && target.path === entry.path) {
          set({ target: { ...target, doc: parseClipManifest(entry.after, entry.path), onDisk: { text: entry.after, mtimeMs: mtime } } });
          await refreshBake(ports);
        }
        const o: PasteOutcome = { kind: 'redone', path: entry.path, removed: false };
        set({ outcome: o });
        return o;
      } catch (e) {
        const o: PasteOutcome = { kind: 'error', text: (e as Error).message };
        set({ outcome: o });
        return o;
      } finally {
        set({ busy: false });
      }
    },

    reset() { set({ ...INITIAL }); },
  };
});

/**
 * The paste history as an UndoStack, for the DocumentHistoryHub. Undo and redo
 * are file writes and so asynchronous; the stack fires them and the page shows
 * the outcome. `clear` empties the in-memory history and touches no file.
 */
export function makeDonorPasteHistory(ports: PastePorts = ipcPastePorts): UndoStack {
  return {
    get canUndo() { return usePasteStore.getState().undoStack.length > 0 && !usePasteStore.getState().busy; },
    get canRedo() { return usePasteStore.getState().redoStack.length > 0 && !usePasteStore.getState().busy; },
    undo() { void usePasteStore.getState().undo(ports); },
    redo() { void usePasteStore.getState().redo(ports); },
    clear() { usePasteStore.setState({ undoStack: [], redoStack: [] }); },
    onChange(cb) {
      return usePasteStore.subscribe((s, p) => {
        if (s.undoStack !== p.undoStack || s.redoStack !== p.redoStack || s.busy !== p.busy) cb();
      });
    },
  };
}
