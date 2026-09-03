// EW-SHAPE-PREVIEW — the parallax composite's scope and its default.
//
// ⚠ WHAT THIS FILE CAN AND CANNOT SEE. The node suite has no canvas and no
// layout: nothing here proves the composite is DRAWN, that the chip is on
// screen, or that Layout's View menu lacks the row. Those are
// `scratchpad/effects-preview-default-harness.mjs`'s four sections, under CDP.
// What lives here is the part that is pure state — the three-way derivation,
// the choice's permanence, and two structural claims read out of the source —
// because those are the ones that can rot silently under a green harness.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parallaxPreviewOn, previewOnFrom, toggleParallaxPreview, inEffectsFacet,
  EFFECTS_FACET, PREVIEW_DEFAULT_TAB,
} from '../parallax-preview';
import { useViewStore, OVERLAY_KEYS_BY_ENGINE } from '../../state/viewStore';
import { useEditorStore } from '../../state/editorStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { useSessionStore } from '../../state/sessionStore';
import { loadPreviewChoice, savePreviewChoice } from '../../shell/preview-pref';

const SRC = join(__dirname, '..', '..');

function fakeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(), key: () => null, length: 0,
  } as unknown as Storage;
}

/** Stand the author in a facet on a sub-tab, with a given recorded choice. */
function stand(facet: string, subTab: 'parallax' | 'colour' | 'tileAnim',
  choice: boolean | null) {
  const tabId = 'level:ojz:1';
  useSessionStore.setState({ activeId: tabId });
  useWorkspaceStore.getState().setFacet(tabId, facet as typeof EFFECTS_FACET);
  useEditorStore.getState().setEffectsSubTab(subTab);
  useViewStore.setState({ parallaxPreview: choice });
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeLocalStorage());
  useWorkspaceStore.getState().reset();
  useViewStore.setState({ parallaxPreview: null });
});

describe('the DEFAULT is scoped to the Parallax sub-tab (d-26b clause 3)', () => {
  it('is ON there for an author who has never operated the switch', () => {
    stand(EFFECTS_FACET, PREVIEW_DEFAULT_TAB, null);
    expect(parallaxPreviewOn()).toBe(true);
  });

  it('and OFF on the other two jobs, which the ruling does not name', () => {
    // Not a lens the Colour or Tile anim author asked for. He can still turn it
    // on — and once he does, the choice holds on all three (below).
    stand(EFFECTS_FACET, 'colour', null);
    expect(parallaxPreviewOn()).toBe(false);
    stand(EFFECTS_FACET, 'tileAnim', null);
    expect(parallaxPreviewOn()).toBe(false);
  });
});

describe('⚠ THE DEFAULT DOES NOT LEAVE THE EFFECTS FACET', () => {
  // The whole reason the previous parcel stopped: flipping one global overlay
  // key would have turned the preview on for every other facet's View menu.
  // Each of these stands on the SUB-TAB THE DEFAULT IS FOR, so nothing but the
  // facet can be doing the refusing.
  for (const facet of ['layout', 'objects', 'collision', 'rings', 'art', 'palette']) {
    it(`is OFF in the ${facet} facet, on the Parallax sub-tab, undecided`, () => {
      stand(facet, PREVIEW_DEFAULT_TAB, null);
      expect(inEffectsFacet()).toBe(false);
      expect(parallaxPreviewOn()).toBe(false);
    });
  }

  it('and an explicit YES does not escape the facet either', () => {
    // The choice is facet-wide, not application-wide: `activeGuideScene()` is
    // null outside this facet and always was, so a `true` reaching Layout would
    // be a claim the canvas contradicts.
    stand('layout', PREVIEW_DEFAULT_TAB, true);
    expect(parallaxPreviewOn()).toBe(false);
  });

  it('is not an overlay key, so no facet\'s View menu can list it', () => {
    // The generic View-menu rows come from this record, in EVERY facet. The
    // structural guarantee behind the six rows above is that the composite is
    // not in it at all.
    const overlays = useViewStore.getState().overlays as unknown as Record<string, unknown>;
    expect(Object.keys(overlays)).not.toContain('showCameraPreview');
    expect(Object.values(OVERLAY_KEYS_BY_ENGINE).flat()).not.toContain('showCameraPreview');
  });
});

