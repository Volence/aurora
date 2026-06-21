# S&K Collision Set Import (fresh start) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Replace the s4_engine's 84 synthetic collision shapes with Sonic & Knuckles' battle-tested 252-shape set, and make the bake author level collision from that fixed set + the editor's authoritative `.collattr.bin` (fresh start — no sonic_hack collision carried over).

**Architecture:** A new one-shot import tool writes S&K's heightmaps/rotated/angles verbatim into the engine's four committed collision tables (solidity = all). `ojz_strip_gen.py` is simplified: it stops walking sonic_hack collision and emitting tables; instead the tables are the fixed committed S&K set, and strip collision is the editor `.collattr.bin` (authoritative, clamped to 256) or air. Aurora needs no code change — it already reads the tables and shows them in the kind-tabbed palette.

**Tech Stack:** Python 3 (engine tools), AS/68k (build), TypeScript/React (Aurora — verify only).

**Spec:** `docs/specs/2026-06-21-sk-collision-import-design.md`. Out of scope: jump-through/solidity-picker (every shape is `all`).

**Key facts (verified):**
- S&K data in `skdisasm/Levels/Misc/`: `Height Maps.bin` (4096B=256×16 signed), `Height Maps Rotated.bin` (4096B), `angles.bin` (256B). All align 256/256/256; 252 non-empty shapes; 69 distinct angles. Byte format matches the engine's.
- Solidity encoding (s4): byte `& 3` → 0 none, 1 top, 2 sides-bottom, **3 all**. So `all` = `3`.
- Engine tables live at `s4_engine/data/collision/{heightmaps,heightmaps_rot,angles,solidity}.bin`.
- `ojz_strip_gen.py` `generate()` collision block: ~lines 1202–1255 (`per_section_coll`, `per_section_coll_rom`, `coll_sources`, the editor overlay, `emit_tables`). Pass-5 write of `out_a`/`out_src`: ~lines 1316–1331. `apply_editor_collision_overlay(grids, sec_id, max_index)` exists (authoritative; clamps editor index `< max_index` to 0). `build_section_collision()` (~998) is the sonic_hack walk to UNHOOK from `generate()` (keep the function for its unit test).
- `gen_collision_data.py data/collision` (build.sh ~line 76) currently regenerates tables from the sonic_hack walk — REMOVE that call so the committed S&K tables persist.

## File Structure
- **Create** `s4_engine/tools/import_sk_collision.py` — read S&K data → write the 4 engine tables.
- **Create** `s4_engine/tools/test_import_sk_collision.py` — verify the tables byte-match S&K + solidity rule.
- **Modify** `s4_engine/tools/ojz_strip_gen.py` — `generate()` collision path: tables fixed (no emit), strips = collattr-or-air; remove/update the obsolete `test_collision_emit_identity` self-test.
- **Modify** `s4_engine/build.sh` — drop the `gen_collision_data.py` table-regen step.
- **Commit (data)** `s4_engine/data/collision/*.bin` — the imported S&K tables (static).

---

## Task 1: S&K import tool

**Files:** Create `s4_engine/tools/import_sk_collision.py`, `s4_engine/tools/test_import_sk_collision.py`.

