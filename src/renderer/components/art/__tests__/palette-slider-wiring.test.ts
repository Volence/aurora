// Two claims about PaletteEditor that nothing else in this suite can reach: the
// renderer tests are node-only, with no DOM and no .tsx collection, so the
// component is only checkable by reading it.
//
//   1. It renders the SHARED slider control and declares no second copy of it.
//   2. Its slider drags have a TEARDOWN — the thing whose absence was a
//      data-loss bug, because the preview writes the live document directly and
//      Chrome does not fire `blur` when a focused element is removed.
//
// What is executed for real elsewhere, so this file does not have to pretend:
// the commit/revert decision itself (core/art/__tests__/palette-drag.test.ts).
// What is left is the wiring.
//
// EVERY READ IS COMMENT-STRIPPED. All four files below discuss these identifiers
// at length in their docblocks — "blur", "CHANNELS", "teardown" — and a scan of
// raw source would pass on the prose after the code was deleted, which is the
// documented failure mode in this repo.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const R = join(__dirname, '../../..');
const code = (p: string) => readFileSync(join(R, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const EDITOR = code('components/art/PaletteEditor.tsx');
const SLIDERS = code('components/art-shared/GenesisColorSliders.tsx');
const CLASSIC = code('components/classic/ClassicPalettePanel.tsx');
const WORKSPACE = code('workspace/LevelWorkspace.tsx');
const SPRITE_MODE = code('components/sprite/SpriteMode.tsx');
const COMPOSER_SHARED = code('components/classic/composer-shared.tsx');

describe('both palette panels render ONE slider control', () => {
  it('is mounted by aeon and by classic', () => {
    for (const [name, src] of [['aeon PaletteEditor', EDITOR], ['ClassicPalettePanel', CLASSIC]] as const) {
      expect(src, `${name} no longer imports the shared control`)
        .toMatch(/import GenesisColorSliders from ['"][^'"]*GenesisColorSliders['"]/);
      expect(src, `${name} imports the control but never renders it`)
        .toMatch(/<GenesisColorSliders\b/);
    }
  });

  it('leaves PaletteEditor no private copy of the control it duplicated', () => {
    // Each of these was a verbatim duplicate. A range input is the tell that the
    // inlined panel came back; the rest are the constants and styles it needed.
    expect(EDITOR, 'PaletteEditor renders a raw range input again — the inlined panel is back')
      .not.toMatch(/type="range"/);
    expect(EDITOR, 'PaletteEditor declares its own channel table again')
      .not.toMatch(/\bCHANNELS\b|\bCHANNEL_COLORS\b/);
    expect(EDITOR, 'PaletteEditor declares its own 8-bit→3-bit helper again')
      .not.toMatch(/function to3\b/);
    expect(EDITOR, 'PaletteEditor declares its own CRAM-word formatter again')
      .not.toMatch(/function fmtWord\b/);
    for (const style of ['editPanel', 'sliderRow', 'channelLabel', 'slider', 'channelValue']) {
      expect(EDITOR, `PaletteEditor re-declared the shared control's \`${style}\` style`)
        .not.toMatch(new RegExp(`^\\s*${style}:`, 'm'));
    }
  });

  it('formats CRAM words from the one pure helper', () => {
    // Both panels and the control print `$0EEE`; three copies of a padStart is
    // how they drift. It lives in core/formats/palette now.
    for (const [name, src] of [['PaletteEditor', EDITOR], ['GenesisColorSliders', SLIDERS]] as const) {
      expect(src, `${name} formats the word itself instead of importing fmtGenesisWord`)
        .not.toMatch(/padStart\(4/);
      expect(src, `${name} does not import fmtGenesisWord`).toMatch(/\bfmtGenesisWord\b/);
    }
  });
});

describe('the shared control does not blur, and nothing needs it to', () => {
  // The ONE documented reason PaletteEditor kept its own copy. Blurring on commit
  // costs a double onCommit and makes arrow-key fine-tuning impossible, and it was
  // only ever there to dodge an undo guard that blocked focused inputs.
  it('neither the control nor its aeon host blurs on commit', () => {
    expect(SLIDERS, 'the shared control blurs the slider on commit').not.toMatch(/\.blur\?\.\(\)|\.blur\(\)/);
    expect(EDITOR, 'PaletteEditor blurs the slider again — re-read why that was removed')
      .not.toMatch(/\.blur\?\.\(\)|\.blur\(\)/);
  });

  it('is safe because BOTH level-side undo bindings exempt type:\'range\'', () => {
    // This is the premise, not a detail. If either binding stops exempting range,
    // a focused slider swallows the Ctrl+Z that follows a palette commit — and the
    // fix would be to restore the exemption, NOT to re-add blur().
    expect(WORKSPACE, 'LevelWorkspace stopped routing its guard through isTypingTarget')
      .toMatch(/isTypingTarget\(/);
    expect(COMPOSER_SHARED, "isTypingTarget no longer exempts range — a focused palette slider now blocks undo")
      .toMatch(/'range'/);
    expect(SPRITE_MODE, "SpriteMode's undo keydown no longer exempts range")
      .toMatch(/'range'/);
    // …and there are still exactly these two window-level level undo bindings, so
    // "both" is the whole set.
    for (const [name, src] of [['LevelWorkspace', WORKSPACE], ['SpriteMode', SPRITE_MODE]] as const) {
      expect(src, `${name} lost its undo binding`).toMatch(/focusedHistory\(\)\?\.undo\(\)/);
    }
  });
});

describe('a palette drag can never be stranded', () => {
  // THE BUG. previewChange writes `zone.palette` directly so the canvas repaints
  // mid-drag; only the drag END turns that into an undoable, dirty-marking step.
  // With no teardown, unmounting the slider panel mid-drag (a facet switch, an act
  // switch, the standalone/zone palette-mode flip) left the zone permanently
  // changed with an EMPTY undo stack and a clean dirty flag.
  it('has an effect whose CLEANUP ends the drag', () => {
    // Scoped to the effect, not the file: an `endZoneDrag()` call somewhere in the
    // component is exactly what already existed and was not enough.
    expect(EDITOR, 'the drain effect is gone — a mid-drag unmount strands the palette mutation')
      .toMatch(/useEffect\(\(\)\s*=>\s*\(\)\s*=>\s*\{\s*drainRef\.current\(\);\s*\}/);
  });

  it('re-runs that cleanup when the OPEN SWATCH changes, not only on unmount', () => {
    // setSel(null) on a palette-mode flip removes the input without unmounting the
    // editor, so an unmount-only cleanup ([] deps) would miss it entirely.
    expect(EDITOR, 'the drain effect no longer keys on the open swatch')
      .toMatch(/useEffect\(\(\)\s*=>\s*\(\)\s*=>\s*\{[^}]*\},\s*\[panelKey\]\)/);
    expect(EDITOR, 'panelKey no longer distinguishes the standalone panel from a zone line')
      .toMatch(/const panelKey = sel \?[\s\S]{0,120}standaloneSprite/);
  });

  it('drains BOTH paths, because the mode may already have flipped at cleanup', () => {
    expect(EDITOR, 'the teardown picks one ender — it will run the wrong one on a mode flip')
      .toMatch(/drainRef\.current = \(\) => \{ endZoneDrag\(\); endStandaloneDrag\(\); \}/);
  });

  it('routes every drag end through the shared commit/revert decision', () => {
    // Both enders, not just the zone one: the standalone path had the identical
    // shape and the identical bug.
    expect(EDITOR, 'PaletteEditor no longer imports resolvePaletteDragEnd')
      .toMatch(/import \{ resolvePaletteDragEnd \}/);
    const calls = EDITOR.match(/resolvePaletteDragEnd\(\{/g) ?? [];
    expect(calls, 'one of the two drag-end paths decides for itself again').toHaveLength(2);
  });

  it('snapshots the DOCUMENT, not just the line index', () => {
    // Without this, a drag that ends after an act switch restores the pre-drag
    // colors onto whatever zone is current NOW — corrupting a zone the user never
    // touched. The snapshot carries the zone object / sprite doc id it came from.
    expect(EDITOR, 'the zone snapshot no longer carries the zone it was taken from')
      .toMatch(/preDragRef = useRef<\{ zone: Zone;/);
    expect(EDITOR, 'the standalone snapshot no longer carries its sprite doc id')
      .toMatch(/preDragStandaloneRef = useRef<\{ docId: string;/);
    // …and the standalone revert reaches a PARKED doc, which setState cannot.
    expect(EDITOR, 'the standalone revert writes the active store field instead of its own doc')
      .toMatch(/patchSpriteDoc\(pre\.docId, \{ standalonePalette:/);
  });
});
