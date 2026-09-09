# Palette edits cannot reach the ROM, and writing one from Aurora would not fix it

**Found 2026-09-09 by the owner, mid-recording:** *"hmm this palette doesn't save and build into new rom when I control + shift + B"*.

He is right, and it is worse than a save failing. **Every palette edit he has made in the
editor has been silently discarded.** Not degraded, not delayed — discarded.

## The loop, measured end to end

| step | what happens | evidence |
|---|---|---|
| He edits a colour | `set-palette-line` command, undoable, live-pushed to the emulator | `PaletteEditor.tsx` |
| Ctrl+Shift+B | Build & Run **does** save first (`saveAllDirty`) | `build-and-run.ts:65` |
| Aurora's aeon save | **writes no palette file at all** | `core/project/aeon/save.ts` — its `files.push` list has tiles, collision, objects, rings, section meta, chunk links, chunk library, tileset, bg layout/tiles, bg library, effects scenes, **and no palette** |
| The bake runs | `ojz_strip_gen.py` **`shutil.copy`s** `art/palettes/OJZ.bin` from the **legacy `sonic_hack` donor tree** over the generated palette | `tools/ojz_strip_gen.py:2136`, `src_dir = SONIC_HACK` |
| The build assembles | the donor's colours | — |

**The measurement, not the claim:** `data/generated/ojz/act1/ojz_palette.bin` was rewritten
by his own build at **16:30:57**, and his edited `$0642` is **absent from all 48 entries** of
it. The donor it is copied from, `sonic_hack/art/palettes/OJZ.bin`, was last modified
**2026-04-15** — five months ago.

## ⚠ Why writing a palette from Aurora is NOT the fix, which is the part that decides the shape

**Aurora READS the palette from the file the bake GENERATES.** `project.json`:

    zones[0].palette = games/sonic4/data/generated/ojz/act1/ojz_palette.bin

So the editor is pointed at a **build artifact**. Writing his edit back to the path it was
read from would be **overwritten by the next bake**, which copies the donor over it every
time. **A one-repo fix on the editor side cannot work**, and — worse — would look like it
had, until the next build.

**And the channel that ought to carry it is inert.** The section sidecar already has a
`paletteRef` field, and Aurora's save already writes it. **No aeon generator reads it**: it
appears in aeon's tree only in test fixtures, always `None`, carried and never consumed.

## What has to be decided, and by whom

**The two halves must land together.** An editor that writes an authored palette nobody
reads is not a fix; it is a second silent discard with a more convincing surface.

The open question is a **contract between Aurora and aeon, not a look call**: where does an
authored palette live, and what reads it? The obvious candidate is the `paletteRef` channel
that already exists on both sides and does nothing — making it mean for palettes what
`sceneRef` means for scenes.

**Not decided here. Not started here.**

## How nobody noticed

The three surfaces that would have told him all report success, honestly:

- the save reports success — it did save, everything it knows about;
- the build reports success — it did build, and it did regenerate the palette;
- the emulator shows his colour — because the **live palette push** writes CRAM directly and
  never goes near the build.

**The live path works and the build path is a no-op, so the editor is at its most convincing
exactly where it is wrong.** He has been colour-picking against a preview that is real and a
ROM that could never show it.

**Held deliberately:** this is filed and not built, because he is recording, verifying a
palette fix means rebuilding, and a rebuild is the churn he is filming against.

---

## ⚠ CORRECTION: the vehicle proposed above is WRONG, and aeon caught it

**Ruled by the hub, `empyrean docs/2026-09-09-palette-binding-ruling.md` at `cb922ec`, read at
that revision.** The section above says *"the obvious candidate is the `paletteRef` channel
… making it mean for palettes what `sceneRef` means for scenes."* **That is refuted, and the
reason is one I did not see.**