- [ ] **Step 1: Write the failing test** — `s4_engine/tools/test_import_sk_collision.py`:
```python
import os, subprocess, sys
HERE = os.path.dirname(__file__)
SK = os.path.normpath(os.path.join(HERE, "..", "..", "skdisasm", "Levels", "Misc"))
OUT = os.path.normpath(os.path.join(HERE, "..", "data", "collision"))

def run():
    subprocess.run([sys.executable, os.path.join(HERE, "import_sk_collision.py")], check=True)

def test_tables_byte_match_sk_inputs():
    run()
    assert open(os.path.join(OUT, "heightmaps.bin"), "rb").read() == open(os.path.join(SK, "Height Maps.bin"), "rb").read()
    assert open(os.path.join(OUT, "heightmaps_rot.bin"), "rb").read() == open(os.path.join(SK, "Height Maps Rotated.bin"), "rb").read()
    assert open(os.path.join(OUT, "angles.bin"), "rb").read() == open(os.path.join(SK, "angles.bin"), "rb").read()

def test_solidity_all_except_air():
    run()
    hm = open(os.path.join(OUT, "heightmaps.bin"), "rb").read()
    sol = open(os.path.join(OUT, "solidity.bin"), "rb").read()
    assert len(sol) == 256
    for i in range(256):
        shape = hm[i*16:(i+1)*16]
        air = (i == 0) or not any(shape)
        assert sol[i] == (0 if air else 3), f"shape {i}: solidity {sol[i]}"
```
- [ ] **Step 2: Run → FAIL** (`import_sk_collision` missing):
```
cd s4_engine && python3 -m pytest tools/test_import_sk_collision.py -q
```
Expected: FAIL (ModuleNotFoundError / file not found).
- [ ] **Step 3: Implement** — `s4_engine/tools/import_sk_collision.py`:
```python
#!/usr/bin/env python3
"""Import Sonic & Knuckles' collision shape set as the s4_engine's collision tables.

Reads S&K's heightmaps + rotated heightmaps + angles from the skdisasm checkout and
writes data/collision/{heightmaps,heightmaps_rot,angles,solidity}.bin — the engine's
fixed 256-slot collision vocabulary. Every non-air shape gets solidity 'all' (3);
classic Sonic heightmaps carry no solidity, so per-shape jump-through variants are a
future feature. Index 0 (and any all-zero slot) stays air (solidity 0).

    python3 tools/import_sk_collision.py
"""
import os

HERE = os.path.dirname(__file__)
SK = os.path.normpath(os.path.join(HERE, "..", "..", "skdisasm", "Levels", "Misc"))
OUT = os.path.normpath(os.path.join(HERE, "..", "data", "collision"))
SHAPES, ROW, SOLID_ALL = 256, 16, 3   # s4 solidity: 0 none,1 top,2 sides-bottom,3 all


def _read(name, expect):
    d = open(os.path.join(SK, name), "rb").read()
    assert len(d) == expect, f"{name}: {len(d)}B, expected {expect}"
    return d


def build():
    hm = _read("Height Maps.bin", SHAPES * ROW)
    hr = _read("Height Maps Rotated.bin", SHAPES * ROW)
    an = _read("angles.bin", SHAPES)
    sol = bytearray(SHAPES)
    for i in range(SHAPES):
        shape = hm[i * ROW:(i + 1) * ROW]
        sol[i] = 0 if (i == 0 or not any(shape)) else SOLID_ALL
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, "heightmaps.bin"), "wb").write(hm)
    open(os.path.join(OUT, "heightmaps_rot.bin"), "wb").write(hr)
    open(os.path.join(OUT, "angles.bin"), "wb").write(an)
    open(os.path.join(OUT, "solidity.bin"), "wb").write(bytes(sol))
    n = sum(1 for i in range(SHAPES) if any(hm[i * ROW:(i + 1) * ROW]))
    print(f"Imported {n} S&K collision shapes -> {OUT} (all solidity 'all')")


if __name__ == "__main__":
    build()
```
- [ ] **Step 4: Run → PASS** (`cd s4_engine && python3 -m pytest tools/test_import_sk_collision.py -q` → 2 passed). Then run the tool for real: `python3 tools/import_sk_collision.py` (prints "Imported 252 …").
- [ ] **Step 5: Commit**
```bash
cd s4_engine && git add tools/import_sk_collision.py tools/test_import_sk_collision.py data/collision/heightmaps.bin data/collision/heightmaps_rot.bin data/collision/angles.bin data/collision/solidity.bin
git commit -m "feat(collision): import the Sonic & Knuckles collision shape set (252 shapes, all solid)"
```

---

## Task 2: Bake fresh-start (fixed tables + collattr-or-air strips)

