/**
 * The contract-leads-consumer lag on the raster preset document, as ONE fact
 * with ONE measurement behind it.
 *
 * ═══ THE LAG IS OPEN AGAIN: `ramp`, RE-ARMED 2026-09-03 (ITEM 6, STEP 3) ═══
 *
 * THE FOURTH ARMING. empyrean `9233883` (AURORA_EFFECTS_SCHEMA.md §7.4) declared
 * EFFECTS-W1 DoD item 6's authoring key, `ramp`, and Aurora has vendored it and
 * written the codec (step 3). AEON'S STEP 4 HAS NOT RUN. Measured firsthand
 * through git objects at aeon `origin/master` `dd17f7c9`, page blob `62ca6426`:
 *
 *   - `docs/EDITOR_RASTER_PRESETS.md`'s machine-checked block reads
 *     `preset: bands, cycles, id, patch_motion, patch_world_ys, schema, variants`
 *     — no `ramp` — and `preset-refused:` is `fires` alone.
 *   - `tools/effects_gen.py` contains the string `ramp` ZERO TIMES, in any case.
 *     `PRESET_KEYS` (`:285`) does not carry it and no `_check_ramp` exists.
 *
 * SO THIS IS THE SHARPER FLAVOUR, the same one item 4 had: `ramp` is not in
 * aeon's vocabulary at all, so it takes `_check_keys`'s generic unknown-key path
 * and `_refuse` RAISES. A preset document carrying `ramp` does not lower
 * partially — IT FAILS AEON'S BUILD ENTIRELY. `presetLagDisclosure` below says
 * exactly that, and it is the wording this flavour needs.
 *
 * The ENGINE half of item 6 shipped long ago (`RasterRampProgram` since
 * 2026-08-14, gated and budgeted at aeon `cf3dfb1a`); it is the GENERATOR that
 * has not been taught the key. That distinction matters to an author: the
 * mechanism exists and is not reachable from a document.
 *
 * RE-RETIRE CONDITION: the day the drift row goes red because aeon's page
 * ACCEPTS `ramp` — empty this list and re-date it, and the sentence retires with
 * the row. Do not empty it on a merge announcement; the row reads aeon's page at
 * TIP on every run and is the only thing entitled to an opinion here.
 *
 * ═══ THE PREVIOUS RETIREMENT (ITEM 4), KEPT FOR ITS REASONING ═══
 *
 * The four-step cross-repo chain for EFFECTS-W1 DoD item 4 has closed. aeon
 * named the key shape, the hub filed the schema CR (empyrean `d36d704`,
 * AURORA_EFFECTS_SCHEMA.md §7.3), Aurora vendored and wrote the keys (step 3,
 * merge `b5c5284b`), and aeon's generator now READS them. Measured firsthand
 * through git objects at aeon `origin/master` `b7f4bdeb`, page blob `22a42064`
 * — a revision LATER than the `81b2a719`/`63fa3f8c` the re-arm below was written
 * against, because aeon's master moves fast and the drift row reads TIP on every
 * run, so it and not this comment answers the question today:
 *
 *   - `PRESET_KEYS` (`tools/effects_gen.py:285-286`) is now `{schema, id, bands,
 *     cycles, variants, patch_world_ys, patch_motion}`, with a comment above it
 *     dating the join to 2026-09-03 and naming §7.3 as the authority.
 *   - `_check_patch_world_ys` and `_check_patch_motion` shape-check them
 *     (positional, `<= 4`, the `PATCH_ANCHOR_NONE` sentinel refused as an
 *     integer, `PATCH_WORLD_Y_MAX` = `0xFFFF`), plus the cross-key refusal for a
 *     motion on a null seed and the `CAP_ANCHOR_MOTION` capability check.
 *   - `render_patch_motion` and the `fn_sec_patch_world_y` / `fn_sec_patch_motion`
 *     emitters lower them as VALUES into `ep_patch_world_ys` / `ep_patch_motion`.
 *   - `docs/EDITOR_RASTER_PRESETS.md`'s machine-checked block lists both under
 *     `preset:`, and grew `sweep:` / `sweep-optional:` rows for the shape.
 *
 * `preset-refused` is back to `fires` alone.
 *
 * ═══ THE LAG THAT RETIRED WAS THE SHARPER FLAVOUR, AND THAT IS KEPT ═══
 *
 * At 12aecd5 the lagging keys were in aeon's `preset-refused` list — refused BY
 * NAME, with a reason. These two were not in aeon's vocabulary at all, so they
 * took `_check_keys`'s generic unknown-key path and `_refuse` RAISED: a preset
 * document carrying either key did not "lower partially", it FAILED AEON'S
 * BUILD ENTIRELY. `presetLagDisclosure` below still says exactly that, because
 * the softer 12aecd5 wording would understate a re-opened lag of this flavour —
 * and `preset-lag-disclosure.test.ts` replays that premise explicitly so the
 * wording stays fully asserted with nothing on screen.
 *
 * ⚠ MERGED, NOT CERTIFIED. Nothing in this repository has seen a ROM obey
 * `patch_world_ys` or `patch_motion`, and nothing here claims one has. What
 * retired is a sentence about what aeon's GENERATOR does with an authored key,
 * which is a fact this file can and does measure. aeon's own page records that
 * `preset()` ensures the ARRAY LENGTH and not the values, and that a game
 * without `CAP_ANCHOR_MOTION` refuses an authored sweep — both are aeon's
 * checks, run in aeon's build, and no row here stands in for them.
 *
 * RE-OPEN CONDITION FOR ITEM 4, stated so this retirement cannot become
 * permanent by accident: if aeon's build REFUSES a document Aurora writes under
 * either key — a length, a sentinel, a unit or a capability Aurora does not know
 * about — then "aeon reads these keys" is true of the vocabulary and false of
 * the documents this editor actually produces, and the disclosure comes back
 * with wording that says so. Aurora cannot measure that: it is aeon's pytest
 * lane and sigil's attest chain, and no row in this repo pretends otherwise.
 * What Aurora CAN measure is the vocabulary, and the drift row does, on every
 * run, at TIP.
 *
 * ═══ THE 2026-09-02 RETIREMENT (ITEM 5), KEPT FOR ITS REASONING ═══
 *
 * It was `['cycles', 'variants']` from the 12aecd5 re-vendor until aeon merged
 * EFFECTS-W1 DoD item 5 (aeon `445a5856`, 2026-09-02). The premise was: the
 * vendored schema DECLARES both keys (§7.2) and Aurora authors, validates,
 * saves and re-reads both, while aeon's `tools/effects_gen.py` refused both by
 * NAME — so a value an author set under either reached the FILE and nothing
 * further, not the ROM, not an emulator, not a screen. The band-preset panel
 * said exactly that, above the controls, in a sentence derived from this list.
 *
 * At aeon `origin/master` `a5e2b618` (page blob `518492e3`) that is no longer
 * true, and it is not true on a doc heading: `PRESET_KEYS` in `effects_gen.py`
 * carries both names, `_check_cycles` / `_check_variants` shape-check them,
 * `render_cycle_channel` / `render_variant` / `render_preset_cycle` /
 * `render_preset_variants` lower them through the real constructors, and the
 * committed generated `.emp` carries the emitted record
 * (`games/sonic4/data/generated/ojz/act1/effects_scenes.emp`:
 * `EditorVariant_OJZ_Act1_ojz_sec3_shimmer_0: pal_variant = variant(shift_r: 1,
 * shift_g: 1)`). So the list below is EMPTY and the sentence does not render.
 *
 * ═══ ITEM 5 WAS MERGED, NOT CERTIFIED — AND ITS OWN REVIVAL CONDITION ═══
 *
 * Item 5 is MERGED on aeon's master. It is NOT a certified chain: sigil
 * `dd5eaad2` (reachable on sigil `origin/master`) records "chain 198 recorded
 * RED — 3 failures, no ROM byte moved", and aeon supersedes it with chain 199.
 * Nothing in this repository has seen a ROM obey these keys, and nothing here
 * claims one has. What retired is a sentence about what aeon's GENERATOR does
 * with an authored key, which is a fact this file can and does measure.
 *
 * RE-OPEN CONDITION, stated so the retirement cannot become permanent by
 * accident: IF ANY OF CHAIN 199'S SEVEN GOLDENS DIFFERS FROM CHAIN 198'S, the
 * ROM did not behave as the retired sentence's absence now implies, and the
 * sentence COMES BACK — re-fill the list below and re-date it. That check is
 * aeon's and sigil's to run; Aurora cannot measure it, and no row in this repo
 * pretends to.
 *
 * ═══ THE MACHINERY STAYS. IT IS NOT DEAD CODE — IT IS A RE-ARMABLE DISCLOSURE ═══
 *
 * `PRESET_KEYS_AWAITING_AEON` is the only hand-typed statement of the fact.
 * TWO readers, and only two:
 *
 *   1. `test/formats/effects-preset-schema-drift.test.ts` MEASURES it: it reads
 *      aeon's page at origin/master through git objects, computes the lag, and —
 *      now that the lag is empty — asserts it is EMPTY. That row goes red the
 *      day a lag re-opens, in either direction: aeon un-building a key, or the
 *      contract declaring a key aeon has not built. Its message says which fix
 *      each is. The row carries no copy of any key name, and — as on 2026-09-02
 *      — it no longer names THIS constant either, because a row asserting "the
 *      measured lag equals <an empty list>" would be the same claim spelled
 *      through an indirection nobody can read.
 *
 *      ⚠ THE MEASUREMENT WIDENED ON 2026-09-03 AND MUST STAY WIDE. Until then
 *      the lag was computed from aeon's `preset-refused` list alone, which sees
 *      only the refused-BY-NAME flavour; a key aeon's page does not mention at
 *      all was invisible to it. That is precisely the flavour d36d704 produced,
 *      and the row stayed green through it. The lag is computed as "every root
 *      key the schema declares that aeon's page does not ACCEPT", which covers
 *      both flavours and is the definition this constant always meant.
 *      Narrowing it back is how this whole apparatus goes green while blind, so
 *      `preset-lag-disclosure.test.ts` pins the WIDE form on the drift test's
 *      own source.
 *   2. `presetLagDisclosure` DERIVES the panel's sentence from it, and returns
 *      null — no sentence — when the list is empty. It is mounted
 *      unconditionally and propless in `BandPresetPanel`, in BOTH the channels
 *      section and the anchors section, so re-filling this list is the whole of
 *      what it takes to put the sentence back on screen in both places. The
 *      leaves STAY MOUNTED while silent: that is what keeps re-arming a one-line
 *      edit in this file.
 *
 * `src/renderer/components/effects/__tests__/preset-lag-disclosure.test.ts`
 * closes the loop from the other side. It has now been re-aimed with the premise
 * THREE times (armed → retired → armed → retired) and keeps the shape both
 * states need. With the lag CLOSED it asserts the retirement rather than assuming
 * it (the list is empty, and the leaf is silent BECAUSE of that and not for some
 * other reason); it keeps the WORDING fully asserted by driving the derivation
 * with an EXPLICIT replay of the retired premise, checked against the schema so
 * the replay is real vocabulary and not fiction; and its poison flips to the
 * load-bearing direction — stub this list back NON-empty and the leaf must speak
 * the whole sentence again, which a leaf hard-wired to `return null` would fail
 * (memory: a workaround outlives its defect; a hold carries its date; a suite
 * that passes while asserting nothing is the failure mode).
 *
 * Evaluate, do not obey: re-measure with `git -C <aeon> show
 * origin/master:docs/EDITOR_RASTER_PRESETS.md`, never by path into a working
 * tree. Owner of the sentence: Aurora (this file). Owner of the fact: aeon.
 */

