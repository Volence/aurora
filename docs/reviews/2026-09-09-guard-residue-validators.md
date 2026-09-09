# GUARD-SEAT-RESIDUE, first named surface — the effects formats tree's validators

Branch `parcel/guard-residue-validators`, base `e443f98d`. Written as the work is
formed, not after, so a death costs the run and not the read.

The residue row `GUARD-SEAT-RESIDUE` names four surfaces the guard seat did not
reach. Two of them are not this parcel's: the main-process close guard is CLOSED
(`docs/reviews/2026-09-09-close-guard-witness.md`), and the off-schema road to
the agent handler plus the budget module's currency claim are a sibling parcel's.
This packet covers the first named surface, **the effects formats tree**, and the
second, **the collision tree**, insofar as tonight's `COLLISION-NEVER-AUDITED`
audit (`docs/reviews/2026-09-09-collision-audit-notes.md`, 22/25) left it open.

## 1. Baseline

`npm test` at base `e443f98d`, exit 0:

    Test Files  563 passed | 3 skipped (566)
    Tests       8248 passed | 9 skipped (8257)
    skip-report: OK. Every skip named its reason.

A bare `npx vitest run` is 30s wall on this machine, so **every plant below was
scored against the WHOLE suite**, not a scoped subset. No plant's verdict rests
on a scope argument, and no survivor needed a second confirming run.

## 2. Enumeration method, and what it cannot see

The unit is the **guard predicate**: one condition inside a validator whose truth
emits a refusal, an advisory or a schema issue. For
`src/core/formats/effects/json-schema-subset.ts` — the evaluator both committed
contract schemas are validated by, and the tree's only real validator in the
"decides yes or no about a document" sense — the population was read off the
file directly and cross-checked two ways:

- `grep -n 'issues.push\|throw new'` over the file gives 16 issue sites and 17
  throw sites;
- the JSON Schema keyword tables the file itself maintains (`SUPPORTED_KEYWORDS`,
  `IMPLEMENTED_TYPES`, `NAME_KEYED_SUBSCHEMAS`, `SINGLE_SUBSCHEMA`,
  `LIST_SUBSCHEMAS`, `IN_PLACE_APPLICATORS`, `ASSERTION_KEYWORDS`) give the
  keyword-by-keyword census independently of where the code puts its throws.

⚠ **WHAT THIS ENUMERATION CANNOT SEE.** It finds guards that EMIT — a push, a
throw, a refusal string. It does not find a guard that silently CORRECTS: a
clamp, a coalesce, a `?? 0`. `scene-ui.ts` has at least one by name
(`clampRowRemapPlaneY`) and the effects tree's `?? ` sites were not enumerated at
all. A reader should assume the correcting guards of this tree are UNCOVERED by
this packet, not covered.

It also stops at the file boundary: `preset.ts` (2,290 lines) and `scene-ui.ts`
(2,344 lines, 71 throws) carry far more refusal sites than were planted here.
See §6 for exactly where the budget ended.

## 3. The result, stated as a ratio

**39 plants scored, 26 killed, 13 survived — 67%.** (Two further plants were
VOID and re-planted rather than counted; see §5.)

The ratio is not the finding. The finding is that the survivors are not scattered:

> **Every guard the committed documents exercise is killed. Every guard that
> exists so a FUTURE schema amendment cannot pass silently survives.**

The document-driven half of the evaluator — `validateNode`'s keyword checks —
is 18 killed of 19 planted. The amendment-facing half — `assertSupported`,
`assertSchemaSupported`'s whole-schema walk, `resolveRef`, and
`canonicalizeBySchema` — is 8 killed of 20. And the amendment-facing half is
precisely the half whose job is to say **"I cannot look at this"**: the file's
own header calls it "the partial-coverage hole this file promises not to have",
after the `cycles` amendment shipped a `"type": ["array","null"]` that the
keyword-coverage gate could not see because `type` was already supported.

That gate is real and it is tested for the keyword-NAME question. It is the
walk's SHAPE coverage that is not.