**Files:** Modify `s4_engine/tools/ojz_strip_gen.py`, `s4_engine/build.sh`.

- [ ] **Step 1:** In `ojz_strip_gen.py` `generate()`, replace the whole collision block (from `per_section_coll: dict... = {}` through the `emit_tables`/stub `else:` branch, ~lines 1202–1255) with the fresh-start version — air baseline, editor overlay, NO table emit:
```python
    # Fresh start: collision shapes are the FIXED imported S&K tables in
    # data/collision/ (committed by tools/import_sk_collision.py; not regenerated
    # here). Level collision is all AIR except what the editor authored
    # (.collattr.bin / .collattrb.bin, applied authoritatively below). No
    # sonic_hack collision walk, no attr-set, no table emit.
    air_col = bytes(COLLISION_ROWS_PER_STRIP)
    per_section_coll: dict[str, tuple[list[bytes], list[bytes]]] = {
        sec_id: ([air_col] * len(strips), [air_col] * len(strips))
        for sec_id, strips in per_section_strips.items()
    }
    per_section_coll_rom = per_section_coll
    if use_editor:
        max_index = 256  # imported S&K table capacity; clamp stale editor indices
        per_section_coll_rom = {
            sec_id: apply_editor_collision_overlay(grids, sec_id, max_index)
            for sec_id, grids in per_section_coll.items()
        }
        painted = sum(1 for sid in per_section_coll_rom
                      if per_section_coll_rom[sid] is not per_section_coll[sid])
        print(f"Collision: {len(per_section_coll)} sections (air baseline), "
              f"editor override applied where authored")
```
(Leave the Pass-5 write unchanged: `out_a` already uses `per_section_coll_rom`, `out_src` uses `per_section_coll`. So strips_a = collattr-or-air, strips_source = air.)
- [ ] **Step 2:** Remove/neuter the now-false self-test. Find `test_collision_emit_identity` (~line 870–890): it asserts `generate()`-equivalent tables == `gen_collision_data.real_tables()` (the sonic_hack walk). That premise is gone. Delete that test function and any call to it in the `test` runner. Keep `build_section_collision` and its own focused unit tests if present (the function is unused by `generate()` now but harmless; a follow-up may delete it).
- [ ] **Step 3:** In `build.sh`, delete the table-regen step so the committed S&K tables persist. Remove:
```bash
echo "Generating baseline collision tables (heightmaps, heightmaps_rot, angles, solidity — strip-gen re-emits the authoritative set)..."
python3 "${TOOLS}/gen_collision_data.py" data/collision
```
- [ ] **Step 4:** Run the bake self-tests + a generate:
```
cd s4_engine && python3 tools/ojz_strip_gen.py test     # expect: All tests passed
python3 tools/ojz_strip_gen.py generate                 # expect: "Collision: 9 sections (air baseline) …"
```
- [ ] **Step 5: Verify** the data flow at the byte level (no collattr present → all-air strips; with one painted cell → it reaches the block):
```
cd s4_engine && python3 - <<'PY'
import os
G='data/generated/ojz/act1'
WIDE,NT,W,ROWS=776,512,256,128
# (a) tables == imported S&K
import hashlib
for t in ['heightmaps.bin','heightmaps_rot.bin','angles.bin']:
    a=hashlib.md5(open(f'data/collision/{t}','rb').read()).hexdigest()
    sk={'heightmaps.bin':'Height Maps.bin','heightmaps_rot.bin':'Height Maps Rotated.bin','angles.bin':'angles.bin'}[t]
    b=hashlib.md5(open(f'../skdisasm/Levels/Misc/{sk}','rb').read()).hexdigest()
    print(t, 'tables==S&K' if a==b else 'MISMATCH')
# (b) strips_source collision is all air (fresh start baseline)
s=open(f'{G}/sec0_strips_source.bin','rb').read()
nz=sum(1 for col in range(W) for cr in range(ROWS) if s[col*WIDE+NT+cr])
print('sec0_strips_source collision non-air:', nz, '(expect 0 with no collattr)')
PY
```
- [ ] **Step 6: Commit**
```bash
cd s4_engine && git add tools/ojz_strip_gen.py build.sh
git commit -m "feat(collision): bake fresh-start — fixed S&K tables + collattr-or-air strips (drop sonic_hack walk)"
```

