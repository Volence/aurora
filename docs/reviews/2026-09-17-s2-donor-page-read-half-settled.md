# S2-DONOR-PAGE: the READ half is settled, the PASTE half is not

**Written 2026-09-17 by the aurora overseer, from aeon via the hub, with every claim below
re-verified here at a published revision rather than taken from the relay.** The relay rule
(`OVERSEER-PROTOCOL.md`, RELAY RULE) exists because a true sentence about an unpushed tree is
indistinguishable from a false one; this one checked out, and the checks are recorded so a
successor can redo them in one line each.

**Why this file exists at all.** Every fact here is a fact about *aeon's* tree, and a
successor in this lane reads this repo's packets and board, not aeon's. A correction that
lands only in the other repo has no local reader — the mistake this suite has now made in
both directions.

## What is SETTLED, and needs no new loader

**Published: aeon `6180a1af` is an ancestor of aeon `origin/master`** (verified with
`git -C ../aeon merge-base --is-ancestor 6180a1af origin/master`), and its report is present
at aeon `origin/master:docs/research/s2-compressed-act/2026-09-17-whole-zone-converter.md`
(verified with `git -C ../aeon cat-file -e`). Read it there, not from this summary.

A converted donor zone lands at `games/sonic4/data/donors/<donor>/<ZONE>/` carrying
`tileset.bin`, `palette.bin`, `section_<N>.tiles.bin` and `zone.json`. **Aeon's existing
validator reads that tree with all three paths passed explicitly, so this page needs no new
loader.**

**Two corrections aeon insists on, because its design doc's first sketch had both wrong and
is now patched.** Do not carry the old shape forward from any earlier note:

1. There is **no `tileset.bin` inside an aeon act directory** — the tile blob lives outside
   it and is named by `project.json`.
2. **A donor tree carries none of `regions.json`, meta, objects or rings.**

## What is NOT settled: the clip manifest this page would WRITE

The manifest a paste emits is exactly what aeon's in-flight parcel is designing
(`parcel/s2-clip-manifest`, confirmed present as a branch here). Aeon has told its agent to
treat it as a **cross-tool interface rather than a private file**, and will send the shape
through the hub when it lands.

**So the board row stays blocked, re-pointed at this half only** — not cleared, and no longer
blamed on the owner's go or his six zones, which the read half no longer waits on.

## The hazard that lands between the two lanes, and one correction to it

`games/sonic4/data/donors/` is **gitignored in aeon** (`.gitignore:205` at `origin/master`,
verified with `git -C ../aeon check-ignore -v`) and **0 paths are tracked under it**
(`git -C ../aeon ls-tree -r --name-only origin/master -- games/sonic4/data/donors`).
**So no donor bytes exist on any machine right now.**

⚠ **BUT "ABSENT" WAS THE WRONG WORD AND IT MISDIRECTS THE WHOLE DECISION BELOW — CORRECTED
2026-09-17 BY AEON, AGAINST MY FIRST VERSION.** The donor trees are **DERIVED AND GITIGNORED,
not unavailable**. They regenerate in about a second from committed inputs with one published
command, in `/home/volence/sonic_hacks/aeon`:

```sh
python3 tools/s2_zone_convert.py convert --all-six      # or --all-zones for all 19 pairs
```

Verified here: `tools/s2_zone_convert.py` is present at aeon `origin/master` and its parser
carries both `--all-six` and `--all-zones`; **both donor sources are present on this machine**
(`s2disasm` and `s2-simonwai-disasm` as sibling checkouts). The owner's six are EHZ, CPZ, OOZ,
MTZ and WFZ from `s2disasm`, plus HPZ from `s2-simonwai-disasm`.

