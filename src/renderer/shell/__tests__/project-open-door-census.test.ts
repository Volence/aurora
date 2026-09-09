import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { confirmProjectOpen } from '../project-open-guard';
import { useConfirmStore } from '../../state/confirmStore';
import { useArtStore } from '../../state/artStore';
import { createDoc } from '../../../core/art/composer-buffer';

/**
 * UX SEAT B, FINDING F8 — "a brand-new art document the app itself calls
 * 'unsaved' is destroyed by a project switch, with no prompt", filed ⚠ door-
 * driven and discounted in bold (docs/reviews/2026-09-07-lens-ux/uxb-audit.md).
 *
 * WHAT THE SEAT SAW IS REAL AND WHAT IT MEANS IS NARROWER. The seat switched
 * project through `window.__dbg.openDir(…)` — `renderer/debug-hooks.ts`, which
 * calls `useClassicProjectStore.getState().openDirectory(dir)` with nothing in
 * between — because the two `Open Project…` buttons open a native
 * `dialog.showOpenDialog` its rig could not dismiss. That door has no guard, so
 * the destruction it watched is exactly what that door does.
 *
 * The USER's road has had a guard over the composer document since f0e15731
 * (2026-08-16), three weeks before the walk: `useProject.openPath` awaits
 * `confirmProjectOpen()` first, and `currentOpenDirtySnapshot().artDirty` reads
 * `useArtStore.getState().open?.dirty`. So F8 is not a user-reachable data-loss
 * defect; it is the debug door being unguarded, which is a much smaller thing.
 *
 * ⚠ AND THE PART THAT IS WORTH A TEST IS NOT THE VERDICT, IT IS WHAT KEEPS THE
 * VERDICT TRUE. The verdict rests entirely on a CENSUS — "every production road
 * to a project switch passes through the guard" — and that census was written
 * in a comment inside `project-open-guard.ts`, where nothing re-derives it. A
 * new caller of `openDirectory`/`openAeonProject` added anywhere in the
 * renderer reproduces F8 for real, in the UI, and no existing row would notice:
 * every one of them calls `confirmProjectOpen` directly, so they measure the
 * guard and never the roads onto it. §2 below is that census, executed.
 *
 * §1 is the other half the brief named: assert the document's CONTENTS survive,
 * not that a dialog appeared. `project-open-guard.test.ts`'s cancel row asserts
 * `open?.dirty === true`, which is a FLAG — it stays true under a mutation that
 * empties the pixels while leaving the entry resident.
 */

// -- §1 --------------------------------------------------------------------

/** Recognisable pixels: 14, the count seat A's F3 painted, in an 8x8 tile. */
function paintedTile(): Uint8Array {
  const px = new Uint8Array(64);
  for (let i = 0; i < 14; i++) px[i * 4] = (i % 15) + 1;
  return px;
}

describe('F8 §1 · a cancelled project open keeps the composer drawing ITSELF, not just its dirty flag', () => {
  beforeEach(() => { useArtStore.getState().closeDocument(); });
  afterEach(() => {
    useArtStore.getState().closeDocument();
    useConfirmStore.setState({ request: null });
  });

  function openPaintedDoc(): Uint8Array {
    const doc = createDoc(1, 1);
    const px = paintedTile();
    doc.localPixels.set(1, px);
    doc.cells[0] = { atlasTile: null, localId: 1, pal: 0, hf: false, vf: false, pri: false };
    doc.nextLocalId = 2;
    useArtStore.getState().openDocument({
      doc, liveTileIndex: null, chunkId: null, name: 'New Tile (1x1)', dirty: false,
    });
    useArtStore.getState().markOpenDirty(); // what a stroke does
    return px;
  }

  it('the pixels are byte-identical after Cancel', async () => {
    const painted = openPaintedDoc();
    // ANTI-VACUOUS: the fixture really carries the pixels, so "identical after"
    // is not two empty buffers agreeing.
    expect(painted.some((b) => b !== 0)).toBe(true);
    expect(useArtStore.getState().open?.doc.localPixels.get(1)).toEqual(painted);

    const p = confirmProjectOpen();
    expect(useConfirmStore.getState().request).not.toBeNull();
    useConfirmStore.getState().answer('cancel');
    await expect(p).resolves.toBe(false);

    const after = useArtStore.getState().open;
    expect(after).not.toBeNull();
    expect(after!.doc.localPixels.get(1)).toEqual(painted);
    expect(after!.doc.cells[0].localId).toBe(1);
    expect(after!.dirty).toBe(true);
  });

  /**
   * THE OTHER DIRECTION. A rule that only ever fires one way has not been shown
   * to be a rule: the same pixels, on the road the seat actually drove, are
   * gone. `resetProjectRuntime` is what a project-key change fires (see
   * shell/session-lifecycle.ts), and it is downstream of the debug door with no
   * dialog anywhere between them.
   */
  it('CONTROL, the door: the same pixels do NOT survive the runtime reset the switch fires', async () => {
    const painted = openPaintedDoc();
    expect(useArtStore.getState().open?.doc.localPixels.get(1)).toEqual(painted);
    const { resetProjectRuntime } = await import('../../state/project-runtime');
    resetProjectRuntime();
    expect(useArtStore.getState().open).toBeNull();
    // and nothing asked: the door never reaches the confirm store.
    expect(useConfirmStore.getState().request).toBeNull();
  });
});

// -- §2 --------------------------------------------------------------------

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(HERE, '..', '..', '..');           // src/
const RENDERER = join(SRC, 'renderer');

/**
 * THE DOORS ONTO A PROJECT SWITCH, and why each one is allowed to be here.
 *
 * Key = path relative to `src/`. A file that calls either switch primitive and
 * is not in this table fails §2, and an entry whose file has stopped calling
 * them fails it too — a stale allowlist is how a census rots into decoration.
 */
