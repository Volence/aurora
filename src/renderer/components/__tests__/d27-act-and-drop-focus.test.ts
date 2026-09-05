// EVERY CONTROL THE d-27 SURVEY NAMED STILL GOES THROUGH THE SHARED HELPER.
//
// ⚠ READ WHAT THIS IS BEFORE TRUSTING IT: a SPELLING PIN, not a behaviour gate.
// The node suite cannot see React, a DOM, or a click, so nothing here can prove
// the blur runs, that it runs unconditionally, or that the button still works.
// `scratchpad/d27-sprite-focus-harness.mjs` (the six sprite controls) and
// `scratchpad/d27-effects-focus-harness.mjs` (the effects ones) press the real
// buttons in the real app and are what prove all of that; each of their rows was
// shown RED FIRST under a plant that removed the blur at exactly one site.
//
// This file exists for the failure those harnesses cannot catch: a refactor that
// drops the wiring and never runs a harness. `npm test` runs; a CDP harness does
// not run itself.
//
// WHY THE SITES ARE LISTED HERE RATHER THAN DISCOVERED BY A GREP FOR
// `actAndDropFocus`. A grep for the helper can only find files that still use
// it — which is green by construction on exactly the regression this watches
// for. The population has to be written down, and it is written down as
// (file, the writer's name, why it is destructive) so a reader can check the
// list against the survey rather than against this file's own opinion.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RENDERER = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(RENDERER, rel), 'utf8');

/**
 * Whitespace-normalised, because a wired handler is not always one line.
 *
 * The four sites added on 2026-09-03 include two whose action is a BLOCK
 * (`BgAnimBandPanel`'s Demote and Remove), and prettier wraps those across
 * lines. A raw `toContain` on a multi-line fragment pins the FORMATTER, not the
 * wiring: a reflow would redden this file while the blur is still there, and
 * the next reader would learn to distrust the row. Every `call` below is
 * therefore matched against the normalised source.
 */
const norm = (s: string): string => s.replace(/\s+/g, ' ');

const HELPER_REL = 'components/ui/act-and-drop-focus.ts';

/**
 * The d-27 survey's controls that STAY MOUNTED after their own click, and are
 * therefore the ones the defect reproduces on. `import` is the module specifier
 * that file uses to reach the helper; `call` is a fragment of the wired
 * `onClick` that must contain the helper's name.
 *
 * ⚠ TWO OF THE SURVEY'S SIX EXCLUSIONS ARE STILL ABSENT, AND ONLY TWO. The
 * survey excluded six controls on the grounds that they unmount themselves;
 * `docs/reviews/2026-09-03-d27-disputed-six.md` CLICKED all six
 * (`npm run harness:d27-disputed-six`) and found the claim holds for only two:
 * `AeonChunkActions.tsx`'s Clear and `SectionGridNav.tsx`'s Remove really do
 * unmount, so d-27 does not apply to them and they are correctly not listed.
 * The other four — `EffectsScenePanel`'s Delete scene, `BandPresetPanel`'s
 * Delete preset, and BOTH `BgAnimBandPanel` controls — survive their own press
 * and KEPT KEYBOARD FOCUS, the two Deletes retargeted at a different document.
 * **All four are now wired and are in `SITES` below**
 * (`docs/reviews/2026-09-03-d27-four-survivors.md`, instrument
 * `npm run harness:d27-four-survivors`).
 *
 * ⚠ AND `AeonChunkActions.tsx`'s Clear IS NOW LISTED — the survey's exclusion
 * of it EXPIRED with d-30. Its exemption was never "it is not destructive"; it
 * was the measured claim that the button UNMOUNTS on its own press, because
 * `hasChunks` goes false the instant the library empties. d-30
 * (`confirm_before`) puts a confirmation in front of the wipe, so the CANCEL
 * path now leaves that button mounted AND focused with the library intact —
 * exactly the shape d-27 was ruled on. The premise that exempted it is
 * consumed, so it joins the list rather than keeping a stale pass.
 */