**This kills the reproducibility argument I made against option 2 below, so read that
correction before the options.** I wrote that a locally-converted zone *"proves nothing a
successor can re-run"*. **That is false:** a successor re-runs it with the line above, and
`zone.json` carries a per-file SHA-256 so two runs can be compared rather than trusted.
**Derived-and-regenerable is a different category from absent, and I collapsed the two** —
the same one-quantity-over shape this file already corrects twice. Reproducibility here comes
from *the generator plus the hashes*, which is exactly how a build input works; committed
bytes were never the only route to it.

⚠ **THAT ZERO CARRIES A POSITIVE CONTROL, AND THE FIRST VERSION OF THIS LINE DID NOT.** It was
originally measured through `| wc -l`, which launders the exit code — the precise mechanism
that produced a WRONG figure in the relay this file corrects (`find <missing> -type f | wc -l`
printed a clean `0` while `find` was erroring `No such file or directory`). Audited here:
`ls-tree` exits **0** with no pipe in the way, and the identical command against a path that
does exist (`games/sonic4/data/editor/ojz/act1`) returns **62** lines. **So the query is live
and the zero means "nothing tracked" rather than "the query failed."** The claim was right the
first time and the method had not earned it; the control is what makes it re-checkable instead
of lucky. Re-derive both halves, never just the zero.

⚠ **CORRECTION TO THE RELAY, AND IT CHANGES THE CODE.** The relay said the directory is
"empty on disk, 0 files". Measured here: **the directory does not exist on disk at all.**
Empty and absent are different inputs — `readdirSync` on a missing path throws `ENOENT`
rather than returning `[]` — so the page must survive an **absent** parent, not merely an
empty listing. This is the one-quantity-over shape: the relayed figure was almost right and
the almost is where the crash lives.

⚠ **AND THE IGNORE IS TEMPORARY BY AEON'S OWN NOTE, so do not design against it as permanent.**
The comment above that line says the tree is ignored *because nothing reads it yet* and it is
not a build input, and then: *"WHEN THAT CHANGES, SO DOES THIS LINE. The moment a clip out of
one of these trees reaches a committed byte ... these trees must be tracked, or the ROM will
be built from bytes nobody can reproduce."* Booked in aeon's `docs/DEFERRED_WORK.md` under
`S2-COMPRESSED-ACT`. A test written to assert "no donor data is ever committed" would go red
on aeon's own planned change.

### What this means for tests here, and the decision to take before the page reads a path

**Tests cannot rely on committed donor data.** This is the
`PRESET-REBIND-TEST-READS-LIVE-AEON` hazard — a test whose truth depends on a working tree
rather than a commit — in a new place and **worse**, because the data is *per-machine*
rather than merely moving: there is no revision at which it exists, so the
read-through-git-objects remedy does not apply either.

Three options, to be decided **before** the page reads a path:

1. **A fixture this repo owns**, committed here, shaped from `zone.json` as published at
   `6180a1af`. Survives a clear, a clean clone and another lane's day. Costs a shape that can
   drift from aeon's without anything saying so — so it needs a currency row against the
   published `zone.json`, which is the pattern this repo already runs for the regions schema.
2. **Run aeon's converter to produce a real zone.** Highest fidelity, one published command,
   and **re-runnable by anyone on this machine** — so the objection I first wrote here (that
   it proves nothing a successor can repeat) is withdrawn. Its real cost is different and
   smaller: the tree is absent until someone runs it, so anything depending on it must
   generate it or skip loudly, and a fresh machine also needs the two donor checkouts.
3. **Skip loudly** when no donor tree is present, naming the variable and the path. Honest,
   and on its own it means the page's main path is never exercised by anything.

**The recommendation, REVISED once option 2 stopped being weak: 1 and 2 and 3, with distinct
jobs.** An owned fixture carries the *behaviour* rows (fast, committed, no external
dependency, so `npm test` stays hermetic). A **real converted tree** carries the *fidelity*
claim, generated on demand by a rig that runs the command itself or skips loudly naming it —
never a row that reads the path and hopes. A currency row against the published `zone.json`
keeps the owned fixture from silently diverging from aeon's shape. Three legs, three different
failure modes, and no leg standing in for another.

