# Rulings asked of the hub, 2026-09-12

Sent to the empyrean hub the same morning. This file is the in-tree record of the positions
the message states, so they survive a clear. Each item is a behaviour call. Where one is also a
look call, it is marked, and the hub should park it for the owner rather than rule it.

## 1. Which fix for the edit a project switch throws away

Measured in `docs/reviews/2026-09-12-switch-window-measure.md` (landed on master, sections 1 to 5).
While a project switch loads, every edit surface stays live, the agent included. On the three
classic roads the edit, its dirty flag and its undo are dropped silently. Aeon to aeon drops the
edit and leaves a stale dirty flag on the new project. Aeon to classic keeps the edit, masked and
unsavable. The overseer re-ran the probe firsthand: 13/13, the same outcome per row.

- **Recommended: (c1) with (c3), as one parcel.** (c1) cancels the switch's commit when anything
  was edited after the user consented, reusing the failed-open path that already keeps the
  current project. Nothing is lost, there is no new dialog, and it covers every surface without
  touching gesture code. Its only new words go in the existing error channel.
- **(c3) must ride WITH (c1), never ahead of it.** Clearing aeon's dirty flag at commit is right
  under any ruling. Landed alone, it would turn aeon's stale flag into the same silent drop the
  classic roads have.
- Not recommended: (a), blocking edits during the switch (12 to 18 files, mid-stroke gestures
  escape a command-layer gate, and it needs a visible busy state, which is a look call); (b),
  re-asking at commit (a second dialog, and the dialog reopens the window).

## 2. The map's open behaviour questions

From `docs/reviews/2026-09-11-map-coverage-4.md`, `docs/reviews/2026-09-12-map-coverage-5.md`
and `docs/reviews/2026-09-12-map-coverage-6.md` (their "Observations" and "Still open"
sections). None of these is a row yet, because the code states no intent either way.

| # | Question | Recommendation |
|---|---|---|
| M1 | A Plane button keeps focus, so Space pressed mid-drag switches plane and splits the stroke with nothing on screen saying so. | Drop focus after the click, as d-27 did for Reset and Clear. |
| M2 | The drag cache key leaves out the plane, so after a plane switch the cell under the pointer is not painted on the new plane until the pointer leaves it. | Put the plane in the key. The key's own comment gives the same reason for including the span. |
| M3 | With both planes armed, a change of the aimed plane still splits the stroke into two undo entries, though the planes written never change. | Leave it. The only cost is undo granularity. |
| M4 | The collision brush SIZE is read live per cell; Alt, both planes and the crossover brush are latched at the press. | Latch it at the press, like its neighbours. |
| M5 | A paint-block drag paints one block (the move branch continues only paint-tile and paint-collision). | Continue the drag like paint-tile. Low confidence: a one-block stamp may be intended, so park it if the hub reads it that way. |
| M6 | A stamp press does not refresh the chunk-link hover. | Refresh it. |
| M7 | The cursor readout freezes during every drag and stays hidden after leaving and re-entering mid-drag. **Look-adjacent.** | Let it follow the drag. Park for the owner if the hub reads it as a look call. |