const SITES: Array<{ rel: string; importFrom: string; writer: string; calls: string[] }> = [
  {
    rel: 'components/CollisionPalette.tsx', importFrom: './ui/act-and-drop-focus',
    writer: 'resetToEngine / clearSection: the two wholesale collision wipes d-27 was ruled on',
    calls: ['actAndDropFocus(e, resetToEngine)', 'actAndDropFocus(e, clearSection)'],
  },
  {
    // ⚠ THE WRITER MOVED (d-29). Both chips now call `newSpriteGuarded` from
    // `shell/new-sprite-guard.ts` rather than the store's `newSprite` directly:
    // the guard confirms when the document has unsaved edits and calls the
    // store unchanged when it does not. The blur is still first and still
    // unconditional — `actAndDropFocus` blurs before `act()`, and the confirm
    // happens inside `act()` — so this file's subject is untouched. Pinning the
    // guard's name here is deliberate: reverting either chip to `st().newSprite`
    // would restore the d-29 defect while leaving the d-27 blur in place, and
    // this line is what makes that revert visible to `npm test`.
    rel: 'shell/SpriteToolOptions.tsx', importFrom: '../components/ui/act-and-drop-focus',
    writer: 'newSpriteGuarded: replaces the whole document AND clears its history, so NOT one '
      + 'Ctrl+Z away; d-29 put a confirm in front of it for a dirty document',
    calls: [
      'actAndDropFocus(e, () => { void newSpriteGuarded(s, s); })',
      'actAndDropFocus(e, () => { void newSpriteGuarded(newSize, newSize); })',
    ],
  },
  {
    // See the ⚠ note above SITES: listed as of d-30, when the confirm made this
    // button survive its own press.
    rel: 'components/AeonChunkActions.tsx', importFrom: './ui/act-and-drop-focus',
    writer: 'clearChunkLibrary: empties the whole chunk library, and `clearChunks` is a bare store '
      + 'write that never enters the undo machinery, so Ctrl+Z does not bring it back',
    calls: ['actAndDropFocus(e, () => { void clearChunkLibrary(); })'],
  },
  {
    rel: 'components/sprite/FrameGrid.tsx', importFrom: '../ui/act-and-drop-focus',
    writer: 'deleteFrame: the survey\'s cleanest no-op case (`frames.length <= 1` early return)',
    calls: ['actAndDropFocus(e, () => useSpriteStore.getState().deleteFrame())'],
  },
  {
    rel: 'components/sprite/SpritePaletteHeader.tsx', importFrom: '../ui/act-and-drop-focus',
    writer: 'clearPalette / clearCanvas: two dispatch lines four lines apart',
    calls: [
      'actAndDropFocus(e, () => st().clearPalette())',
      'actAndDropFocus(e, () => st().clearCanvas())',
    ],
  },
  {
    rel: 'components/sprite/Timeline.tsx', importFrom: '../ui/act-and-drop-focus',
    writer: 'removeStep: the key={i} list-removal family, where a repeat press RETARGETS at the neighbour',
    calls: ['actAndDropFocus(e, () => useSpriteStore.getState().removeStep(i))'],
  },
  {
    // ⚠ THE DELETE'S WRITER MOVED (deleted-scene-returns, 2026-09-05), exactly as
    // d-29 moved the sprite chips': `deleteSceneGuarded` (shell/effects-delete-guard.ts)
    // confirms when the scene has a FILE and calls `deleteSceneCommand` unchanged
    // when it does not. It moved because the save now UNLINKS that file — this
    // button used to be recoverable by simply not saving. The blur is still first
    // and still unconditional (`actAndDropFocus` blurs before `act()`; the confirm
    // is inside `act()`), so this file's subject is untouched. Pinning the guard's
    // name is deliberate: reverting to the bare command would restore an unasked
    // destruction while leaving the d-27 blur in place, and this line is what makes
    // that revert visible to `npm test`.
    rel: 'components/effects/EffectsScenePanel.tsx', importFrom: '../ui/act-and-drop-focus',
    writer: 'removeLayerCommand: key={i} list removal, same retarget shape; AND '
      + 'deleteSceneGuarded, which deletes a WHOLE DOCUMENT (and its FILE, since the save '
      + 'gained a removal step), and, measured, left the same button focused and renamed at '
      + 'another scene',
    calls: [
      'actAndDropFocus(e, () => run(removeLayerCommand(library, selected.id, i)))',
      'actAndDropFocus(e, () => { void deleteSceneGuarded(library, selected.id, run); })',
    ],
  },
  {
    rel: 'components/effects/BandPresetPanel.tsx', importFrom: '../ui/act-and-drop-focus',
    writer: 'removeBandCommand / removeCycleChannelCommand: the purest instance of the shape, where the '
      + 'channel Remove has no disabled predicate, no refusal and no confirmation at any count; AND '
      + 'deletePresetGuarded, whose `disabled` refusal is re-derived for the NEW target after the delete',
    calls: [
      'actAndDropFocus(e, () => run(removeBandCommand(library, presetId, index)))',
      'actAndDropFocus(e, () => run(removeCycleChannelCommand(library, presetId, index)))',
      // Same move as the scene Delete above, and for the same reason.
      'actAndDropFocus(e, () => { void deletePresetGuarded(library, selected.id, run); })',
    ],
  },
  {
    // ⚠ A NEAR-IDENTICAL PAIR IN ONE `Row`. Demote and Remove sit two lines
    // apart and read the same; a fix (or a plant) landing on the wrong one of
    // them survives a full build looking convincing. Both are pinned, and the
    // Remove one is pinned by SLICE below rather than by a fragment, because
    // comments sit between its `actAndDropFocus(` and its writer.
    rel: 'components/effects/BgAnimBandPanel.tsx', importFrom: '../ui/act-and-drop-focus',
    writer: 'demoteBandCommand: key={b.index} band cards, so card 0 is re-used by the successor '
      + 'band; and removeBandCommand, whose FIRST press REFUSES and writes nothing at all',
    calls: [
      'actAndDropFocus(e, () => { setPendingRemoval(null); apply(demoteBandCommand(doc, b.index)); })',
    ],
  },
];

