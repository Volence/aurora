// ═══════════════════════════════════════════════════════════════════════════
// d-38: THE SAVE-SIDE VOCABULARY. FOUR CONTROLS, ONE RULE: SAY WHAT IS TRUE.
// ═══════════════════════════════════════════════════════════════════════════
//
// Owner card `d-38-save-surface-vocabulary` (docs/decisions.jsonl), answered
// `name_what_is_true` on 2026-09-09. Packet:
// `docs/reviews/2026-09-10-save-surface-vocabulary.md`. Sources: the two UX
// seats that walked this app cold on 2026-09-07 and could not see each other
// (`docs/reviews/2026-09-07-lens-ux/uxa-walk.md` F2,
// `docs/reviews/2026-09-07-lens-ux/uxb-audit.md` F2 / F3 / F7).
//
// ⚠ FOUR PREDICATES, AND NAMING WHICH ONE EACH ROW READS IS THE DISCIPLINE.
// The save-contract packet before this one was bitten by exactly this and its
// test file says so; the same list, plus the one this parcel adds:
//
//   a  "the store believes there are unsaved edits"  — useEditorStore.dirty
//   b  "an undo could take the work back"            — documentHistoryHub
//   c  "the app told a person"                       — a toast, or a receipt
//   d  "the words on a control are true"             — the request the confirm
//                                                      store actually holds
//
// A FIFTH, "a person can SEE it", is NOT readable here: this suite has no
// jsdom, no React and no DOM, so §1 is a SOURCE gate and every row below it is
// held at the store layer. Nothing here observes a rendered pixel. The packet
// says so in the same words.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { requestCloseTab } from '../tab-activation';
import { aeonLevelTab } from '../tabs';
import { useSessionStore } from '../../state/sessionStore';
import { useProjectStore, getActiveLevel } from '../../state/projectStore';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useEditorStore, executeCommand, focusedHistory } from '../../state/editorStore';
import { useToastStore } from '../../state/toastStore';
import { useConfirmStore } from '../../state/confirmStore';
import { useArtStore } from '../../state/artStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../../state/history-hub';
import { useSaveReceipt, resetSaveReceipt } from '../../state/save-receipt';
import {
  saveActive, __setRuntimeSaversForTest, __resetRuntimeSaversForTest,
} from '../../state/project-runtime';
import { savedFilesSentence } from '../../state/classic-save';
import { chunkDocEditsAreRecorded } from '../../state/chunk-doc-commit';
import {
  planArtDocDiscard, artDocDiscardBody, artDocDiscardTitle, confirmArtDocumentClose,
} from '../../components/art/open-document';
import type { OpenDocument } from '../../state/artStore';
import { createDoc } from '../../../core/art/composer-buffer';
import { createSection } from '../../../core/model/s4-types';
import { NAMED_IN_SUMMARY } from '../../../core/project/notice';

const RENDERER = join(__dirname, '..', '..');
const read = (rel: string): string => readFileSync(join(RENDERER, rel), 'utf8');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A one-zone/two-act aeon project. Same shape save-contract.test.ts uses. */
function fakeProject(chunkIds: readonly string[] = []): never {
  return {
    zones: [{
      id: 'ojz',
      name: 'OJZ',
      tileset: { tiles: [] },
      palette: { lines: [{ colors: [{ r: 0, g: 0, b: 0, a: 255 }] }] },
      acts: [
        { id: 'act1', name: 'act1', gridWidth: 1, gridHeight: 1, sections: [createSection(0, 's0')] },
        { id: 'act2', name: 'act2', gridWidth: 1, gridHeight: 1, sections: [createSection(0, 's0')] },
      ],
    }],
    chunkLibrary: chunkIds.map((id) => ({
      id, name: id, widthTiles: 2, heightTiles: 2,
      nametable: new Uint16Array(4), collisionA: new Uint16Array(1), collisionB: new Uint16Array(1),
    })),
    bgLibrary: [],
  } as never;
}

/** One undoable command: a palette line edit, recorded on the focused document. */
const setPal = (v: number) => ({
  type: 'set-palette-line', description: 't', sectionIndex: -1, line: 0,
  oldColors: [{ r: 0, g: 0, b: 0, a: 255 }], newColors: [{ r: v, g: 0, b: 0, a: 255 }],
}) as never;

