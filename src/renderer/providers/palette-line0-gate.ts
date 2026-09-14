// THE WARNING BEFORE AN AEON ZONE'S PALETTE LINE 0 IS EDITED.
//
// Owner ruling 2026-09-13 (docs/decisions.jsonl `PALETTE-LINE0-BLAST-RADIUS-answered`,
// option `write_shared_file`), verbatim:
//
//   "we should allow the top row with just a warning I think. like "heyy just
//    sayying this changes everything", although the top row can't be per
//    level? like I can't change sonic's palette for 1 level and it ber normal
//    for another?"
//
// Line 0 is Sonic and Tails, read from ONE file the whole game shares, so an
// edit to it changes the characters in every zone. It was refused outright
// until this ruling; now it is editable, and this is the one door every line 0
// edit goes through first: the swatch grid (via `PaletteGridPort.admit`), the
// "Copy to" menu and the drag-and-drop copy (components/art/PaletteEditor.tsx),
// and the preview's own second lock (providers/palette-aeon.ts previewZone).
//
// ═══ HOW OFTEN IT ASKS, AND WHY ═══════════════════════════════════════════
//
// ONCE PER OPEN PROJECT, on the first line 0 edit. The blast radius does not
// change while the project stays open, and a dialog on every swatch click
// trains a person to dismiss it unread, which is the opposite of what a warning
// is for. Keyed on the open `S4Project` object itself, not on a path: reopening
// the project (a new load, possibly a different file on disk) asks again.
// Declining leaves nothing acknowledged, so the next attempt asks again.
//
// ═══ NEVER A NATIVE DIALOG ════════════════════════════════════════════════
//
// The in-app confirm (state/confirmStore, mounted once as shell/ConfirmDialog).
// `window.confirm` blocks the renderer and hangs the headless test rig, and it
// cannot be driven by a harness at all.
//
// ═══ WHEN LINE 0 CANNOT BE SAVED ══════════════════════════════════════════
//
// If the shared file is absent, truncated or unreadable (core/project/aeon/
// player-palette.ts `playerPaletteRefusal`), there is nothing to warn about:
// an edit would never save. The same dialog says so and offers no way on,
// rather than letting a person make an edit that evaporates.
//
// ═══ WHAT THE WARNING LISTS ═══════════════════════════════════════════════
//
// Two searches of the open project, both at warning time, both through the
// same listing and batch-read channels (core/project/aeon/
// shared-palette-warning.ts): what else embeds the shared file, and (hub
// ruling 2026-09-14T00:24:36Z) whether the project's spring character-swap
// check `tools/spring_line0_gate.py` reads it. Either search that cannot run
// says Aurora could NOT check, never "nothing".

import { useProjectStore, getCurrentZone } from '../state/projectStore';
import { useConfirmStore } from '../state/confirmStore';
import { playerPaletteRefusal } from '../../core/project/aeon/player-palette';
import {
  EMBED_SOURCE_EXTENSION, SPRING_LINE0_GATE_EXTENSION, scanEmbeds, scanSpringGate, sharedLine0Warning,
  type SourceRead,
} from '../../core/project/aeon/shared-palette-warning';
import type { S4Project } from '../../core/model/s4-types';
import type { SourceListing } from '../../shared/ipc-types';

/**
 * The answer key that accepts the warning. Every other answer declines.
 *
 * ⚠ THE BUTTONS AT THE `ask` BELOW SPELL THIS KEY AS A LITERAL, ON PURPOSE.
 * shell/__tests__/confirm-dialog-focus.test.ts parses every confirm door in
 * src/ and REFUSES a `buttons` array it cannot read as literals (a spread of a
 * constant was refused, measured 2026-09-13), because it proves no door ever
 * focuses a destructive button. So the literal and this constant are two
 * statements of one key, and palette-line0-gate.test.ts asserts they agree.
 */
export const LINE0_ACCEPT_KEY = 'edit-shared';

