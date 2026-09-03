// DELETING A BOUND PRESET — EFFECTS-W1 defect 11, and the preview chip (14).
//
// `Delete` removed the preset document with no confirmation and left every
// section binding that named it DANGLING. aeon's generator refuses the build by
// name for that ("rasterRef 'x' names no preset document … Known ids: …"), and
// the walkthrough met that refusal through the FAST wrapper, which replaces it
// with a wrong message about missing out-of-repo donor directories. One
// unguarded click, one misattributed build failure, and no way back to the
// control.
//
// ⚠ THESE ROWS READ SOURCE AND CALL THE PROVIDER. Whether the button is really
// greyed on screen and the sentence really painted is the CDP harness's claim
// (scratchpad/effects-section-picker-harness.mjs and its siblings), not this
// file's.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deletePresetRefusal, sectionsBindingPreset } from '../../../providers/effects-preset';

const panel = readFileSync(join(__dirname, '..', 'BandPresetPanel.tsx'), 'utf8');
const code = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const bar = readFileSync(join(__dirname, '..', 'EffectsToolOptions.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const sec = (rasterRef: string | null) => ({ rasterRef });

describe('a preset nothing binds deletes exactly as before', () => {
  it('no binding, no refusal — this is a guard, not a wall', () => {
    // ANTI-VACUOUS for every row below: a predicate that refused everything
    // would satisfy them all and make Delete useless.
    expect(deletePresetRefusal([sec(null), sec('other')], 'mine')).toBeNull();
    expect(deletePresetRefusal([], 'mine')).toBeNull();
    expect(deletePresetRefusal([null, null], 'mine')).toBeNull();
  });
});

describe('a preset a section binds is refused, and the sentence is actionable', () => {
  it('one section: names it, names the build\'s own failure, and says what to do', () => {
    const why = deletePresetRefusal([sec(null), sec(null), sec('mine')], 'mine')!;
    expect(why).toMatch(/^Section 2 binds "mine"\./);
    expect(why).toMatch(/aeon's build refuses that by name/);
    // THE ESCAPE, named as a control the author can find — the difference
    // between a guard and a dead end.
    expect(why).toMatch(/Hand-authored raster/);
    expect(why).toMatch(/Section dropdown above/);
  });

  it('several sections: all of them, in index order, in English', () => {
    const why = deletePresetRefusal([sec('mine'), sec(null), sec('mine'), sec('mine')], 'mine')!;
    expect(why).toMatch(/^Sections 0, 2 and 3 bind "mine"\./);
    expect(why).toMatch(/those bindings naming a document that does not exist/);
  });

  it('the sections are found by the SECTION\'s own ref, never by the library', () => {
    // A binding lives in a section sidecar; asking the preset library "is
    // anyone pointing at me" is a question it cannot answer.
    expect(sectionsBindingPreset([sec('a'), null, sec('b'), sec('a')], 'a')).toEqual([0, 3]);
    expect(sectionsBindingPreset([sec('a')], 'b')).toEqual([]);
  });
});

describe('the panel is wired to the guard, from one derivation', () => {
  it('Delete is disabled by the refusal and the refusal is rendered', () => {
    expect(code).toMatch(/disabled=\{deleteRefusal !== null\}/);
    expect(code).toMatch(/\{deleteRefusal !== null && <Hint tone="warning">\{deleteRefusal\}<\/Hint>\}/);
    // ONE derivation for both — the disabled state and the sentence cannot
    // describe different conditions, which is `lastBandRefusal`'s rule.
    expect(code).toMatch(/deletePresetRefusal\(act\.sections, selected\.id\)/);
    // ...and the panel does not re-compare refs of its own.
    expect(code).not.toMatch(/rasterRef === selected\.id/);
  });
});

describe('the parallax preview is reachable from the tab it is about (defect 14)', () => {
  it('the Effects bar carries the toggle, and it is the SAME view-store switch', () => {
    // The preview existed, was off by default, lived in the View menu and was
    // never mentioned by this tab; the cold reader found it ten minutes after
    // he needed it. A second, private flag would be worse than the burial —
    // this reads and writes the ONE derivation the View menu's own row uses
    // (providers/parallax-preview). It was `overlays.showCameraPreview` until
    // EW-SHAPE-PREVIEW made the switch tab-scoped and the flag a tri-state; the
    // claim this row makes — one switch, not two — is unchanged.
    expect(bar).toMatch(/useParallaxPreviewOn\(\)/);
    expect(bar).toMatch(/onClick=\{\(\) => toggleParallaxPreview\(\)\}/);
    expect(bar).not.toMatch(/overlays\.showCameraPreview/);
    expect(bar).toMatch(/Parallax preview/);
    // It reflects the current state rather than pretending to be a button.
    expect(bar).toMatch(/<Chip active=\{cameraPreview\}/);
  });

  it('and it says out loud that it is the same switch as the menu\'s', () => {
    // `Play bands` documents the identical duplication in its own tooltip; this
    // follows that precedent rather than inventing a second explanation.
    expect(bar).toMatch(/The same switch as[\s\S]{0,80}View > Compose the background/);
  });
});
