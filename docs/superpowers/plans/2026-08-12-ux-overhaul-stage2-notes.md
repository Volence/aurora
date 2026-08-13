# UX Overhaul — Stage 2 pre-planning notes

Carry-forward from Stage 1's final whole-stage review (Stage 1 merged to master 2026-08-12). Read alongside the spec (`docs/superpowers/specs/2026-08-12-aurora-ux-overhaul-design.md`) before writing the Stage 2 plan.

## Stage 2 scope (spec §12, stage 2)

Tab strip, explorer (grouped/filterable/collapsible), Home tab, ⌘K rewired, Project Setup tab + mapping layer wiring, session-persistence storage keyed by project path.

## Watch-list from the Stage 1 review

1. **Facet modules need a renderer half.** `FacetDescriptor` (core) is id/label/order only; the canvas view / right panel / tool set per facet must live in a renderer-side registry keyed by `FacetCapability` — core stays React-free. Plan that second registry deliberately.
2. **Persistence will grow per-tab state** (active facet, viewport). `persistedTabSchema` is strictObject — extend with *optional* fields, and decide versioning when the schema grows (older builds currently reset wholesale on unknown shapes).
3. **Merge the sidecar parsers.** `s1/index.ts` `readSidecar()` (authoritative today, paths channel) vs `core/project/mapping.ts` (v2 schema, unwired). Project Setup work must retire one, and revisit mapping's all-or-nothing null failure in favor of per-entry diagnostics (red rows in the Setup UI need to know *which* entry failed).
4. **Hub/coordinator singleton ownership.** `DocumentHistoryHub` and `SaveCoordinator` have no home instance yet — decide project-scoped ownership when the shell lands. Note: the hub holds aeon `EditHistory` only; sprite/classic histories need generalization or unification before Stages 3–4 rewire them (see the hub's header comment).
5. **Tab ergonomics.** `Ctrl+1..9` needs a focus-by-index helper over `focusTab`; no reorder reducer exists yet if drag-reorder is wanted.
6. **`FacetCapability` import path.** Canonical home is `core/project/adapter.ts` (facets.ts re-exports). Pick ONE import path for renderer code and stick to it.
7. **`createRegistry` lacks `unregister`** — SaveCoordinator hand-rolls registration because of it; consider growing the factory if more behavioral registries appear.

## Process notes that mattered in Stage 1

- Execute in a git worktree (`git worktree add .claude/worktrees/<name> -b <branch> HEAD`, symlink node_modules from the main tree — npm install hits a pre-existing electron-vite/vite-8 peer conflict). Give every implementer subagent a MANDATORY tripwire: verify `git branch --show-current` before any command; one agent committed to the user's live branch without it.
- Baseline at Stage 1 merge: 135 test files / 1179 passed / 2 skipped; `npx tsc --noEmit` clean.
- Commit style `type(scope): summary`, single line, never any trailer.
