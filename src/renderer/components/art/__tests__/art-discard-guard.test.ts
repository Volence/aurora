// ═══════════════════════════════════════════════════════════════════════════
// THE ONLY GUARD BETWEEN AN AUTHOR AND THE DESTRUCTION OF A COMPOSER DRAWING
// ═══════════════════════════════════════════════════════════════════════════
//
// Finding ART-DISCARD-GUARD-UNTESTED (docs/lens-findings.jsonl, sweep 2026-09-06).
//
// ⚠ THE MEASUREMENT THAT MADE THIS FILE NECESSARY. Before it existed, deleting
// the guard's body outright left `npm test` at exactly its baseline: 7821 passed
// / 9 skipped over 537 files, exit 0. Both functions in
// `components/art/open-document.ts` were reduced to their unconditional halves,
// on disk, and the whole suite agreed. Ten call sites, one store holding an
// artist's unsaved pixels, and nothing anywhere asserting that anybody is asked
// first. A guard nothing asserts is a guard a refactor deletes on a green suite.
//
// ═══ WHAT THIS FILE CAN AND CANNOT SEE ════════════════════════════════════
//
// The node suite has no jsdom and no testing-library, so `art-facet.tsx` cannot
// be mounted and no dialog is ever rendered. What it CAN drive is the doors
// themselves, which this parcel made drivable by moving them off
// `window.confirm` and onto the app's own promise-based confirm store:
//
//   §B  `planArtDocDiscard` / `artDocDiscardBody` — the pure decision and the
//       pure copy, the same split as shell/project-open-guard.ts.
//   §C  THE REAL DOORS, over the REAL `confirmStore` and the REAL `artStore`,
//       and on the Save arm the REAL `saveComposerDocument` rather than a stub
//       that hardcodes the clean outcome. These are the rows the plant reddens.
//   §D  The `composerSaveState` arm this parcel added, with the control that
//       proves it agrees with the saver it is derived from.
//   §E  Source gates for the two things a behavioural row cannot reach: that no
//       door in `src/` asks through `window.confirm` any more, and that the
//       guard works in a host with no `window` at all.
//
// It does NOT prove that a real Space keypress answers 'cancel' at this door, or
// that the dialog paints. `shell/__tests__/confirm-dialog-focus.test.ts` §B now
// walks this door's button literal (it walks every `ask()` site in `src/`), and
// `scratchpad/confirm-focus-harness.mjs` is what measures focus in the running
// app under CDP. A green here with neither of those run is not a proof.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import {
  planArtDocDiscard, artDocDiscardBody,
  confirmArtDocumentOpen, confirmArtDocumentClose,
} from '../open-document';
import { useArtStore } from '../../../state/artStore';
import type { OpenDocument } from '../../../state/artStore';
import { useConfirmStore } from '../../../state/confirmStore';
import { useToastStore } from '../../../state/toastStore';
import { useProjectStore } from '../../../state/projectStore';
import { useEditorStore } from '../../../state/editorStore';
import { composerSaveState, saveComposerDocument } from '../../../state/art-composer-save';
import { safeFocusIndex } from '../../ui/safe-focus';
import { createDoc } from '../../../../core/art/composer-buffer';
import { createSection } from '../../../../core/model/s4-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** An OpenDocument with only the fields a row cares about spelled out. */
function docOf(over: Partial<OpenDocument> = {}): OpenDocument {
  return {
    doc: createDoc(2, 2), liveTileIndex: null, chunkId: null,
    name: 'New Chunk (16x16)', dirty: false, ...over,
  };
}

/**
 * One zone, one act, and the chunks named: the minimum
 * `saveComposerDocument` needs to write into. Mirrors the fixture in
 * shell/__tests__/project-open-guard.test.ts so the two cannot disagree about
 * what an openable aeon project is.
 */
function aeonProjectOpen(chunkNames: readonly string[] = []): void {
  useProjectStore.setState({
    project: {
      zones: [{
        id: 'z', name: 'Z', tileset: { tiles: [] }, palette: { lines: [] },
        acts: [{
          id: 'a', name: 'A', gridWidth: 1, gridHeight: 1,
          sections: [createSection(0, 'sec0')],
        }],
      }],
      chunkLibrary: chunkNames.map((n) => ({
        id: n, name: n, widthTiles: 2, heightTiles: 2,
        nametable: new Uint16Array(4), collisionA: new Uint16Array(1), collisionB: new Uint16Array(1),
      })),
      bgLibrary: [],
    } as never,
    currentZoneId: 'z',
    currentActId: 'a',
  });
}

function openDirty(over: Partial<OpenDocument> = {}): void {
  useArtStore.getState().openDocument(docOf(over));
  useArtStore.getState().markOpenDirty();
}

