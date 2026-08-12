# Aurora UX Overhaul — Design Spec

**Date:** 2026-08-12
**Status:** Approved pending final user review
**Supersedes:** the shell/navigation portions of current `App.tsx` architecture; complements `docs/ROADMAP.md` (which remains the feature roadmap)

## 1. Problem

Aurora has grown features faster than structure. Today it is two apps wearing one coat:

- The aeon editor (Map/Art/Sprite modes) and the classic/S1 editor (Level/Sprite) duplicate every conceptual task — chunks, level art, objects, palettes, tools, undo, save — with separate stores, viewports, tool systems, and layouts.
- There is no front door: launching without a project shows an empty viewport. Standalone capabilities (sprite editing, format conversion) exist but are undiscoverable.
- Mode switches destroy context (the sprite-mode "← Back" hack, fragile Ctrl+S routing, three undo systems bridged by an undo-bus are all symptoms).

Goal: one coherent shell where a newcomer finds everything laid out in front of them, a veteran flies via keyboard, and S1 vs aeon (vs future S2/S3K/SCE) differ only in data, never in navigation.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Audience | Existing ROM hackers + newcomers. Borrow the good from SonLVL/SonED2/Flex2; inherit none of their constraints. |
| Center of gravity | **Level-centric** with a global tool tier — a level is the primary working unit; everything about it is a facet of one workspace. |
| Standalone identity | **Full second identity**: "Aseprite for Genesis formats." Loose files are first-class documents; no project required. |
| Shell | **Everything is a tab** + persistent explorer (see §3). |
| Rebuild posture | Big-bang on a branch; internally staged (§10). |
| Scope cut | One project per window. A second project = a second OS window. Typed clipboard works across windows. |

## 3. Shell

Four permanent elements, identical with or without a project:

1. **Tab strip (top).** Every open thing is a tab: level workspaces, sprite/art/palette documents, tool tabs (Converter, Import-from-game, Project Setup), and Home. Tabs preserve full state while inactive (they never unmount — "everything as you left it" is guaranteed by construction, not by state plumbing). `Ctrl+1..9` jumps tabs. Dirty tabs show an emerald dot.
2. **Explorer (left, persistent).** A grouped, filterable tree present in every tab. Groups come from the project profile catalog (§7): Levels, Object Library, Level Art, Palettes, UI & Screens, Tools, Project Setup. Groups are collapsed by default with counts; the filter box narrows the whole tree ("buzz" → one row). Clicking focuses the item's tab if open, else opens one. `Ctrl+B` toggles between full width (~240px) and a slim icon rail (~44px). With no project, groups are Files / Tools / Recents.
3. **Home tab (leftmost, uncloseable).** A landing page, never a required hallway. With a project: level cards, object/asset highlights, tools, project health. Without: Open project / Open file / New sprite / Convert, recent projects, recent files. Home is where the "no project → tools are the star; project → disassembly is the star" re-weighting happens.
4. **Command palette (⌘K)** searches everything: levels, objects, assets, tools, commands.

Wayfinding stack, cheapest first: ⌘K → explorer filter → explorer browse → contextual right-click jumps → Home. Contextual jumps ("edit this badnik's sprite art") open the target's tab beside the current one; they are accelerators, never the only path.

## 4. Level workspace

A level tab is internally identical across engines:

- **Facet bar** (segmented control at top): `Layout · Art · Objects · Collision · Palette`, plus `Rings` (aeon), later `Parallax · Events · Preview` (§9). Facets are **lenses over one level**, not separate screens — switching facets keeps canvas position where meaningful (Layout → Collision shows the same place through a different lens). Facets an engine lacks do not render (no dead chrome).
- **Plane control:** `FG / BG / Both`. In Both, the inactive plane renders behind/above as composited in-game, view-only, optionally dimmed; edits always target the active plane. Once parallax data exists, Both positions the BG at its correct scroll offset for the camera position (doubles as a parallax sanity check).
- **One tool system.** A 44px tool dock per facet (Layout: select/stamp/marquee/pan; Art: the pixel toolset; etc.) — same components, same keybinding scheme, both engines. The current aeon-dock vs classic-inline-chips split is eliminated.
- **Right panel = context for the current facet.** Layout → chunk picker + properties; Objects → object palette (fed by the Object Library) + inspector; Palette → the single unified palette editor. Zone-scoped panels carry a scope badge (e.g. "GHZ · shared") because level art and palettes are zone assets edited from act-scoped tabs.
- **Bottom:** status bar with per-tool hints and coordinates; transient panels (animation timeline) only — no permanently docked composer.
- The classic Composer's Chunk › Block › Tile drill-down becomes **the** Art facet pattern for both engines.
- **Bounds & start** are a Layout overlay (camera bounds, start/checkpoint positions, wrap flags), not a facet.

