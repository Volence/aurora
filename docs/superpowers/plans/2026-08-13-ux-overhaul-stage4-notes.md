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

## Process notes that mattered in Stage 3

- (a) The hardened worktree tripwire (cd-prefix every Bash call, absolute worktree paths, end-of-work master-HEAD check) held for the whole stage — zero master incidents across roughly 20 subagent runs.
- (b) Two-stage review caught real bugs before merge: an export-failure test gap, a false claim about `rootDir` being part of the FileAccess contract, an `addRecentProject`-ordering restore race, a phantom-dirty discard trap, a bypass of the edit-art guard, a boot-time viewport clobber, and two plan-authored wiring hazards — one of which (the `session-lifecycle.ts` reads-first restore ordering) was caught by an implementer, not a reviewer. Both reviews and implementer skepticism of the plan text are load-bearing; keep both.
- (c) Verbatim-port tasks (the aeon loader, the aeon save path) were parity-audited hunk-by-hunk against their renderer originals rather than trusted by inspection. Keep that discipline for classic's port in Stage 4 — it's the same shape of risk (moving working code without changing behavior).
- (d) Commit style stayed `type(scope): summary`, single line, no trailers, for the whole stage.

## Baseline at Stage 3 end

154 test files / 1319 passed / 2 skipped; `npx tsc --noEmit` clean.
