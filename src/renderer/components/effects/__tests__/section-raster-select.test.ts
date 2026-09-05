// THE PER-SECTION RASTER SELECT — ROADMAP row 93's remaining half.
//
// ═══ WHAT THIS FILE IS DEFENDING, AND IT IS NOT "THE SELECT EXISTS" ═══
//
// `rasterRef` has TWO writers: `assign_section_preset` (an agent tool) and this
// select (an author). The defect this parcel is exposed to is not a broken
// control — it is TWO DOORS THAT DISAGREE. If the select assigned the field
// itself, then:
//
//   • the select's empty option and the tool's explicit `null` would be two
//     different unbinds, and `rasterRef: ""` — which the sidecar parser reads
//     back as null and erases — would be expressible from one of them;
//   • re-picking the value a section already has would push an empty undo
//     entry from one door and not the other;
//   • the one `set-section-raster` command both arms of history know would have
//     a bypass.
//
// So the rows below are mostly about the SEAM, not the widget. `sectionPresetCommand`
// is the single function; every row here asks whether the control really goes
// through it and whether the option list it draws can express what that function
// accepts.
//
// ⚠ THE NODE SUITE CANNOT SEE REACT. These rows read the panel SOURCE and call
// the provider directly. That bounds what they prove: that the wiring is written
// and that the pure functions behind it are right — NOT that an author can click
// the thing. The click is `scratchpad/section-raster-select-harness.mjs`'s job,
// in a real Electron over CDP, and it is a separate claim. Said out loud so the
// green here is not read as more than it is.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RASTER_REF_ROW, presetRefOptions, unassignablePresetRef, sectionPresetCommand,
  newPreset,
} from '../../../providers/effects-preset';
import { RASTER_SECTION_BINDING_LIMIT } from '../../../../core/formats/raster-binding';
import type { EffectsPresetLibrary } from '../../../../core/formats/effects/preset';

const PANEL_PATH = join(__dirname, '..', 'BandPresetPanel.tsx');
const panel = readFileSync(PANEL_PATH, 'utf8');

/**
 * The panel source with comments stripped — `band-preset-wording.test.ts`'s
 * bound, for its reason. This panel's own comments now discuss
 * `sectionPresetCommand` and `rasterRef` at length (the placement note is
 * thirty lines), so a naive `panel.includes('sectionPresetCommand')` would stay
 * green with the whole control deleted, satisfied entirely by the prose saying
 * it should be there. The next row proves the strip removed something.
 */
const code = panel
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const lib = (ids: string[], unreadable: string[] = []): EffectsPresetLibrary => ({
  presets: ids.map((id) => newPreset(id)),
  unreadable: unreadable.map((id) => ({
    path: `/p/data/editor/effects/presets/${id}.json`, reason: 'not JSON',
  })),
  notices: [], loadedPaths: [],
});

describe('the slice this file measures is bounded', () => {
  it('comment-stripping really removed the prose that discusses the binding', () => {
    // ANTI-VACUOUS, both directions: the COMMENTS really do name the provider
    // function, so a naive contains-check WOULD have been fooled — counted
    // rather than pattern-matched, because the mention is in a JSX block
    // comment and a `//`-shaped probe would miss it and pass for the wrong
    // reason.
    const count = (s: string, n: string) => s.split(n).length - 1;
    expect(count(panel, 'sectionPresetCommand'))
      .toBeGreaterThan(count(code, 'sectionPresetCommand'));
    expect(panel.length - code.length).toBeGreaterThan(500);
    // ...and what is left is still the component.
    expect(code).toMatch(/export default function BandPresetPanel/);
  });
});

