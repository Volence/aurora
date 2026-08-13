# UX Overhaul — Stage 4 pre-planning notes

Carry-forward from Stage 3's task-by-task reviews (branch `feature/ux-overhaul-stage3`, 18 commits). Read alongside the spec (`docs/superpowers/specs/2026-08-12-aurora-ux-overhaul-design.md`) before writing the Stage 4 plan.

## Stage 4 scope (spec §12.4)

Re-home classic into the same workspace; the Composer pattern (chunk/block/tile editing) becomes the shared Art facet; palette editors, tool docks, and toolbars merge across engines. EXIT CRITERION: facet parity — same task, same UI, regardless of which engine (classic or aeon) the open project is. The undo-bus + three-history arrangement (spec §10) must be REPLACED, not bridged: sprite-history and classic-history join or unify with `DocumentHistoryHub` rather than staying separate histories the bus keeps in sync.

## What Stage 3 left for Stage 4 (deliberate)

- `LegacyWorkspace.tsx` is a thin classic wrapper (mounted keep-alive); `ClassicProjectView` + `Toolbar` + the classic panels underneath it are all still legacy, untouched by the facet workspace. `Toolbar` also serves double duty as the sprite-doc pane's app bar — its aeon zone/act-selector block is reachable ONLY from that pane (commented in-file where it's rendered).
- Toolbar-in-sprite-pane consequence: while editing a sprite doc, the visible zone/act selector is aeon's — switching acts there navigates the whole app away from the sprite doc. Odd UX; resolve when `Toolbar` is retired.
- The sprite-doc dirty confirm offers Discard/Cancel only, no Save option — save paths are context-dependent (sprite-art saver fires on `s1ArtSource != null`, not on the confirm dialog). Will smooth out once sprite saving unifies with the rest.
- Classic sprite-doc restore of an object not linked in the currently loaded zone: activation returns `false` and focus won't take. Accepted as a v1 edge case, not fixed.
- The sprite-undo merged timeline: switching act tabs mid-sprite-session hides pre-switch level edits from the merge view (a per-document consequence of the current history split; commented in `sprite-undo.ts`).
- Aeon still loads all acts eagerly on project open; laziness was never in scope for Stage 3 and remains untouched.

## Guard/flow unification debt

- `ProjectSetupTab`'s same-directory reopen runs its own NARROWER confirm (checks `classicDirty` only), predating the shared `project-open-guard` — unify onto the shared guard.
- Three parallel ask→save/discard→proceed flows exist today: the tab-activation act-switch guard, `project-open-guard`, and `ProjectSetupTab`'s local one. Consider one shared helper. Note `openPath`'s flow deliberately has NO supersession counter (commented at the call site) — any unification must preserve or consciously replace that.
- `agent-handler`'s classic-open-project command fails closed on dirty state (refuses rather than prompting); consider an explicit force/save flag for agent callers so automation isn't permanently blocked by a dirty doc.
- The open-guard's abort toast says "see earlier save errors" — mildly misleading in the sprite-checkout-still-open case, where no earlier error actually exists.

## Smaller debt

- `ObjectPalette`'s `selectedType` prop is dead (unused in the component body) — remove on next touch.
- `Explorer.tsx`'s activate router is five branches of if/else — worth table-driven dispatch if a sixth branch shows up.
- `classicProjectStore` ↔ `classicLevelStore` have a lazy circular import (commented as intentional in both files) — a coordinator module would break the cycle cleanly if it ever becomes a problem.
- `viewStore` has no `reset()` action; the one test that needs a clean slate sets store defaults directly via `setState`.
- TabStrip accessibility (Stage 2 watch-list gap #3: `role="tab"`/`aria-selected`/keyboard nav, ConfirmDialog focus trap) is STILL deferred to polish. Tab drag-reorder (Stage 2 watch-list #5) is still unbuilt.
- The `T` theme tokens + `Chip` primitive absorbed the workspace header styling; `FacetBar`'s pills remain intentionally bespoke (spec §11 calls for facet-switcher distinctness from generic chips) — not a gap, just worth remembering before "simplifying" it.

## Aeon BG store bridge + library normalization asymmetry

Surfaced while importing OJZ act1's actual in-game background into the editor's data model (one-off data import: added an `ingame-forest-v15-*` BG-library entry from the engine's `editor_bg_override.json` and repointed `section_0`).

- The editor↔engine BG stores are unsynchronized. The editor keeps its own BG state (the per-zone BG library `ojz_bglib.json` + `ojz_bg_<id>.bin`/`_tiles.bin`, and the act default `ojz_act1_bg*.bin`), while the engine keeps a SEPARATE authored BG in `games/sonic4/data/editor_bg_override.json`, which `tools/inject_editor_bg.py` transforms into `generated/ojz/act1/zone_bg.bin` + `bg_tiles.bin` and `act_assets.emp` embeds into the ROM. Editing the BG in Aurora and saving does NOT touch the engine's override, and re-authoring in-engine does NOT update the editor library — the two drift silently. A bridge is needed: a save-time export that writes `editor_bg_override.json` from the editor's active BG (inverting the transform: row-major→column-major, local→VRAM-absolute at `BG_TILE_BASE_SLOT`, BE byte-length tile header), and/or a load-time fallback that reads the generated `zone_bg.bin`/`bg_tiles.bin` (normalized) when no editor BG is present, so the editor shows what the game ships by default. Note also that the engine's BG tile-band animation (`inject_editor_bg.py` `anims`/`bganim_band`, HCZ-pillar technique) has NO editor representation at all — any bridge that round-trips the override must preserve, or consciously drop, those band definitions rather than silently discarding them.

- Library-entry layouts load WITHOUT `normalizeBgLayout`. In `load.ts`, the act-default BG runs `normalizeBgLayout(parseNametable(...), BG_TILE_BASE_SLOT)` (engine layouts use VRAM-absolute indices; editor convention is BG-blob-local), but the BG-library path calls `parseNametable(...)` directly with no normalization. That is fine for editor-saved entries (already local) and was fine for this import (the override JSON is already local, row-major — verified: 0-mismatch inverse-transform against `zone_bg.bin`), but it silently MISRENDERS any entry stored in engine convention (VRAM-absolute indices would show as tile `base+n`, past the 448-tile blob). Normalize on load in the library path too, for symmetry with the act default and robustness against engine-convention or hand-made entries.

## Process notes that mattered in Stage 3

- (a) The hardened worktree tripwire (cd-prefix every Bash call, absolute worktree paths, end-of-work master-HEAD check) held for the whole stage — zero master incidents across roughly 20 subagent runs.
- (b) Two-stage review caught real bugs before merge: an export-failure test gap, a false claim about `rootDir` being part of the FileAccess contract, an `addRecentProject`-ordering restore race, a phantom-dirty discard trap, a bypass of the edit-art guard, a boot-time viewport clobber, and two plan-authored wiring hazards — one of which (the `session-lifecycle.ts` reads-first restore ordering) was caught by an implementer, not a reviewer. Both reviews and implementer skepticism of the plan text are load-bearing; keep both.
- (c) Verbatim-port tasks (the aeon loader, the aeon save path) were parity-audited hunk-by-hunk against their renderer originals rather than trusted by inspection. Keep that discipline for classic's port in Stage 4 — it's the same shape of risk (moving working code without changing behavior).
- (d) Commit style stayed `type(scope): summary`, single line, no trailers, for the whole stage.

## Baseline at Stage 3 end

154 test files / 1319 passed / 2 skipped; `npx tsc --noEmit` clean.
