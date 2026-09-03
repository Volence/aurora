# O49 — the 101 harnesses nobody could run by name

**Branch** `fix/o49-harness-registration` · **2026-09-03** · aurora

At master `e1cd7861` this repo carried **145 tracked harness-like files** under
`scratchpad/` (`*-harness.mjs`, `*-probe.mjs`, `*-proof.mjs`). **44** were
reachable by a `package.json` script. **101 were not runnable by name by
anyone.** O48c fixed exactly one family — nine collision scripts, commit
`e89b70ea` — and was capped there on purpose. This is the rest, plus the gate
that stops it recurring.

The counts were re-derived here from `git ls-files` and from the script table
in `package.json`, not adopted: **145 / 44 / 101**, matching the dispatch.

---

## 1. Why this is not cosmetic

Both prices were paid inside twenty-four hours and both are in
`docs/lane-log.jsonl`:

- **`vsplit-advisory-harness` sat RED for six days at 30/31**, holding a rule
  that had been overturned on 2026-08-27 at `7ba5a638`. The repair had dropped a
  parameter so stale call sites would fail to compile — which works for
  TypeScript and **does not reach a `.mjs` harness**. The entry's own account of
  why nobody saw it: *"THE HARNESS WAS NOT IN package.json so nobody could run
  it — verified by me at `b0e1b0c1`: zero occurrences."*
- **Registering nine collision harnesses immediately surfaced a tenth finding.**
  `crossover-paint` had **never** been runnable on a clean checkout — its own
  anti-vacuous row `[2c]` is what said so, and it had only ever "passed" against
  a tree a previous session had painted into. Unregistered, nothing swept it, so
  nothing asked.

The pattern is the one this repo already names elsewhere: *a check that nobody
runs is the empty population*. A harness with no name is worse than a missing
test, because the repo believes it has coverage.

---

## 2. How the three buckets were derived

Filenames were **not** used to classify. The dispatch was explicit about that,
and it was right to be: `zone-blocks-probe.mjs` opens with a header copied
wholesale from the collision-needle harness, and `_select-key-probe.mjs`
declares itself *"THROWAWAY probe (not committed)"* while being committed.
Prose about a file is not evidence about a file.

**The discriminator is measured from the source: does the file GATE?** — does it
exit non-zero when *its own subject-matter claim* is false, as opposed to
exiting 0 whatever it found, or exiting non-zero only when the measurement could
not be *taken* (no socket, no owned port, no app)?

That test separates the population **with zero exceptions**:

| | gates | does not gate |
|---|---|---|
| **the 44 already registered** | 44 | 0 |
| **the 101 unregistered** | 77 | 24 |

Every one of the 44 files the repo had already chosen to register has the gating
shape. That is not a rule I imposed — it is the convention the repo had already
converged on, recovered by reading it. So "gates" is the operational meaning of
**LIVE**, and it is why registering a report-only probe would be wrong rather
than merely untidy: it would add a script that **can never go red**, which is
the vacuous-instrument shape three separate packets in `docs/reviews/` were
written to stamp out.

Each row below therefore carries two pieces of evidence: **the source line that
gates** (or the absence of one), and **the in-repo document that cites the
file**. Where the citation column says *"only the O16 mass-edit table"*, the
only doc naming that file is `docs/reviews/2026-08-29-harness-hazards.md`, which
lists ~96 launchers it bulk-edited — that is a record of a mass edit, not
evidence about the file's purpose, and it is discounted throughout.

⚠ **One method correction, recorded.** The gate-line column is extracted
automatically, and the first extractor missed multi-line
`if (fails.length) { … process.exitCode = 1; }` blocks and the tallies spelled
`fail` / `passed !== rows.length` / `fail === 0 ? 0 : 1`. It reported nine
registered files as ungated. All nine were resolved **by hand** and all nine do
gate; the extractor was widened and re-run, and the table below is from the
widened run. `crash-harness.mjs` is annotated by hand because its rows `throw`
and its gate is therefore the catch handler — the one file where the automated
column would still be wrong.

### Counts

| bucket | count |
|---|---|
| **LIVE** — gates; a standing instrument for a shipped surface | **121** |
| ├─ already registered before this parcel | 44 |
| └─ registered by this parcel | 77 |
| **RETIRED** — report-only, and an in-repo record says what closed it | **20** |
| **UNCLASSIFIABLE** — report-only, and nothing records what closed it | **4** |
| **total** | **145** |

---

## 3. LIVE — registered by this parcel (77)

Naming follows the 44: `harness:<basename minus the -harness/-probe/-proof
suffix>`. No slug collisions; `marquee` and `marquee-flip-button` sit beside the
existing `marquee-flip` and `marquee-snap-modifier` without shadowing them.