Remaining S1-vs-aeon differences are data differences (256×256 chunks vs sections; rings-as-objects vs ring layout), surfaced as facet presence and panel contents — never as different navigation.

## 5. Objects: instances vs definitions

- **Objects facet** (in a level tab) = **instances**: what is placed in this act — position, subtype, flags. Edits the level's object layout.
- **Object Library** (explorer group) = **definitions**: the project-wide catalog of object types — sprite art, mappings, animations, palette association. Indexed from the disassembly's object/art tables (as the current S1 object library already does), **not** from level layouts — so bosses, title/ending art, and anything DLE-loaded is present without being placed anywhere. Art loaded by pure hand-written code gets manual catalog entries in the profile.
- Interplay: the Objects facet's placement palette is fed by the Library; right-click an instance → edit its definition; editing a definition live-updates every open tab; right-click a definition → "Find in levels."

## 6. Standalone documents

- **Document types:** sprite art (Nemesis/Kosinski/KosM/uncompressed/ZX0 + mappings/DPLC styles), raw tile art, palettes; later animation sets.
- **Open:** Home, File → Open, drag-onto-window, OS file association (`.nem` etc. open Aurora).
- **New is instant:** `Ctrl+N` → blank canvas, default Genesis palette, sensible default size. **All format questions are deferred to save/export time.** Two keystrokes from drawing.
- **Formats are properties, not modes:** a doc's game format / compression / mapping style is an editable strip in its header; changing compression there is conversion, applied on save. The **Converter tool tab** remains for batch/drag-drop jobs.
- **PNG round-trip on every art doc:** sheet import with grid slicing and palette matching to a chosen 16-color line; PNG export.
- The standalone sprite editor and the Object Library's definition editor are the same component; standalone simply lacks project context.

## 7. Engine profiles and the project mapping layer

A profile declares three things; the shell renders only from this contract and never branches on engine identity in UI code:

1. **Detection** — fingerprint specific bases: `s1-github`, `s1-hivebrain-2005`, `s1-hivebrain-2022`, `s2-github`, `aeon`, … Detection ranks candidates and asks the user to confirm when ambiguous.
2. **Catalog** — how to index the project into explorer groups: levels tree, Object Library (with categories: badniks / bosses / gimmicks-per-zone / items & monitors / players / …), level art, palettes, manual entries for table-invisible art.
3. **Capabilities** — which facets each level gets and which operations exist (create level, create object, resize layout, …).

**Project mapping layer:** on top of the base profile sits a per-project override map — per asset class: path, format, compression. Stored in `.aurora/project.json` (travels with the repo). Stock projects inherit the base untouched; modified hacks (moved files, swapped compression, S2-derived-but-heavily-changed) override per entry.

**Project Setup tab:** every asset class as a row — path, format, compression, status light (green = loads clean; red = fix me) with live re-validation. This is the current Resolution Report promoted from readout to editor. Workflow for a divergent hack: pick nearest base, fix the red rows.

Aeon is promoted from marker-adapter to full profile (its loading logic moves out of the renderer), closing the last two-worlds seam at the code level.

## 8. Typed clipboard, cross-tab copy, import

- **Typed clipboard:** copying anything (chunk, block, tile run, object placement, sprite frames, palette line, raw pixels) carries typed content **plus dependencies** (a chunk brings its blocks/tiles/palette).
- **Conversion-aware paste:** pasting into a different zone/project remaps or imports dependencies, prompting only when necessary.
- **Serializable:** the clipboard round-trips through the OS clipboard, so copy/paste works across Aurora windows — i.e., across projects. Cross-game import ("Import from game…" tool tab: pick source disassembly + destination, guided review before write) is bulk copy-paste over the same conversion machinery.
- **Outside import rides the same rails:** PNG/sheet import is "paste pixels with palette matching," available on every art surface.

