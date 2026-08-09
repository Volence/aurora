<!--
Authored 2026-07-03 (Claude Fable 5). Design for ROADMAP.md Phase P3 (the authoring half —
the export spine is already specced in plans/2026-06-17-sprite-*.md). Research grounding:
ideas/2026-06-16-art-suite-vision.md (two research passes: Aseprite/SGDK/ClownMapEd/Unity
patterns, already adversarially verified). Engine contract: aeon engine/objects/animate.asm
+ constants.asm AF_* codes; aeon design #9 consumes AF_CALLBACK as EV_ANIM.
-->

# Sprite Animation Authoring — Design

## Goal

Upgrade Sprite mode's timeline from *playback of imported scripts* to *authoring*:
create/edit animations frame-by-frame with per-frame timing, loop/control codes, and
inline **event tags**, exporting to aeon's animation script format. This is the last
piece of the "draw → animate → export" sprite loop.

## Non-goals

Layers/cels (frames are whole bitmaps here); bone/skeletal anything; editing donor-game
(S1/S2/S3K) scripts beyond what the adapters already read (authoring targets S4/aeon;
donor scripts remain import-only in v1).

## 1. Model

Extend the sprite model (spriteStore) with editable animations:

```ts
Animation { id, name, mode: 'forward'|'loop'|'pingpong',
            loopBackIndex?: number,            // $FE jump-back target
            steps: AnimStep[] }
AnimStep  { frame: number,                     // index into sprite frames
            duration: number,                  // 1/60s ticks (SGDK convention)
            tags: EventTag[] }
EventTag  { kind: string, params: Record<string, number|string> }
```

- The engine's script vocabulary is the export target, not the editing model:
  control codes ($FF loop, $FE jump-back N, $FD switch-anim, $FC advance-routine,
  $FB delete — S3K lineage) map from `mode`/`loopBackIndex` + explicit end-behavior
  dropdown. **Verify the current AF_* code set + per-frame-timing variant against
  `aeon/constants.asm` and `engine/objects/animate.asm` at implementation time** —
  the engine is actively evolving; do not trust this spec's list over the source.
- Event tags serialize to the engine's inline frame-event mechanism. As of aeon
  design #9, the confirmed consumer is `AF_CALLBACK` → `EV_ANIM` (behavior sequencer
  events). Tag kinds v1: `callback` (the #9 event pulse), `sfx {id}` (if/when the
  engine exposes a play-SFX frame code — check constants.asm; if absent, defer this
  kind rather than inventing an encoding).

## 2. Timeline UI (upgrade the existing playback strip)

- **Rows = animations, cells = frames** (the SGDK/Aseprite grid model). Left rail
  lists animations (add/rename/delete/duplicate); the selected row expands into the
  step strip.
- Per-step: thumbnail, duration badge (click → numeric ticks; drag horizontally to
  scrub duration). Reorder by drag; Ins/duplicate/delete keys; multi-select for bulk
  duration edits.
- **Event tags render as markers on the step** (the Unity/Unreal marker convention —
  visible inline, hover tooltip, small typed payload editor on click).
- Playback stays: play/pause, speed, and mode preview honoring loop/pingpong.
  **Onion-skinning**: previous/next N steps at configurable opacity/tint (canvas
  overlay; off by default). Live preview window optional-later; the main canvas
  already follows the scrubbed step.
- Every mutation = one undo step in `SpriteHistory` (existing merged-undo machinery).

## 3. Persistence & export

- Editor-side: animations live in the sprite's existing editor document (additive
  JSON — no format break for sprites without animations).
- Export: emit aeon animation scripts alongside mappings/DPLC via the export spine
  (plans 2026-06-17-sprite-{animation,mappings}-export). Data lands under
  `games/sonic4/data/animations/` conventions. Golden test: import an existing
  engine animation → re-export → byte-identical.
- Round-trip: importing an S4 script populates the editable model losslessly
  (control codes → mode fields; unknown codes preserved as opaque "raw" steps so
  re-export is byte-safe even for codes this UI doesn't surface).

## 4. MCP tools

`list_animations`, `get_animation`, `set_animation` (full-replace, one undo step),
`set_anim_step {anim, index, frame?, duration?, tags?}`.

## 5. Acceptance

- Author a 6-step loop with varied durations + one callback tag entirely in the UI;
  export; the engine plays it (GUI + in-game verification via Build & Run from the
  P2 spec).
- Import→re-export byte-identity for every animation currently in
  `games/sonic4/data/animations/`.
- Onion skin and pingpong preview behave; undo granularity = one gesture.

## Plan seeds

1. Model + persistence + import round-trip (pure, tested). 2. Timeline editing UI.
3. Event tags + marker UI. 4. Export wiring + goldens. 5. Onion skin + polish.
6. MCP tools.
