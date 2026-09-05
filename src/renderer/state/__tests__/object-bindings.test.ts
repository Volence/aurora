// The aeon Object Library greyed EVERY entry with "no sprite bound" because two
// mechanisms were never reconciled: the Explorer read `ObjectDef.sprite` (from
// the hand-authored objects.json Aurora must never write), while the only
// binding UI — the Objects facet's "Preview sprite" dropdown — wrote a separate
// sidecar, `<dataRoot>sprites/object-bindings.json`. Binding through the UI
// therefore could not ungrey anything.
//
// The sidecar is the right home, so projectStore now carries it and the two
// Explorer/palette feed sites resolve `bindings[id] ?? def.sprite`. The store
// side is unit-tested here; the wiring — which the node-only renderer suite has
// no DOM harness for — is guarded at source level, the same way
// components/classic/__tests__/classic-surface.test.ts guards facet claims.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useProjectStore } from '../projectStore';

const SRC = join(__dirname, '..', '..');
const read = (rel: string): string => readFileSync(join(SRC, rel), 'utf8');

describe('projectStore.objectBindings', () => {
  beforeEach(() => { useProjectStore.getState().reset(); });

  it('starts empty', () => {
    expect(useProjectStore.getState().objectBindings).toEqual({});
  });

  it('publishes what the sidecar loader read', () => {
    useProjectStore.getState().setObjectBindings({ spring: 'spring_up' });
    expect(useProjectStore.getState().objectBindings).toEqual({ spring: 'spring_up' });
  });

  it('is cleared by reset: bindings name sprites under the OLD project root', () => {
    useProjectStore.getState().setObjectBindings({ spring: 'spring_up' });
    useProjectStore.getState().reset();
    expect(useProjectStore.getState().objectBindings).toEqual({});
  });
});

describe('binding wiring (source guards)', () => {
  it('the sidecar loader publishes BEFORE the palette gate', () => {
    // refreshObjectPreviews renders thumbnails, so it early-returns without a
    // zone. If the bindings read sat behind that return, the Object Library
    // would stay greyed until the user happened to open a level — the exact
    // symptom this fix is about.
    const src = read('object-previews.ts');
    const publish = src.indexOf('setObjectBindings(');
    const gate = src.indexOf('if (!project || !zone) return;');
    expect(publish).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(-1);
    expect(publish).toBeLessThan(gate);
  });

  it('App loads bindings on PROJECT open, not only when a zone is current', () => {
    const src = read('App.tsx');
    expect(src).toMatch(/if \(project\) refreshObjectPreviews\(\)/);
    expect(src).not.toMatch(/if \(project && currentZoneId\) refreshObjectPreviews\(\)/);
  });

  it('both feed sites resolve through the fallback chain, not ObjectDef.sprite alone', () => {
    // Explorer.tsx builds the Object Library; App.tsx builds the ⌘K
    // "Edit sprite:" commands. Either one reading `o.sprite` directly is the
    // original bug.
    for (const file of ['shell/Explorer.tsx', 'App.tsx']) {
      const src = read(file);
      expect(src, file).toMatch(/resolveObjectSprite\(o, objectBindings\)/);
      expect(src, file).toMatch(/useProjectStore\(\(s\) => s\.objectBindings\)/);
    }
  });

  it('Aurora still never writes the aeon object library', () => {
    // The decision of record: objects.json is hand-authored alongside the
    // object's assembly, and aeon's own toolchain reads only id + codeLabel from
    // it. A writer here would fight the human editing that file.
    for (const file of ['object-previews.ts', 'shell/Explorer.tsx', 'App.tsx']) {
      expect(read(file), file).not.toMatch(/objectLibraryPath|writeObjectLibrary/);
    }
  });
});