const KEYS = () => useConfirmStore.getState().request!.buttons.map((b) => b.key);
const BODY = () => useConfirmStore.getState().request!.body!;
const LAST_TOAST = () => useToastStore.getState().toasts.at(-1) ?? null;

// ---------------------------------------------------------------------------
// §B  The pure plan and the pure copy
// ---------------------------------------------------------------------------

describe('§B planArtDocDiscard and the words it produces', () => {
  it('nothing at risk means no question: no document, or a clean one', () => {
    expect(planArtDocDiscard(null, { kind: 'savable' })).toEqual({ kind: 'proceed' });
    expect(planArtDocDiscard(docOf(), { kind: 'nothing-to-save' })).toEqual({ kind: 'proceed' });
  });

  it('a dirty savable document asks, and offers Save', () => {
    expect(planArtDocDiscard(docOf({ dirty: true, name: 'N' }), { kind: 'savable' }))
      .toEqual({ kind: 'confirm', name: 'N', offerSave: true, unsavable: null });
  });

  it('a dirty document Save cannot write asks WITHOUT offering Save, and carries why', () => {
    // The conflation this shape exists to prevent: one boolean would have had to
    // mean both "dirty" and "dirty and savable", and the door would have shown an
    // inert primary button over work no saver touches.
    const plan = planArtDocDiscard(
      docOf({ dirty: true, name: 'N' }), { kind: 'blocked', why: 'BECAUSE X.' });
    expect(plan).toEqual({ kind: 'confirm', name: 'N', offerSave: false, unsavable: 'BECAUSE X.' });
  });

  it('the body states the stake, then the reason, then the way out', () => {
    const blocked = { offerSave: false, unsavable: 'BECAUSE X.' };
    for (const door of ['open', 'close'] as const) {
      const body = artDocDiscardBody(door, blocked);
      expect(body, door).toContain('BECAUSE X.');
      // A missing primary button has to be explained or it reads as a bug.
      expect(body, door).toMatch(/only ways out/);
    }
    // With Save on offer the tail says what Save does not cover instead.
    expect(artDocDiscardBody('open', { offerSave: true, unsavable: 'BECAUSE X.' }))
      .toMatch(/Save cannot cover all of it/);
    // Nothing unsavable: the plain sentence, with no dangling explanation.
    const plain = artDocDiscardBody('open', { offerSave: true, unsavable: null });
    expect(plain).not.toMatch(/only ways out|cannot cover/);
    expect(plain.length).toBeGreaterThan(20);
  });

});

// ---------------------------------------------------------------------------
// §C  The real doors
// ---------------------------------------------------------------------------

