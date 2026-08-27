# Row 59 — retiring `Precision`, the control for a field the engine deleted

Branch `feat/retire-precision`. Commits `896ef48` (code + re-pin), `0d533e5`
(canopy_dusk), `d0bc864` (writer-originated re-run), plus this packet.

Baseline on entry: **5069 passed / 7 skipped / 0 failed**, 387 files, tsc clean.
Final: **5070 passed / 7 skipped / 0 failed**, 387 files, tsc exit 0. Net +1 is
the new refusal row; the two retired `scene-ui` rows were replaced one-for-one.

---

## 1. What the change is, and the distinction that decides it

aeon deleted `precision` on 2026-08-26. Verified firsthand in the engine, not
taken from the brief: `engine/level/scene_dsl.emp:422-423` records
`PRECISION_CELL` / `PRECISION_LINE` and the `Scene.sc_precision` field as having
*"LIVED HERE until 2026-08-26"*, retired with the per-cell HScroll path under
owner ruling d-29-corrected — the field's only consumer was arm 4 of the per-line
forcer, and with one fill there is nothing to force. `:1009` records `sc_pad_5D`
shrinking `u16 -> u8` to fill the byte `sc_precision` vacated.

**Removed, not reserved.** The engine deleted the *storage*, not merely the
behaviour, so there is nothing left to reserve a slot for. The contrast is
`v_factor_fg`, which stays in the schema because the runtime *will* read it.
Owner ruling d-16 chose removal for exactly that reason.

---

## 2. The re-pin

Re-vendored **by extraction**, per `docs/OVERSEER.md`'s rule, never hand-edited:

    git -C ../empyrean show 0bd4753:contract/schema/... > <vendored>

* blob `0f661b70` → `dd972cf0`, **exactly one line** removed.
* `0bd4753` is an **ancestor of empyrean `origin/main`**, and `origin/main`'s
  blob is the same `dd972cf0` — so the pin is *current*, not merely correctly
  cited.
* The anchor bound (8→16) and `left_column_mask` conditions that rode in on the
  same hub commit were already vendored here by rows 56 and 58, which is why
  this re-pin is one line.

### A stale pin nobody could have caught

`scene.ts`'s header comment cited blob `cab3ca58` — **stale by two re-pins**
(item 37 moved it to `d4345af5`, row 56 to `0f661b70`), and
`effects-scene-golden.test.ts` cited the same `cab3ca58`, stale by three.
Neither went red, because **nothing hashes a comment**. Both are corrected, both
now name `effects-schema-drift.test.ts` as the pin *of record*, and both carry
the full pin history so the next re-pin appends rather than overwrites.

---

## 3. The derived read did its job

`scene-ui.ts` read the enum with `stringEnumAt('properties','precision')`. When
the key left the schema, that threw at module load and took the suite with it:

```
Error: effects scene schema has nothing at properties.precision — a UI constraint
that used to be derivable no longer is; re-derive it against the amended schema.
```

That is the module header's "EVERY READ IS LOUD" working as specified. **The
derivation was deleted, not given a fallback.** A hand-typed `['cell','line']`
would have gone on offering a dead control in silence — the defect this row
exists to fix.

---

## 4. A retired key is a REFUSAL — and the open call I was handed

The schema is **closed** (`unevaluatedProperties: false` at top level; its own
`description` explains why — on the writer path the party validating is the party
publishing). So retiring the key does not merely stop the UI offering it: a
document still carrying it **fails validation**.

This was already booked in ROADMAP row 59 itself, which correctly noted the hub
priced the cost off a grep of *aeon's* tree while the schema's other consumer is
this repo. The hub's ruling text left one call to Aurora:

> a tolerant read that discards a stray `precision` is aurora's call.

**Declined, on evidence:**

1. **The population is empty — verified, not assumed.** The hub grepped aeon
   `origin/master`; I checked the **owner's live aeon tree**. Both
   `games/sonic4/data/editor/effects/*.json` (`ojz_act1_start`, `ojz_act1_depth`)
   carry zero `precision` keys. On Aurora's side only the two fixtures and one
   test string carried it.
