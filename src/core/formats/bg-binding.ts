/**
 * WHAT A PER-SECTION BACKGROUND ASSIGNMENT DOES, AND WHERE IT STOPS.
 *
 * `assign_section_bg` returns a success reply, the editor composites the
 * assigned background, and the ref persists in the section's `.meta.json`
 * sidecar. All of that is real and none of it reaches a ROM: no aeon generator
 * reads `{zone}_bglib.json` or a sidecar's `bgLayoutRef` (the effects generator
 * says so explicitly in aeon `tools/EFFECTS_CONSUMER_CONTRACT.md` §2.2).
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

/*
 * ⚠ REWRITTEN 2026-09-25 (ROADMAP row 212, EXPIRY-LISTS-WITH-NO-READER). The
 * sentence said its evidence was that "every section of the shipped act still
 * carries sec_bg_layout: default". aeon DELETED `Sec.sec_bg_layout` on
 * 2026-09-16 (regions part 2 step 3; `engine/structs.emp`, Sec 26 -> 22), so an
 * MCP tool description and two agent replies cited a field that no longer
 * exists for nine days. The only automated reader was
 * `expect(BG_SECTION_BINDING_LIMIT).toMatch(/sec_bg_layout: default/)`, green
 * exactly while the clause was false and red on its repair. The conclusion (no
 * aeon build reads a sidecar's bgLayoutRef) was and is TRUE; only the evidence
 * rotted. It now names aeon's own statement of what its generator reads, and
 * the command that checks it, and `agent-handler.bg-binding.test.ts` re-derives
 * both halves from aeon origin/master: the contract sentence, and that no
 * non-test aeon tool reads a quoted "bgLayoutRef" key.
 *
 * "section-mode" on the last clause is load-bearing: on a region-mode act
 * (regions.json exists) aeon refuses a sidecar sceneRef, so assign_section_scene
 * bakes nothing there either (its own description says so).
 */
export const BG_SECTION_BINDING_LIMIT =
  'This binding is an editor/preview assignment and stops at the editor\'s own files. '
  + 'It persists in the section\'s .meta.json sidecar and the viewport composites it, but aeon\'s '
  + 'build does not read a sidecar\'s bgLayoutRef, so nothing bakes it into a ROM. aeon\'s '
  + 'tools/EFFECTS_CONSUMER_CONTRACT.md lists the sidecar keys its generator reads and says it does '
  + 'not read bgLayoutRef; grep -n bgLayoutRef over that file at a committed aeon revision checks it '
  + '(read at aeon a0c63764, 2026-09-25). The background that DOES reach a ROM '
  + 'is the ACT-WIDE one (set_bg without a name, then aeon\'s tools/inject_editor_bg.py). Unlike '
  + 'a section-mode assign_section_scene, which is baked.';