## 9. Future facets — registry and roadmap

**Facets are registered modules.** Each implements one interface: id, label, canvas view, right-panel content, tool set, gating capability key. The workspace renders registry × profile capabilities. Adding a facet later = one module + one capability declaration; zero shell edits. Explorer groups and tool tabs use the same registration pattern. Unknown future facets are expected; the socket is cheap by design.

Engine-driven, aeon-first (aeon defines each data format via empyrean contracts; classic profiles opt in only where a sane mapping exists):

- **Parallax:** BG view with draggable scroll-band boundaries, per-band speed/behavior in the right panel, live camera-motion preview. Aeon: editable. S1: view-only visualization of known stock routines initially.
- **Events (DLE):** markers on the canvas (water rise, camera lock, boss spawn, act end) + event list; each event links to what it spawns (boss event → boss art in the Library). Aeon-first; S1 view-only until proven.
- **Preview:** the reserved socket — build ROM, boot this act in oracle-next via Aether, embedded as a facet panel (pop-out window later if wanted). Facet slot, build hook, and protocol seam are designed now; the facet does not render until oracle-next is ready.
- **Animated art & palette cycles:** an "animate" toggle on Layout/Art (waterfalls flow, palettes cycle) plus animation editing in the Art facet / art docs.

## 10. Save, undo, sessions

- **Undo is per-document:** level layout doc, zone art doc, sprite doc each own a stack; undo follows the focused facet/tab. The current three-system undo-bus arrangement is replaced, not bridged.
- **Ctrl+S saves the project** (all dirty project state); standalone file docs save their own file. Per-tab dirty dots aggregate honestly (a zone-art edit dirties every tab viewing that zone).
- **Session restore:** open tabs, active facet, and viewport state persist per project and restore on reopen.

## 11. Visual language

Empyrean-derived, applied everywhere:

- Four steps of slate: `#0B0D10` app → `#0E1116` side panels → `#12151A` surfaces → `#232830` borders; text `#E6EAF0` / `#8B94A3`.
- **Emerald `#34D399` is a signal, never decoration:** active-tab underline, selection, unsaved dots, OK status — nothing else.
- **Tabs ≠ facets visually:** tabs are page-shaped with a top accent line; facets are a pill segmented control. The two horizontal navigation rows must never look alike.
- **Data is monospace** (hex, coordinates, IDs); UI is sans.
- Hover states everywhere; ~7px radii; 10–12px type; thumbnails identify, names confirm.
- Tokens consumed from `empyrean/design/tokens.json` as the roadmap already intends.

## 12. Rebuild order (big-bang branch, staged internally)

1. **Foundations:** document/session model (tabs, per-document undo, project-wide save), facet/tool/panel registries, profile contract + capability lists.
2. **Shell:** tab strip, explorer, Home, ⌘K rewired, Project Setup tab + mapping layer.
3. **Re-home aeon:** Map/Art/Sprite content → Layout/Art facets + Library docs; aeon becomes a full profile.
4. **Re-home classic:** S1 level view → the same workspace; Composer pattern becomes the shared Art facet; palette editors, tool docks, toolbars merge into one of each. **Exit criterion: facet parity — same task, same UI, both engines.**
5. **Typed clipboard + import:** cross-tab/cross-window copy, PNG import, Converter tab.
6. **Polish:** keyboard map, empty states, first-run, visual treatment applied everywhere.

Future facets (§9) land after this ships, as registry modules.

## 13. Testing posture

- Registry/profile contracts and the mapping layer are pure core logic → unit-tested in `src/core` as today (profile fixtures per supported base, including both Hivebrain revisions).
- Typed clipboard: round-trip property tests (copy → serialize → paste → structural equality after remap).
- Facet parity: a checklist-style integration test that walks both an S1 and an aeon project through identical task scripts (open level, stamp chunk, place object, edit palette) asserting the same component tree shapes render.
- Visual language: existing component-level tests continue; no pixel-diff infrastructure in this pass.

## 14. Out of scope (this overhaul)

- Multi-project single-window; split-pane tab layouts (architecture permits later); pixel-diff visual testing; S2/S3K/SCE profile authoring (the contract makes them data work, but authoring them is separate); parallax/DLE/preview/animated-art implementations (sockets only); seraph/audio surfaces.