describe('d-27: every surveyed control that stays mounted goes through actAndDropFocus', () => {
  for (const site of SITES) {
    it(`${site.rel}: ${site.writer}`, () => {
      const src = read(site.rel);
      // ANTI-VACUOUS, and it is the half that actually earns its keep: a file
      // that no longer contains the button at all would satisfy a "contains
      // actAndDropFocus" assertion trivially if the import line were the only
      // thing checked. Both halves are asserted.
      expect(src, `${site.rel} does not import the helper: the d-27 wiring cannot be judged`)
        .toContain(`import { actAndDropFocus } from '${site.importFrom}';`);
      for (const call of site.calls) {
        expect(norm(src), `${site.rel} lost the wiring at: ${call}`).toContain(norm(call));
      }
    });
  }

  // ⚠ THE ONE SITE A FRAGMENT CANNOT PIN, pinned by SLICE instead.
  //
  // `BgAnimBandPanel`'s Remove carries two comment blocks BETWEEN
  // `actAndDropFocus(e, () => {` and the `removeBandCommand` call it wraps, so
  // no contiguous fragment contains both halves and a fragment covering only the
  // first half would pass on a handler wired to the WRONG writer — which is
  // exactly the failure mode of a near-identical pair in one `Row`. The slice
  // runs from this button's own `aria-label` to the writer, and asserts the blur
  // is inside it.
  it('components/effects/BgAnimBandPanel.tsx: the Remove button\'s REFUSING press goes through the '
    + 'helper too, and the blur wraps the whole handler rather than sitting after the refusal', () => {
    const src = read('components/effects/BgAnimBandPanel.tsx');
    const at = src.indexOf('label={`Remove tile animation ${b.index}`}');
    expect(at, 'the Remove button is not in this file under the label the harness aims at: the '
      + 'wiring cannot be judged, and `npm run harness:d27-four-survivors` aims by that same '
      + 'aria-label').toBeGreaterThan(-1);
    const writer = src.indexOf('removeBandCommand(doc, b.index, false)', at);
    expect(writer, 'the Remove handler no longer asks the command for a refusal first')
      .toBeGreaterThan(at);
    const handler = src.slice(at, writer);
    expect(handler, 'Remove\'s onClick does not go through actAndDropFocus: its FIRST press writes '
      + 'nothing and keeps focus, which is the [k7] case d-27 rests on')
      .toContain('onClick={(e) => actAndDropFocus(e,');
    // And the Demote beside it is a DIFFERENT button: the slice must not have
    // swallowed it, or this row would be pinning the neighbour's wiring.
    expect(handler, 'the slice from the Remove label to removeBandCommand contains the Demote '
      + 'writer: the two buttons have been reordered and this row is judging the wrong one')
      .not.toContain('demoteBandCommand');
  });

  it('the helper itself still blurs, and still blurs BEFORE the action', () => {
    // Sliced, not regexed: the signature contains `()` (the `act: () => void`
    // parameter), so a `[^)]*` for the parameter list stops in the middle of it
    // and reports the helper ABSENT while it is right there — a false negative
    // that reads exactly like the defect this row watches for. That regex was
    // written first and its red is why this is a slice.
    const src = read(HELPER_REL);
    const at = src.indexOf('export function actAndDropFocus');
    expect(at, 'actAndDropFocus not found: every row above is asserting a call to nothing')
      .toBeGreaterThan(-1);
    const end = src.indexOf('\n}', at);
    expect(end, 'actAndDropFocus has no closing brace: refusing to judge a partial read')
      .toBeGreaterThan(at);
    const helper = src.slice(at, end);
    expect(helper).toContain('.blur()');
    // ⚠ THE ORDER IS THE DESIGN, not a style choice: an early return inside a
    // handler must not be able to skip the blur. This is the node-side echo of
    // the harnesses' `[k7]`/`-d` rows, and it is the ONLY half of d-27 a
    // source-grep can see at all.
    expect(helper.indexOf('.blur()')).toBeLessThan(helper.indexOf('act()'));
  });

  it('Chip and IconButton still FORWARD the click event, or no caller could reach currentTarget', () => {
    // Both primitives declared `onClick: () => void` before d-27's second wave.
    // TypeScript will not accept a one-parameter callback where a zero-parameter
    // one is declared, so that spelling makes `actAndDropFocus` unreachable from
    // every Chip/IconButton caller — which is five of the nine surveyed sites.
    // A refactor "tidying" these back to `() => void` breaks the wiring at
    // COMPILE time, but only for files that use it; this row says why the wide
    // signature is there so it is not tidied away as noise.
    const src = read('components/ui/primitives.tsx');
    const forwards = src.match(/onClick\??: \(e: React\.MouseEvent<HTMLButtonElement>\) => void/g) ?? [];
    expect(forwards.length,
      'Chip and IconButton must both take the click event: found ' + forwards.length + ' of 2')
      .toBe(2);
  });
});