const HOME = { id: 'home', kind: 'home' as const, title: 'Home' };
const OJZ1 = aeonLevelTab('ojz', 'OJZ', 'act1');

function openAeon(chunkIds: readonly string[] = []): void {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useSessionStore.getState().reset();
  useClassicProjectStore.setState({ status: 'closed' } as never);
  useProjectStore.setState({ project: fakeProject(chunkIds), currentZoneId: 'ojz', currentActId: 'act1' });
  useEditorStore.getState().markClean();
  useArtStore.getState().closeDocument();
  useToastStore.setState({ toasts: [] });
  useConfirmStore.getState().answer('cancel');
  resetSaveReceipt();
  useSessionStore.setState({ tabs: [HOME, OJZ1], activeId: OJZ1.id });
}

/** An OpenDocument with only the fields a row cares about spelled out. */
function docOf(over: Partial<OpenDocument> = {}): OpenDocument {
  return {
    doc: createDoc(2, 2), liveTileIndex: null, chunkId: null,
    name: 'New Chunk (16x16)', dirty: false, ...over,
  };
}

// ---------------------------------------------------------------------------
// §1  ITEM 1 — a level document has a Save control (seat B's F7)
//
// PREDICATE: none of the four. This is a SOURCE gate, for the reason
// `shell/__tests__/sprite-doc-header.test.ts` states for the header it guards:
// the suite is node-only, so what a .tsx MOUNTS is readable and what it RENDERS
// is not. The behaviour behind the control is §2's, over the real coordinator.
// ---------------------------------------------------------------------------

describe('§1 the level workspace header carries a Save control', () => {
  const workspace = read('workspace/LevelWorkspace.tsx');
  const chip = read('shell/SaveChip.tsx');

  it('reads the files it claims to (a wrong path would pass vacuously)', () => {
    expect(workspace).toContain('export default function LevelWorkspace');
    expect(chip).toContain('export default function SaveChip');
  });

  it('the header imports and mounts the chip', () => {
    expect(workspace).toMatch(/^import SaveChip from '\.\.\/shell\/SaveChip';$/m);
    expect(workspace).toContain('<SaveChip />');
  });

  it('and mounts it AFTER Redo, where the sprite header puts its own Save', () => {
    // The rule the card's answer is really about: two document kinds in one tab
    // strip, and a control that moves when you change tabs is one you have to
    // find again. Positions, not a snapshot of the whole header, so adding a
    // seventh facet chip does not redden this.
    const redo = workspace.indexOf('>Redo</Chip>');
    const save = workspace.indexOf('<SaveChip />');
    expect(redo).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(redo);
    // ...and the sprite header, which is the precedent being mirrored, still
    // orders its own three the same way. A guard that pinned only the level
    // header would go on passing the day the sprite one was reordered, and the
    // property is the AGREEMENT between them.
    const sprite = read('shell/SpriteDocHeader.tsx');
    expect(sprite.indexOf('>Redo</Chip>')).toBeLessThan(sprite.indexOf("{saveFlash ? 'Saved!' : 'Save'}"));
  });

  it('the chip derives enabledness from the coordinator, not a second rule', () => {
    // `canSaveActive` is the one predicate that answers "would Ctrl+S write
    // anything", so the button and the chord cannot disagree. A chip that
    // computed its own dirtiness is the inert-Save shape the save perimeter
    // exists to remove.
    expect(chip).toContain('canSaveActive');
    expect(chip).toContain('saveActive()');
    expect(chip).toContain('useSaveReceipt');
  });
});

// ---------------------------------------------------------------------------
// §2  ITEM 2 — a save says so on screen (seat A's F2)
//
// PREDICATE c ("the app told a person"), in its two channels: the RECEIPT the
// control flashes from, and the toast SENTENCE a classic save now speaks.
// ---------------------------------------------------------------------------

