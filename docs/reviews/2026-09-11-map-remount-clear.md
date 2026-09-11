# map-remount-clear: the marquee and an armed paste belong to the act, not to the mount

Branch `parcel/map-remount-clear`, from master `3676a447`.
Code tip `49e36604` (commits `cd222ae9` reproduction, `49e36604` fix). This
packet, the plant script it cites and the ledger row follow it and change no
code or test.

Lens row `MAP-REMOUNT-DROPS-PASTE`. Opened from "An observation for the
overseer, not acted on" in `docs/reviews/2026-09-11-map-coverage-3.md`.

---

## Verdict: FIXED. The mount-time clear was accidental, and it was also load-bearing

The effect that cleared the marquee and paste mode on an act switch also ran on
every mount. The history shows no intent for that run. It was nonetheless the
only thing catching an act, zone or project change made while the map was
unmounted, because both pieces of state live in `editorStore`, which outlives
the component. So the clear could not simply stop running on mount; it had to
move somewhere that sees every change whether or not the map is on screen.

It is now a `useProjectStore.subscribe` in `src/renderer/state/editorStore.ts`,
beside the state it clears (search `MAP SELECTION BELONGS TO THE ACT`). It fires
on every change of project, zone or act, mounted or not, and never on a mount.
MapViewport keeps a comment where the effect was, pointing there.

Two defects closed, one of them not in the brief:

1. **The one filed.** A facet round trip through Art threw away a committed
   marquee in the act that was still open. The same round trip through Objects
   kept it, so this was an inconsistency between facets, not a rule.
2. **Found on the way.** A project opened over one whose open act has the SAME
   zone and act ids (two checkouts of one tree) kept both the marquee and an
   armed paste with the map on screen. The effect was keyed on zone and act
   alone, and `resetProjectRuntime` (`src/renderer/state/project-runtime.ts:322`)
   clears histories and documents, not these.

---

## 1. What remounts the map

`src/renderer/workspace/LevelWorkspace.tsx:196` renders the resolved facet
module's canvas as `<Canvas />`, with no `key`. `mapFacet` supplies
`Canvas: MapViewport` as the default (`src/renderer/workspace/facet-registry.ts:169`),
and no aeon facet overrides it: `git grep -n "Canvas:" -- src/renderer/workspace`
finds that default, `Canvas: ArtCanvas` (`src/renderer/workspace/facets/art-facet.tsx:247`),
and classic's s1 facets, nothing else. So:

- Layout, Objects, Rings, Collision, Palette and Effects share one component
  type in one slot, and React keeps the instance across a switch among them.
- A switch to or from **Art** changes the type, and MapViewport unmounts and
  mounts again. That is the remount.
- The level pane is kept alive (`src/renderer/App.tsx:292`,
  `{engine ? <LevelWorkspace /> : null}` inside a pane whose `display` toggles),
  so Home, a sprite document or a canvas document does not unmount the map.

---

## 2. The reproduction, red on base

Seven rows in `src/renderer/components/__tests__/map-viewport-mounted.test.ts`,
nested at the end of the paste block for its `document` stub. Every row arms
the state through the real handlers (a marquee drag, then a Ctrl+V keydown) and
asserts both premises before the transition, so a clear is never measured over
state that was never armed. A remount is `unmount()` (every cleanup) followed by
a fresh `mountMap()` (every effect as a first render). The rows through the
facet bar call `switchFacet`, the store half of what the bar does; LevelWorkspace
itself is not rendered in this suite.

| row | base `3676a447` + rows (`cd222ae9`) |
|---|---|
| a facet round trip through Art keeps the committed marquee | **RED**, ASSERTION: `expected null to deeply equal {...}` |
| CONTROL: the facet switch ITSELF disarms paste, before any remount | green |
| a remount with no tool change keeps the marquee AND the armed paste | **RED**, ASSERTION |
| an act switch while the map is unmounted still drops both | green (the mount clear carried it) |
| a round trip to another act and back while unmounted still drops both | green (the mount clear carried it) |
| a project opened while unmounted, with the SAME zone and act ids, still drops both | green (the mount clear carried it) |
| a project opened with the map MOUNTED, same zone and act ids, drops both | **RED**, ASSERTION: `expected {...} to be null` |

File run on base: 3 failed, 94 passed (97). The existing row "an act switch
drops the committed marquee AND paste mode" is the mounted control and was
already there.

---

## 3. The history of the effect

`git log -S` on the effect's body and `git log -L` on its lines both return one
commit: `25efe5c0` (2026-08-08) "feat(map): clipboard paste with ghost preview,
art/collision layer modes, composer collision paste", subject only, no body. The
lines never changed after it. The comment at introduction explains why the
effect is deliberately not keyed on `project` (edits mutate the project in
place without changing the act/zone identity) and ends:

> so this only fires on an actual act/zone switch, not on every command.

Its concern was the `project` dependency (edits); the mount-time run is
mentioned nowhere. Not deliberate. What it was carrying without saying so is
the next section.

---

## 4. Where the state lives

| state | lives in | outlives the map? | who writes it |
|---|---|---|---|
| `marquee` (the committed rect: a section INDEX and a rect) | `editorStore` | yes | armed only by MapViewport's drag; cleared by Escape and by the act clear |
| `pasting` | `editorStore` | yes | armed only by MapViewport's Ctrl+V; cleared by Escape, by `setTool` (`src/renderer/state/editorStore.ts:783`) and by the act clear |
| `mapClipboard` | `editorStore` | yes | never cleared by any act, zone or project path (see section 9) |
| `marqueeDragStart`, `marqueeDragLast`, the paste hover | MapViewport refs | no | die with the instance; a drag in flight is handled by the unmount cleanup and `abandonStaleGestures` |

---

## 5. Reachability: every path by which the act, zone or project changes

The writers of `currentZoneId`, `currentActId` and `config`:

- `setCurrentAct` at `src/renderer/shell/tab-activation/level.ts:165`, reached by
  `requestOpenTab` (Explorer, Home, the number keys), by the neighbour promotion
  in `requestCloseTab`, by session restore (`src/renderer/shell/session-lifecycle.ts:203`)
  and by a debug hook.
- `openLoaded` then `setCurrentAct(first act)` at `src/renderer/state/aeon-open.ts:90`
  and `:101`: every aeon open, a same-directory reopen included.
- `projectStore.reset`: no production caller (`src/renderer/shell/project-open-guard.ts:193`).
- `setConfig`: no production caller.
- `resetAct` at `src/renderer/debug-hooks.ts:2172`: a debug hook, not a gesture.

| path | the map at the change | base | tip | row |
|---|---|---|---|---|
| act or zone switch between two tabs on map facets | mounted | cleared (effect) | cleared (subscription) | the existing mounted control |
| act switch into a tab whose facet is Art | unmounted | cleared at the next mount, by accident | cleared at the change | unmounted act switch |
| act A to B and back to A while unmounted | unmounted | cleared at the next mount, by accident | cleared at the first change | round trip |
| project open, first act with different ids | either | cleared (the ids change) | cleared | same mechanism as the act rows |
| project open, first act with the SAME ids | mounted | **NOT cleared** | cleared | project, mounted |
| project open, first act with the same ids | unmounted | cleared at the next mount, by accident | cleared at the change | project, unmounted |
| same-directory reopen | either | mounted: not cleared; unmounted: cleared at mount | cleared (a fresh `config` object) | same mechanism as the project rows |
| facet round trip Layout to Art to Layout, same act | unmounted, then mounted | **marquee cleared**; paste disarmed by `setTool` | marquee kept; paste still disarmed by `setTool` | Art round trip, and the CONTROL |
| facet round trip through Objects (or any map facet) | stays mounted | marquee kept | marquee kept | from source (section 1), not a row |
| a remount with the same act, the same project and no `setTool` | unmounted, then mounted | both cleared | both kept | bare remount |
| debug `resetAct` | either | mounted: cleared; unmounted: at mount | cleared | not a row |

**The remount side, enumerated.** Every path that switches a facet goes through
`switchFacet`, which calls `setTool` (`src/renderer/workspace/facet-tools.ts:82`)
and so disarms paste: the facet bar (`src/renderer/workspace/FacetBar.tsx:39`),
the map's own open-in-Art actions (save-as-chunk and the context menu,
`src/renderer/components/MapViewport.tsx:1989`, `:4339`, `:4367`), the Art
browser (`src/renderer/components/ArtBrowser.tsx:367`), the band panel
(`src/renderer/components/effects/BgAnimBandPanel.tsx:744`), the chunk grid
(`src/renderer/providers/chunk-grid-aeon.ts:132`), the facet heal
(`src/renderer/workspace/LevelWorkspace.tsx:66`) and the agent
(`src/renderer/agent/agent-handler.ts:196`). A level-tab switch that changes the
facet type is also an act change, because there is one tab per act
(`level:zone:act`). `engine` flips only on a project open or close, which changes
`config`. **So no shipped path found here remounts the map with the same act,
the same project and no `setTool`.** The bare-remount row pins the component's
own property (a mount destroys nothing), not an author's path.

---

## 6. The decision, and where it departs from the brief

