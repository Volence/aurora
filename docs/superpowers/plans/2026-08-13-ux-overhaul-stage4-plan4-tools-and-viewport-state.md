# Stage 4 Plan 4 — One Tool Vocabulary + Classic Viewport State

**Goal:** Land re-home **Steps D and E** — the two mechanical prerequisites that
stand between today's `master` and Step G (classic rendering through
`LevelWorkspace`). Plus one carry-forward: restore `PropertiesPanel`'s
**Selected Object** readout, which Plan 3 removed as superseded and which is
still the only selection display in the Layout facet.

**Spec:** `docs/superpowers/specs/2026-08-13-ux-overhaul-stage4-design.md` —
§3.6 (one tool vocabulary) and §3.0 (the corrections that outrank §3's prose).

**Status doc:** `docs/superpowers/plans/2026-08-13-stage4-status.md`.

**Baseline:** `master` @ `e61ad9c`, working tree clean, `npx tsc --noEmit`
clean, `npx vitest run` = 188 test files (187 passed, 1 skipped) / 1726 tests
(1723 passed, 3 skipped) / 0 failed. Measured, not copied — the status doc's
"1726 passed / 3 skipped" double-counted the skips.

**Branch:** `feature/ux-stage4-plan4`. Single worker, no worktree fan-out — every
task edits `ClassicLevelViewport.tsx`, so concurrency here buys nothing and the
status doc records that two agents in one worktree already swept one another's
work into a single commit once.

---

## Why E before D

Both touch the same 928-line component, so they are sequential regardless. E
goes first because it is the one with a hard ordering constraint recorded in the
status doc: `classic-surface.ts` cannot move from `setFacet` to `switchFacet`
until classic and aeon share one tool store, because `switchFacet` re-scopes
`editorStore.tool`. That move belongs to Step G; E is what unblocks it.

## Pre-flight facts

Established by reading `master` @ `e61ad9c`. **Verify anything you depend on;
line numbers rot.**

1. **Classic's `object` tool is genuinely two aeon tools.** Unarmed it
   hit-tests, selects, drags and deletes (`ClassicLevelViewport` ~`:566-631`);
   armed (`armedObjectId != null`) the next click places and then *disarms,
   reverting to the unarmed behaviour*. That "revert to unarmed" is literally
   `setTool('select')` after the split — the semantics survive the merge
   unchanged, which is the whole reason the split is safe.
2. **`FACET_TOOLS.layout` is not a superset of what classic needs.** It is
   `['stamp-chunk','select','view','marquee','paint-tile','paint-block']` —
   no `place-object`. So spec §3.6's "`FACET_TOOLS` becomes the default,
   **intersected** with the profile" is wrong in the intersect direction: an
   intersection drops the one tool classic's map most needs. The rule that
   works is **profile declaration replaces the default for the facets it
   names**; the default applies to facets it does not. Record this deviation in
   the code.
3. **`ClassicTool` has exactly one production write path per value** and six
   reader files: the viewport, `providers/object-list-classic.ts`,
   `providers/chunk-grid-classic.ts` (via `selectChunkForStamp`),
   `providers/object-inspector-classic.ts`, `ChunkPickerHeader.tsx`,
   `ClassicComposerDock.tsx`. The last two read `selectedChunkId`/`stampLoop`
   only — they do not read `tool` and must not be touched.
4. **`selectChunkForStamp` force-arms the stamp tool** (`classicLevelStore.ts`
   ~`:349`), which after E means `classicLevelStore` writes `editorStore`. That
   import direction is safe: `editorStore` does not import `classicLevelStore`,
   so no cycle. Verify before relying on it.
5. **`ViewMenu` renders one checkbox per `OverlayOptions` key**
   (`Object.keys(overlays)`, `ViewMenu.tsx:19`). Adding `showStart` for classic
   therefore adds a dead "Start" checkbox to aeon's View menu unless the menu is
   filtered by engine. `ViewMenu` is mounted only from `LevelWorkspace`, which
   is aeon-only today — so the dead chrome would be aeon's.
6. **The camera is a `useRef`, not state, on purpose.** `camRef` +
   rAF-coalesced `forceRedraw` is the shape three perf commits converged on
   (`493454d`, `56ad2ff`). Moving the camera to `useViewStore` *as a subscribed
   selector* re-renders the component on every mousemove and re-introduces the
   redraw storm those commits removed. The design below keeps the ref as the hot
   path and syncs the store once per painted frame.
7. **The renderer test suite is node-only** — no jsdom, `.tsx` not collected.
   Nothing below may be "tested" by rendering. Every test named here is either a
   pure-function test, a store test, or a source-grep guard.

---

## Scope

**In:** Steps D and E, plus the `PropertiesPanel` readout restore.

**Out:** Step G (classic into `LevelWorkspace`), Step F-remainder, the shared
Art facet (H), and the classic collision editor. `classic-surface.ts` keeps
using `setFacet` — the `switchFacet` move is Step G's, and E only makes it
*possible*.

---

# Task 1 — `ToolId` moves to core; the profile declares its facet tools

**Why core:** `FacetCapability` already lives in `core/project/adapter.ts` and is
imported all over the renderer. The tool vocabulary is the same kind of thing —
a profile-facing vocabulary — and putting it there is what lets a profile declare
its tool sets without core importing the renderer or the manifest carrying loose
strings.

### Contract

`src/core/project/adapter.ts`:

```ts
/** The one editing-tool vocabulary, shared by every engine (spec §3.6).
 *  Lives here, beside FacetCapability, so a profile can DECLARE its tools
 *  without core depending on the renderer. The renderer's `EditorTool` is an
 *  alias of this. */
export type ToolId =
  | 'view' | 'select' | 'paint-tile' | 'paint-block' | 'stamp-chunk'
  | 'paint-collision' | 'eraser' | 'place-object' | 'place-ring' | 'marquee';
```

On `CapabilityManifest`:

```ts
  /**
   * Which tools this profile's facets offer, overriding the shell's default
   * (renderer FACET_TOOLS) for the facets named here. REPLACES rather than
   * intersects — spec §3.6 says intersect, but the default `layout` set has no
   * `place-object`, which is exactly the tool classic's map needs, so an
   * intersection would delete it. Facets not named here keep the default.
   */
  facetTools?: Partial<Record<FacetCapability, readonly ToolId[]>>;
```

`src/core/project/s1/index.ts` — add to the manifest, beside `artTiers`:

```ts
        // Classic's map is one surface with one chip row until Step G splits it
        // into facets, so `layout` carries all four tools it can drive. The
        // shell default is wrong for classic in both directions: it offers
        // marquee / paint-tile / paint-block (no classic implementation) and
        // omits place-object (classic's armed placement). Only `layout` is
        // declared — every other granted facet's default is already right.
        facetTools: {
          layout: ['view', 'stamp-chunk', 'select', 'place-object'],
        },
```

`src/core/project/aeon/index.ts` — **declares nothing.** Aeon is what
`FACET_TOOLS` was written for; a declaration would be a second copy to drift.

`src/renderer/state/editorStore.ts`:

```ts
import type { ToolId } from '../../core/project/adapter';
/** @see ToolId — one vocabulary, declared in core so profiles can name it. */
export type EditorTool = ToolId;
```

Every existing `import { type EditorTool }` keeps working unchanged.

### Tests

- `src/core/project/__tests__/s1-adapter.test.ts` — extend the existing
  capability assertion with `facetTools`.
- New `src/renderer/workspace/__tests__/facet-tools.test.ts` cases (Task 2).

### Acceptance

- [ ] `ToolId` exported from `core/project/adapter.ts`; `EditorTool` aliases it.
- [ ] `facetTools` on `CapabilityManifest`, optional, documented as REPLACES.
- [ ] s1 declares `layout` only; aeon declares nothing.
- [ ] `npx tsc --noEmit` clean — no import of a renderer type from core.

---

# Task 2 — `toolsForFacet`: the effective tool list

### Contract

`src/renderer/workspace/facet-tools.ts` gains:

```ts
/**
 * The tools the OPEN project's `facet` offers: the profile's declaration when
 * it names this facet, else the FACET_TOOLS default. Reading the manifest here
 * (rather than at each call site) keeps "which tools exist" in one place for
 * the dock, the keybindings and the facet-switch re-scope alike.
 */
export function toolsForFacet(facet: FacetCapability): readonly EditorTool[]
```

It reads `openCapabilities()?.facetTools` (`state/open-project.ts`) — the same
seam Plan 2 built and Plan 3 wired.

`toolForFacet(facet, current)` (the re-scope helper) switches from `FACET_TOOLS`
to `toolsForFacet`, so a facet switch under classic can never land on a tool
classic cannot drive. `MapFacetDock` and `MapViewport`'s `setToolScoped` follow.

**Also extract labels.** `MapFacetDock`'s `TOOL_META` couples labels to React
icon components, so classic's chip row cannot reuse it. Split:

- New `src/renderer/workspace/tool-meta.ts` — `TOOL_LABELS: Record<ToolId, string>`
  plus `TOOL_HINTS` if `MapStatusBar`'s `TOOL_INFO` hints move cleanly. Pure, no
  React, node-testable.
- `MapFacetDock` keeps the icon map and reads labels from `TOOL_LABELS`.

Label values: `view: 'Pan'`? **No — keep `'View'`.** Classic's chip said "Pan"
and aeon's dock said "View" for the same tool; one vocabulary means one label,
and the aeon one is already in `TOOL_INFO`, `TOOL_META` and the `v` keybinding
hint. Classic's chip row will read "View" after this task. That is the intended
convergence, not a regression — call it out in the commit message.

### Tests

`src/renderer/workspace/__tests__/facet-tools.test.ts`:

- `toolsForFacet` returns the FACET_TOOLS default when no project is open.
- With an s1 manifest seeded, `toolsForFacet('layout')` is the declared four,
  in declared order, and **includes `place-object`** (the regression the
  intersect rule would have caused).
- With an s1 manifest seeded, a facet s1 does NOT declare falls back to the
  default.
- With an aeon manifest seeded, every facet keeps its default.
- `toolForFacet('layout', 'marquee')` under s1 returns `'view'` (declared
  default) — a tool classic cannot drive is never retained across a switch.
- `TOOL_LABELS` is exhaustive over `ToolId` (compile-time via `Record`, plus a
  runtime key-count assertion so a union addition fails loudly).

### Acceptance

- [ ] `toolsForFacet` is the single reader of `facetTools`.
- [ ] `toolForFacet`, `MapFacetDock`, `setToolScoped` all route through it.
- [ ] `TOOL_LABELS` extracted; `MapFacetDock` renders from it.
- [ ] Existing `facet-tools.test.ts` cases still pass unmodified.

---

# Task 3 — Classic drops `ClassicTool`

The core of Step E. **Read `ClassicLevelViewport.tsx` and
`classicLevelStore.ts` before writing anything** — the mapping below is a
contract, not a patch.

### Mapping

| Was (`ClassicTool`) | Becomes (`EditorTool`) |
|---|---|
| `pan` | `view` |
| `stamp` | `stamp-chunk` |
| `object`, unarmed | `select` |
| `object`, armed | `place-object` |

### Contract

**`src/renderer/state/classicLevelStore.ts`**

- Delete `ClassicTool`, the `tool` field, and `setTool`.
- `selectChunkForStamp` sets the chunk and calls
  `useEditorStore.getState().setTool('stamp-chunk')` when the tool is not
  already that. Keep the "only when it isn't already active" guard: `setTool`
  clears `selection` and `pasting`, so an unconditional call would clobber aeon
  state on a no-op chunk re-select.
- Keep `armedObjectId`, `selectedObjectIndex`, `selectedChunkId`, `stampLoop`
  exactly as they are. They are engine-specific payloads, not tools.

**New pure module `src/renderer/state/classic-placement.ts`** (or fold into an
existing pure classic helper if one fits — implementer's call, but it must be
node-testable and store-free):

```ts
/**
 * The object id an armed classic placement would drop, or null.
 *
 * Armed placement is now expressed as the `place-object` TOOL plus the armed
 * id; `armedObjectId` alone is not enough, because switching tools does not
 * clear it. Deriving through this helper means a tool switch implicitly
 * disarms — no call site has to remember to clear the id, and none can forget.
 */
export function armedPlacementId(tool: EditorTool, armedObjectId: number | null): number | null
```

Returns `armedObjectId` when `tool === 'place-object'`, else `null`.

**`ClassicLevelViewport.tsx`**

- `tool` comes from `useEditorStore((s) => s.tool)`; `setTool` likewise.
- Every `tool === 'stamp'` → `'stamp-chunk'`; `tool === 'pan'` → `'view'`.
- The `tool === 'object'` branches split:
  - **mouse-down**, **mouse-move hover**, **cursor**, **status hint**: the
    armed-place path keys on `armedPlacementId(tool, armedObjectId) != null`;
    the select/move path keys on `tool === 'select'`.
  - The BG guard (`plane === 'fg'`) stays on both paths — objects and the start
    marker are FG concepts and a BG click must still fall through to pan.
- After a successful place: `setArmedObjectId(null)` **and**
  `setTool('select')`, then select the placed object. This is the existing
  "revert to select behaviour" comment, now literal.
- Escape's disarm branch: `setArmedObjectId(null)` **and** `setTool('select')`.
- The chip row renders from `toolsForFacet('layout')` with `TOOL_LABELS`, not a
  hardcoded three. Keep `<Chip>` — the shared `MapFacetDock` arrives in Step G,
  and swapping the presentation now would mix two refactors in one diff.

**`src/renderer/providers/object-list-classic.ts`**

- Arm: `setTool('place-object')` then `setArmedObjectId(id)` (same order as
  today's `setTool('object')`).
- Disarm (clicking the armed row again): `setArmedObjectId(null)` **and**
  `setTool('select')`. Without the second call the tool sits on `place-object`
  with nothing armed and map clicks do nothing.
- `selectedKey` derives through `armedPlacementId`.

**`src/renderer/providers/object-inspector-classic.ts`**

- The "an armed placement outranks a selection" rule derives through
  `armedPlacementId`.
- The empty-hint text says "Use the Object tool" — reword to whatever the chips
  now read (`Select` / `Place Object`).

### Tests

- `src/renderer/state/__tests__/classicLevelStore.test.ts` — the tool block
  (`~:459-586`) is rewritten, not deleted:
  - `selectChunkForStamp` sets `editorStore.tool` to `'stamp-chunk'` from
    `'view'` and from `'select'`, and does not touch it when already
    `'stamp-chunk'`.
  - `openAct` still resets `selectedChunkId` / `stampLoop` /
    `selectedObjectIndex` / `armedObjectId`, and still does **not** reset the
    tool (now `editorStore`'s).
  - Tool state is still absent from the undo snapshot.
  - Delete the `'the object tool is a valid ClassicTool value'` case; replace
    with `armedPlacementId` coverage.
- New `armedPlacementId` tests: armed + `place-object` → the id; armed +
  `select` → null; armed + `stamp-chunk` → null; unarmed → null.
- **New guard test** `src/renderer/state/__tests__/one-tool-vocabulary.test.ts`
  — source-grep, in the style of `classic-surface.test.ts`: no file under
  `src/renderer` outside `editorStore.ts` may reference `ClassicTool`, and no
  file may match `classicLevelStore` + `\.tool\b`. The status doc records that
  `classic-surface.test.ts` has been escaped twice by too-narrow scans; write
  this one to scan all of `src/renderer` from the start.
- `classic-surface.test.ts` — re-run unchanged. If `armedPlacementId`'s home
  file trips `COMMAND_CALL`, that is a real finding: fix the file, not the
  regex.

### Acceptance

- [ ] `grep -rn ClassicTool src/` returns nothing.
- [ ] `classicLevelStore` has no `tool` field and no `setTool`.
- [ ] Arm → place → the tool is `select` and nothing is armed.
- [ ] Arm → switch to Stamp → `armedPlacementId` is null (no orphan arm).
- [ ] Chip row renders four chips: View / Stamp Chunk / Select / Place Object.

---

# Task 4 — Classic plane and overlays move to the stores

Step D, first half.

### Contract

**Plane.** `useState<Plane>('fg')` → `useEditorStore((s) => s.editingLayer)` /
`setEditingLayer`. The unions are already identical (`'fg' | 'bg'`), and
`classicSetLayoutCells(plane, …)` takes `LayoutPlane`, which is the same pair.
Delete the local `Plane` type. The fit-on-load effect keys on `editingLayer`
where it keyed on `plane`.

**Overlays.** Local `Overlays` → `useViewStore`:

| Local | Store key | Exists? |
|---|---|---|
| `collision` | `showCollision` | yes |
| `angles` | `showCollisionAngles` | yes |
| `objects` | `showObjects` | yes |
| `start` | `showStart` | **new** |

Add `showStart: boolean` to `OverlayOptions`, default `true` — matching classic's
current local default and the three existing keys' defaults, which already match
classic's (`showCollision:false`, `showCollisionAngles:false`,
`showObjects:true`). Delete the local `Overlays` type and `toggle` helper; use
`toggleOverlay`.

**Engine-filtered View menu.** `showStart` is classic-only (aeon has no spawn
marker), and `ViewMenu` renders every key. Add, beside `viewStore`:

```ts
/**
 * Which overlay keys each engine actually renders. `ViewMenu` shows only these,
 * so a key one engine needs is not dead chrome in the other's menu (parent §4:
 * no dead chrome).
 *
 * Declared here rather than on CapabilityManifest because the overlay set is
 * still a renderer concept — OverlayOptions lives in viewStore. It joins the
 * manifest alongside facetTools when Step G's shared overlay bar lands and the
 * classic OptionBar stops declaring its own.
 */
export const OVERLAY_KEYS_BY_ENGINE: Record<OpenEngine, readonly (keyof OverlayOptions)[]>
```

`ViewMenu` maps over `OVERLAY_KEYS_BY_ENGINE[engine]` (via `useOpenEngine()`),
falling back to all keys when no project is open.

### Tests

- `viewStore` test: `showStart` defaults true; `toggleOverlay('showStart')`
  flips it.
- New pure test for `OVERLAY_KEYS_BY_ENGINE`: every listed key exists in the
  default `overlays` object (a typo'd key would silently vanish from the menu);
  `showStart` is in `s1` and **not** in `aeon`; every key of `OverlayOptions`
  appears in at least one engine's list (so a new overlay cannot be added and
  then be invisible everywhere).

### Acceptance

- [ ] No `useState` for plane or overlays remains in `ClassicLevelViewport`.
- [ ] Aeon's View menu gains no "Start" checkbox.
- [ ] Classic's FG/BG chips and four overlay chips behave exactly as before.

---

# Task 5 — The camera moves to `viewStore` without a redraw storm

Step D, second half, and the one with a real perf trap (pre-flight fact 6).

### Contract

`camRef` **stays** as the hot mutable camera. It gains two seams:

1. **Push, once per painted frame.** Inside the existing `redraw()` rAF
   callback — after `forceRedraw` — sync the camera to the store when it
   changed since the last sync:

   ```ts
   // ILLUSTRATIVE — derive from the current source.
   rafRef.current = requestAnimationFrame(() => {
     rafRef.current = null;
     const cam = camRef.current;
     const last = syncedRef.current;
     if (cam.x !== last.x || cam.y !== last.y || cam.zoom !== last.zoom) {
       syncedRef.current = { ...cam };
       useViewStore.getState().setViewport(cam.x, cam.y, cam.zoom);
     }
     forceRedraw((n) => n + 1);
   });
   ```

   One store write per *painted* frame, which is the cadence the existing state
   bump already runs at — so this adds no renders classic was not already doing.
   Note `setViewport` clamps zoom to `[0.125, 8]`, the same bounds the wheel
   handler already applies, so the clamp cannot fight the ref.

2. **Adopt external writes.** Anything else that moves the camera — the agent
   handler's goto, a future shared zoom control, Task 6's tab restore — writes
   `viewStore`. Subscribe imperatively (**not** with a selector hook; a selector
   re-renders on every frame's own push):

   ```ts
   // ILLUSTRATIVE.
   useEffect(() => useViewStore.subscribe((s) => {
     const cam = camRef.current;
     if (s.vpX === cam.x && s.vpY === cam.y && s.zoom === cam.zoom) return; // our own echo
     cam.x = s.vpX; cam.y = s.vpY; cam.zoom = s.zoom;
     syncedRef.current = { ...cam };
     redraw();
   }), [redraw]);
   ```

   Self-echo is filtered by exact equality against the values this component
   just wrote — no epsilon, no flag, and no feedback loop.

3. **The fit-on-load effect** writes `camRef` *and* `setViewport` +
   `syncedRef`, so the store is not left holding the previous act's camera
   between load and first drag.

**Do not** subscribe to `vpX`/`vpY`/`zoom` with `useViewStore((s) => …)` in this
component. A reviewer should be able to grep for that and find nothing.

### Tests

Node-only, so the component itself is untestable — the guard is a source grep,
plus honest manual verification:

- New case in the guard test from Task 3 (or its own file): `ClassicLevelViewport.tsx`
  contains no `useViewStore((` selector subscription. Comment it with *why*
  (the redraw storm), because the next reader will otherwise "tidy" the
  imperative subscribe into a hook.
- **Manual, under the real app** (the status doc is blunt that node tests cannot
  see this): drag-pan and wheel-zoom a large act with `AURORA_PERF=1` and
  compare the logged `draws` / `avgDraw` / `maxDraw` against a `master` run of
  the same act. Record both numbers in the commit message. A draw count that
  rises materially means the push is re-rendering — stop and fix, do not ship it
  with a note.

### Acceptance

- [ ] Camera state readable from `viewStore` while classic is open.
- [ ] `AURORA_PERF` draw counts unchanged vs `master` (numbers in the commit).
- [ ] No selector subscription to the camera in the classic viewport.

---

# Task 6 — Per-tab viewport restore for classic

The payoff Step D exists for. **Land this as its own commit** — it is the one
sub-step that can be dropped without affecting Tasks 4–5 if it fights the
fit-on-load effect.

### Contract

`src/renderer/shell/tab-activation.ts`, the `classic-open` branch, mirrors what
`aeon-switch` already does: snapshot the outgoing act's viewport into
`workspaceStore.setView(levelTabId, …)`, then restore the incoming tab's via
`viewFor(tabId)`.

The collision to resolve: classic's fit-on-load effect resets the camera to
fit-height whenever `status`/`ref`/plane change, which would clobber a restored
viewport. Rule: **fit only when the tab has no saved view.** Same condition,
evaluated in both places, so they cannot disagree:

```ts
// ILLUSTRATIVE.
const saved = useWorkspaceStore.getState().viewFor(levelDocId(ref.zone, ref.act));
if (saved) return; // the restore already positioned the camera
```

Read `activateLevelTarget`'s aeon branch first — its `skipViewSnapshot` handling
exists because a boot-restore's "outgoing" act is the loader's default, not user
state. The classic branch needs the same guard for the same reason.

### Tests

`planLevelActivation` is already a pure planner with tests — extend those rather
than testing the effect. Plus a `workspaceStore` test that a classic tab's view
round-trips through `setView`/`viewFor`.

### Acceptance

- [ ] Switch act A → B → A: A's pan/zoom is where it was left.
- [ ] First-ever open of an act still fits to height.
- [ ] Boot restore does not clobber the restored act's saved viewport.

---

# Task 7 — Restore `PropertiesPanel`'s Selected Object readout

Open decision 2 from the status doc, answered: restore it.

### Contract

Plan 3 removed it because the Objects facet's `ObjectInspector` supersedes it —
true there, and still true. The gap is the **Layout** facet, where `select` can
pick an object and nothing displays it.

So restore it **prop-gated, not unconditionally**:

```ts
export default function PropertiesPanel({ showObjectSelection = false }: { showObjectSelection?: boolean })
```

`layout-facet.tsx` passes `showObjectSelection`. The objects/rings/collision
facets do not, so the panel stays free of the dead chrome Plan 3 deleted.
Props over a `facetFor(activeId)` lookup: it is the pattern this stage keeps
choosing, and it keeps the decision at the mount site where it is legible.

The readout itself is the removed block — Section / Position, read-only, keyed
off `selection.type === 'object'`, using the existing `Property` rows. Update
the docblock at `PropertiesPanel.tsx:35-40` to say why it is back and why it is
gated, replacing the "deliberately absent" note.

### Tests

Presentational and node-untestable. The docblock is the artifact; make it good.

### Acceptance

- [ ] Layout facet + `select` tool + click an object → Section and Position show.
- [ ] Objects facet shows the editor only, no duplicate readout.

---

## Commit sequence

One commit per task, in order. Tasks 1+2 may share a commit if the split reads
as noise — they are one change to one seam.

## Definition of done

- [ ] `npx tsc --noEmit` clean.
- [ ] `npx vitest run` — no failures, and the count has moved **up** from the
      baseline (tasks 2, 3, 4 and 6 each add cases).
- [ ] `AURORA_PERF` numbers recorded for Task 5.
- [ ] Manual smoke under the real app, classic project: stamp a chunk, place an
      object, move it, delete it, switch FG/BG, toggle all four overlays,
      switch acts and back, Ctrl+Z after each edit type.
- [ ] `docs/superpowers/plans/2026-08-13-stage4-status.md` updated: D and E
      struck from the remaining list, open decision 2 closed, and any new trap
      recorded.
