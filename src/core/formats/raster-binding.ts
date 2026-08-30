/**
 * WHAT A PER-SECTION RASTER-PRESET ASSIGNMENT DOES, AND WHERE IT STOPS.
 *
 * `assign_section_preset` writes `rasterRef` into a section's `.meta.json`
 * sidecar, one undo step, and the sidecar persists it. All of that is real.
 * What no consumer does is READ it: `rasterRef` appears ZERO times in aeon's
 * `tools/EFFECTS_CONSUMER_CONTRACT.md` and `tools/effects_gen.py` resolves
 * `sceneRef` only (verified at aeon `origin/master` `ab4a3520`, 2026-08-30 —
 * the contract's §8 amend is still due). So an agent calls the tool, is told
 * `changed: true`, and reasonably concludes the preset is installed. Nothing
 * installs it. That is `bg-binding.ts`'s defect class exactly: **a reply that
 * asserts an effect it cannot know reached anything.**
 *
 * ⚠ THIS CASE IS STRICTLY WEAKER THAN THE BACKGROUND ONE, WHICH IS WHY THE
 * DISCLOSURE IS NOT OPTIONAL HERE. `assign_section_bg` at least PAINTS: the
 * viewport composites the assigned background, so an author sees the assignment
 * take effect and only the ROM half is missing. A `rasterRef` has no such
 * consolation — the band-preset panel has no per-section control (ROADMAP row
 * 93's other half) and `NO_PREVIEW` says out loud that nobody in this suite has
 * ever seen a raster band render, so there is nothing on screen to see either.
 * Written and observed by nothing is the whole state of the binding today.
 *
 * ⚠ SAID ONCE, HERE. It is read by the agent replies (`agent-handler.ts`,
 * renderer), the published tool descriptions (`editor-methods.ts`, main) and
 * the band-preset panel's own author-facing limit
 * (`providers/effects-preset.ts`, `PRESET_LIMITS.unbound`). It lives in `core/`
 * for `bg-binding.ts`'s reason — main must not import the renderer — and the
 * panel reads it rather than keeping a second wording, which is the one thing
 * `bg-binding.ts` wanted and could not have (it had no panel sentence to fold).
 *
 * ⚠ THIS SENTENCE HAS AN EXPIRY AND IT IS SOMEONE ELSE'S FILE. The day aeon's
 * generator reads `rasterRef`, the second half of this text becomes the lie it
 * exists to prevent — pointed the other way. Re-check the two aeon files named
 * above whenever this constant is read in anger; do not treat the revision
 * above as current.
 */

export const RASTER_SECTION_BINDING_LIMIT =
  'Saving a preset does not install it, and neither does binding one. The per-section key is '
  + 'rasterRef: assign_section_preset writes it into that section\'s .meta.json sidecar, and stops '
  + 'there. NO aeon consumer reads a rasterRef yet — the key appears zero times in aeon\'s '
  + 'tools/EFFECTS_CONSUMER_CONTRACT.md and tools/effects_gen.py resolves sceneRef only — so nothing '
  + 'bakes this binding into a ROM, and a programmer still installs the preset by hand in aeon\'s '
  + 'ojz_effects.emp. Nor is there anything to look at: no control in the band-preset panel writes a '
  + 'rasterRef and nothing in this editor draws one, so unlike assign_section_bg (whose ref the '
  + 'viewport at least composites) this assignment changes nothing on screen either. Until aeon reads the key '
  + 'the preset document costs ROM whether or not anything installs it. Unlike assign_section_scene, '
  + 'which is baked.';
