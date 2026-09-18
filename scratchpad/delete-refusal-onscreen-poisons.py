#!/usr/bin/env python3
"""
RED-FIRST FOR delete-refusal-onscreen — every mutation APPLIED ON DISK.

An unapplied mutation and a correctly restored baseline are THE SAME ARTIFACT:
both print `ok`. So this driver refuses to run unless

  * the tree is clean before each mutation (`git status --porcelain`),
  * the target text occurs EXACTLY ONCE in the file (counted, not hoped),
  * `git diff --stat` and `git diff -U0` are PRINTED for the mutated file
    before the run, so the mutation is visible in the log rather than claimed,
  * the tree is rebuilt (the harness drives `dist/`, not `src/`: a mutation
    that is not rebuilt measures the UNMUTATED app and prints a false PASS),
  * and the file is restored from the COMMITTED baseline with
    `git show HEAD:<path>`, never `git checkout --` on a dirty tree.

⚠ NOTHING IS EVER COMMITTED MUTATED. The brief for this parcel says "do not
edit anything under src/", and the standing invariant says "red-first, and show
the mutation on disk". Those cannot both be read literally, so this driver
takes the narrow reading — no change under src/ is ever LANDED — and restores
plus re-verifies `git status --porcelain src/` after every single run.

  python3 scratchpad/delete-refusal-onscreen-poisons.py            # all
  python3 scratchpad/delete-refusal-onscreen-poisons.py M3 M6      # some
"""
import os
import re
import subprocess
import sys

# THIS tree is OBSERVED from this file's own location, never a literal: a
# literal names a worktree that stops existing (empyrean contract/SUITE_PATHS.md,
# and `check:peer-path-literals` fails the suite over it -- which it did over
# this file's first draft).
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# The electron binary is the caller's override first, then this tree's own. A
# LITERAL is not a default: an agent worktree that has no node_modules must be
# able to borrow one by setting ELECTRON_BIN, and a hardlinked one resolves
# in-tree without the operator saying anything.
ELECTRON_BIN = os.environ.get('ELECTRON_BIN') or os.path.join(
    ROOT, 'node_modules', '.bin', 'electron')
ENV = dict(os.environ,
           VITE_AURORA_DEBUG='1',
           ELECTRON_BIN=ELECTRON_BIN,
           AURORA_BUILT_TREE=ROOT)

PANEL_P = 'src/renderer/components/effects/BandPresetPanel.tsx'
PANEL_S = 'src/renderer/components/effects/EffectsScenePanel.tsx'
PROV_P = 'src/renderer/providers/effects-preset.ts'
PROV_S = 'src/renderer/providers/effects-aeon.ts'

# (id, file, old, new, what it is, rows predicted red)
MUTATIONS = [
    ('M1', PANEL_P,
     'disabled={deleteRefusal !== null}',
     'disabled={false}',
     'the preset Delete stops reading the refusal',
     '[p1]'),
    ('M2', PANEL_P,
     'deletePresetRefusal(act.sections, selected.id, act)',
     'deletePresetRefusal(act.sections, selected.id)',
     'the panel drops the ACT argument — the exact region-blind defect '
     'DELETE-PRESET-REGION-BOUND fixed',
     '[p1] [p4]  — and NOT [p3], which is the point'),
    ('M3', PANEL_P,
     '          id="aeon.effects.preset.bands"\n'
     '          title={`Preset: ${selected.id}`}\n'
     '          defaultCollapsed\n',
     '          id="aeon.effects.preset.bands"\n'
     '          title={`Preset: ${selected.id}`}\n',
     'the preset section no longer arrives collapsed',
     '[p3]'),
    ('M4', PROV_P,
     ' row, under Bindings, ',
     ' row, under Binding, ',
     'the provider rewords the preset sentence by one letter',
     '[dp] [p4]'),
    ('M5', PANEL_S,
     'disabled={deleteRefusal !== null}',
     'disabled={false}',
     'the scene Delete stops reading the refusal',
     '[s1]'),
    ('M6', PANEL_S,
     '<CollapsibleSection id="aeon.effects.scene" title={`Scene: ${selected.id}`}\n'
     '          defaultCollapsed\n',
     '<CollapsibleSection id="aeon.effects.scene" title={`Scene: ${selected.id}`}\n',
     'the scene section no longer arrives collapsed',
     '[s3]'),
    ('M7', PANEL_S,
     'deleteSceneRefusal(act.sections, selected.id, act)',
     'deleteSceneRefusal(act.sections, selected.id)',
     'the scene panel drops the ACT argument',
     '[s1] [s4]'),
    ('M8', PROV_P,
     'if (binders.length > 0) {',
     'if (true as boolean) {',
     'the preset region arm becomes a WALL — every preset refuses',
     '[p2] [p4]'),
    ('M10', PROV_S,
     ' row, under Bindings, ',
     ' row, under Binding, ',
     'the provider rewords the SCENE sentence by one letter — [ds]s own '
     'mutation, which M4 does NOT supply: M4 only touches the preset provider, '
     'so without this the scene anti-drift gate is an unproven row',
     '[ds] [s4]'),
    # ⚠ M11 MUTATES THE HARNESS, NOT THE APP, and that is the only way to
    # isolate [fx]: the row compares the LIVE aeon fixture with this repo's
    # vendored copy, and neither operand may be written by this parcel (the
    # aeon tree is another lane's, and a fixture edit is a different parcel).
    # Pointing the vendored operand at a DIFFERENT committed regions fixture is
    # the fixture moving, simulated on the only side this lane owns.
    ('M11', 'scratchpad/delete-refusal-onscreen-harness.mjs',
     "const VENDORED = `${ROOT}/test/fixtures/regions/ojz_act1.regions.json`;",
     "const VENDORED = `${ROOT}/package.json`;",
     'the vendored operand of [fx] points at a different file — "the fixture '
     'moved under this run", which must be LOUD rather than silent',
     '[fx]'),
    ('M9', PROV_S,
     'if (binders.length > 0) {',
     'if (true as boolean) {',
     'the scene region arm becomes a WALL — every scene refuses',
     '[s2] [s4]'),
]