| file | script | gates at | cited by |
|---|---|---|---|
| `aeon-priority-lens-harness.mjs` | `harness:aeon-priority-lens` | L702 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, 2026-08-28-priority-lens.md |
| `animated-art-harness.mjs` | `harness:animated-art` | L412 `if (fails.length) process.exit(1);` | — (only the O16 mass-edit table) |
| `art-agent-harness.mjs` | `harness:art-agent` | L303 `process.exit(passed === rows.length ? 0 : 1);` | 2026-08-29-agent-paint-priority.md, 2026-08-18-art-agent-surface.md, 2026-08-19-set-block-collision.md |
| `band-art-foreground-harness.mjs` | `harness:band-art-foreground` | L1005 `process.exit(fails.length === 0 ? 0 : 1);` | ROADMAP.md |
| `bg-dangling-ref-harness.mjs` | `harness:bg-dangling-ref` | L404 `if (fails.length) { console.log('FAILED:\n  ' + fails.join('\n  ')); process` | 2026-08-30-o31-dangling-bg-refs.md |
| `bg-override-paints-harness.mjs` | `harness:bg-override-paints` | L647 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, lane-log.jsonl |
| `bg-tile-picker-harness.mjs` | `harness:bg-tile-picker` | L676 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md |
| `bganim-band-harness.mjs` | `harness:bganim-band` | L722 `if (fails.length) {` → L725 `process.exitCode = 1;` | ROADMAP.md |
| `bganim-band-lens-harness.mjs` | `harness:bganim-band-lens` | L1130 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, 2026-08-26-effects-foreground-checks.md |
| `bganim-insert-roomy-harness.mjs` | `harness:bganim-insert-roomy` | L530 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md |
| `bganim-motion-harness.mjs` | `harness:bganim-motion` | L757 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md |
| `bganim-phase-shift-harness.mjs` | `harness:bganim-phase-shift` | L422 `process.exit(fails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `bganim-rate-shift-harness.mjs` | `harness:bganim-rate-shift` | L548 `if (fails.length) {` → L551 `process.exitCode = 1;` | ROADMAP.md |
| `bganim-strip-range-harness.mjs` | `harness:bganim-strip-range` | L1044 `process.exit(fails.length === 0 ? 0 : 1);` | — (only the O16 mass-edit table) |
| `bganim-tile-door-harness.mjs` | `harness:bganim-tile-door` | L696 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md |
| `bganim-ui-authored-composition-harness.mjs` | `harness:bganim-ui-authored-composition` | L462 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, lane-log.jsonl |
| `boot-override-harness.mjs` | `harness:boot-override` | L251 `if (fails.length) process.exitCode = 1;` | — (only the O16 mass-edit table) |
| `build-console-overlap-harness.mjs` | `harness:build-console-overlap` | L595 `process.exitCode = fails.length ? 1 : 0;` | ROADMAP.md, 2026-08-27-build-console-overlap.md |
| `camera-harness.mjs` | `harness:camera` | L184 `if (fails.length) process.exitCode = 1;` | 2026-08-15-art-authoring-phase1-paint-through.md |
| `camera-preview-harness.mjs` | `harness:camera-preview` | L667 `process.exitCode = fails.length ? 1 : 0;` | ROADMAP.md, lane-log.jsonl, 2026-08-27-camera-preview.md |
| `canvas-cdp-harness.mjs` | `harness:canvas-cdp` | L1048 `if (fails.length \|\| negFails.length) process.exitCode = 1;` | ROADMAP.md, lane-log.jsonl, 2026-08-15-canvas-cdp-report.md |
| `capture-harness.mjs` | `harness:capture` | L515 `if (fails.length) process.exitCode = 1;` | — (only the O16 mass-edit table) |
| `chunk-links-harness.mjs` | `harness:chunk-links` | L566 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, lane-log.jsonl |
| `chunkgrid-hint-harness.mjs` | `harness:chunkgrid-hint` | L275 `if (fails.length) process.exit(1);` | ROADMAP.md |
| `classic-playtest-harness.mjs` | `harness:classic-playtest` | L532 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, 2026-08-19-classic-playtest-links.md, 2026-08-31-liveness-assertions.md |
| `commit-cdp-harness.mjs` | `harness:commit-cdp` | L224 `process.exit(bad.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `composer-fill-harness.mjs` | `harness:composer-fill` | L334 `if (negFails.length \|\| (MODE === 'after' && fails.length)) process.exitCod` | 2026-08-15-art-authoring-phase1-paint-through.md, 2026-08-15-paint-through-cdp-report.md, 2026-08-18-art-agent-surface.md |
| `constraints-cdp-harness.mjs` | `harness:constraints-cdp` | L507 `process.exitCode = fails.length \|\| negFails.length ? 1 : 0;` | 2026-08-15-constraints-cdp-report.md, 2026-08-15-phase-2c-resolve-and-commit-design.md |
| `crash-harness.mjs` | `harness:crash` | L103 `if (lvl.status !== 'ready') throw …` → L115 `catch → process.exitCode = 1` (rows THROW; verified by hand) | 2026-08-09-classic-v1.1-batch.md |
| `curve-editor-harness.mjs` | `harness:curve-editor` | L895 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, 2026-08-28-curve-editor.md |
| `curve-vsplit-reachable-harness.mjs` | `harness:curve-vsplit-reachable` | L945 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, lane-log.jsonl, 2026-08-27-curve-vsplit-reachable.md |
| `effects-column-harness.mjs` | `harness:effects-column` | L1516 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, 2026-08-26-effects-foreground-checks-2.md |
| `effects-deform-harness.mjs` | `harness:effects-deform` | L868 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, lane-log.jsonl, 2026-08-27-effects-deform-authoring.md |
| `effects-scene-harness.mjs` | `harness:effects-scene` | L861 `if (fails.length) { console.log('FAILED:\n  ' + fails.join('\n  ')); process` | ROADMAP.md |
| `explorer-canvases-harness.mjs` | `harness:explorer-canvases` | L43 `process.exit(bad.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `guard-surface-harness.mjs` | `harness:guard-surface` | L424 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, lane-log.jsonl, 2026-08-27-guard-surface-gaps.md |
| `handover/handover-band-harness.mjs` | `harness:handover-band` | L499 `process.exit(fails.length ? 1 : 0);` | lane-log.jsonl |
| `import-cdp-harness.mjs` | `harness:import-cdp` | L54 `process.exit(bad.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `layer-bound-harness.mjs` | `harness:layer-bound` | L801 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, 2026-08-28-layer-guide-bound.md |
| `live-palette-e2e-harness.mjs` | `harness:live-palette-e2e` | L283 `if (fails.length) process.exit(1);` | — (only the O16 mass-edit table) |
| `mapviewport-baseline-harness.mjs` | `harness:mapviewport-baseline` | L1318 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, lane-log.jsonl |
| `marquee-flip-button-harness.mjs` | `harness:marquee-flip-button` | L723 `process.exitCode = fails.length ? 1 : 0;` | ROADMAP.md, 2026-08-28-marquee-flip-buttons.md |
| `marquee-harness.mjs` | `harness:marquee` | L859 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, 2026-08-28-marquee-preview-tiles.md |
| `marquee-stamp-harness.mjs` | `harness:marquee-stamp` | L378 `process.exit(fails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `micro-type-harness.mjs` | `harness:micro-type` | L235 `if (fails.length) process.exit(1);` | 2026-08-19-handoff-after-collision.md |
| `numberfield-empty-harness.mjs` | `harness:numberfield-empty` | L187 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md |
| `object-label-harness.mjs` | `harness:object-label` | L663 `if (fails.length) { console.log('FAILED:\n  ' + fails.join('\n  ')); process` | ROADMAP.md |
| `paint-regression-harness.mjs` | `harness:paint-regression` | L78 `process.exit(bad.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `paint-through-harness.mjs` | `harness:paint-through` | L390 `if (fails.length \|\| negFails.length) process.exitCode = 1;` | 2026-08-15-art-authoring-phase1-paint-through.md, 2026-08-15-canvas-cdp-report.md, 2026-08-15-paint-through-cdp-report.md |
| `palette-drag-harness.mjs` | `harness:palette-drag` | L301 `process.exit(fails.length \|\| negFails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `palette-grid-harness.mjs` | `harness:palette-grid` | L578 `process.exit(fails.length \|\| negFails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `palette-push-harness.mjs` | `harness:palette-push` | L201 `if (fails.length) process.exit(1);` | — (only the O16 mass-edit table) |
| `priority-lens-harness.mjs` | `harness:priority-lens` | L299 `if (fails.length) process.exit(1);` | ROADMAP.md, 2026-08-28-priority-lens.md |
| `restore-harness.mjs` | `harness:restore` | L139 `if (fails.length) process.exitCode = 1;` | — (only the O16 mass-edit table) |
| `s1-anim-harness.mjs` | `harness:s1-anim` | L312 `process.exit(fails.length ? 1 : 0);` | 2026-08-20-s1-animation-audit.md |
| `s1-boss-sprites-harness.mjs` | `harness:s1-boss-sprites` | L262 `process.exit(fails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `s1-layout-anim-harness.mjs` | `harness:s1-layout-anim` | L416 `if (fails.length) process.exit(1);` | 2026-08-22-aeon-effects-survey-verification.md |
| `s1-library-presentation-harness.mjs` | `harness:s1-library-presentation` | L342 `process.exit(fails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `s1-nonlevel-families-harness.mjs` | `harness:s1-nonlevel-families` | L361 `process.exit(fails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `s1-priority-occlusion-harness.mjs` | `harness:s1-priority-occlusion` | L706 `if (fails.length) process.exit(1);` | ROADMAP.md, 2026-08-22-aeon-effects-survey-verification.md |
| `s1-saveback-cdp-harness.mjs` | `harness:s1-saveback-cdp` | L400 `process.exit(fails.length === 0 ? 0 : 1);` | — (only the O16 mass-edit table) |
| `s1-sonic-preview-harness.mjs` | `harness:s1-sonic-preview` | L321 `process.exit(fails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `s1-sonic-sprite-harness.mjs` | `harness:s1-sonic-sprite` | L254 `process.exit(fails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `screen-frame-guides-harness.mjs` | `harness:screen-frame-guides` | L724 `if (fails.length) process.exitCode = 1;` | ROADMAP.md, 2026-08-27-screen-frame-guides.md |
| `screen-frame-harness.mjs` | `harness:screen-frame` | L330 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, lane-log.jsonl |
| `section-column-harness.mjs` | `harness:section-column` | L1647 `if (fails.length) { console.log(`\nfailed rows:\n  ${fails.join('\n  ')}`); ` | OVERSEER.md, ROADMAP.md, 2026-08-22-non-facet-section-columns.md |
| `section-header-action-harness.mjs` | `harness:section-header-action` | L660 `if (fails.length) {` → L663 `process.exit(1);` | ROADMAP.md |
| `shell-flip-harness.mjs` | `harness:shell-flip` | L632 `if (fails.length) process.exitCode = 1;` | — (only the O16 mass-edit table) |
| `slot-range-onscreen-harness.mjs` | `harness:slot-range-onscreen` | L212 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, lane-log.jsonl |
| `sprite-restore-harness.mjs` | `harness:sprite-restore` | L308 `process.exit(fails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `sweep-fix-harness.mjs` | `harness:sweep-fix` | L435 `process.exitCode = fails.length === 0 ? 0 : 1;` | — (only the O16 mass-edit table) |
| `tier-zoom-harness.mjs` | `harness:tier-zoom` | L62 `process.exit(bad.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `tile-editor-harness.mjs` | `harness:tile-editor` | L428 `if (fails.length \|\| negFails.length) process.exitCode = 1;` | 2026-08-15-paint-through-cdp-report.md |
| `tool-keys-harness.mjs` | `harness:tool-keys` | L327 `if (fails.length) { console.log(`FAILED: ${fails.join(', ')}`); process.exit` | — (only the O16 mass-edit table) |
| `tool-split-harness.mjs` | `harness:tool-split` | L204 `if (fails.length) process.exitCode = 1;` | 2026-08-13-ux-overhaul-stage4-plan5-slot-parity-and-classic-rehome.md |
| `warp-tearing-harness.mjs` | `harness:warp-tearing` | L511 `if (fails.length) process.exit(1);` | 2026-08-22-oracle-instrument-gaps.md |
| `writer-originated-scene-harness.mjs` | `harness:writer-originated-scene` | L1032 `process.exit(fails.length ? 1 : 0);` | 2026-08-27-guard-surface-gaps.md |

---

## 4. LIVE — already registered before this parcel (44)

Listed for completeness, because a bucket that does not sum to 145 is not a
classification. Every one gates; none needed a change.

| file | script | gates at | cited by |
|---|---|---|---|
| `aether-method-gate-proof.mjs` | `harness:aether-method-gate` | L209 `process.exit(fails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `band-preset-harness.mjs` | `harness:band-preset` | L742 `if (fails.length) { console.log(fails.join('\n')); process.exitCode = 1; }` | ROADMAP.md, lane-log.jsonl, 2026-08-29-band-preset-panel.md |
| `bg-wrap-harness.mjs` | `harness:bg-wrap` | L436 `if (fails.length) { console.log('FAILED:'); for (const f of fails) console.l` | ROADMAP.md, 2026-08-30-o21-bg-wrap-visibility.md |
| `collision-agent-harness.mjs` | `harness:collision-agent` | L548 `process.exit(passed === rows.length ? 0 : 1);` | ROADMAP.md, 2026-08-19-handoff-after-collision.md, 2026-08-29-agent-paint-priority.md |
| `collision-destructive-harness.mjs` | `harness:collision-destructive` | L863 `process.exit(fails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `collision-edit-harness.mjs` | `harness:collision-edit` | L314 `if (fails.length) process.exit(1);` | 2026-08-17-commit-collision-remediation.md |
| `collision-gesture-harness.mjs` | `harness:collision-gesture` | L1237 `process.exit(passed === rows.length ? 0 : 1);` | ROADMAP.md, 2026-08-19-handoff-after-collision.md, 2026-09-02-o48-collision-gesture.md |
| `collision-legibility-harness.mjs` | `harness:collision-legibility` | L644 `process.exitCode = fails.length ? 1 : 0;` | 2026-08-28-collision-legibility.md, 2026-08-28-collision-mark-normal-first.md |
| `collision-lens-harness.mjs` | `harness:collision-lens` | L269 `if (fails.length) process.exit(1);` | 2026-08-17-classic-collision-editing.md |
| `collision-mark-normal-harness.mjs` | `harness:collision-mark-normal` | L857 `process.exitCode = fails.length ? 1 : 0;` | ROADMAP.md, 2026-08-28-collision-mark-normal-first.md |
| `collision-needle-harness.mjs` | `harness:collision-needle` | L229 `if (fails.length) process.exit(1);` | 2026-08-17-classic-collision-lens.md |
| `collision-preservation-harness.mjs` | `harness:collision-preservation` | L622 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, 2026-08-28-collision-word-preservation.md |
| `collision-read-harness.mjs` | `harness:collision-read` | L684 `if (fails.length) {` → L687 `process.exitCode = 1;` | ROADMAP.md, 2026-08-29-collision-read.md |
| `commit-collision-harness.mjs` | `harness:commit-collision` | L340 `if (passed !== rows.length) process.exit(1);` | ROADMAP.md, 2026-08-19-handoff-after-collision.md, 2026-08-18-art-agent-surface.md |
| `composer-collision-gesture-harness.mjs` | `harness:composer-collision-gesture` | L569 `if (fails.length) { console.log(`FAILED: ${fails.join(', ')}`); process.exit` | 2026-09-02-o48-collision-gesture.md |
| `composer-priority-harness.mjs` | `harness:composer-priority` | L579 `if (fails.length) { console.log(`FAILED: ${fails.join(', ')}`); process.exit` | — (only the O16 mass-edit table) |
| `crossover-paint-harness.mjs` | `harness:crossover-paint` | L503 `process.exit(fail === 0 ? 0 : 1);` | lane-log.jsonl, 2026-08-29-crossover-paint-loop.md, 2026-09-02-o48d-crossover-fixture.md |
| `curve-option-disabled-harness.mjs` | `harness:curve-option-disabled` | L606 `if (fails.length) { console.log(fails.join('\n')); process.exitCode = 1; }` | 2026-08-29-curve-option-disabled.md |
| `discovery-exit-net-proof.mjs` | `harness:discovery-exit-net` | L190 `process.exit(fails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `effects-bob-harness.mjs` | `harness:effects-bob` | L468 `if (fails.length) {` → L471 `process.exitCode = 1;` | ROADMAP.md |
| `effects-drift-harness.mjs` | `harness:effects-drift` | L599 `process.exit(fails.length ? 1 : 0);` | 2026-09-02-effects-drift-control.md |
| `effects-guide-harness.mjs` | `harness:effects-guide` | L406 `process.exit(fails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `effects-guides-harness.mjs` | `harness:effects-guides` | L866 `process.exit(fails.length ? 1 : 0);` | OVERSEER.md, ROADMAP.md, 2026-08-26-effects-foreground-checks.md |
| `effects-preview-default-harness.mjs` | `harness:effects-preview-default` | L593 `process.exit(fails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `effects-refusal-harness.mjs` | `harness:effects-refusal` | L488 `process.exit(fails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `effects-section-picker-harness.mjs` | `harness:effects-section-picker` | L603 `process.exit(fails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `effects-section-strip-harness.mjs` | `harness:effects-section-strip` | L600 `process.exit(fails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `effects-sub-tabs-harness.mjs` | `harness:effects-sub-tabs` | L554 `process.exit(fails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `harness-guard-proof.mjs` | `harness:guard-proof` | L451 `process.exit(fails.length ? 1 : 0);` | OVERSEER.md, ROADMAP.md, 2026-08-30-xvfb-display-leak.md |
| `loop-paint-harness.mjs` | `harness:loop-paint` | L952 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, 2026-08-29-loop-paint.md |
| `marquee-flip-harness.mjs` | `harness:marquee-flip` | L866 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, 2026-08-28-marquee-flip-buttons.md, 2026-08-28-marquee-flip.md |
| `marquee-snap-modifier-harness.mjs` | `harness:marquee-snap-modifier` | L744 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md |
| `ozone-x11-proof.mjs` | `harness:ozone-x11` | L239 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, lane-log.jsonl |
| `paste-pan-harness.mjs` | `harness:paste-pan` | L519 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md |
| `raster-timeline-harness.mjs` | `harness:raster-timeline` | L654 `if (fails.length) { console.log('FAILED:\n  ' + fails.join('\n  ')); process` | ROADMAP.md, 2026-08-28-raster-timeline-view.md |
| `save-file-count-harness.mjs` | `harness:save-file-count` | L464 `process.exit(fails.length ? 1 : 0);` | 2026-09-02-save-writes-only-what-changed.md |
| `section-raster-select-harness.mjs` | `harness:section-raster-select` | L715 `process.exit(fails.length ? 1 : 0);` | OVERSEER.md, ROADMAP.md, lane-log.jsonl |
| `tile-attribute-harness.mjs` | `harness:tile-attributes` | L1138 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, 2026-08-28-tile-attributes.md, 2026-08-29-agent-paint-priority.md |
| `timeline-edit-harness.mjs` | `harness:timeline-edit` | L882 `if (fails.length) { console.log('FAILED:\n  ' + fails.join('\n  ')); process` | ROADMAP.md, lane-log.jsonl |
| `toast-overflow-harness.mjs` | `harness:toast-overflow` | L327 `if (fails.length) { console.log('FAILED:\n  ' + fails.join('\n  ')); process` | lane-log.jsonl |
| `variant-cycle-harness.mjs` | `harness:variant-cycle` | L793 `process.exit(fails.length ? 1 : 0);` | lane-log.jsonl, 2026-09-02-preset-lag-retired.md, 2026-09-02-variant-cycle-controls.md |
| `vsplit-advisory-harness.mjs` | `harness:vsplit-advisory` | L1085 `process.exit(fails.length ? 1 : 0);` | ROADMAP.md, 2026-08-28-vsplit-advisory.md, 2026-08-30-o15-advisory-shape.md |
| `window-icon-probe.mjs` | `harness:window-icon` | L210 `process.exit(fails.length ? 1 : 0);` | — (only the O16 mass-edit table) |
| `xvfb-reap-proof.mjs` | `harness:xvfb-reap` | L420 `process.exit(fail ? 1 : 0);` | — (only the O16 mass-edit table) |

---

## 5. RETIRED (20)

None of these gates. Each answered a question, the answer is written down
somewhere in this repo, and the file is kept for its record. **The reason for
each is carried in `RETIRED_UNREGISTERED` in
`scratchpad/check-harness-guards.mjs` — that is the enforced copy, printed on
every `npm test`, and it is where a future reader should look.** Summarised
here with what closed it:

| file | report-only because | what closed it |
|---|---|---|
| `_select-key-probe.mjs` | `process.exit(0)` unconditionally | `docs/reviews/2026-08-27-curve-vsplit-reachable.md` §5 quotes its output verbatim (L308) and its table calls it *"committed so they can be re-derived rather than believed"*; the standing instrument for that row is `harness:curve-vsplit-reachable` |
| `band-lens-harness.mjs` | `process.exit(0)` at L178; its only `exit(1)` is *"FATAL: no socket"* | `docs/OVERSEER-LOG.md`: **"TAGGED QUESTION CLOSED 2026-08-27 — the band STEPS, proven with a control run"**, naming this file and `band-step-proof.mjs` as its two instruments |
| `band-step-proof.mjs` | prints `VERDICT:` and exits 0 on **all three** of STEPS / UNDETERMINED / did-NOT-step | same closure as above, same sentence |
| `band-rate-shift-probe.mjs` | writes `rate-shift.json`, `exit(0)`; its non-zero exits are all `FATAL`/`BLOCKED` | answered ROADMAP row 43's untested `rate_shift` tail; packet `docs/reviews/2026-08-27-rate-shift-watched.md` |
| `bganim-marquee-resolution-probe.mjs` | its `exit(3)` gates **the decode being proven**, not the marquee percentages it reports — its own note says the percentages *"must NOT be read as a verdict"* | packet `docs/reviews/2026-08-26-bganim-marquee-resolution.md` |
| `block-fanout-probe.mjs` | prints a JSON census; **no exit code at all** | `docs/reviews/2026-08-19-handoff-after-collision.md` L198: *"A block fan-out census decided one design question outright"* |
| `bus-probe.mjs` | `exit(0)` after printing the advertised method list | superseded as a standing check by `harness:aether-method-gate`, which derives the method **set** the run needs instead of printing a count (that file's own header: *"A COUNT IS NOT A CAPABILITY"*). **This is my inference from the two files' stated purposes, not a doc citation** |
| `effects-strip-delta-probe.mjs` | self-declared: *"This is a MEASUREMENT, not a gate"* | step 1 of EW-SHAPE-STRIP; the shipped surface is gated by `harness:effects-section-strip`, packet `docs/reviews/2026-09-02-effects-section-strip.md` |
| `effects-subtabs-geometry-probe.mjs` | self-declared: *"A MEASUREMENT. It asserts nothing"* | shipped surface gated by `harness:effects-sub-tabs`, packet `docs/reviews/2026-09-02-effects-sub-tabs.md` |
| `fromtile-typing-probe.mjs` | prints `VERDICT: NO SNAP` / `SNAPS` then `exit(0)` either way | ROADMAP item 40, **DELIVERED 2026-08-27** — the tagged typing wrinkle it was written for |
| `guide-aim-probe.mjs` | first line of its header: *"DIAGNOSTIC, NOT A GATE"*; only non-zero exit is `PROBE ERROR` | aimed at ROADMAP row 43's layer-guide drag |
| `init-probe.mjs` | `exit(0)` after printing the `initialize` reply's keys | `docs/OVERSEER-LOG.md` L432–436: *"the parcel is CLOSED … Probe: `scratchpad/init-probe.mjs`"* |
| `label-measure-probe.mjs` | self-declared: *"no assertions, just numbers"* | ROADMAP §5.1 item 17, **DELIVERED 2026-08-22**; its standing instrument is `harness:object-label` |
| `loop-cell-probe.mjs` | only non-zero exit is `UNMEASURABLE` | `docs/reviews/2026-08-19-handoff-after-collision.md` L199: *"a layout census showed a shipped warning was unreachable in stock data — which is why a harness row now authors the condition itself"* |
| `marquee-paste-probe.mjs` | diffs the whole canvas and prints a bounding box; non-zero only on `PROBE ERROR` | written to diagnose `marquee-harness` rows 5b/6a; ROADMAP item 74 **DELIVERED 2026-08-28**, and `harness:marquee` is the standing instrument |
| `row8-probe.mjs` | *"no clicks at all"*; non-zero only on `PROBE ERROR` | diagnosed `sprite-restore-harness` rows 7→8, which exist and assert today (rows `7`, `8a`, `8b` at L245/264/287) under `harness:sprite-restore` |
| `s1-vplayer-spike-probe.mjs` | writes `s1-vplayer-spike.json` and `exit(0)`; its non-zero exits are `BLOCKED` / `UNDETERMINED`, i.e. the measurement could not be taken | item 48's gate spike; packet `docs/reviews/2026-08-27-s1-vplayer-spike.md` |
| `skipped-cells-probe.mjs` | prints `[VERDICT] field-on-wire=…` and never gates on it | `skippedCells` shipped at `8efda9d` (`docs/reviews/2026-08-19-handoff-after-collision.md` L19) |
| `storage-flush-probe.mjs` | **no exit code at all**; its own header calls it *"a 40-line control for ONE question the canvas harness could not answer about itself"* | cited by `docs/superpowers/plans/2026-08-15-canvas-cdp-report.md` |
| `zone-blocks-probe.mjs` | ⚠ **it looks like a gate and is not** — see §6 | `docs/superpowers/plans/2026-08-17-classic-collision-editing.md` §3: *"Refuse the table growth"* |

---

## 6. UNCLASSIFIABLE (4)

I can say what these are **not**: none of them gates, so none is a standing
instrument and registering any of them would add a script that cannot go red.
What I cannot say is whether their investigation ever closed — **no packet,
ROADMAP row or lane-log entry names it**, and I am not guessing into RETIRED to
make the table sum tidily.

They are exempted in the gate for the measured reason (they cannot go red), and
each exemption entry says `UNCLASSIFIABLE` in its own text so nobody reads the
list as claiming they are finished.

| file | report-only because | what I could not establish |
|---|---|---|
| `artmode-repro-harness.mjs` | no exit code at all; self-declared *"Diagnostic only — it changes nothing and saves nothing"* | reproduces two reported Art-mode defects — **(A)** the Chunk tab's ASSIGN view renders all black, **(B)** PAINT opens at 24x and ctrl+scroll does not zoom out. Searched `docs/` for both; **nothing records either being fixed.** |
| `assign-black-harness.mjs` | prints `REPRODUCED: assign went black` or `not reproduced`, `exit(0)` either way | first hypothesis for defect (A) — that an opened sprite document causes it. No recorded outcome. |
| `assign-toggle-harness.mjs` | ⚠ **looks like a gate and is not** — see §6.1 | second hypothesis for defect (A) — the render effect's deps omitting `chunkPaintMode`. No recorded outcome. |
| `bo-probe.mjs` | *"Probe: what state is the freshly booted s4.debug.bin actually in?"*; non-zero only on a thrown error | scouting probe, apparently for `boot-override-harness`. Nothing in `docs/` names its investigation or its closure. |

**Open for the owner:** defects (A) and (B) above are the substantive question
here. Three files exist to reproduce them and the repo has no record of either
being resolved. That is a real open thread, not a bookkeeping gap.

---

## 6.1 Two dead failure accumulators — named, NOT fixed

Both found while measuring, both out of scope per the dispatch (do not fix a
harness found to be broken):

- **`scratchpad/zone-blocks-probe.mjs`** builds `const fails = []` (L90) and
  pushes into it (L94) — and **never reads it**. Its only `process.exit(1)` is
  the `.catch` at L171. A failing row exits 0. It also carries a header whose
  second through fourth paragraphs describe `angleNeedle` and `drawCollision` —
  copied from the collision-needle harness and unrelated to the block/colind
  census the file actually performs.
- **`scratchpad/assign-toggle-harness.mjs`** prints `PASS`/`FAIL` rows and
  computes `const bad = rows.filter((r) => !r.pass)` on its second-to-last line,
  then never uses it. A failing row exits 0.

Neither is registered, so neither is newly dangerous — but if either is ever
wired to gate, it becomes a candidate LIVE and should be re-classified. Both are
called out in their own `RETIRED_UNREGISTERED` entries so the next reader of the
gate meets the fact.

---

## 7. G6 — the gate that stops this recurring

`scratchpad/check-harness-guards.mjs` runs inside `npm test` and carried rules
G1–G5 (and S1–S5 for shell). Every one of them asks whether a harness is **safe
to run**. None asked whether it **can be run at all**. G6 is that rule.

**Derived, never a list.** The population is `git ls-files scratchpad` filtered
to the harness-like filename shapes; reachability comes from the actual `scripts`
table in `package.json` — directly, or through a `.sh` under `scratchpad/` that a
script dispatches (a shell script a script runs is a door with a name on it).
Paths match at a filename boundary, so `marquee-harness.mjs` is **not** satisfied
by a command running `marquee-flip-button-harness.mjs`.

**Failure message names the file and the exact line to add**, e.g.

```
G6 collision-lens-harness.mjs: tracked, harness-like, and NO package.json script can reach it
— nobody can run it by name, so nothing sweeps it and a red row in it is invisible.
Add:  "harness:collision-lens": "node scratchpad/collision-lens-harness.mjs"  to package.json
```

**The exemption is a written list with a reason per entry, not a pattern.** A
pattern is the cheaper spelling and it is wrong twice: it makes the exemption
*invisible* — nobody reading the gate learns which files are excused or why —
and it silently swallows the next real instrument that happens to be named
`-probe`. No pattern could have drawn this line anyway: **four of the 24 excused
files are named `-harness`, and eleven registered files would match
`-probe`/`-proof`.** Every entry prints on every run, the way G1's single
exemption does.

**The list is itself checked**, so it cannot rot into a workaround outliving its
defect: an entry naming a path that is no longer tracked fails **STALE**; an
entry naming a path a script already reaches fails **DEAD**.

**Loud on unmeasurable.** If `git ls-files` cannot answer, or `package.json`
cannot be read or parsed, G6 reports UNMEASURABLE and fails — and prints **no
count at all**, rather than a reassuring `0 UNREACHABLE`.

Green on this tree:

```
G6  121/145 tracked harness-like file(s) reachable by a package.json script
    (0 via a dispatched .sh) · 24 declared report-only · 0 UNREACHABLE
```

121 + 24 = 145. The two numbers are derived independently and are made to sum.

---

## 8. Red-first evidence

Five plants, each applied to disk, each shown before the run, each restored from
a **committed** baseline (never `git checkout --` on a dirty tree). Baseline
green, from the committed tree: `0 failure(s) · 0 unmeasurable`, exit **0**.

| # | plant | mutation on disk | result |
|---|---|---|---|
| 1 | a brand-new tracked harness with no script entry (`o49-plant-harness.mjs`, `git add`ed so `git ls-files` carries it) | `git status --short` → `A  scratchpad/o49-plant-harness.mjs` | **RED, exit 1.** Population 145→146, `1 UNREACHABLE`, message named the file and printed `"harness:o49-plant": "node scratchpad/o49-plant-harness.mjs"` |
| 2 | an existing **registered** harness whose script entry is removed | `git diff` → `- "harness:collision-lens": "node scratchpad/collision-lens-harness.mjs"` | **RED, exit 1.** Reachable 121→120; the line the message told me to add was byte-identical to the one deleted |
| 3 | a stale exemption — `RETIRED_UNREGISTERED` naming a path that does not exist | `git diff` → `+ 'scratchpad/o49-never-existed-harness.mjs': 'PLANT 3: stale exemption'` | **first run: APPLIED AND STILL GREEN, exit 0** — see §8.1. After the runner fix: **RED, exit 1** |
| 4 | a dead exemption — `RETIRED_UNREGISTERED` naming `collision-lens-harness.mjs`, which **is** registered | `git diff` → `+ 'scratchpad/collision-lens-harness.mjs': 'PLANT 4: …'` | **RED, exit 1**, `DEAD EXEMPTION … but \`harness:collision-lens\` already reaches it` |
| 5 | `package.json` made unparseable | `git diff` → `-{` / `+{ THIS IS NOT JSON` | **RED, exit 1**, `UNMEASURABLE (1)` — and **no G6 count line was printed at all**, so the run could not be misread as zero violations |

Tree verified clean (`git status --short` empty) and green after every restore.

### 8.1 The plant that found a real gate defect

**Plant 3 was applied, fired, printed its message — and the run exited 0.**

The tracked/untracked split at the bottom of `check-harness-guards.mjs` is
correct for a rule about a **file**: the repo cannot fix a launcher it does not
carry, so an untracked one is reported loudly and is not fatal. It is exactly
wrong for a rule about the repo's **own configuration**. G6's STALE EXEMPTION
fires *precisely when* the path it names is untracked — so the split filed every
stale exemption as "untracked, not fatal", and **the check written to stop the
exemption list from rotting was structurally unable to fail.** Printed is not
gated.

Fixed by `alwaysFatal`, a set the split excludes before it asks git; both
exemption-audit failures go in it, because they are claims about `package.json`
and about the gate's own lists, never about a file that may be absent. Commit
`f2442559`.

**Re-established after the method change** (the earlier claims must not be
inherited across a tightening): plants **1** and **2** were re-checked — both
key on tracked paths, so both were already fatal and both still go red. Plant 3
went from exit 0 to exit 1 on the same mutation, which is the whole evidence for
the fix.

---

## 9. Verification

| | before | after |
|---|---|---|
| `npm test` | **6436 passed / 8 skipped** (466 files), exit 0 | **6436 passed / 8 skipped** (466 files), exit 0 — unchanged |
| `check:harness-guards` | 186 clean / 186 classified, 0 failures, 0 unmeasurable | same, plus `G6 121/145 … 0 UNREACHABLE` |

No harness was run. This parcel is static by dispatch: no CDP, no Electron, no
emulator, nothing that could contend with the sibling lane measuring the same
tree.

---

## 10. What is left open

1. **The Art-mode defects behind the three UNCLASSIFIABLE files** (§6) — the
   Chunk>Assign black render and the 24x-zoom/ctrl+scroll report. Three files
   exist to reproduce them and nothing records a fix.
2. **`bo-probe.mjs`** — no record of what it was for or whether it closed.
3. **Two dead failure accumulators** (§6.1), named and deliberately not fixed.
4. **Rot found by the sibling lane** is deliberately not duplicated here. This
   packet classifies and registers; it makes **no claim that any of the 77
   newly-registered harnesses currently passes.** Registering them is precisely
   what makes it possible to find out — which is what happened to
   `crossover-paint` the moment O48c gave it a name.
5. **Nothing here was confirmed at runtime.** Every claim in this packet is from
   source text, `git ls-files`, and the gate's own output.