/** The title when line 0 cannot be saved at all. */
export const LINE0_REFUSED_TITLE = 'Palette line 0 cannot be saved from here';

let acknowledgedFor: S4Project | null = null;
let pending: Promise<boolean> | null = null;

/** Has the person accepted the warning for the project that is open NOW? */
export function isSharedLineAcknowledged(): boolean {
  const project = useProjectStore.getState().project;
  return project !== null && project === acknowledgedFor;
}

/**
 * May a line 0 edit go ahead? `true` straight away once accepted for this
 * project; otherwise a promise that shows the warning (or the refusal) and
 * resolves with the answer. A second request while the dialog is up joins the
 * first rather than stacking another.
 */
export function admitSharedLineEdit(): true | Promise<boolean> {
  if (isSharedLineAcknowledged()) return true;
  pending ??= askOnce().finally(() => { pending = null; });
  return pending;
}

async function askOnce(): Promise<boolean> {
  const state = useProjectStore.getState();
  const project = state.project;
  const zone = getCurrentZone(state);
  const config = state.config;
  if (!project || !zone || !config) return false;

  const file = zone.playerPaletteFile;
  const refusal = playerPaletteRefusal(file);
  if (refusal !== null || file.path === null) {
    await useConfirmStore.getState().ask({
      title: LINE0_REFUSED_TITLE,
      body: 'Palette line 0 is Sonic and Tails, one file shared by every zone, and an edit to it '
        + `would not save: ${refusal ?? 'there is no file to save it into.'}`,
      buttons: [{ key: 'cancel', label: 'Close' }],
    });
    return false;
  }

  const [scan, gate] = await Promise.all([
    scanEmbeds(file.path, projectLister(config.basePath, EMBED_SOURCE_EXTENSION), projectReader(config.basePath)),
    scanSpringGate(file.path, projectLister(config.basePath, SPRING_LINE0_GATE_EXTENSION), projectReader(config.basePath)),
  ]);
  // The project can close or change while the sources are read; an answer
  // about one project must never be recorded against another.
  if (useProjectStore.getState().project !== project) return false;
  const { title, body } = sharedLine0Warning(file.path, scan, gate);
  // The accepting button is `danger`, so the dialog focuses Cancel and a stray
  // Enter or Space declines (shell/ConfirmDialog.tsx).
  const answer = await useConfirmStore.getState().ask({
    title,
    body,
    buttons: [
      { key: 'edit-shared', label: 'Edit the shared palette', tone: 'danger' },
      { key: 'cancel', label: 'Cancel' },
    ],
  });
  if (answer !== LINE0_ACCEPT_KEY || useProjectStore.getState().project !== project) return false;
  acknowledgedFor = project;
  return true;
}

// The two searches the warning runs over the open project (what embeds the
// shared file, and whether the spring check reads it) go through the same two
// IPC channels: one project listing, asked per extension, and one batch read.

function projectLister(basePath: string, extension: string): () => Promise<SourceListing> {
  return async () => {
    const api = window.api;
    if (typeof api?.listProjectSources !== 'function') {
      throw new Error('this build of Aurora has no source-listing channel');
    }
    return api.listProjectSources(basePath, extension);
  };
}

function projectReader(basePath: string): (paths: string[]) => Promise<SourceRead[]> {
  return async (paths) => {
    const entries = await window.api.readManyFiles(basePath, paths);
    const decoder = new TextDecoder();
    return paths.map((path, i) => {
      const e = entries[i];
      return e?.bytes
        ? { path, text: decoder.decode(e.bytes), reason: null }
        : { path, text: null, reason: e ? (e.reason ?? e.outcome) : 'no answer from the batch read' };
    });
  };
}

/** Test seam: forget any acceptance, as a fresh app would. */
export function resetSharedLineAcknowledgementForTests(): void {
  acknowledgedFor = null;
  pending = null;
}