describe('⚠ AN EXPLICIT CHOICE WINS, AND KEEPS WINNING', () => {
  it('OFF on the Parallax tab stays off — the default never speaks again', () => {
    stand(EFFECTS_FACET, PREVIEW_DEFAULT_TAB, null);
    expect(parallaxPreviewOn()).toBe(true);
    expect(toggleParallaxPreview()).toBe(false);
    expect(parallaxPreviewOn()).toBe(false);
    // Leave the tab and come back — the arrival state is the choice, not the
    // default. "It keeps doing that" is precisely this row going the other way.
    useEditorStore.getState().setEffectsSubTab('colour');
    useEditorStore.getState().setEffectsSubTab('parallax');
    expect(parallaxPreviewOn()).toBe(false);
  });

  it('⚠ the first click on a preview that is SHOWING records false, not true', () => {
    // The trap the tri-state creates: the stored value is `null` while the
    // thing on screen is ON, so a toggle written as `!stored` would record
    // `true` and change nothing the author could see. It flips the EFFECTIVE
    // value.
    stand(EFFECTS_FACET, PREVIEW_DEFAULT_TAB, null);
    toggleParallaxPreview();
    expect(useViewStore.getState().parallaxPreview).toBe(false);
  });

  it('ON from the Colour job holds when he moves to Parallax and back', () => {
    stand(EFFECTS_FACET, 'colour', null);
    expect(toggleParallaxPreview()).toBe(true);
    useEditorStore.getState().setEffectsSubTab('parallax');
    expect(parallaxPreviewOn()).toBe(true);
    useEditorStore.getState().setEffectsSubTab('tileAnim');
    expect(parallaxPreviewOn()).toBe(true);
  });

  it('and it is WRITTEN DOWN, so it survives the session', () => {
    stand(EFFECTS_FACET, PREVIEW_DEFAULT_TAB, null);
    toggleParallaxPreview();
    expect(loadPreviewChoice()).toBe(false);
    // A fresh store seeded from storage — what the next launch does.
    expect(loadPreviewChoice()).toBe(false);
  });
});

describe('preview-pref: the stored choice', () => {
  it('round-trips both answers', () => {
    savePreviewChoice(true);
    expect(loadPreviewChoice()).toBe(true);
    savePreviewChoice(false);
    expect(loadPreviewChoice()).toBe(false);
  });

  it('erases to "undecided" rather than to "off"', () => {
    savePreviewChoice(false);
    savePreviewChoice(null);
    expect(loadPreviewChoice()).toBe(null);
  });

  it('⚠ reads a CORRUPT value as undecided, never as off', () => {
    // "off" would be a choice the author never made, and it would silence the
    // default permanently on the strength of a bad byte.
    localStorage.setItem('aurora.effects.parallaxPreview', 'yes');
    expect(loadPreviewChoice()).toBe(null);
    localStorage.setItem('aurora.effects.parallaxPreview', '');
    expect(loadPreviewChoice()).toBe(null);
  });

  it('survives storage being unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => savePreviewChoice(true)).not.toThrow();
    expect(loadPreviewChoice()).toBe(null);
  });
});

describe('ONE derivation, not two', () => {
  // The hook and the imperative reader are what the switches and the canvas
  // read respectively. They are separate functions because one subscribes; a
  // row that only tested one would let them drift.
  it('the call-time reader is the pure rule, over all 18 input combinations', () => {
    // ⚠ THE HOOK CANNOT BE CALLED HERE — a hook outside a render throws, which
    // is why the rule is a pure function both of them call rather than two
    // copies of four lines. This drives the store-reading half against the rule
    // directly; the row below is what pins the hook to the same rule.
    for (const facet of [EFFECTS_FACET, 'layout', 'collision'] as const) {
      for (const subTab of ['parallax', 'colour', 'tileAnim'] as const) {
        for (const choice of [null, true, false]) {
          stand(facet, subTab, choice);
          expect(parallaxPreviewOn(), `${facet}/${subTab}/${String(choice)}`)
            .toBe(previewOnFrom(facet, subTab, choice));
        }
      }
    }
  });

  it('and BOTH switches\' reader — the hook — concludes from that same rule', () => {
    const src = readFileSync(join(SRC, 'providers', 'parallax-preview.ts'), 'utf8');
    const hook = src.slice(src.indexOf('export function useParallaxPreviewOn'));
    // The hook's body ends in the shared rule and states nothing of its own: no
    // second `EFFECTS_FACET` comparison, no second `PREVIEW_DEFAULT_TAB` one.
    expect(hook).toMatch(/return previewOnFrom\(facet, subTab, choice\);/);
    expect(hook).not.toMatch(/!== EFFECTS_FACET/);
    expect(hook).not.toMatch(/=== PREVIEW_DEFAULT_TAB/);
  });

  it('MapViewport reads it rather than keeping a flag of its own', () => {
    const src = readFileSync(join(SRC, 'components', 'MapViewport.tsx'), 'utf8');
    expect(src).toMatch(/const previewOn = parallaxPreviewOn\(\);/);
    // And the keyboard camera-step shares the predicate: a composite on screen
    // with the arrows still panning the map is a preview with no way to move
    // the camera it is a preview of.
    expect(src).toMatch(/const cameraKeys = parallaxPreviewOn\(\)/);
    expect(src).not.toMatch(/overlays\.showCameraPreview/);
  });

  it('⚠ the View menu\'s row is FACET-GATED, which is what keeps it out of Layout', () => {
    // Read from the source because the claim is about a `return null` that the
    // node suite cannot render. The harness measures the DOM consequence in
    // both facets; this catches the gate being deleted while the harness is not
    // being run.
    const src = readFileSync(join(SRC, 'shell', 'ViewMenu.tsx'), 'utf8');
    expect(src).toMatch(/if \(facet !== EFFECTS_FACET\) return null;/);
    expect(src).toMatch(/toggleParallaxPreview\(\)/);
    // ...and it is NOT rendered from the generic key list, which has no facet
    // filter at all.
    expect(src).not.toMatch(/LABELS[\s\S]{0,200}showCameraPreview/);
  });
});
