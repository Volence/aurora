<!--
Authored 2026-07-03 (Claude Fable 5). Design for ROADMAP.md Phase P1 (the non-collision
half). Contracts: aeon/structs.asm (Sec struct, objentry format), aeon LEVEL_EDITOR_SPEC §8
(entity formats — still accurate for entities), aeon design #9
(2026-07-02-object-behaviors-design.md) whose properties panel EXTENDS what this builds.
-->

# Entity Placement & Section Properties — Design

## Goal

Close Map mode's last authoring gaps: place/edit objects and rings **in the viewport**
(today they're display-only, edited as raw JSON), and surface the authored per-section
fields Aurora currently hides. This is also deliberate substrate: aeon design #9 turns
the read-only PropertiesPanel into a typed param form — build the panel + selection
model here so #9 only adds the schema-driven fields.

## Non-goals

Behavior params/bundles (design #9); object art previews via the sprite registry
(ROADMAP §4.4, needs the sprite export spine); any change to the on-disk JSON formats
(`section_{N}.objects.json` / `.rings.json` stay as-is — additive fields only).

## 1. Selection & editing model

- New map tool: **Entities** (keyboard `E`), coexisting with tile/collision tools.
  When active: click selects object/ring (nearest within 8px), drag moves, Del
  deletes, Esc clears. Shift-click multi-select; drag-marquee selects a group.
- **Placement**: drag an entry out of the existing object library palette onto the
  map (or click-to-arm then click-to-place). Rings place from a ring palette with
  pattern tools: single, row/column with spacing (default 24px, the classic gap),
  arc (radius + count). Patterns are ordinary rings once placed (no live pattern
  object on disk).
- **Commands**: one new undoable command `set-entities {sectionId, objects?, rings?}`
  carrying full replacement arrays for the touched section (sections are small;
  diffing is not worth the complexity). One undo step per gesture (a 30-ring arc = 1
  step).
- **Constraints enforced at edit time** (same rules the engine bake hard-fails on):
  x,y clamped to section-local 0–$7FF; object type index must exist in the act's
  library and be <32 per section type-table; subtype 0–255. X-sorting happens at
  save, not in the store.
- **Cross-section drag** moves the entity between `section_{N}` files (one command
  touching both sections' arrays — still one undo step).
- Flip flags (OEF_XFLIP/OEF_YFLIP) toggled with X/Y keys on selection (matching the
  tile-stamp convention).

## 2. Properties panel (right dock, Entities tool active)

Selection-sensitive inspector:
- **Object**: type (dropdown from library, shows id+name), subtype (numeric,
  0–255), X/Y (numeric, section-local), X-flip / Y-flip checkboxes. Multi-select
  edits common fields.
- **Ring**: X/Y only.
- Design #9 later injects the typed param form + behavior picker below these — keep
  the panel componentized (`EntityInspector` with an extension slot).

## 3. Section & act properties

New **Section** inspector tab (visible regardless of tool, follows selected section):
- `sec_flags` checkboxes: Water, Underground, No-Y-wrap, Preserve-state (`SF_*`,
  aeon structs.asm).
- `sec_music`: dropdown (track list — source from a `music.json` manifest if the
  engine ships one; else numeric with a name map in project.json; verify what design
  #7/#5 provide at implementation time).
- `sec_camera_lookahead`: numeric px (0 = zone default).
- Per-section BG override (already exists — move it here) and per-section parallax
  ref (string path now; becomes a dropdown of `*.parallax.json` when design #8 lands).
- Persistence: all of it in the existing `section_{N}.meta.json` (additive keys:
  `flags`, `music`, `cameraLookahead`, `parallaxRef`). **Engine-side note:** the
  current bake derives these Sec fields from its own tables, not from meta.json —
  wiring meta.json → `ojz_strip_gen.py` (or the act-descriptor generator that
  supersedes it) is a small engine-tools task; coordinate with the user before
  touching `ojz_strip_gen.py` (daemon-watched). Ship the UI + persistence first;
  the bake hook is its own commit.
- **Act properties** (Act tab): start position (draggable marker on the map +
  numeric fields; writes `project.json` startPosition), grid size (existing resize
  UI), zone name. Camera bounds intentionally absent — grid-derived in-engine.
- **New Act / New Zone wizard**: dialog (name, grid WxH, copy-palette-from) →
  writes `project.json` entry + skeleton editor files (empty sections). No hand-JSON.

## 4. MCP tools

`get_entities {section}` / `set_entities {section, objects?, rings?}` (validated,
one undo step), `get_section_meta` / `set_section_meta`. Design #9's
`get/set_object_props` will extend these, not replace them.

## 5. Acceptance

- Place, move, flip, multi-move, delete objects and rings entirely in-viewport;
  every gesture one undo step; save→reload round-trips byte-identically for
  untouched sections.
- Out-of-range placement is impossible (clamped) and library-invalid types are
  unselectable.
- Section flags/music/lookahead persist through save/reload; the bake consumes them
  (in-game verification: water flag audible/visible where the engine supports it).
- Wizard creates a loadable empty act that builds and boots.

## Plan seeds

1. Selection model + Entities tool + move/delete (objects). 2. Placement +
library-drag + flips. 3. Ring patterns. 4. Inspector panels + meta.json fields.
5. Wizard. 6. MCP tools + engine-side meta consumption (coordinated).