2. A tolerant discard is a **silent lossy path** — precisely what §6 hazard 1
   ("round-trip what you do not understand, or refuse the file") and this codec's
   no-field-enumeration design exist to prevent.
3. The refusal is **loud and names the file**; the author's fix is deleting one
   line. An un-exercised tolerance branch for an empty population rots.

The refusal is now **pinned by a test** so nobody quietly "fixes" it back.

---

## 5. Red-first plants — every one, with its quoted failure

| # | plant | gate that caught it | quoted failure |
|---|---|---|---|
| 1 | re-add `"precision"` to the **vendored schema** | `effects-schema-drift` | `AssertionError: expected '0f661b7052cced56597e958849bbcd787db5a…' to be 'dd972cf0e203a11330dfcec60b8c3ca59eac5…'` |
| 1 | (same plant) | `scene-ui` retirement row | `AssertionError: expected [ 'schema', 'id', 'name', …(13) ] to not include 'precision'` |
| 2 | disable the **closed-schema branch** in `json-schema-subset.ts` | `effects-scene` refusal row | `AssertionError: expected [Function] to throw an error` (+4 sibling closed-schema rows) |
| 3 | re-add the **`Precision` panel control** | writer-originated key-set row | `AssertionError: expected true to be false` |
| 3 | (same plant, rebuilt, under CDP) | harness row **6f** | `FAIL [6f] … {"precisionSelects":1,"precisionLabels":1,"transitionSelects":1,"vFactorInputs":1,"selectsInPanel":47}` → **28/29** |

All three plants restored; `git diff --stat` clean on each restored file, and the
vendored schema re-hashed to `dd972cf0` after restore. Control run after restore:
**29/29**, emitting bytes identical to the committed fixture.

Plant 1 is worth one extra line: re-adding the deleted line reproduced blob
`0f661b70` **exactly**, which independently confirms that one line was the entire
difference between the two contract revisions.

Plant 3's CDP half was deliberately given a **different tooltip**
(`"precision — PLANTED DEFECT, row 59 red-first"`). Row 6f caught it anyway, on
both of its independent detection paths, which shows the row is not keyed to the
original title string.

---

## 6. Alternative green-paths named and ruled out

The operational question — *if this row went green for a reason OTHER than the
rule holding, what would that reason be?*

| row | the alternative green path | how it was ruled out |
|---|---|---|
| harness **6f** ("the control is gone from the running app") | **the panel never mounted**, so nothing matched and absence is trivially true | the row itself requires `transitionSelects === 1`, `vFactorInputs === 1`, `selectsInPanel > 1` — its row-mates present. The plant run proves this is not decorative: the row still went red with the panel mounted (`selectsInPanel: 47`). |
| harness **6f** | the control is **still rendered but retitled**, so a title-regex misses it | a second, independent path counts visible **labels** reading exactly "Precision". The plant carried a changed title and `precisionLabels: 1` fired. |
| `scene-ui` retirement row | the **schema import failed / is empty**, so every "not present" assertion passes | anti-vacuous siblings assert `transition` and `left_column_mask` ARE in `properties`. An empty schema fails those first. |
| `scene-ui` retirement row | `precision` was **moved into `$defs`** rather than deleted, so `properties` is clean but the key lives on | a whole-schema `JSON.stringify(rawSchema)` match for `/precision/`. |
| `effects-scene` refusal row | it throws for **some unrelated reason** (any parse throwing satisfies "it throws") | the identical document *without* the key is asserted **not** to throw, so the key is the whole difference; plus an unrelated alien key is asserted to be refused the same way, and `unevaluatedProperties` is asserted `false`. |
| `effects-aeon` choice-set row | `SCENE_FORM_CHOICES` is **empty**, so "does not contain precision" is trivial | `Object.keys(...).length > 0` asserted first. |

---

## 7. Rows disclosed as NON-DISCRIMINATING

Stated because it costs something.

* **`effects-aeon.test.ts` "offers both transitions, and offers NO precision"
  stayed GREEN under plant 3** (re-adding the panel control). The plant wrote a
  literal `<option value="cell">` rather than mapping `SCENE_FORM_CHOICES`, so
  the provider constant was untouched. **The catcher is the writer-originated
  key-set row**, which scans the panel *source* for `setSceneFieldCommand`
  literals. This row guards the provider, not the panel — a real division of
  labour, but it does not catch a hand-rolled control.
