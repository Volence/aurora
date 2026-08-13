# UX Overhaul — Stage 3 pre-planning notes

Carry-forward from Stage 2's final whole-branch review (branch `feature/ux-overhaul-stage2`, 24 commits, MERGE-READY verdict). Read alongside the spec (`docs/superpowers/specs/2026-08-12-aurora-ux-overhaul-design.md`) before writing the Stage 3 plan.

## Stage 3 scope (spec §12, stage 3)

Re-home aeon: Map/Art/Sprite content → Layout/Art facets + Library docs; aeon becomes a full profile (loading logic moves out of the renderer).

## Known gaps deferred out of Stage 2 (fix or absorb in Stage 3)

1. **Project-switch dirty guard gap.** Opening a *different project* while the classic doc is dirty bypasses the confirm guard entirely (`useProject.openPath` / `classicProjectStore.openDirectory` have no dirty check; only act switches are guarded via `tab-activation.ts`). Edits are lost silently on project switch. Cheapest fix: route project opens through the same confirm used by `activateLevelTarget`; also reset `classicLevelStore` inside `openDirectory` itself rather than ClassicProjectView's handle-identity effect (closes the stale-handle window when switching projects from sprite mode).
2. **aeon→aeon session-restore sliver.** `session-lifecycle.ts` gates the aeon session key on `project !== null`; switching directly between two aeon projects leaves the old project resident while the new one loads, so the restore can run in the load gap and be clobbered by the loader's first-act `setCurrentAct`. No in-app aeon→aeon switch UI exists today. Proper fix candidates: adopt the key at `setConfig` time while gating *restore* on `project`, or suppress the persist subscription during a load.
3. **TabStrip accessibility.** `role="tablist"` but tabs are divs with no `role="tab"`/`aria-selected`/keyboard navigation; close X is a span. ConfirmDialog lacks `aria-modal`/focus trap/Enter-activates-primary. Deferred to polish (spec §12 stage 6) unless Stage 3 touches the strip anyway.
4. **Sprite-art dirty dot lingers** on the loaded classic act tab while art is checked out even after save (`dirty-tabs.ts` — `s1ArtSource != null` is the only signal the stores expose). Resolves naturally when per-document stores land (Stages 3–4).
5. **Superseded-activation inertness**: a keyboard re-activation of the already-loaded act while the confirm dialog is open bumps the generation counter and inertifies the dialog's buttons (fails safe — cancel semantics). Noted by review; fix only if users hit it.
6. **Home engine chip uses emerald** (`HomeTab.tsx`, S1/AEON badge) — decoration under §11's strict rule; swap to a text token in polish.
7. **`saveAllDirty` result caveat** (documented in `project-runtime.ts`): `saved` means the saver RAN — classic/sprite savers encode failure in return values and toast themselves. Never gate destructive actions on `failed.length === 0`; use per-saver results (see `isSaveSuccess` in `tab-activation.ts`).

## Watch-list disposition from Stage 2

- #1 renderer-side facet registry: **still open — this is the heart of Stage 3.** Core `FacetDescriptor` is id/label/order; the canvas/right-panel/tool-set halves need a renderer registry keyed by `FacetCapability`.
- #2 per-tab persisted state (active facet, viewport): **still open for Stage 3** — extend `persistedTabSchema` with optional fields; decide versioning then. The storage key already carries `v1` (`aurora.session.v1:<dir>`) so a re-key is available.
- #3 sidecar parser merge: **done** (`readProjectConfig` in mapping.ts; `ProjectHandle.sidecar` carries config + per-entry issues; Setup tab renders them).
- #4 hub/coordinator ownership: **done** (`renderer/state/project-runtime.ts`; `documentHistoryHub` still has zero consumers — Stage 3 wires aeon histories onto it).
- #5 tab ergonomics: focus-by-index done (`requestFocusIndex`); **drag-reorder still unbuilt** (needs a reorder reducer in core session + strip DnD).
- #6 FacetCapability import path: renderer code still imports it nowhere; when Stage 3 starts, standardize on `core/project/adapter` (the canonical home).
- #7 `createRegistry.unregister`: still absent; add it if the facet renderer registry needs HMR-safe re-registration.

## Architecture facts Stage 3 planning must know

- **Everything opens through the activation guard**: `requestOpenTab` / `requestFocusTabId` / `requestFocusIndex` / `requestCloseTab` in `renderer/shell/tab-activation.ts`. Never call `sessionStore.open/close` directly from UI (the only sanctioned direct `open` is `useActTabSync`, which reflects already-completed act switches).
- `LegacyWorkspace.tsx` is the extraction of the old App ternary, mounted keep-alive; Stage 3 dissolves its aeon branches into facet modules — do not refactor it incrementally.
- `classic-save.ts` and `saveSpriteArt` never reject; failures are result variants. Any "save then act" flow must check the variant (`isSaveSuccess` convention).
- Project identity/session key = the exact directory string used to open (classic `dir` / aeon `config.basePath`); no normalization anywhere — key consistently.
- Tab ids are doc ids: `level:<zone>:<act>` (classic act = number, aeon act = string id), built/parsed ONLY via `renderer/shell/tabs.ts`.
- Tests are node-only (no jsdom). Shell logic lives in pure modules with tests; components stay thin and untested. Keep that split.

## Process notes that mattered in Stage 2

- Same worktree flow as Stage 1, but the implementer tripwire must be stronger than "check the branch": subagent shells START in the main tree, so every prompt must require (a) `cd <worktree> && ` prefix on EVERY Bash command, (b) absolute worktree paths for every file tool, (c) an end-of-work check that master's HEAD did not move. One Stage 2 agent still committed to live master before the hardened rules; recovery = cherry-pick into the branch, `git reset --hard` master.
- Two-stage review per task caught two plan-authored data-loss bugs (save-result fall-through in the act-switch guard; stale Setup edits crossing a project switch) and one restore race — reviews are load-bearing, keep them.
- Baseline at Stage 2 end: 144 test files / 1258 passed / 2 skipped; `npx tsc --noEmit` clean.
- Commit style `type(scope): summary`, single line, never any trailer.