---

## Task 3: End-to-end verification (build + Aurora palette + in-game)

**Files:** none (verification only). Aurora is expected to need NO change.

- [ ] **Step 1: Full ROM build** (sound on, debug):
```
cd s4_engine && SOUND_DRIVER_ENABLED=1 DEBUG=1 ./build.sh 2>&1 | grep -iE "ERROR|Build complete"
```
Expected: `Build complete: s4.bin …`, no ERROR (tile-budget guard passes).
- [ ] **Step 2: Aurora shows the S&K palette** — `cd aurora && npx tsc --noEmit && npm test && npm run build` (all green). Then GUI-verify (user): open the Collision tool — the palette shows ~252 shapes across **Slope / Wall / Ceiling / Solid** tabs, angle-sorted; the **Floor** tab is hidden/empty (all shapes are `all`). No code change should be needed; if `solidCount`/loading caps at the old count, that's a bug to fix (Aurora reads `profiles.solidCount` from the adapter, which counts non-air to last index — should report ~252).
- [ ] **Step 3: Paint reaches the ROM** — GUI: paint a floor patch in section 0, Save. Then:
```
cd s4_engine && SOUND_DRIVER_ENABLED=1 DEBUG=1 ./build.sh >/dev/null 2>&1
python3 - <<'PY'
import sys,struct,re; sys.path.insert(0,'tools'); import s4lz
blob=open('data/generated/ojz/act1/sec0_blocks.bin','rb').read()
dl=int(re.search(r'SEC0_BLOCK_DICT_LEN\s*=?\s*(\d+)', open('data/generated/ojz/act1/sec_block_dicts.asm').read()).group(1))
idx=struct.unpack_from('>256I',blob,0); dr=blob[1024:1024+dl]; tot=0
for e in idx:
    if not e: continue
    off=e&0x7FFFFFFF
    b=blob[off:off+768] if e&0x80000000 else s4lz.decompress(blob[off:],dr)[:768]
    tot+=sum(1 for x in b[512:640] if x)
print('sec0_blocks.bin painted collision bytes:', tot, '(expect > 0 = your paint reached the ROM)')
PY
```
- [ ] **Step 4: In-game (emulator)** — reload `s4.bin`, advance a few frames, screenshot: ROM boots the jungle level, Z80 running. Walk onto the painted floor → the player stands on it. (Un-painted areas are air → player falls; expected for fresh start.)
- [ ] **Step 5:** Update memory `aurora-roadmap.md` (Phase 3 = S&K import done; the jump-through/solidity-picker follow-up is noted) and `collision-rom-pipeline.md` (tables are now the fixed imported S&K set; bake no longer walks sonic_hack collision).

---

## Self-Review
- **Spec coverage:** import tool (Task 1) ✓; solidity=all (Task 1, solidity rule) ✓; bake fresh-start fixed-tables + collattr-or-air (Task 2) ✓; drop sonic_hack walk + gen_collision_data (Task 2) ✓; Aurora auto-shows + WYSIWYG verify (Task 3) ✓; committed static tables (Task 1 Step 5) ✓.
- **Placeholders:** none — import tool is complete code; bake edits show the replacement block; one judgement step (Step 2 self-test removal) names the exact function and why.
- **Type/name consistency:** `apply_editor_collision_overlay(grids, sec_id, max_index)`, `per_section_coll` / `per_section_coll_rom`, `COLLISION_ROWS_PER_STRIP`, solidity `all` = `3` — consistent across tasks.
- **Risk:** if `build_section_collision`'s own unit tests reference `gen_collision_data`, removing the build.sh call doesn't affect them (they import directly). Confirm `ojz_strip_gen.py test` passes after Task 2 Step 2.