describe('§C both doors, over the real confirm store', () => {
  beforeEach(() => {
    useArtStore.getState().closeDocument();
    useProjectStore.getState().reset();
    useEditorStore.getState().markClean();
    useConfirmStore.getState().answer('cancel');
    useToastStore.setState({ toasts: [] });
  });
  afterEach(() => {
    useConfirmStore.getState().answer('cancel');
    useArtStore.getState().closeDocument();
    useProjectStore.getState().reset();
    useEditorStore.getState().markClean();
  });

  // ── REPLACE ──────────────────────────────────────────────────────────────

  it('CONTROL: a clean document is replaced with no question asked', async () => {
    useArtStore.getState().openDocument(docOf({ name: 'old' }));
    await expect(confirmArtDocumentOpen(docOf({ name: 'new' }))).resolves.toBe(true);
    expect(useConfirmStore.getState().request).toBeNull();
    expect(useArtStore.getState().open!.name).toBe('new');
  });

  it('CANCEL KEEPS THE DRAWING: the replacement does not happen', async () => {
    // ⚠ THE ROW THE PLANT REDDENS. With the guard's body deleted this resolves
    // true and `open.name` is 'new': the unsaved strokes are gone and nobody was
    // asked. Nothing in the repo asserted this before.
    openDirty({ name: 'old' });
    const p = confirmArtDocumentOpen(docOf({ name: 'new' }));
    expect(useConfirmStore.getState().request).not.toBeNull();
    expect(useArtStore.getState().open!.name).toBe('old');   // held, not replaced
    useConfirmStore.getState().answer('cancel');
    await expect(p).resolves.toBe(false);
    expect(useArtStore.getState().open!.name).toBe('old');
    expect(useArtStore.getState().open!.dirty).toBe(true);
  });

  it('DISCARD replaces it, so the door is not simply refusing everything', async () => {
    openDirty({ name: 'old' });
    const p = confirmArtDocumentOpen(docOf({ name: 'new' }));
    useConfirmStore.getState().answer('discard');
    await expect(p).resolves.toBe(true);
    expect(useArtStore.getState().open!.name).toBe('new');
  });

  it('DISMISSAL is a cancel: an unrecognised answer never destroys anything', async () => {
    openDirty({ name: 'old' });
    const p = confirmArtDocumentOpen(docOf({ name: 'new' }));
    useConfirmStore.getState().answer('some-key-nobody-wrote');
    await expect(p).resolves.toBe(false);
    expect(useArtStore.getState().open!.name).toBe('old');
  });

  it('the focused button is the reserved cancel key, whatever its label says', () => {
    // d-31 (components/ui/safe-focus.ts): the dialog focuses the safe button and
    // never the destructive one. This asserts the KEY through the real chooser
    // rather than trusting the label, because a label is prose and a guard keyed
    // on one silently stops covering the site that gets reworded.
    openDirty();
    void confirmArtDocumentClose();
    const buttons = useConfirmStore.getState().request!.buttons;
    const i = safeFocusIndex(buttons);
    expect(i).not.toBeNull();
    expect(buttons[i as number].key).toBe('cancel');
    expect(buttons[i as number].tone).toBeUndefined();       // not danger toned
  });

  it('with no project the door does not offer a Save that cannot work', async () => {
    openDirty();
    const p = confirmArtDocumentOpen(docOf({ name: 'new' }));
    expect(KEYS()).toEqual(['discard', 'cancel']);
    expect(BODY()).toMatch(/no open zone and act/i);
    useConfirmStore.getState().answer('cancel');
    await expect(p).resolves.toBe(false);
  });

  it('SAVE IS A REAL THIRD OPTION: the strokes reach the library and the open proceeds',
    async () => {
      // The point of doing this parcel now rather than later. Until
      // `saveComposerDocument` existed, a dialog here could only have offered
      // Discard and Cancel; this row drives the REAL saver, not a stub that
      // hardcodes the clean outcome, because the saver's absence was the defect.
      aeonProjectOpen();
      openDirty({ name: 'Keep Me' });
      const p = confirmArtDocumentOpen(docOf({ name: 'new' }));
      expect(KEYS()).toEqual(['save', 'discard', 'cancel']);
      useConfirmStore.getState().answer('save');
      await expect(p).resolves.toBe(true);
      expect(useProjectStore.getState().project!.chunkLibrary.map((c) => c.name))
        .toEqual(['Keep Me']);
      expect(useArtStore.getState().open!.name).toBe('new');   // and the open happened
    });

  // ── CLOSE ────────────────────────────────────────────────────────────────

  it('CLOSE with nothing open is a no-op that asks nothing', async () => {
    await expect(confirmArtDocumentClose()).resolves.toBe(true);
    expect(useConfirmStore.getState().request).toBeNull();
  });

  it('CLOSE asks, and cancel leaves the document standing', async () => {
    openDirty({ name: 'old' });
    const p = confirmArtDocumentClose();
    expect(useConfirmStore.getState().request).not.toBeNull();
    useConfirmStore.getState().answer('cancel');
    await expect(p).resolves.toBe(false);
    expect(useArtStore.getState().open!.name).toBe('old');
    // …and discard really closes it, or the New… button would be broken.
    const q = confirmArtDocumentClose();
    useConfirmStore.getState().answer('discard');
    await expect(q).resolves.toBe(true);
    expect(useArtStore.getState().open).toBeNull();
  });

});

// ---------------------------------------------------------------------------
// §D  The composerSaveState arm this parcel added
// ---------------------------------------------------------------------------

describe('§D Save is not promised over a chunk that has left the library', () => {
  beforeEach(() => {
    useArtStore.getState().closeDocument();
    useProjectStore.getState().reset();
    useEditorStore.getState().markClean();
    useToastStore.setState({ toasts: [] });
  });
  afterEach(() => {
    useArtStore.getState().closeDocument();
    useProjectStore.getState().reset();
    useEditorStore.getState().markClean();
  });

  it('reports blocked, naming the library', () => {
    aeonProjectOpen(['other']);
    openDirty({ chunkId: 'gone' });
    const s = composerSaveState();
    expect(s.kind).toBe('blocked');
    expect(s.kind === 'blocked' && s.why).toMatch(/no longer in the chunk library/);
  });

  it('CONTROL: the SAME state with the chunk present is savable', () => {
    // Without this row the one above could pass on a rule that blocks every chunk
    // document, which would drop the Save button from the door that needs it most.
    aeonProjectOpen(['c1']);
    openDirty({ chunkId: 'c1' });
    expect(composerSaveState().kind).toBe('savable');
  });

  it('and the saver it is derived from agrees: it writes nothing and says so', () => {
    // ⚠ THE POINT OF THE ARM. `composerSaveState` is only worth anything if it
    // agrees with `saveComposerDocument`, and this is the fourth early return that
    // was missed when it was derived. Driving the real saver over the real state is
    // the only way to know the two now say the same thing.
    aeonProjectOpen(['other']);
    openDirty({ chunkId: 'gone', name: 'Half Drawn' });
    saveComposerDocument();
    expect(useArtStore.getState().open!.dirty).toBe(true);      // nothing was written
    expect(useProjectStore.getState().project!.chunkLibrary.map((c) => c.id)).toEqual(['other']);
    expect(LAST_TOAST()!.type).toBe('error');
    expect(LAST_TOAST()!.message).toMatch(/Cannot save/);
  });
});

