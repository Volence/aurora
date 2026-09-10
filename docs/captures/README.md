# `docs/captures/` — what a capture is and where it goes

**Ratified 2026-09-10 by the aurora lane, closing the `EFFECTS-CAPTURE-SHAPE` debt.** The
shape below is **DERIVED from the 42 capture directories already on disk, not invented for this
file** — it is what the convention became in practice between 2026-08-26 and 2026-09-09, written
down so the next session does not have to re-derive it from `ls`.

**Nothing here needed the owner.** A card sat on his console for fifteen days saying *"Effects
captures are built and waiting for you to ratify the shape"*. It had no id, no options and no
recommendation, so it could not render and he was never able to answer it. The shape is a
lane's to settle; `docs/decisions.jsonl` carries both the withdrawal and this ratification.

## The shape

```
docs/captures/YYYY-MM-DD-<slug>/
```

One directory per measurement or parcel, named by the date the measurement was taken and a
short slug matching the packet or ROADMAP row it belongs to. **41 of the 42 directories on disk
follow this; the exception is `f7-frame-09/`**, which predates the convention and is left alone
rather than renamed — a directory cited by a landed packet is evidence, and renaming it breaks
the citation to tidy a name.

Inside, whatever the measurement produced. In practice: `.png` (much the commonest), `.json`,
`.md`, `.diff`, `.bin`, and `logs/` or `run-1/`…`run-N/` subdirectories where a claim rests on
more than one run. There is **no mandatory manifest** — one directory carries a `captures.json`
because its own instrument emitted one, and one carries a `README.md` because its author had
something to say. Neither became general and neither is required here.

## The three rules that are not stylistic

**1. A capture is committed, or it is not evidence.** The whole point is that a later session,
or the owner, can open the thing a packet is describing. A screenshot living in a scratchpad or
a transcript does not exist to anyone else.

**2. Cite captures by path from the packet that rests on them.** 54 distinct capture paths are
cited across `docs/`, `scripts/` and `src/` today and **all 54 resolve** (measured 2026-09-10).
That is the property worth keeping.

**3. Do not rename or delete a directory a landed packet cites.** Superseded evidence stays; a
correction adds a new directory and says which one it supersedes. The cost of a stale capture is
one confused reader; the cost of a dangling citation is a packet whose evidence cannot be
checked at all.

## ⚠ Two measurement traps found while ratifying this, both worth more than the convention

**A grep for `docs/captures/...` across this repo returns paths that are NOT this repo's.**
The first pass here reported **7 dangling citations out of 76** and the true figure for aurora's
own tree is **0 out of 54**. The seven were: **three inside a vendored copy of aeon's tree that
lives under this repo's scratchpad fixtures**, where those same paths resolve correctly and are
aeon's; two from an illustrative example inside `scripts/check-doc-citations.mjs`'s own source;
and one that is not a citation at all but a packet *describing an untracked file in the aeon
checkout*, in a sentence whose point is that the file **predates that session and is another
lane's**. **Restrict the sweep to `docs/ scripts/ src/` and read what cites a path before
counting it as broken.**

⚠ **And the vendored tree is itself UNTRACKED, which is worse than the mis-attribution and was
found by `check-doc-citations` refusing this very file.** It exists only on the machine that
made it — so the naive sweep's `7` is **not even reproducible**: a reader on a fresh clone
greps the same way and gets a different number, with no way to tell which of the two figures
was the anomaly. A count taken across a machine-local tree is a fact about a machine.

That gate's refusal is also why the paragraph above names no path for it. It has **no
absence-marker exemption by design** — a disclosed dangling reference is still a pointer to
nothing, and if `(not committed)` excused one, every author would learn the phrase. The rule it
enforces is the one this file's rule 1 states from the other side.

**There is deliberately NO GATE enforcing any of this**, and the reason is the measurement: the
defect rate is **zero out of 54**. A gate added against a defect that is not occurring buys
nothing and can only cry wolf, and a gate that cries wolf gets retired — taking the real
coverage with it. If dangling capture citations ever start appearing, that is the moment to add
one, and the population above is the baseline to measure the change against.
