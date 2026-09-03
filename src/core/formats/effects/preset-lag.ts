/**
 * The contract-leads-consumer lag on the raster preset document, as ONE fact
 * with ONE measurement behind it.
 *
 * ═══ RE-ARMED 2026-09-03. THE LAG IS `patch_world_ys` AND `patch_motion`. ═══
 *
 * The retirement below happened, and then the exact event its RE-OPEN paragraph
 * described happened too — from the other direction. empyrean `d36d704`
 * (AURORA_EFFECTS_SCHEMA.md §7.3) declared two new optional preset keys for
 * EFFECTS-W1 DoD item 4, Aurora vendored them (step 3 of a four-step chain), and
 * aeon's `tools/effects_gen.py` reads neither: step 4 is theirs and has not run.
 * Measured at aeon `origin/master` `81b2a719` through git objects:
 * `PRESET_KEYS` (`effects_gen.py:280`) is `{schema, id, bands, cycles,
 * variants}` and `docs/EDITOR_RASTER_PRESETS.md`'s machine-checked block lists
 * the same five.
 *
 * ═══ THIS LAG IS SHARPER THAN THE LAST ONE, AND THE SENTENCE SAYS SO ═══
 *
 * At 12aecd5 the two lagging keys were in aeon's `preset-refused` list — refused
 * BY NAME, with a reason. These two are not in aeon's vocabulary at all, so they
 * take `_check_keys`'s generic unknown-key path (`effects_gen.py:444-453`), and
 * `_refuse` RAISES: a preset document carrying either key does not "lower
 * partially", it FAILS AEON'S BUILD ENTIRELY until step 4 lands. An author who
 * sets one has not merely authored something inert — they have made that preset
 * un-generatable. The disclosure below is written to say that, because the
 * softer 12aecd5 wording ("saved to this file, and that is as far as it goes")
 * would understate it.
 *
 * ═══ THE 2026-09-02 RETIREMENT, KEPT FOR ITS REASONING ═══
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
 * ═══ MERGED, NOT CERTIFIED — AND THE CONDITION THAT REVIVES THE SENTENCE ═══
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
 *      aeon's page at origin/master through git objects, computes the lag and
 *      asserts it equals this list exactly. It goes red in BOTH directions —
 *      aeon builds one of these (empty the list) or the contract declares a key
 *      aeon has not built (add it). The test carries no copy of the names.
 *
 *      ⚠ THE MEASUREMENT WIDENED ON 2026-09-03, AND IT HAD TO. Until then the
 *      lag was computed from aeon's `preset-refused` list alone, which sees only
 *      the refused-BY-NAME flavour; a key aeon's page does not mention at all
 *      was invisible to it. That is precisely the flavour d36d704 produced, and
 *      the row stayed green on the half that mattered. The lag is now computed
 *      as "every root key the schema declares that aeon's page does not
 *      ACCEPT", which covers both flavours and is the definition this constant
 *      always meant.
 *   2. `presetLagDisclosure` DERIVES the panel's sentence from it, and returns
 *      null — no sentence — when the list is empty. It is mounted
 *      unconditionally and propless in `BandPresetPanel`, so re-filling this
 *      list is the whole of what it takes to put the sentence back on screen.
 *
 * `src/renderer/components/effects/__tests__/preset-lag-disclosure.test.ts`
 * closes the loop from the other side: it asserts the list is empty AND that the
 * drift test still measures the refusal list, so a green suite cannot mean
 * "nobody is looking any more". Its sentence rows drive the derivation with an
 * EXPLICIT hypothetical list, so the wording is still fully asserted with the
 * premise retired (memory: a workaround outlives its defect; a hold carries its
 * date; a suite that passes while asserting nothing is the failure mode).
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
 * item 5; re-filled 2026-09-03 with item 4's authoring key, whose step 4 is
 * aeon's and has not run. Empty it (and only it) the day the drift row says the
 * lag has closed.
 */
export const PRESET_KEYS_AWAITING_AEON: readonly string[] =
  Object.freeze(['patch_motion', 'patch_world_ys']);

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
