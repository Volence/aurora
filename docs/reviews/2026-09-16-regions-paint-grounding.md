# REGIONS-PAINT is not one row: it is editor-spec steps 4 to 10, and the precedents it rests on are real

Written by the overseer while the seam leg ran, so that a rotation does not lose it. Nothing
here is a ruling; it is grounding, re-derived firsthand, for the dispatches that follow.

## The queue row understates the work, and the two specs collide on step numbers

`REGIONS-PAINT` is booked as one `L`. The editor spec's §7 build plan
(empyrean `origin/main:docs/superpowers/specs/2026-09-14-aurora-regions-editor-design.md`,
read at that revision, never through `../empyrean/`) decomposes this lane's half into
**steps 4 to 10**, each independently verifiable:

| step | what | size (spec's estimate) |
|---|---|---|
| 4 | the codec, **the TS flattening and `resolveRegion`, tested against the shared golden** | M |
| 5 | `SetRegionsCommand` + history; load/save plan entries under `dataPath`; load-time validation notices | S |
| 6 | the Regions facet: list, bindings rows, badges (§3.4), **no painting yet** | M |
| 7 | `migrate-sections` (§4) and `migrate_sections` on the bus | M |
| 8 | the world-space marquee, add/move/resize, carve (§3.2); the map overlay — **this is the painting** | M to L |
| 9 | the screen frame, reference mark, `[`/`]` hop (§3.5) | M |
| 10 | the bus methods; `docs/MCP.md` rewritten | S |

**REGIONS-SEAM-LEG is step 4's back half.** The parse/serialise half landed 2026-09-16
(`docs/reviews/2026-09-16-regions-codec.md`); the flattening against the golden is what the
seam leg builds. So when the seam leg lands, **step 5 is the next dispatch**, not "paint".

⚠ **ALWAYS SAY WHICH SPEC WHEN NAMING A STEP.** The spec carries its own warning about this and
it is live: `2026-09-14-regions-part-2-design.md` (engine half) and
`2026-09-14-aurora-regions-editor-design.md` (editor half) number independently, and they
collide — **part 2's step 10 IS the editor spec's step 1** (the schema, landed at empyrean
`c3f892f`), while the editor spec's step 2 is aeon TOOLS work part 2 describes only in prose.
The hub has already been caught reading one against the other.

⚠ **THE SPEC'S §7 CARRIES A MEASUREMENT THAT IS NOW STALE, AND IT IS STALE IN THE GOOD
DIRECTION.** It records, measured at aeon `f9413014`, that `load_act_regions` has **zero**
matches anywhere in aeon's tree and therefore **"the shared golden does not exist"**. It exists
now: aeon landed it at `e3b21e7267fa0590fdf43fbede068a98fc681c16`
(*"merge(REGIONS SEAM): the loader, the flattener and the shared golden"*), verified here an
ancestor of aeon `origin/master`, carrying `tools/fixtures/regions/ojz_act1.regions.json` and
`ojz_act1.rows.json`. **Editor-spec step 2 is done.**

⚠ **AND `e3b21e72` IS A LANDING, NOT A PIN — DO NOT REUSE IT AS ONE.** Corrected 2026-09-16 by
the seam-leg agent against this file's own author. `git log origin/master -- <path>` over both
golden files names **`97723264e3ec975e46b1c2569ad9aadb00f5074a`** as the *only* commit that has
ever touched either; `e3b21e72` is the merge eight commits later and resolves the same blobs
only because it does not touch them. Identical bytes, weaker citation. The vendored sidecars
pin `9772326`. **The rule is this repo's own** (`docs/reviews/2026-09-16-regions-codec.md`, "The
pin, re-derived here": the pin is the last-touching commit, never the tip) — it was quoted in
the dispatch brief that then broke it, which is the ordinary way a rule fails: not disputed,
just not applied to the sentence being written. Do not read that paragraph as current;
it is a dated measurement, which is the class this repo keeps paying for.

## The precedent the hub cited for region colours is REAL — checked, not assumed

Ruling 1 of §8 (the owner's *"Mayybe give an option to change color later"*) is applied by the
hub as: save the author's region colour **editor-side in a sidecar, the `.chunklinks.json`
precedent, never in `regions.json`**, so level data stays free of editor-only fields.

That precedent was worth checking before building on it, because the module named after it,
`src/core/editing/chunk-links.ts`, says in its own header that **"Nothing here reads or writes
the filesystem"** — it is the pure model, not a sidecar. The sidecar is real, and it is
elsewhere:

| piece | where |
|---|---|
| the wire format | `test/formats/section-chunk-links.test.ts` — *"The `section_N.chunklinks.json` wire format — chunk identity on disk"* |
| the writer | `src/core/project/aeon/save.ts:313`, `serializeSectionChunkLinks(section.chunkLinks)` |
| round trip, and the **understood/unreadable split** | `test/formats/aeon-chunk-links-roundtrip.test.ts` — a stamped section writes the file and reopening restores the same placement and plane; a corrupt one lands in `section.unreadable` with a matching notice, and a good one appears in neither |

**That last row is step 5's whole shape already built once.** Step 5 asks for "load/save plan
entries under `dataPath` (understood/unreadable split)" and "load-time validation notices";
the chunklinks roundtrip test is the pattern to follow, and `aeon-save.test.ts` in
`src/renderer/state/__tests__/` is the plan-shape test the spec names.

So: the hub's cited precedent stands, its module reference points one layer too shallow, and
the useful artifact is the **pair** (pure model, plus a writer and a roundtrip test that owns
the failure modes). Build region colours the same way.

## What is settled and must not be relitigated in a brief

- **The contract schema stays CLOSED** — hub ruling 2026-09-16, empyrean `39b8405`. A shape key
  was refused on the ground that an Aurora author has no DEBUG and no release, so a build
  concept in a GUI-edited document is a flag that gets mis-set once and then believed. The
  codec does not change, and a disagreement with a DEBUG ROM is **not** a flattener defect.
- **Region hues** are fixed by default, recolourable later, saved editor-side (above).
- **The screen frame** is always visible in the Regions facet and arrow keys take it; panning
  moves to Shift-drag or the middle button there. Owner, *"Sure."*
- **`[` and `]`** for the edge hop. Owner, *"That sounds fine."* Not verified against every
  facet's bindings — the spec's §9 says so, so step 9 verifies it rather than assuming it.
- **Migration naming**: the preset name when the preset is explicit, `sec_N` otherwise. He had
  no preference, so the recommendation stands as the default.
- **Marking regions that share a background** (his item 5) is out with a Fable agent tonight,
  under his 2026-09-16T05:2xZ instruction lifting the look park for regions phase 2. It lands
  in step 6's badges and §3.4. **The hub's "Colour by: region / background / effects preset"
  shape is a PROPOSAL, not a ruling**, and it contends with the author-chosen hues above for
  the same channel; that tension is the content of the call.
