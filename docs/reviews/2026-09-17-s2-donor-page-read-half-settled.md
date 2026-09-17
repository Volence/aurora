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
at `origin/master:docs/research/s2-compressed-act/2026-09-17-whole-zone-converter.md`
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
**So no donor zone exists anywhere yet.**

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
2. **Run aeon's converter locally** to produce a real zone. Highest fidelity, and the result
   is un-committable by aeon's current ignore, so it proves nothing a successor can re-run.
3. **Skip loudly** when no donor tree is present, naming the variable and the path. Honest,
   and on its own it means the page's main path is never exercised by anything.

**The recommendation: 1 plus 3** — an owned fixture for the behaviour, a loud reasoned skip
for the real-tree path, and a currency row so the fixture cannot silently diverge. That is
the same division this repo already uses where a peer's data is not committable.

**Whichever is chosen, "no donors present" is a first-class state of the page, not an error**
— today it is the *only* state that can occur on any machine, including the owner's.
