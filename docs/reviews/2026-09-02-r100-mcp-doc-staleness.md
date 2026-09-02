# ROADMAP row 100 — `docs/MCP.md` staleness, re-measured

**Date:** 2026-09-02 · **Branch:** `fix/r100-mcp-doc-staleness` · **Project:** EFFECTS-W1
**Verified against:** aeon `origin/master` **`73b07a4f`** (2026-09-02 10:16 -0400,
"merge: our half of sigil's compiler pair — the unit-fold poison re-purposed").
Every aeon read in this packet went through `git -C ../aeon show origin/master:<path>`.
No sibling working-tree path was read. No emulator tool was called.

## Verdict on the two booked findings: BOTH ALREADY FIXED

Neither finding reproduced. Both were repaired by `580ecd85`, *"docs/MCP.md: the
export step is gone and effects_gen ships — two claims re-measured"*, committed
**2026-08-29 22:10:47 -0400** — **1h36m after** the row was booked at
**2026-08-29 20:34:17 -0400** (`40d75b23`). The row was accurate when written and
obsolete before the night was out. Nobody struck it, so it stood four days as a
live queue entry aimed at prose that already said the opposite of what it alleged.

Enumerating command (returns **exactly two** commits each — the one that
introduced the sentence, and `580ecd85` that removed it):

```
git log -S'booked and not built'          -- docs/MCP.md
  580ecd85 2026-08-29 22:10:47  (removed)
  4977f618 2026-08-22 13:21:11  (introduced)

git log -S'the engine build must BINCLUDE' -- docs/MCP.md
  580ecd85 2026-08-29 22:10:47  (removed)
  5624a085 2026-06-11 16:34:54  (introduced)
```

| Finding | Status | Read to establish it |
|---|---|---|
| (a) `{zone}_BG_{id}` labels / BINCLUDE export promise | **ALREADY FIXED** | `docs/MCP.md:95+` now opens *"There is no export step and no `{zone}_BG_{id}` labels"*. Aurora's own `src/core/project/aeon/save.ts:11-23` carries the matching "THE EXPORT STEP IS GONE (2026-08-19)" comment — the citation spans exactly those lines. |
| (b) `effects_gen.py` "booked and not built" | **ALREADY FIXED** | `docs/MCP.md:176+` now opens *"An authored scene DOES reach a ROM."* aeon ships `tools/effects_gen.py`, `tools/test_effects_gen.py`, `tools/EFFECTS_CONSUMER_CONTRACT.md` and 9 more `effects_*` tools at `73b07a4f`; the contract's consumer table (`:24`) reads **BUILT AND WIRED** 2026-08-22. |

## What was actually wrong today — the same defect one layer down

The prose `580ecd85` wrote is **substantively correct**: every mechanism in it
re-verified at `73b07a4f`, nothing falsified. But it cites aeon by **bare
`path:line` carrying no revision**, so it rots invisibly. In four days,
**six of the eight** aeon line citations in the two paragraphs had drifted:

| Citation as written | Actual at `73b07a4f` | Δ |
|---|---|---|
| `EFFECTS_CONSUMER_CONTRACT.md:178` (does not read `bgLayoutRef`) | **195** | +17 |
| `act_descriptor.emp:207` (`sec_bg_layout: default`) | **211** | +4 |
| `regenerate-level.sh:94` (`inject_editor_bg.py`) | **95** (94 is the `[[ -f ]]` guard) | +1 |
| `regenerate-level.sh:206` (`effects_gen.py emit`) | **207** | +1 |
| `build.sh:394-407` (staleness gate) | **409-426** | +15/+19 |
| `build.sh:534` (`effects_gen.py check`) | **569** | +35 |
| `engine/structs.emp:119` | **119** | held |
| `EFFECTS_CONSUMER_CONTRACT.md:24` | **24** | held |

Aurora-side citations all held: `save.ts:11-23`, `build-plan.ts:174-179`.
The quoted `effects_scenes.emp` header (*"2 editor scene(s) … 2 binding(s),
9 act sections"*) is still byte-exact.

## One claim got STRONGER, not merely re-numbered

The doc said *"every section of the shipped act still carries `sec_bg_layout:
default`"* — an enumeration a reader has to re-check per section, and one that
would silently become false if a single section were given an override.

At `73b07a4f`, `sec_bg_layout` appears **exactly once** in the whole descriptor,
inside the `ojz_sec` comptime constructor (`:202`) whose signature takes **no BG
parameter**, with the field set to `default` at `:211`. All nine sections
(`:229-317`, `sec: 0`–`sec: 8`) build through that one constructor. So no section
*can* carry anything else — the property is structural, not enumerated. Rewritten
to say so, since a reader following the old line number lands on one line and has
no way to tell whether "every" was ever checked.

## What changed

- `docs/MCP.md` — six citations corrected; the `sec_bg_layout` sentence rewritten
  to the structural claim; a ⚠ preamble note added that (i) declares a bare
  `aeon path:line` perishable, (ii) names `73b07a4f` as the revision these were
  checked at, (iii) **scopes itself explicitly** to the two paragraphs it covers
  — identified by their opening words, since the BG prose has no heading of its
  own (it lives under `## Collision`; there is no `## Backgrounds` section)
  and disclaims the citations carrying their own pins (`4aa2abc0`, `9cdf32d8`,
  `6e2495a5`), which were NOT re-checked, and (iv) gives the
  `git -C ../aeon show <rev>:<path>` recipe plus the never-read-a-sibling's-
  working-tree rule.
- `docs/ROADMAP.md` — row 100 struck and marked DELIVERED with the above.

## Scope notes and non-closure

- **No gate added.** Nothing here is machine-checkable without a sibling-repo
  probe, which is wrong from a worktree, wrong from a lone clone, and absent from
  a packaged build — the same reasoning row 8 used to decline one, and the reason
  the empyrean schema reconciliation is a ritual rather than a test. Per the
  brief's red-first requirement, a gate that cannot be proven red is not shipped.
- **Third staleness, NAMED not fixed** (reported to the overseer to book): the
  same bullet said `level_staleness.py`'s "newer" side is *"all of
  `data/editor/**`"*. It is that **plus** `editor_bg_override.json` and the
  project's tileset entry (`tools/level_staleness.py:36-39`). Not false for the
  claim it supports (a scene edit lives under `data/editor/**` and does trip the
  gate), so this was corrected in place only because the sentence sits inside a
  citation I was already re-numbering and leaving it would have read as
  contradictory beside the newly exact line references.
- **Completeness NOT claimed.** This packet asserts nothing about aeon citations
  elsewhere in `docs/MCP.md`. The preamble note says which paragraphs it covers
  and that the rest were not re-checked, rather than implying a clean sweep.