ROW_RE = re.compile(r'^FAIL\s+\[([^\]]+)\]', re.M)


def git(*args, check=True):
    return subprocess.run(['git', *args], cwd=ROOT, check=check,
                          capture_output=True, text=True).stdout


def dirty():
    return git('status', '--porcelain').strip()


def run(cmd, **kw):
    return subprocess.run(cmd, cwd=ROOT, env=ENV, capture_output=True, text=True, **kw)


def build():
    r = run(['npm', 'run', 'build'])
    if r.returncode != 0:
        print(r.stdout[-3000:])
        print(r.stderr[-3000:])
    return r.returncode


def harness():
    r = run(['npm', 'run', 'harness:delete-refusal-onscreen'], timeout=400)
    out = r.stdout + r.stderr
    rows = ROW_RE.findall(out)
    tail = [ln for ln in out.splitlines() if 'rows passed' in ln or 'HARNESS ABORTED' in ln]
    return r.returncode, rows, tail, out


def main():
    want = set(sys.argv[1:])
    if dirty():
        sys.exit(f'REFUSING: tree is dirty before any mutation:\n{dirty()}')
    print(f'baseline HEAD = {git("rev-parse", "--short", "HEAD").strip()}   tree CLEAN')

    for mid, rel, old, new, what, predicted in MUTATIONS:
        if want and mid not in want:
            continue
        path = os.path.join(ROOT, rel)
        src = open(path).read()
        n = src.count(old)
        print(f'\n{"=" * 74}\n{mid}  {rel}\n     {what}\n     predicted red: {predicted}')
        if n != 1:
            print(f'  ⚠ SKIPPED: target occurs {n} time(s), not exactly 1. '
                  'A mutation that cannot be placed is NOT a pass.')
            continue
        open(path, 'w').write(src.replace(old, new))
        print('  --- git diff --stat ---')
        print(git('diff', '--stat', '--', rel).rstrip())
        print('  --- git diff -U0 ---')
        print(git('diff', '-U0', '--', rel).rstrip())
        if build() != 0:
            print(f'  ⚠ {mid}: BUILD FAILED — restoring; this mutation is UNMEASURED, not green.')
        else:
            code, rows, tail, out = harness()
            print(f'  RESULT exit={code}  red rows: {sorted(rows) if rows else "NONE"}')
            for t in tail:
                print(f'         {t.strip()}')
            if not rows:
                print('  ⚠⚠ MUTATED AND STILL GREEN. That is a RUNNER DEFECT or a vacuous row, '
                      'never a pass. The full output follows.')
                print(out[-4000:])
        # RESTORE from the COMMITTED baseline, never `git checkout --`.
        blob = subprocess.run(['git', 'show', f'HEAD:{rel}'], cwd=ROOT,
                              check=True, capture_output=True, text=True).stdout
        open(path, 'w').write(blob)
        # THE MUTATED FILE ITSELF, not a hardcoded `src` — M11 mutates the
        # HARNESS, and a restore check aimed at a directory the mutation was
        # never in is a check that cannot fail.
        d = git('status', '--porcelain', '--', rel).strip()
        print(f'  restored from HEAD:{rel} — git status {rel} = {d!r}')
        if d:
            sys.exit(f'REFUSING TO CONTINUE: {rel} did not restore clean.')

    print(f'\n{"=" * 74}\nrebuilding the clean tree so the next run measures the baseline')
    build()
    print(f'final git status: {dirty()!r}')


main()
