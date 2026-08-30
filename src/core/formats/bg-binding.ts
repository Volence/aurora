/**
 * WHAT A PER-SECTION BACKGROUND ASSIGNMENT DOES, AND WHERE IT STOPS.
 *
 * `assign_section_bg` returns a success reply, the editor composites the
 * assigned background, and the ref persists in the section's `.meta.json`
 * sidecar. All of that is real and none of it reaches a ROM: no aeon generator
 * reads `{zone}_bglib.json` or a sidecar's `bgLayoutRef` (the effects generator
 * says so explicitly, aeon `tools/EFFECTS_CONSUMER_CONTRACT.md:178`), and every
 * section of the shipped act still carries `sec_bg_layout: default` — "use the
 * act-wide BG" (aeon `games/sonic4/data/levels/ojz/act1/act_descriptor.emp:207`).
 * The background that DOES reach a ROM is the ACT-WIDE one, through
 * `{dataRoot}editor_bg_override.json` and aeon's `tools/inject_editor_bg.py`.
 *
 * So an agent calls the tool, is told `changed: true`, and reasonably concludes
 * the background is in the game. That is this parcel's defect class in its
 * fourth costume, and the one that shows the class is not only about servers:
 * **a reply that asserts an effect it cannot know reached anything.**
 *
 * `list_effects_presets` already solved this shape and its solution is the
 * model (`agent-handler.ts`, `PRESET_LIMITS.unbound`): where the scene tools
 * have a per-section column, the preset tool has a SENTENCE, because an
 * all-nulls column reads as "assigned to nothing" rather than "there is no
 * assignment to make" — and the two send an agent to different places.
 *
 * The difference here is that the assignment IS real and IS stored. The
 * sentence therefore says where it stops, not that it did nothing.
 *
 * ⚠ SAID ONCE, HERE, so nothing restates it. It is read by BOTH the agent
 * replies (`agent-handler.ts`, renderer) and the published tool descriptions
 * (`editor-methods.ts`, main process) — which is why it lives in `core/` and
 * not beside `PRESET_LIMITS` in `renderer/providers/`: main must not import the
 * renderer, and a second copy of the sentence in the description is exactly the
 * drift this module exists to prevent.
 *
 * The Properties panel's "Background" select (`properties-aeon.ts`) does NOT
 * yet render it — the panel has no equivalent wording to mirror, and giving the
 * select a hint slot is a UI change this parcel did not take. Recorded as a gap
 * a future change can close in one line rather than by re-authoring the words.
 */

export const BG_SECTION_BINDING_LIMIT =
  'This binding is an editor/preview assignment and stops at the editor\'s own files. '
  + 'It persists in the section\'s .meta.json sidecar and the viewport composites it, but no aeon '
  + 'generator reads a per-section bgLayoutRef and every section of the shipped act still carries '
  + 'sec_bg_layout: default, so nothing bakes it into a ROM. The background that DOES reach a ROM '
  + 'is the ACT-WIDE one (set_bg without a name, then aeon\'s tools/inject_editor_bg.py). Unlike '
  + 'assign_section_scene, which is baked.';