/**
 * The preset keys the schema declares that aeon's generator does not lower yet,
 * sorted, as the drift row measures them.
 *
 * `['cycles','variants']` from 2026-08-30; EMPTY on 2026-09-02 when aeon merged
 * item 5; `['patch_motion','patch_world_ys']` on 2026-09-03 when empyrean
 * d36d704 declared item 4's authoring keys and aeon's step 4 had not run; EMPTY
 * again LATER THE SAME DAY, when it did; `['ramp']` on 2026-09-03 when empyrean
 * 9233883 declared item 6's authoring key and aeon's step 4 had not run. Empty
 * it (and only it) the day the drift row reports the lag closed — the sentence
 * leaves the screen in both mount sites by construction.
 */
export const PRESET_KEYS_AWAITING_AEON: readonly string[] = Object.freeze(['ramp']);

/** The date the premise above was last measured — printed inside the sentence. */
export const PRESET_LAG_MEASURED_ON = '2026-09-03';

/** Where the measurement lives, named in the sentence so a reader can re-run it. */
export const PRESET_LAG_MEASUREMENT =
  'test/formats/effects-preset-schema-drift.test.ts (the lag row) against aeon ' +
  'docs/EDITOR_RASTER_PRESETS.md at origin/master';

/** The sentence's leading words — a harness finds the block by them. */
export const PRESET_LAG_LEAD = 'Not consumed by the engine yet.';