* **Harness rows 6g and 7f stayed GREEN under plant 3.** Correctly: the planted
  control was rendered but never *driven*, because the gesture sequence no longer
  touches precision, so no key reached the document or the file. **The catcher is
  6f.** 6g and 7f guard the *data* path (a default seeded in `newEffectsScene`,
  a stale command replayed) — a different hazard, and they would catch that one.
* **`test/formats/effects-scene.test.ts`'s old `expect('precision' in scene)
  .toBe(false)` was already non-discriminating** and is why it was replaced: with
  nothing writing the key, it could only ever return green. It asserted nothing.

---

## 8. The two fixtures, by their own different rules

### `canopy_dusk.json` — writer-CERTIFIED, editing is legitimate

Key deleted, then re-emitted by the formatter §5 names —
`json.dumps(sort_keys=True, indent=2, ensure_ascii=False)` plus the §8 terminator
— **never** by the writer under test, so the byte round-trip stays
cross-implementation evidence rather than a serializer agreeing with itself.
Fixed point re-proven after: `effects-scene-golden` + trailing-newline gate,
**20/20**.

|  | before | after |
|---|---|---|
| blob | `01cadfae08bd044548c9754b9d321031e9ae3d1b` | `67efc2684831a9b55f1fd0128d01c97b44e6e8fa` |
| sha256 | `556a425de0f8308e9c1e85d36ead342e37da055b5bb3d3d2fc3738a59d22b48f` | `4a498433a96c8d1be90c89d111e6b84691074a52fdfda1bec6de04bb054d8efb` |
| size | 2,505 bytes, 140 lines | 2,482 bytes, 139 lines |

Delta: **one line**, `"precision": "cell",`.

### `writer_session_ojz.json` — writer-ORIGINATED, the session was RE-RUN

Its provenance forbids editing in as many words. Re-run under CDP, not patched.

|  | before | after |
|---|---|---|
| blob | `2c4104e465bff9d5f70399ab7e37a03ce6d49e4e` | `893cd05586c4524fa919adc6bbbb111e710d1a7e` |
| sha256 | `4564a270046a7f613e68b868cdcf8abcb332f075833e164e6cb53ec5b6de20bd` | `c28b6db065d2cf88a108d4f91baae3673fad66e67bf980c642f4a6e84ccb0dfd` |
| size | 956 bytes | 933 bytes, one trailing newline |

**The corroboration held — exactly one line:**

```
50d49
<   "precision": "cell",
```

Every layer, every factor spelling and every scene scalar came back
byte-identical. This is the precedent set by item 35's re-origination, and it is
what separates *faithful re-run* from *differently-driven session*.

**Harness 25/29 → 29/29.** R9 lost `precision`; no row was deleted (6a merely
narrowed to `transition`) and four were added: **6f** control gone from the
running app, **6g** key absent from the document, **7f** key absent from the
emitted file, **4c** the app's layer ceiling reported rather than assumed.

**aeon's own tree was never opened or written.** Both live scene files' mtimes
are byte-identical before and after (`1787770470`, `1787709676`), and no
`writer_session_ojz.json` exists there. The session ran against a writable copy
in scratchpad.

---

## 9. Four rots the re-run found — none of them this row's doing

All invisible until somebody actually re-ran the session, which nobody had since
2026-08-23.

1. **`doc[0]` was the wrong scene.** At origination the aeon project had *no*
   `editor/effects/` directory, so the created scene was the only one and index 0
   was safe. It has since gained `ojz_act1_start` and `ojz_act1_depth`, so the
   harness was reading **their** layer count as `N` and typing it into
   `v_factor`/`v_center`/`v_offset`. Now addressed **by id** (`sceneOf`).
2. **Three selectors end-anchored against titles that had grown a suffix** —
   `/^Layer i fa$/`, `/^Layer i fb$/`, `/^v_offset$/`. `SET_INPUT` returned
   `'no-element'` and the gestures drove **nothing**: every layer silently kept
   the app's default `FACTOR_1`, and `v_offset` never reached the document. Now
   `\b`.
3. **Rows 5c and 6b are what caught (2), and neither is decoration.** `FACTOR_1`
   is both a legal enumerated answer *and* the app's default, so a row asserting
   "fa is some schema factor" stays green through a run that drove nothing. Row
   5c pins layer 0's `fb` to the **packed sentinel** — the one cell the
   enumeration lands on a value no default produces. Row 6b reads the
   **document** rather than trusting a gesture landed.
4. **The layer count was already stale.** See below.

### The ceiling debt, stated plainly

Gesture R3 derives the layer count from the app's ceiling. That ceiling was **8**
at origination; **row 56 raised it to 16** on 2026-08-27 and nobody re-ran this
fixture — so the file was *already* stale against its own gesture rule before
row 59 touched it.

A literal ceiling-driven re-run would have moved **~9 lines at once** (eight new
layer blocks plus the three `N`-derived scalars) and **confounded the one-line
corroboration**, which is the only evidence separating a faithful re-run from a
differently-driven one. That is the same reason this row refused to widen the
gestures to row 58's deform controls.

So `LAYERS=8` was **pinned** for this run, the harness **prints the pin beside
the measured ceiling on every run** (rows 4a and 4c: *"app ceiling 16, this run
authored 8 — STALE by 8: a ceiling re-origination is owed"*), and the ceiling
re-origination is **booked as its own row**. Visible, not hidden. A pin recorded
in the output and the provenance is a debt; a pin nobody prints is a lie.

---

## 10. Environment and run stability

The dpr bar's underlying point is that this environment varies, so a number that
passed twice has proven nothing. This harness aims at **titled DOM elements and
`<select>` option indices**, never at client pixel coordinates, so the fractional
rect hazard does not arise here — there is no geometric aim to be off by one.
What still varies is machine load, so the run count and the environment are
printed beside every number.

| run | port | uptime | load average | result | emitted sha256 |
|---|---|---|---|---|---|
| 3 | 9413 | 1d 21:54 | 6.48 | **29/29** | `c28b6db065d2cf88a1…` |
| 4 | 9414 | 1d 21:54 | 7.76 | **29/29** | `c28b6db065d2cf88a1…` |
| 5 | 9415 | 1d 21:55 | 7.80 | **29/29** | `c28b6db065d2cf88a1…` |
| plant | 9416 | 1d 21:58 | 2.66 | **28/29** (6f red, as designed) | — |
| control | 9417 | 1d 21:59 | 4.84 | **29/29** | `c28b6db065d2cf88a1…` |

Four clean runs, byte-identical output, across a load range of 2.7–7.8. Every row
of every claim above comes from **one** run; no two rows are stitched from
different runs.

Two earlier runs are recorded rather than dropped: run 1 (**22/29**) and run 2
(**27/29**) are the runs that *found* the four rots in §9. They are failures of
the instrument, not of the feature, and they are why the instrument is now right.

---

## 11. What is left open

* ⚠ **NOT SEEN ON HARDWARE.** No emulator was touched (standing ban). Nothing in
  this row changes engine behaviour — the field is already gone from the engine —
  so there is no ROM-level claim outstanding. Flagged only for completeness.
* **The ceiling re-origination** (§9) — `writer_session_ojz.json` should be
  re-run ceiling-driven at 16 layers, as its own row, once nothing else needs a
  one-line delta from it. Booked in the ROADMAP.
* **Widening the gesture sequence to row 58's deform controls** — deliberately
  not done here, for the same confounding reason. Booked in the ROADMAP and
  stated in the provenance.
* **`canopy_dusk.json` carries `left_column_mask: "sprite_mask"`**, which the hub
  documented at `0bd4753` as *refused in every scene today* by the engine
  (`scene_dsl.emp:1354` — the left-column strip emission has not landed). It is
  schema-legal, so the fixture is valid and no test is wrong; noted because a
  shape-coverage fixture carrying an engine-refused value is worth someone's
  decision, not silently mine. Row 58 already ships the control as DISABLED.