describe('the select goes through the provider, and cannot assign the field', () => {
  /**
   * THE ROW THE WHOLE PARCEL TURNS ON. Recorded in four places — the provider,
   * core/formats/section-meta.ts, core/model/s4-types.ts and ROADMAP row 93 —
   * and mechanical rather than stylistic: `sectionPresetCommand` owns the `''`
   * sentinel and the no-op rule, so a control that wrote the field would make
   * the UI and the agent tool disagree about what an unbind is.
   */
  it('the onChange runs sectionPresetCommand with the active section and its current ref', () => {
    expect(code).toMatch(
      /onChange=\{\(v\)\s*=>\s*run\(sectionPresetCommand\(\s*activeSectionIndex,\s*section\.rasterRef,\s*v\)\)\}/);
  });

  /**
   * The negative half, and it is NOT redundant with the row above: a panel can
   * call the provider AND still poke the field somewhere else (a second control,
   * an effect, a "reset" button). Assignment is what is forbidden, so assignment
   * is what is searched for — in CODE, never in the comments that discuss it.
   */
  it('nothing in the panel ASSIGNS rasterRef, or builds the command by hand', () => {
    expect(code).not.toMatch(/rasterRef\s*=[^=]/);
    expect(code).not.toMatch(/['"]set-section-raster['"]/);
  });

  /** One store value for "the active section", shared with the scene panel's
   *  assignment row. A panel-local copy would be a second source of truth for
   *  which section the author is looking at. */
  it('the active section comes from the editor store, not from panel state', () => {
    expect(code).toMatch(/useEditorStore\(\(s\)\s*=>\s*s\.activeSectionIndex\)/);
    expect(code).not.toMatch(/useState[^\n]*[sS]ectionIndex/);
  });

  /** The value shown is the section's own binding — not the panel's selected
   *  preset, which is a different quantity entirely (the document being EDITED,
   *  not the one this section USES). Confusing the two is the single most
   *  plausible wrong wiring here. */
  it('the select renders the SECTION\'s binding, not the edited preset', () => {
    expect(code).toMatch(/value=\{section\.rasterRef \?\? ''\}/);
    expect(code).not.toMatch(/value=\{selected(\?)?\.id/);
  });
});

describe('what the select offers', () => {
  it('leads with the unbind option, whose value is the sentinel the provider owns', () => {
    const opts = presetRefOptions(lib(['a', 'b']));
    expect(opts[0]).toEqual({ value: '', label: RASTER_REF_ROW.unbound });
    // The sentinel really is what unbinds, asserted through the function rather
    // than assumed: this is the whole reason the empty option may exist at all.
    expect(sectionPresetCommand(3, 'a', opts[0].value)?.newRef).toBeNull();
  });

  it('offers one option per LOADED preset, by label, in library order', () => {
    expect(presetRefOptions(lib(['ojz_shimmer', 'ojz_depth'])).map((o) => o.value))
      .toEqual(['', 'ojz_shimmer', 'ojz_depth']);
  });

  /**
   * Unreadable files are deliberately absent — `sceneRefOptions`' rule. Binding
   * a section to a file Aurora could not read writes a ref aeon's generator
   * refuses BY NAME at build time, so an option for it is an offer to break the
   * build.
   */
  it('does NOT offer a preset file that could not be read', () => {
    // ⚠ PRESENCE AND ABSENCE, NOT THE WHOLE ARRAY, and the poison run is why.
    // Written as `toEqual(['', 'good'])` this row also reddened when the UNBIND
    // option was deleted — a true failure, but a different rule's, so the plant
    // that removed the empty option looked like it had broken the unreadable
    // rule too. A row that reddens for someone else's defect cannot tell you
    // which one you have.
    const values = presetRefOptions(lib(['good'], ['broken'])).map((o) => o.value);
    expect(values, 'the readable preset vanished — this row would pass vacuously')
      .toContain('good');
    expect(values).not.toContain('broken');
  });

  /**
   * THE EMPTY-LIBRARY CASE, which is the one a broken control shows up in: a
   * project with no presets must still draw a working select whose one option
   * is the state the section is already in — not an empty listbox, and not a
   * control that cannot express "unbound".
   */
  it('an empty or entirely-unreadable library still yields a usable control', () => {
    expect(presetRefOptions(lib([]))).toEqual([{ value: '', label: RASTER_REF_ROW.unbound }]);
    expect(presetRefOptions(lib([], ['a', 'b'])))
      .toEqual([{ value: '', label: RASTER_REF_ROW.unbound }]);
  });

  /**
   * ⚠ THIS ROW EXISTS BECAUSE A PLANT SLIPPED PAST THE WHOLE NODE SUITE.
   * Swapping the option's `value` for its `label` — `value={o.label}` — left
   * 57 rows green and `tsc` clean, and turned nine harness rows red in the real
   * app: the select then offered "Authored probe (red / blue)" as a VALUE, so
   * no pick could ever match a preset id and nothing could be bound at all.
   *
   * The row closes that instance. The CLASS — what React actually put on the
   * element — stays the harness's, which is why the harness is not optional
   * here.
   */
  it('the option VALUE is the preset id, not the display label', () => {
    expect(code).toMatch(/<option key=\{o\.value\} value=\{o\.value\}>\{o\.label\}<\/option>/);
  });

  /** No document, no control. A section index past the end of the act must not
   *  render a select over `undefined`. */
  it('the panel guards on the section existing before drawing the select', () => {
    expect(code).toMatch(/const section = act\?\.sections\[activeSectionIndex\] \?\? null/);
    expect(code).toMatch(/\{!section \?/);
  });
});

describe('a binding that names nothing is SAID, not silently redrawn as unbound', () => {
  /**
   * REACHABLE WITHOUT ANY BUG: the sidecar is hand-editable and aeon's generator
   * writes it too, so a ref can name a preset that was deleted, renamed, or is
   * sitting in `unreadable`. A plain `<select>` renders an unknown value by
   * falling back to its FIRST option — which here is "Hand-authored raster", so
   * silence would draw the section as unbound when the file says otherwise.
   */
  it('null and a live id are both quiet', () => {
    expect(unassignablePresetRef(lib(['a']), null)).toBeNull();
    expect(unassignablePresetRef(lib(['a']), 'a')).toBeNull();
  });

  it('an id naming no preset is named, in the sentence', () => {
    expect(unassignablePresetRef(lib(['a']), 'ghost'))
      .toMatch(/"ghost".*not a raster preset in this project/);
  });

  // EFFECTS-W1 defect 7: the SECTION is named too, when the caller knows it.
  // One control draws every section in turn, so the sentence has to say which
  // section's sidecar carries the dangling id — aeon's own build message for
  // the same fault names the section, and the two now agree.
  it('names the SECTION when the caller passes one, and stays generic when it does not', () => {
    expect(unassignablePresetRef(lib(['a']), 'ghost', 4))
      .toMatch(/^Section 4 is assigned to "ghost"/);
    expect(unassignablePresetRef(lib(['a']), 'ghost'))
      .toMatch(/^This section is assigned to "ghost"/);
  });

  /** The two failures are DIFFERENT ACTIONS for the author — create the preset,
   *  versus fix the file that will not parse — so they are different sentences. */
  it('an id whose FILE exists but will not parse says so instead', () => {
    expect(unassignablePresetRef(lib([], ['broken']), 'broken'))
      .toMatch(/"broken", whose file exists but could not be read/);
  });

  it('the panel renders that advisory, in code, at the warning tone', () => {
    expect(code).toMatch(/unassignablePresetRef\(library, section\.rasterRef, activeSectionIndex\)/);
    expect(code).toMatch(/<Hint under tone="warning">/);
  });
});

describe('the control adds no second wording of the limit', () => {
  /**
   * ⚠ THE ONE THING THIS PARCEL WAS FORBIDDEN TO DO. `RASTER_SECTION_BINDING_LIMIT`
   * is one sentence for four audiences and `LimitBlock` already carries it at
   * the top of this very section — the author-length half painted, the contract
   * wording on the same element's `title` (`b8d16256`; the split is held by
   * band-preset-wording.test.ts). ⚠ THIS LINE SAID "renders in full" UNTIL
   * 2026-09-04, the pre-`b8d16256` ruling; do not read it as licence to paint
   * the contract text. Either way, a near-identical sentence beside the select
   * is exactly the drift core/formats/raster-binding.ts exists to prevent. The row samples
   * distinctive phrases from the constant rather than the whole string, because
   * a FORK would be paraphrased, not pasted.
   */
  it('no distinctive phrase of the shared limit is retyped in the panel', () => {
    // ⚠ 'one line per section' WAS HERE UNTIL 2026-08-30 and this row went RED
    // when the constant's universal call-site clause was retired (aeon
    // `9cdf32d8` threads the chooser for section 5, and wiring a second section
    // is a preset SPLIT plus a line, not one line). The anti-vacuous loop below
    // is what caught it: a phrase that leaves the constant stops being a sample
    // of it and would otherwise assert nothing about the panel forever.
    const phrases = [
      'does not install it', 'assign_section_preset writes it',
      'changes nothing on screen', 'costs ROM',
      'a preset split plus one call-site line',
    ];
    // ANTI-VACUOUS: these really are the constant's phrases, so a green here is
    // about the panel and not about five strings nobody wrote.
    for (const p of phrases) expect(RASTER_SECTION_BINDING_LIMIT).toContain(p);
    for (const p of phrases) expect(panel, `panel retypes: ${p}`).not.toContain(p);
  });

  /** The row's own words live in the provider, on this panel's "holds no rules"
   *  rule — the label and title are read, not typed. */
  it('the row label and title come from RASTER_REF_ROW', () => {
    expect(code).toMatch(/RASTER_REF_ROW\.title/);
    expect(RASTER_REF_ROW.unbound.length).toBeGreaterThan(0);
    expect(RASTER_REF_ROW.title).toMatch(/rasterRef/);
    // The title DEFINES the options; it must not grow into a second limit.
    expect(RASTER_REF_ROW.title).not.toMatch(/does not|nothing|still/i);
  });

  /** WHERE THE VALUE IS WRITTEN is the one thing no control can tell you, and
   *  it is the scene row's settled trade — the persistence line stays, the
   *  definition moved onto the control's title. */
  it('the panel says where the value is saved, and names the key', () => {
    expect(code).toMatch(/section_\{activeSectionIndex\}\.meta\.json/);
    expect(code).toMatch(/<code>rasterRef<\/code>/);
  });
});