/**
 * The disclosure the panel renders above the cycle and variant controls, or
 * null when there is nothing to disclose.
 *
 * ═══ WHY IT IS DERIVED AND NOT WRITTEN ═══
 *
 * The sentence must retire the day the premise does. Writing it as a literal in
 * the panel would leave a second copy of the fact that nothing measures — the
 * O62/O64 class: a disclosure that stays on screen after it stops being true is
 * worse than none, because it teaches the author to ignore the panel's warnings.
 * Built from the list, an empty list yields no sentence, and the drift row is
 * the only thing that can empty it honestly.
 *
 * The date inside the sentence is the measurement's, not the sentence's: it
 * tells the reader how stale the claim COULD be, and where to look.
 */
export function presetLagDisclosure(keys: readonly string[] = PRESET_KEYS_AWAITING_AEON): string | null {
  if (keys.length === 0) return null;
  const one = keys.length === 1;
  const names = keys.map((k) => `\`${k}\``);
  const list = one ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${PRESET_LAG_LEAD} ${list} ${one ? 'is' : 'are'} authored here and saved to this ` +
    `preset file, and that is as far as ${one ? 'it goes' : 'they go'}: aeon's generator ` +
    `(tools/effects_gen.py) does not accept ${one ? 'it' : 'them'} at origin/master and refuses ` +
    'the WHOLE DOCUMENT, so a preset carrying ' +
    `${one ? 'the key' : 'either key'} will not build, nothing set below reaches a ROM, and no ` +
    `emulator has shown ${one ? 'it' : 'either'}. ` +
    `Measured ${PRESET_LAG_MEASURED_ON} by ${PRESET_LAG_MEASUREMENT}. ` +
    `Expires (${PRESET_LAG_MEASURED_ON}): the day that row goes red because aeon lowers ` +
    `${one ? 'the key' : 'the keys'} — this sentence retires with the row.`;
}