**Fixed.** The comment's contract is the intent: "clear both whenever the
act/zone identity changes", "only on an actual act/zone switch". Preserving the
marquee across a remount does not trade one behaviour for another. It removes an
inconsistency, because the same round trip through Objects already kept it. The
feared trade (a paste ghost reappearing somewhere unexpected) cannot happen
through the facet bar: `setTool` disarms paste before the unmount, and the
CONTROL row pins that. No shipped path reaches the bare remount.

**Where the tree contradicted the brief's mechanism.** The brief asked for the
clear to fire when the act, zone or project the state was ARMED IN differs from
the current one. One path breaks that shape: A to B and back to A while the map
is unmounted. A mounted map clears at A to B. An armed-in comparison made at the
next mount sees A equal to A and keeps both, so the result would depend on
whether the map happened to be on screen. Plant P4 below emulates exactly that
design (no subscription; a component effect keyed on act, zone and project
comparing against a scope recorded when the state was armed), and it reddens
exactly the round-trip row. So the clear fires on EVERY change, as a store
subscription, which is the old comment's contract without the mount.

**Project identity is the `config` reference.** Its writers are `openLoaded`
(a fresh object on every open) and `reset`; `setConfig` has no production
caller. `project` is not an identity: `addChunks`, `addBgToLibrary` and
`clearChunks` replace that object on an edit.

**A timing change, and the one row it moved.** The clear is now synchronous with
the store write rather than after React's commit. "a move after an act switch
does not extend the marquee into the act that opened" asserted `toEqual(before)`,
which only held because the clear was an effect that a React-held-back row never
let run. It now compares the rect after the move with the rect the move WOULD
write, with an anti-vacuous guard that the two differ from the rect before, so it
still isolates the marquee arm of `abandonStaleGestures` (P6 reds it, P2 does
not). Nothing else in the suite moved.

---

## 7. Rows and their mutations

Every plant was applied by `scratchpad/map-remount-plant.mjs` (exact-anchor
replacement, refused unless the anchor occurs exactly once, read back from disk),
its diff printed before the run, run against the whole file, and restored from
the committed tip `49e36604` with `git show HEAD:<path> > <path>`. `git status`
was clean after every restore, the plant script aside.

| plant | what it does | reds (all ASSERTION, TIMEOUT 0) |
|---|---|---|
| P1 | puts the mount-running effect back | 2: the Art round trip; the bare remount (marquee half) |
| P1b | a mount-running effect that disarms paste only | 1: the bare remount's PASTE half |
| P2 | the subscription clears nothing | 5: the existing mounted control; unmounted act switch; round trip; both project rows |
| P3 | the identity loses `config` (zone and act alone) | 2: both project rows |
| P4 | the brief's armed-in design, compared at mount | 1: the round trip |
| P5 | `setTool` no longer disarms paste | 1: the CONTROL |
| P6 | map-coverage-3's MD6: the stale arm keeps the drag | 1: the amended held-back row |

Every new row, and the amended one, is reddened by at least one plant.

---

## 8. Suite

| | Test Files | Tests |
|---|---|---|
| base `3676a447` | 602 passed \| 3 skipped (605) | 9048 passed \| 9 skipped (9057) |
| code-final `49e36604` | 602 passed \| 3 skipped (605) | 9055 passed \| 9 skipped (9064) |

Both runs exit 0, and the repo's failure-class reporter says "no failures in this
run" on both. `9064 - 9057 = 7`, the rows added; the file count does not move
because every row went into an existing file. `npx tsc --noEmit` exits 0 at both.

---

## 9. Foreground-only, tagged; and what this parcel did not touch

**Foreground, not attempted.** No emulator was touched.

- F-1. Layout, marquee tool, drag a marquee; click Art on the facet bar; click
  Layout. The marquee outline is on the map and Ctrl+C copies it. (Before: gone.)
- F-2. Arm a paste (Ctrl+C, Ctrl+V), go to Art and back. Paste mode is OFF and no
  ghost follows the cursor.
- F-3. With the map on screen, a marquee and an armed paste, open a second
  checkout of the same aeon tree. Both are gone. This also checks the claim,
  made here from source, that the map stays mounted across a project open.

**Not touched: the clipboard.** `mapClipboard` survives act, zone and project
switches, and nothing on any of those paths clears it. Copying in one act and
pasting in another is the feature. But its nametable words index the open zone's
tileset, so a Ctrl+V re-armed in another zone or another project writes indices
into a different tileset. That changes what a gesture does, so it is an
observation for the overseer, not this parcel's to change.

`docs/reviews/2026-09-11-map-coverage-3.md` is a dated record and keeps its
sentence about the effect; this packet supersedes it.