// ---------------------------------------------------------------------------
// §E  Source gates and the no-window host
// ---------------------------------------------------------------------------

/**
 * Every .ts/.tsx under src/, excluding test trees.
 *
 * `.d.ts` IS EXCLUDED BY CONSTRUCTION, and the reason is stated rather than
 * discovered: `transpileModule` has no output to generate for a declaration file
 * and throws "Debug Failure. Output generation failed" on all three of them
 * (measured). A declaration file cannot contain a call in the first place, so
 * nothing is lost. Everything else that cannot be read is left to THROW, which
 * fails the row: a scanner that skipped a file it could not parse would report
 * coverage it does not have.
 */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      sourceFiles(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * A file's CODE, comments removed, by the compiler's own parser.
 *
 * Not tidiness: `open-document.ts` now carries a header explaining at length why
 * `window.confirm` is the wrong mechanism here, and a naive grep would match that
 * warning instead of the code. The same trap
 * `shell/__tests__/confirm-dialog-focus.test.ts` documents: a guard a comment can
 * redden is a guard a comment can also green, and the second is silent.
 */
function codeOf(path: string): string {
  return ts.transpileModule(readFileSync(path, 'utf8'), {
    fileName: path,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve, removeComments: true, target: ts.ScriptTarget.ESNext,
    },
    reportDiagnostics: false,
  }).outputText;
}

describe('§E no door in src/ asks through a native browser dialog', () => {
  const SRC = join(__dirname, '..', '..', '..', '..');            // → src/
  const files = sourceFiles(SRC);

  it('[canary] the scanner reads code, not prose, and found the tree', () => {
    // A scan that found no files, or that could not strip comments, would green
    // the row below without measuring anything.
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(join('art', 'open-document.ts')))).toBe(true);
    const stripped = ts.transpileModule(
      'const a = 1;\n// never write window.confirm here\nwindow.confirm("real");\n',
      { fileName: 'canary.ts', compilerOptions: { removeComments: true } },
    ).outputText;
    expect(stripped).not.toContain('never write');
    expect(stripped).toContain('window.confirm("real")');   // the real one survives
  });

  it('no window.confirm, window.alert or window.prompt anywhere', () => {
    // `components/art/open-document.ts` was the last one in the tree, and it was
    // not a considered exception: it was written 2026-06-11 and
    // `state/confirmStore.ts` on 2026-08-12, so it predates the convention every
    // other door follows. A native dialog focuses OK by default, and OK here meant
    // "discard the drawing" — which is the d-31 defect by another route, at the one
    // door whose destructive answer is an artist's unsaved pixels.
    const offenders = files
      .filter((f) => /window\.(confirm|alert|prompt)\s*\(/.test(codeOf(f)))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});

describe('§E the guard works in a host with no window at all', () => {
  // Saved and restored rather than "deleted if it was not there", so the row
  // below asserts the absence unconditionally instead of quietly measuring
  // nothing in a host that happens to provide one.
  const HAD_WINDOW = 'window' in globalThis;
  const SAVED_WINDOW = (globalThis as { window?: unknown }).window;
  afterEach(() => {
    useConfirmStore.getState().answer('cancel');
    useArtStore.getState().closeDocument();
    useProjectStore.getState().reset();
    if (HAD_WINDOW) (globalThis as { window?: unknown }).window = SAVED_WINDOW;
    else delete (globalThis as { window?: unknown }).window;
  });

  it('asks and answers with window undefined', async () => {
    // The old guard could not have done this: `window.confirm(...)` where `window`
    // is undeclared is a ReferenceError, not a no-op, exactly as
    // shell/close-guard.ts records for its own replaced code. That is also why
    // §C's rows were previously impossible to write.
    delete (globalThis as { window?: unknown }).window;
    expect('window' in globalThis).toBe(false);

    openDirty({ name: 'old' });
    const p = confirmArtDocumentOpen(docOf({ name: 'new' }));
    useConfirmStore.getState().answer('cancel');
    await expect(p).resolves.toBe(false);
    expect(useArtStore.getState().open!.name).toBe('old');
  });
});