**And "no donors present" is a first-class state of the PAGE, which this correction makes
MORE true rather than less.** Derived-and-gitignored means absent is the *normal* state of a
fresh checkout, not a transitional one. **So the empty state should name the command** —
telling an author `python3 tools/s2_zone_convert.py convert --all-six` in aeon is the whole
difference between a dead page and a one-line fix, and it is the cheapest useful thing this
page can do before any marquee exists.

## ADDENDUM 2026-09-17: THE PASTE HALF IS SETTLED TOO — THIS DOCUMENT'S TITLE IS NOW HALF WRONG

Aeon landed the clip-manifest format. **Verified here at a committed revision, not taken from
the relay** (`git -C ../aeon merge-base --is-ancestor`, `git -C ../aeon cat-file -e`, both
against a freshly fetched `origin/master`):

- `72d8c764` and parcel tip `72cd8b7d` are both ancestors of aeon `origin/master`.
- Present at that revision: aeon `docs/research/s2-compressed-act/2026-09-17-clip-manifest.md`
  (the spec and the reasoning), aeon `tools/clip_manifest.py` (the format),
  aeon `games/sonic4/data/clips/s2_two_clip/clips.json` (a working fixture).

**Shape**, one file per act: `{schema, units: "world_px", id, name, act: {grid_w, grid_h}, clips: []}`.
Each clip carries `id`, `donor`, `zone`, `src_rect`, `dst_rect` (both `{x,y,w,h}`) and `region_id`.
All geometry is integer world pixels **with the unit declared in the file**, so nothing rounds
inside the interface.

### Four things a page built on this must not assume

1. **`region_id` is OPTIONAL and is AURORA'S WRITE-BACK**, not a naming handed to us. The
   shipped fixture happens to pre-fill it on both clips (`ehz_s2`, `cpz_s2`, each equal to its
   own clip `id`), **so the fixture cannot show you the absent case.** Read it as absent-capable.
2. **There is NO palette or preset field, and a manifest carrying one is REFUSED, not ignored.**
   A clip supplies the donor's 96 palette bytes; the preset that installs them is named by
   Aurora at paste time. A page that expects to read a palette name out of the manifest is
   built against a field that was deliberately removed.
3. **Clip ids are held to the regions schema's own region-id pattern** (`^[a-z][a-z0-9_]{0,31}$`,
   confirmed in `tools/clip_manifest.py` and matching the pattern verified in
   `contract/schema/aurora-regions.schema.json`), so one rectangle keeps one name in both
   documents. That is the property the page should rely on.
4. **COLLISION IS NOT IN THE MANIFEST.** Aeon's next parcel. **Nothing built against this format
   may assume a pasted clip already carries collision** — and this is the assumption most likely
   to be made silently, because a pasted rectangle looks complete on screen.

### Two engine facts that change what the page should show

- **The 2048 px placement snap stayed, but its REASON changed under aeon's measurement.** Window
  cost is identical whether a section holds one zone or two (9 of 12 either way, adjacency fixed).
  What the snap protects is the **per-section tile lookup table**: 394+224 split against 617
  merged, hard limit 2047. So the bake **refuses** an unsnapped placement (with an in-file
  opt-out), while two zones in one section is a **warning, not a refusal**. The hard rule nobody
  had written down is **8 px**.
- **A tile index is 11 bits**, so one act-wide tileset caps at 2048 tiles while six clipped zones
  need 2,965. **Multiple tilesets are forced, not chosen** — a budget view that assumes one
  tileset per act is wrong by construction.

*(Aurora's four constraints all landed, two of them changing aeon's design rather than being
accommodated: the palette field removed, and clip ids bound to the region-id pattern. Provenance
sits in the manifest and the bake output, never in the regions document and never in `name` —
on the ground that a field whose own contract says it is decorative must not carry anything
load-bearing.)*