const DOORS: Record<string, string> = {
  'renderer/hooks/useProject.ts':
    'THE USER ROAD. Every production entry point funnels here: the Explorer and hero '
    + '"Open Project…" buttons and the Home "Switch project" (App.tsx passes openProject), '
    + 'the recents rows and the command palette\'s recent: commands (openProjectByPath), and '
    + 'the palette\'s open-project command (openProjectDialog). It awaits confirmProjectOpen() '
    + 'before touching either store, which is why seat B\'s F8 is not reachable from the UI.',
  'renderer/debug-hooks.ts':
    'THE DOOR SEAT B DROVE, and the reason its F8 is discounted. __dbg.openDir and '
    + '__dbg.aeon.open call the primitives raw, with no guard, in VITE_AURORA_DEBUG builds '
    + 'only. Not a user gesture; every CDP harness in this repo uses it.',
  'renderer/agent/agent-handler.ts':
    'THE AGENT DOOR. No UI to confirm through, so classic-open-project refuses outright on '
    + 'any resident dirt (unsavedAgentRefusal) rather than asking. Guarded by refusal, not '
    + 'by dialog. See shell/__tests__/agent-open-refusal.test.ts.',
  'renderer/components/setup/ProjectSetupTab.tsx':
    'RE-VALIDATE, NOT A SWITCH. It re-opens the directory that is ALREADY open, so the '
    + 'session key is unchanged and resetProjectRuntime never fires; no document session '
    + 'ends and nothing is destroyed. It saves the classic project first and aborts on a '
    + 'failed save. If it ever gains a different-directory argument it becomes a real '
    + 'switch and needs the guard.',
};

/**
 * A CALL to one of the two switch primitives.
 *
 * `.openDirectory(` is method-call-only by construction, so the store that
 * DEFINES it (`renderer/state/classicProjectStore.ts`, where it is an object
 * property) is not a call site and does not need an entry. `openAeonProject(`
 * has no such luck — its own `export async function` header matches — so
 * definition headers are dropped in `callSiteLines` and the two primitives are
 * treated symmetrically: this census lists CALLERS, and only callers.
 */
const CALL_RE = /(?:\.openDirectory\s*\(|(?<![\w.])openAeonProject\s*\()/;
const DEFINITION_RE = /^export\s+(?:async\s+)?function\s/;

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * A call site, with comment lines and import lines removed first.
 *
 * WHY THE STRIPPING IS NOT COSMETIC: `project-open-guard.ts` names both
 * primitives a dozen times in its docblocks and calls neither, and a census
 * that counts prose reports the module that DOCUMENTS the perimeter as a hole
 * in it — the comment outbidding the code in exactly the way a grep for a
 * feature's words finds the comment predicting it before the code building it.
 */
function callSiteLines(text: string): string[] {
  const hits: string[] = [];
  let inBlock = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (inBlock) { if (line.includes('*/')) inBlock = false; continue; }
    if (line.startsWith('/*')) { if (!line.includes('*/')) inBlock = true; continue; }
    if (line.startsWith('//') || line.startsWith('*')) continue;
    if (line.startsWith('import ') || line.startsWith('} from')) continue;
    if (DEFINITION_RE.test(line)) continue;
    if (CALL_RE.test(line)) hits.push(line);
  }
  return hits;
}

describe('F8 §2 · the census the verdict rests on, executed instead of asserted in a comment', () => {
  const files = walk(RENDERER, []);
  const found = new Map<string, string[]>();
  for (const f of files) {
    const hits = callSiteLines(readFileSync(f, 'utf8'));
    if (hits.length > 0) found.set(relative(SRC, f).split(sep).join('/'), hits);
  }

  it('LOUD WHEN IT CANNOT MEASURE: the scan actually read the renderer tree', () => {
    // A walk that silently found nothing would make every row below vacuously
    // green, which is the failure mode this whole file exists to end.
    expect(files.length).toBeGreaterThan(100);
    expect(found.size).toBeGreaterThan(0);
    // Positive control: the one road we KNOW is a call site is in the result.
    expect([...found.keys()]).toContain('renderer/hooks/useProject.ts');
  });

  it('no production module reaches a project switch except through a declared door', () => {
    const undeclared = [...found.keys()].filter((k) => !(k in DOORS));
    expect(undeclared, `undeclared door(s) onto a project switch: ${undeclared.join(', ')}. `
      + 'Either route it through confirmProjectOpen (renderer/hooks/useProject.ts) or add it '
      + 'to DOORS with the sentence saying why it is safe.').toEqual([]);
  });

  it('and the other direction: every declared door is still a call site', () => {
    const stale = Object.keys(DOORS).filter((k) => !found.has(k));
    expect(stale, `DOORS names ${stale.join(', ')}, which no longer call a switch primitive. `
      + 'Remove the entry: an allowlist carrying dead names stops being a census.').toEqual([]);
  });

  it('the user road, specifically, awaits the guard before it touches either store', () => {
    const text = readFileSync(join(RENDERER, 'hooks', 'useProject.ts'), 'utf8');
    const guardAt = text.indexOf('await confirmProjectOpen()');
    const openAt = text.search(CALL_RE);
    expect(guardAt, 'useProject.openPath must await confirmProjectOpen()').toBeGreaterThan(-1);
    expect(openAt).toBeGreaterThan(-1);
    // ORDER, not presence: the defect class this repo hit three times in one day
    // is a refusal that runs AFTER the write it was meant to prevent.
    expect(guardAt).toBeLessThan(openAt);
    // And it must be able to abort: a guard whose answer is dropped is decoration.
    expect(text).toMatch(/if\s*\(!\(await confirmProjectOpen\(\)\)\)\s*return;/);
  });
});