**`paletteRef` lives in `section_N.meta.json` — one per SECTION. The palette is a single
per-ACT artifact, bound as `zones[0].palette`.** So reusing the field imports a per-section
binding onto a per-act resource, and it resolves only two ways: **eight sections may name
eight different palettes — a real feature with CRAM and VRAM consequences nobody has costed —
or seven of the eight are decorative and the first silently wins.** `sceneRef` carries no such
problem, because a scene genuinely *is* per-section. **The symmetry I reasoned from was the
whole error: the two fields look alike and name artifacts of different scope.**

**THE RULE, which is the durable half: A REFERENCE MUST SIT AT THE SCOPE OF THE ARTIFACT IT
NAMES.** Per-section palettes are not refused — they are a **separate feature** needing their
own costed case, and must not arrive by reusing a field that happens to exist.

**Two further rulings that change this document's scope:**

- **Aeon's half does not wait.** The per-build donor copy becomes a **one-time seed**, and the
  generated palette is generated from something authored. Correct independently of the
  vehicle, so it lands on its own.
- **`paletteRef` does not get to stay inert.** Aurora writes it faithfully and nothing reads
  it. Whichever vehicle the per-act binding takes, it is **struck or given a stated meaning
  and a consumer** — *a field that is faithfully written and never read is a promise the
  format makes on nobody's behalf.*

## And the sharper reading of "how nobody noticed", which is aeon's

This document says the live push works and the build path does not. Aeon put it better:
**the live path WORKING is what made the defect undetectable. Had the live push also failed,
he would have found this in April.** So it is not the honest-green shape at all — it is **a
correct component concealing a broken sibling precisely BECAUSE it is correct.** The quality
of the preview is what hid it.

---

## ⚠ SECOND CORRECTION: my invariant was a NEAR-MISS, and aeon found the second writer

The proposal above states the property it buys as: *"the file Aurora reads is the file Aurora
writes, and no build step writes it."* **That sentence is satisfiable while one palette line
stays unauthorable**, and aeon caught it before the parcel started.

**`tools/inject_editor_bg.py:1361-1379` stamps a BG palette line directly into
`ojz_palette.bin` AFTER `strip_gen` runs.** Its own comment says why, verbatim: *"strip_gen
copies ojz_palette.bin from sonic_hack every build, so a palette that matches the injected art
must be written HERE (inject runs after strip_gen) or the colours revert."*

**That is not an independent feature. It is a WORKAROUND FOR THIS EXACT DEFECT** — someone hit
the donor copy, could not stop it, and wrote a second stamp downstream to survive it. So under
the proposal as written: the authored file becomes the source, the generator copies authored →
generated, and **inject stamps CRAM line 2 over the top anyway.** The invariant holds *for the
authored file* while line 2 stays owned by another mechanism — **Aurora could edit it and the
edit would vanish on the next build, which is this bug again with a smaller blast radius.**

⚠ **THE LESSON IS ABOUT THE INVARIANT'S SHAPE, NOT THE MISS.** *"No build step writes it"* is a
claim about the file I named. The defect lives in a file I did **not** name — the generated
one, which I had just finished demoting to an output and stopped thinking about. **An invariant
stated over the artifact you are fixing does not constrain the artifact you are abandoning**,
and a downstream writer of the abandoned one is invisible to it. The correct form quantifies
over *writers*, not over *my* file: **exactly one writer of the palette, and it is the editor.**

**And a third site reasons FROM the bug.** `tools/png_to_bg_override.py:270-278` argues its
lock-mode safety from *"GEN_PALETTE, which ojz_strip_gen.py re-copies from sonic_hack on every
build"*. When the copy stops being per-build that argument stops holding and must be
re-derived — **not because it becomes wrong, but because its premise is the thing being
deleted.** Cf. this repo's own *"a wrong reason on a correct rule cannot be caught by testing
the rule"*.

**Adopted from aeon, and it makes the authored path a better choice than I knew:**
`tools/level_staleness.py`'s `editor_sources()` covers the whole `data/editor` tree, so an
authored palette there makes the **staleness gate see a palette edit and re-bake** — correct
behaviour, free, and unavailable anywhere else.

**`paletteRef`: STRUCK**, at aeon's request and my agreement. Aurora stops writing it. *A
reserved field is a promise on nobody's behalf.*
