// THE SHARED SWATCH GRID AND ITS TWO HOSTS — a source scan, because it is the
// only kind of test that can reach any of this. The renderer suite is node-only:
// there is no DOM, and `.tsx` files are not collected at all, so PaletteGrid.tsx
// gets ZERO runtime coverage and four screens change with nothing executable
// watching them.
//
// (This file replaces components/art/__tests__/palette-slider-wiring.test.ts,
// which guarded the same invariants while the drag machinery still lived inside
// PaletteEditor. The machinery moved — half into providers/palette-aeon.ts, half
// into the grid below — so the guard moved with it rather than being deleted.)
//
// WHAT IS EXECUTED FOR REAL ELSEWHERE, so this file does not have to pretend:
//   • the commit/revert decision — core/art/__tests__/palette-drag.test.ts;
//   • the swatch/click/policy rules — art-shared/__tests__/palette-grid-model.test.ts;
//   • both ports' pure halves and the aeon port's own teardown wiring —
//     providers/__tests__/palette-{classic,aeon}.test.ts.
// What is left is the WIRING, and each assertion below names the specific way it
// silently breaks.
//
// EVERY READ IS COMMENT-STRIPPED. All of these files discuss the identifiers
// below at length in their docblocks — "drain", "classicSetPalette", "the open
// swatch" — so a scan of raw source would pass on prose after the code was
// deleted, which is the documented failure mode in this repo.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const R = join(__dirname, '../../..');
const code = (p: string): string => readFileSync(join(R, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const GRID = code('components/art-shared/PaletteGrid.tsx');
const SLIDERS = code('components/art-shared/GenesisColorSliders.tsx');
const EDITOR = code('components/art/PaletteEditor.tsx');
const CLASSIC = code('components/classic/ClassicPalettePanel.tsx');
const WORKSPACE = code('workspace/LevelWorkspace.tsx');
const SPRITE_MODE = code('components/sprite/SpriteMode.tsx');
const COMPOSER_SHARED = code('components/classic/composer-shared.tsx');
// The rule itself moved here (VIS2): six surfaces each held a slightly
// different copy of "is the user typing", and the map viewport's was the one
// missing the input-TYPE filter this test exists to protect.
const TYPING_TARGET = code('shell/typing-target.ts');

const HOSTS = [['aeon PaletteEditor', EDITOR], ['ClassicPalettePanel', CLASSIC]] as const;

describe('one grid, mounted by both engines', () => {
  it.each(HOSTS)('%s imports the shared grid and renders it', (name, src) => {
    expect(src, `${name} no longer imports PaletteGrid`)
      .toMatch(/import PaletteGrid(?:,[^;]*)? from ['"][^'"]*art-shared\/PaletteGrid['"]/);
    expect(src, `${name} imports the grid but never renders it`).toMatch(/<PaletteGrid\b/);
  });

  it.each(HOSTS)('%s draws no swatch grid of its own', (name, src) => {
    // The duplication this task removed: two 4x16 grids, two selection states,
    // two draft words. A host that grows one back has forked the panel again.
    expect(src, `${name} renders the sliders directly: it has a second selection state`)
      .not.toMatch(/<GenesisColorSliders\b/);
    expect(src, `${name} declares a swatch style again`).not.toMatch(/^\s*swatch:/m);
    expect(src, `${name} declares its own edit selection again`).not.toMatch(/\bsetSel\b/);
  });

  it('leaves the classic host as a host and nothing else', () => {
    // ~30 lines, almost all docblock. If this grows back past a screen, something
    // engine-specific has been put back into a file whose whole job is to pick a
    // port. (Generous on purpose — it is a smoke alarm, not a style rule.)
    const lines = readFileSync(join(R, 'components/classic/ClassicPalettePanel.tsx'), 'utf8').split('\n');
    expect(lines.length, 'ClassicPalettePanel is no longer a thin host').toBeLessThan(60);
    expect(CLASSIC, 'the classic host reaches a store directly again')
      .not.toMatch(/useClassicLevelStore|useToastStore/);
  });

  it('keeps aeon\'s three context modes on aeon\'s side of the port', () => {
    // The sprite pane's standalone palette is a flat 16-colour array with its own
    // undo stack. The PORT models it as a one-row grid (providers/palette-aeon.ts),
    // which is what keeps the shared component from growing a mode flag.
    expect(EDITOR, 'PaletteEditor stopped passing its context to the port')
      .toMatch(/useAeonPaletteGridPort\(\{ context \}\)/);
    expect(GRID, 'the shared grid learned about aeon\'s sprite modes')
      .not.toMatch(/standalone|sprite/i);
  });
});

describe('the shared grid stays engine-neutral', () => {
  /**
   * Any import whose specifier reaches `state/` — the same rule (and the same
   * regex) as components/shared/__tests__/shared-purity.test.ts, applied to the
   * one file in art-shared/ that could plausibly want a store. Matching the
   * SPECIFIER covers `import`, `import type`, `export … from`, a bare side-effect
   * import and a dynamic `import()`; all three quote styles, because the repo has
   * no formatter and single quotes are a habit rather than a guarantee.
   */
  const STATE_IMPORT = /(?:from|import)\s*\(?\s*["'`](?:[^"'`]*\/)?state\//;

  it('imports no store', () => {
    // Not stylistic: aeon's executeCommand THROWS when the focused document is
    // not aeon, so a store or command import here would hard-crash classic on the
    // first click rather than degrade. And the engines repaint off different
    // clocks, so a subscription could only ever be right for one of them.
    expect(GRID, 'PaletteGrid imports a store: it can only be correct for one engine')
      .not.toMatch(STATE_IMPORT);
  });

  it('names no classic editing command', () => {
    // A file that names one has to claim a classic surface for undo routing
    // (classic/__tests__/classic-surface.test.ts), and a SHARED file has no
    // engine of its own to claim for. The command — and the art claim that must
    // travel with it — live in providers/palette-classic.ts.
    expect(GRID, 'PaletteGrid issues a classic command; the art-facet claim has nowhere to live')
      .not.toMatch(/\bclassic(?:Set|Edit|Add)[A-Za-z]*\b/);
  });

  it('takes the classic facet claim from the port instead', () => {
    // `rootProps` is how the claim reaches a root element the shared file owns.
    // Spread FIRST, so a port contributes behaviour and can never override the
    // grid's own layout.
    expect(GRID, 'the grid drops port.rootProps: classic Ctrl+Z will hit the layout document')
      .toMatch(/<div \{\.\.\.port\.rootProps\} style=/);
  });

  it('leaves aeon\'s drag-and-drop and copy menu in aeon\'s file', () => {
    // Both speak in aeon `Color` objects, aeon zone lines and aeon sprite docs;
    // classic has no version of either. They reach the swatches as render props.
    for (const marker of ['PaletteCopyMenu', 'dragPayload', 'copySwatchInto', 'copyLineInto']) {
      expect(GRID, `${marker} moved into art-shared/`).not.toContain(marker);
      expect(EDITOR, `${marker} left PaletteEditor: the copy bridge is gone`).toContain(marker);
    }
    // …and the shape they arrive through is still declared.
    expect(GRID, 'the shell render props are gone, so aeon has nowhere to put its grips')
      .toMatch(/renderLineGrip\?\(/);
    expect(GRID, 'the per-swatch prop hook is gone').toMatch(/swatchProps\?\(/);
    expect(EDITOR, 'PaletteEditor no longer supplies a shell').toMatch(/shell=\{shell\}/);
    expect(CLASSIC, 'classic grew a shell: it has no decoration to add').not.toMatch(/shell=/);
  });

  it('declares no scroller at all', () => {
    // All four mounts are `content` sections, which give a scroller no height to
    // shrink into (components/__tests__/panel-scrollers.test.ts). The dead space
    // under aeon's palette editor is a column-layout question and must not be
    // "fixed" with a nested scrollbar here.
    expect(GRID, 'the shared grid declares an unbounded scroller')
      .not.toMatch(/overflow(?:X|Y)?:/);
  });
});

describe('the shared slider control, still the only one', () => {
  it('is rendered by the grid and by nothing else', () => {
    expect(GRID, 'the grid no longer imports the shared control')
      .toMatch(/import GenesisColorSliders from ['"][^'"]*GenesisColorSliders['"]/);
    expect(GRID, 'the grid imports the control but never renders it').toMatch(/<GenesisColorSliders\b/);
  });

  it('has no private copy anywhere in either host or the grid', () => {
    // Each of these was a verbatim duplicate inside PaletteEditor. A range input
    // is the tell that an inlined panel came back; the rest are what it needed.
    for (const [name, src] of [...HOSTS, ['PaletteGrid', GRID] as const]) {
      expect(src, `${name} renders a raw range input: an inlined slider panel is back`)
        .not.toMatch(/type="range"/);
      expect(src, `${name} declares its own channel table`).not.toMatch(/\bCHANNELS\b|\bCHANNEL_COLORS\b/);
      expect(src, `${name} declares its own 8-bit→3-bit helper`).not.toMatch(/function to3\b/);
      for (const style of ['sliderRow', 'channelLabel', 'slider', 'channelValue']) {
        expect(src, `${name} re-declared the control's \`${style}\` style`)
          .not.toMatch(new RegExp(`^\\s*${style}:`, 'm'));
      }
    }
  });

  it('neither the control nor the grid blurs on commit', () => {
    // Blurring costs a double onCommit and makes arrow-key fine-tuning
    // impossible, and it was only ever there to dodge an undo guard that blocked
    // focused inputs.
    expect(SLIDERS, 'the shared control blurs the slider on commit').not.toMatch(/\.blur\?\.\(\)|\.blur\(\)/);
    expect(GRID, 'the grid blurs the slider: re-read why that was removed')
      .not.toMatch(/\.blur\?\.\(\)|\.blur\(\)/);
  });

  it('is safe because BOTH level-side undo bindings exempt type:\'range\'', () => {
    // The premise, not a detail. If either binding stops exempting range, a
    // focused slider swallows the Ctrl+Z that follows a palette commit — and the
    // fix would be to restore the exemption, NOT to re-add blur().
    expect(WORKSPACE, 'LevelWorkspace stopped routing its guard through isTypingTarget')
      .toMatch(/isTypingTarget\(/);
    expect(TYPING_TARGET, "isTypingTarget no longer exempts range: a focused palette slider now blocks undo")
      .toMatch(/'range'/);
    expect(COMPOSER_SHARED, 'composer-shared stopped sharing the one rule')
      .toMatch(/from '\.\.\/\.\.\/shell\/typing-target'/);
    expect(SPRITE_MODE, "SpriteMode's undo keydown stopped routing through isTypingTarget")
      .toMatch(/isTypingTarget\(/);
    // …and there are still exactly these two window-level level undo bindings, so
    // "both" is the whole set.
    for (const [name, src] of [['LevelWorkspace', WORKSPACE], ['SpriteMode', SPRITE_MODE]] as const) {
      expect(src, `${name} lost its undo binding`).toMatch(/focusedHistory\(\)\?\.undo\(\)/);
    }
  });
});

describe('a palette drag can never be stranded: the grid half', () => {
  // THE BUG, now routed through the port: aeon's preview writes the open document
  // in place so the composer repaints per tick, and only a drag END turns that
  // into an undoable, dirty-marking step. Chrome does not fire `blur` when a
  // focused element is REMOVED, so the end has to be guaranteed by a teardown.
  // The port's half is guarded in providers/__tests__/palette-aeon.test.ts; this
  // is the half that has to be right in the component, on FOUR surfaces now.

  /** The drain effect, with its dependency array captured. Anchored on the
   *  cleanup body and stopped at the first `);`, so it cannot run on into a
   *  later effect's deps and report them as this one's. */
  const DRAIN_EFFECT = /useEffect\(\(\) => \(\) => \{ drainRef\.current\(\); \}, (\[[^\]]*\])\);/;

  it('has an effect whose CLEANUP ends the drag', () => {
    expect(GRID, 'the drain effect is gone: a mid-drag unmount strands the palette mutation')
      .toMatch(DRAIN_EFFECT);
  });

  it('keys that cleanup on the OPEN SWATCH, not on unmount alone', () => {
    // `[]` deps only fire on unmount, which misses BOTH in-place endings: the
    // selection moving to another swatch, and the selection closing (setSel(null),
    // which a click on a non-editable swatch takes).
    const deps = DRAIN_EFFECT.exec(GRID)?.[1];
    expect(deps, 'the drain effect is gone').toBeTruthy();
    expect(deps, 'the drain effect fires on unmount only: an in-place drag end is stranded')
      .not.toBe('[]');
    expect(deps, 'the drain effect no longer keys on the open swatch').toBe('[openKey]');
    // …and that key is derived from the open swatch itself, not from something
    // that merely changes at the same time.
    expect(GRID, 'openKey stopped tracking the open swatch')
      .toMatch(/const openKey = sel \?[^;]*sel\.line[^;]*sel\.idx[^;]*: null;/);
  });

  it('calls the drain through a REF that is refreshed every render', () => {
    // A cleanup that captured `port.drain` would run whichever drain the render
    // that armed it happened to see; the ports rebuild their port objects on every
    // clock tick.
    expect(GRID, 'the drain is captured instead of read through a ref')
      .toMatch(/const drainRef = React\.useRef\(port\.drain\);/);
    expect(GRID, 'the drain ref is never refreshed: it holds the first render\'s drain forever')
      .toMatch(/drainRef\.current = port\.drain;/);
  });

  it('remounts the grid on aeon\'s palette-mode flip, which is a drag end too', () => {
    // The standalone/zone flip removes the slider panel without unmounting the
    // editor. Keying the grid on the mode makes that an unmount of the GRID, so
    // the effect above runs; it also stops a standalone selection (line 0 of a
    // flat palette) leaking into the zone render, where line 0 is a zone line.
    expect(EDITOR, 'the grid is no longer keyed on the palette mode')
      .toMatch(/<PaletteGrid key=\{keyPrefix\}/);
    expect(EDITOR, 'keyPrefix no longer distinguishes the standalone palette from the zone lines')
      .toMatch(/const keyPrefix = standaloneSprite \?/);
  });
});

describe('the four palette mounts are four separate sections', () => {
  // A CollapsibleSection id keys the collapse preference in shell/panel-state.ts.
  // All four of these are titled "Palette" and section-ids.test.ts permits that;
  // what it cannot see is the opposite mistake — one id reused across two of
  // them, so collapsing the palette in classic's Art column silently collapses it
  // in the Palette facet.
  const FACETS = join(R, 'workspace', 'facets');

  /** Every `<CollapsibleSection id="…" title="Palette">` across the facet modules. */
  function paletteSections(): { file: string; id: string }[] {
    const out: { file: string; id: string }[] = [];
    const files = readdirSync(FACETS).filter((f) => f.endsWith('.tsx'));
    expect(files.length, 'no facet modules found').toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(FACETS, file), 'utf8');
      for (const m of source.matchAll(/<CollapsibleSection\s+id="([^"]+)"\s+title="Palette"/g)) {
        out.push({ file, id: m[1] });
      }
    }
    return out;
  }

  it('are exactly the four, each with its own id', () => {
    const found = paletteSections();
    expect(found.map((s) => s.id).sort()).toEqual([
      'art.palette',        // aeon Art column
      'classic.mapPalette', // classic Palette facet
      'classic.palette',    // classic Art column
      'palette.editor',     // aeon Palette facet
    ]);
    expect(new Set(found.map((s) => s.id)).size, 'two palette sections share a collapse preference')
      .toBe(found.length);
  });
});