describe('§2 a save that wrote something leaves a receipt; one that wrote nothing does not', () => {
  beforeEach(() => { openAeon(); });
  afterEach(() => { __resetRuntimeSaversForTest(); useSessionStore.getState().reset(); });

  it('a Ctrl+S that writes bumps the receipt and names the tab it wrote', async () => {
    executeCommand(setPal(7), getActiveLevel(useProjectStore.getState())!);
    let ran = 0;
    __setRuntimeSaversForTest({ aeon: () => { ran += 1; useEditorStore.getState().markClean(); } });

    const before = useSaveReceipt.getState().seq;
    await saveActive(OJZ1.id);

    expect(ran).toBe(1);
    expect(useSaveReceipt.getState().seq).toBe(before + 1);
    expect(useSaveReceipt.getState().tabId).toBe(OJZ1.id);
  });

  // THE CONTROL, and it is the one that matters: a control that says "Saved!"
  // over a save that wrote nothing is the d-38 defect in a new place.
  it('CONTROL: a Ctrl+S the routing did not reach leaves NO receipt, and speaks instead', async () => {
    // Dirty in the store, but the ACTIVE tab is Home, which no saver owns. This
    // is seat B's F3 keypress exactly (uxb-audit.md F3).
    executeCommand(setPal(7), getActiveLevel(useProjectStore.getState())!);
    useSessionStore.setState({ activeId: HOME.id });
    useToastStore.setState({ toasts: [] });

    await saveActive(HOME.id);

    expect(useSaveReceipt.getState().seq).toBe(0);
    // ...and the silence that seat B measured is still gone: it says why.
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(/Ctrl\+S wrote nothing/);
  });

  it('CONTROL: a clean app saving nothing leaves no receipt and says nothing', async () => {
    await saveActive(OJZ1.id);
    expect(useSaveReceipt.getState().seq).toBe(0);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('a save that FAILED leaves no receipt, however much else ran', async () => {
    executeCommand(setPal(7), getActiveLevel(useProjectStore.getState())!);
    __setRuntimeSaversForTest({ aeon: () => { throw new Error('disk on fire'); } });

    await saveActive(OJZ1.id);

    expect(useSaveReceipt.getState().seq).toBe(0);
    expect(useToastStore.getState().toasts.at(-1)?.type).toBe('error');
  });
});

describe('§2 the classic success toast names the files it wrote', () => {
  // Seat A's F3: 14 pixels in a tile the panel called "in 0 blocks · 0 cells"
  // rewrote two .nem files, +329 bytes, and nothing on screen named either.
  const FILES = ['objpos/ghz1.bin', 'palette/Green Hill Zone.bin', 'artnem/8x8 - GHZ1.nem'];

  it('names them, and counts them', () => {
    const s = savedFilesSentence(1, FILES.slice(0, 2));
    expect(s).toContain('objpos/ghz1.bin');
    expect(s).toContain('palette/Green Hill Zone.bin');
    expect(s).toContain('2 files');
    expect(s).toContain('Saved 1 level(s)');   // the sentence it grew out of survives
  });

  it('singularises one file rather than saying "1 files"', () => {
    expect(savedFilesSentence(1, ['objpos/ghz1.bin'])).toContain('1 file:');
  });

  it('is BOUNDED: a long save samples and counts the rest', () => {
    // Derived from the producer's own constant, not from a literal typed here:
    // the day `NAMED_IN_SUMMARY` moves, this row moves with it.
    const many = Array.from({ length: NAMED_IN_SUMMARY + 4 }, (_, i) => `art/f${i}.bin`);
    const s = savedFilesSentence(1, many);
    expect(s).toContain(`${many.length} files`);
    expect(s).toContain(`+${many.length - NAMED_IN_SUMMARY} more`);
    expect(s).not.toContain(many[many.length - 1]);
  });

  it('CONTROL: a save the channel reported no paths for still says it saved', () => {
    // `written` is display metadata from main; an empty one must not produce
    // "0 files:" with nothing after the colon.
    expect(savedFilesSentence(2, [])).toBe('Saved 2 level(s)');
  });
});

// ---------------------------------------------------------------------------
// §3  ITEM 3 — a dirty level tab closes with no prompt, and destroys nothing
//
// PREDICATES a ("the store believes there are unsaved edits"), b ("an undo could
// take the work back") and d ("no question was asked").
//
// ⚠ THIS ROW EXISTS TO PIN A PREMISE, NOT A FIX. The card's answer adds no
// close prompt, and its stated reason is "after this morning's fix a close
// destroys nothing" — a claim about behaviour that the no-prompt decision rests
// entirely on. If a close ever starts destroying something again, the ruling is
// wrong rather than merely unimplemented, so the premise gets a guard.
//
// `save-contract.test.ts` R4 already pins the history survival on the CLASSIC
// side. These rows are the AEON side (the engine both seats were actually
// looking at), and they add the two halves R4 does not read: that nothing is
// asked, and that the surviving stack can still take the work back.
// ---------------------------------------------------------------------------

describe('§3 closing a dirty level tab asks nothing and destroys nothing', () => {
  beforeEach(() => { openAeon(); });
  afterEach(() => { useSessionStore.getState().reset(); documentHistoryHub.clearAll(); });

  it('no dialog, the edit survives, and Undo can still take it back', async () => {
    executeCommand(setPal(7), getActiveLevel(useProjectStore.getState())!);
    expect(useEditorStore.getState().dirty).toBe(true);
    expect(focusedHistory()!.canUndo).toBe(true);

    await requestCloseTab(OJZ1.id);

    // d — NOTHING WAS ASKED. This is the half the card decided, and the half no
    // existing row reads.
    expect(useConfirmStore.getState().request).toBeNull();
    // The tab really did close, or the three assertions above are vacuous.
    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME.id]);

    // a — the work is still there and still unsaved.
    expect(useEditorStore.getState().dirty).toBe(true);
    expect(Object.keys(useEditorStore.getState().dirtyActs)).toEqual(['ojz/act1']);

    // b — and the way back is not merely PRESENT, it WORKS. `has()` alone would
    // pass over a stack that had been emptied.
    expect(documentHistoryHub.has(OJZ1.id)).toBe(true);
    const history = documentHistoryHub.historyFor(OJZ1.id);
    expect(history.canUndo).toBe(true);
    history.undo();
    expect(useEditorStore.getState().dirty).toBe(false);
    expect(useProjectStore.getState().project!.zones[0].palette.lines[0].colors[0].r).toBe(0);
  });

  it('CONTROL: a CLEAN level tab still disposes its stack (the pre-existing rule)', async () => {
    documentHistoryHub.historyFor(OJZ1.id);
    expect(useEditorStore.getState().dirty).toBe(false);

    await requestCloseTab(OJZ1.id);

    expect(useConfirmStore.getState().request).toBeNull();
    expect(documentHistoryHub.has(OJZ1.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §4  ITEM 4 — Discard on a chunk (seat-independent; a d-37 consequence)
//
// PREDICATE d ("the words on a control are true"), read off the request the
// real confirm store actually holds, plus the pure rule underneath it.
// ---------------------------------------------------------------------------

describe('§4a chunkDocEditsAreRecorded: which documents lose nothing', () => {
  const LIB = [{ id: 'c1' }];

  it('a chunk document whose chunk is in the library is recorded', () => {
    expect(chunkDocEditsAreRecorded(docOf({ chunkId: 'c1', dirty: true }), LIB)).toBe(true);
  });

  // THE ROW THAT KEEPS THE REASSURANCE HONEST. A chunk whose entry was undone or
  // cleared away has nowhere its edits can be living, so the old Discard wording
  // is still the true one there.
  it('a chunk document whose chunk has LEFT the library is not', () => {
    expect(chunkDocEditsAreRecorded(docOf({ chunkId: 'gone', dirty: true }), LIB)).toBe(false);
    expect(chunkDocEditsAreRecorded(docOf({ chunkId: 'c1', dirty: true }), [])).toBe(false);
  });

  it('the three document kinds that are not chunk documents are not recorded', () => {
    expect(chunkDocEditsAreRecorded(docOf({ dirty: true }), LIB)).toBe(false);               // buffered
    expect(chunkDocEditsAreRecorded(docOf({ chunkId: 'c1', liveTileIndex: 2 }), LIB)).toBe(false);
    expect(chunkDocEditsAreRecorded(
      docOf({ chunkId: 'c1', bgOverride: { kind: 'tile', tileIndex: 0 } }), LIB)).toBe(false);
    expect(chunkDocEditsAreRecorded(null, LIB)).toBe(false);
  });
});

describe('§4b the words the two cases produce', () => {
  const recorded = { offerSave: true, unsavable: null, writesThrough: true };
  const buffered = { offerSave: true, unsavable: null, writesThrough: false };

  it('the recorded copy names Ctrl+Z as the way back and claims no loss', () => {
    for (const door of ['open', 'close'] as const) {
      const body = artDocDiscardBody(door, recorded);
      // Keyed on wording ONLY this rule uses. "already in the chunk library" and
      // the chord appear in no other door's copy, so a matcher that went green
      // with the branch deleted would be reading the buffered sentence, which
      // says "discards the unsaved strokes" instead.
      expect(body, door).toContain('already in the chunk library');
      expect(body, door).toContain('Ctrl+Z');
      expect(body, door).toContain('throws nothing away');
      expect(body, door).not.toMatch(/discard/i);
    }
  });

  it('CONTROL: the buffered copy still warns, in the old words', () => {
    for (const door of ['open', 'close', 'stale'] as const) {
      expect(artDocDiscardBody(door, buffered), door).toMatch(/discards|discards the unsaved/);
      expect(artDocDiscardBody(door, buffered), door).not.toContain('Ctrl+Z');
    }
  });

  it('the title says unAPPLIED for a chunk and unSAVED for a buffer', () => {
    expect(artDocDiscardTitle({ name: 'Ledge', writesThrough: true }))
      .toBe('Chunk "Ledge" is not applied to this act yet');
    expect(artDocDiscardTitle({ name: 'Ledge', writesThrough: false }))
      .toBe('Unsaved strokes in "Ledge"');
  });

  it('the plan defaults to the CONSERVATIVE answer for a caller that never asked', () => {
    const plan = planArtDocDiscard(docOf({ dirty: true }), { kind: 'savable' });
    expect(plan.kind === 'confirm' && plan.writesThrough).toBe(false);
  });
});

describe('§4c the real close door over a real chunk document', () => {
  beforeEach(() => { openAeon(['c1']); });
  afterEach(() => {
    useConfirmStore.getState().answer('cancel');
    useArtStore.getState().closeDocument();
    useProjectStore.getState().reset();
  });

  it('offers Save, offers a close that is not called Discard, and tones it safe', async () => {
    useArtStore.getState().openDocument(docOf({ chunkId: 'c1', name: 'Ledge' }));
    useArtStore.getState().markOpenDirty();

    const p = confirmArtDocumentClose();
    const request = useConfirmStore.getState().request!;

    expect(request.title).toContain('not applied to this act');
    expect(request.body).toContain('Ctrl+Z');
    // The KEYS are unchanged, which is what keeps every caller and every guard
    // working: only the words and the tone moved.
    expect(request.buttons.map((b) => b.key)).toEqual(['save', 'discard', 'cancel']);
    // ⚠ THE ROW THE CARD IS ABOUT. No label on this dialog says "discard", and
    // the button that leaves without saving is no longer toned destructive,
    // because it destroys nothing.
    expect(request.buttons.map((b) => b.label).join(' ')).not.toMatch(/discard/i);
    expect(request.buttons.find((b) => b.key === 'discard')!.label).toBe('Close without saving');
    expect(request.buttons.find((b) => b.key === 'discard')!.tone).toBeUndefined();
    // ...and the door still WORKS: answering it closes the document.
    useConfirmStore.getState().answer('discard');
    await expect(p).resolves.toBe(true);
    expect(useArtStore.getState().open).toBeNull();
  });

  it('CONTROL: a chunk whose entry has gone keeps the destructive Discard', async () => {
    // Same document, library emptied under it. This is the one chunk document
    // that really can lose work, and it must not get the reassuring sentence.
    useArtStore.getState().openDocument(docOf({ chunkId: 'gone', name: 'Ledge' }));
    useArtStore.getState().markOpenDirty();

    const p = confirmArtDocumentClose();
    const request = useConfirmStore.getState().request!;

    expect(request.title).toBe('Unsaved strokes in "Ledge"');
    expect(request.body).toMatch(/discards its unsaved strokes/);
    expect(request.buttons.find((b) => b.key === 'discard')!.label).toBe('Discard & close');
    expect(request.buttons.find((b) => b.key === 'discard')!.tone).toBe('danger');

    useConfirmStore.getState().answer('cancel');
    await expect(p).resolves.toBe(false);
  });

  it('CONTROL: a BUFFERED document (New Chunk, no chunk id) keeps the old words', async () => {
    useArtStore.getState().openDocument(docOf({ name: 'New Chunk (16x16)' }));
    useArtStore.getState().markOpenDirty();

    const p = confirmArtDocumentClose();
    const request = useConfirmStore.getState().request!;

    expect(request.title).toContain('Unsaved strokes');
    expect(request.body).not.toContain('Ctrl+Z');
    expect(request.buttons.find((b) => b.key === 'discard')!.tone).toBe('danger');

    useConfirmStore.getState().answer('cancel');
    await expect(p).resolves.toBe(false);
  });
});
