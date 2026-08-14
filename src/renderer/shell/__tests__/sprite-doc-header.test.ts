// The sprite document's app bar. A SOURCE grep, because these are .tsx and the
// suite is node-only (see components/__tests__/section-claim.test.ts for the
// same constraint and its limits): it proves what the file MOUNTS and what it
// reaches for, not what renders.
//
// What is being locked in:
//
//  • components/Toolbar.tsx is GONE. Its last mount was this one slot, and every
//    other control on it was unreachable chrome — Open/Recents (Explorer,
//    HomeTab, ⌘K all offer it), the Aurora mark (HomeTab, Explorer), the
//    "unsaved" badge (the tab strip's dirty dot, one definition of dirty), a
//    "Loading…" string nothing depended on.
//  • The sprite header does NOT reach into the aeon project store. That is where
//    the zone/act selector came from, and re-adding one here is the specific
//    regression worth failing on: it was aeon's control, reachable only from the
//    sprite pane, and using it navigated the whole app away from the sprite
//    being edited.
//  • Save keeps its disabled-reason tooltip and its "Saved!" flash. With no
//    dirty badge in this header and no toast on save, the flash is the only
//    confirmation the sprite pane gives that a write happened.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RENDERER = join(__dirname, '..', '..');
const read = (rel: string): string => readFileSync(join(RENDERER, rel), 'utf8');

const header = read('shell/SpriteDocHeader.tsx');
const app = read('App.tsx');

describe('the sprite doc has its own header and the legacy Toolbar is gone', () => {
  it('reads the files it claims to (a wrong path would pass vacuously)', () => {
    expect(header).toContain('export default function SpriteDocHeader');
    expect(app).toContain('export default function App');
  });

  it('components/Toolbar.tsx no longer exists', () => {
    expect(existsSync(join(RENDERER, 'components', 'Toolbar.tsx'))).toBe(false);
  });

  it('nothing imports a Toolbar component', () => {
    // Prose may still recount the history; an IMPORT is the thing that cannot
    // survive the delete.
    for (const rel of ['App.tsx', 'components/sprite/SpriteMode.tsx', 'shell/EditorShell.tsx']) {
      expect(read(rel), rel).not.toMatch(/^\s*import .*\bToolbar\b.*$/m);
    }
  });

  it("App fills SpriteMode's appBar slot with the new header", () => {
    expect(app).toMatch(/<SpriteMode\s+appBar=\{<SpriteDocHeader\b/);
  });

  it('the header carries undo, redo and save off the focused document', () => {
    expect(header).toContain('focusedHistory');
    expect(header).toContain('useHistoryVersion');   // enabledness re-evaluates
    expect(header).toContain('history?.undo()');
    expect(header).toContain('history?.redo()');
    expect(header).toContain('canSaveActive');       // the coordinator's verdict
  });

  it('save keeps its disabled-reason tooltip and its Saved! flash', () => {
    expect(header).toContain('no save-back file');
    expect(header).toContain('Nothing to save in this document');
    expect(header).toContain("'Saved!'");
    expect(header).toContain('setSaveFlash');
  });

  it('the header does not reach into the aeon project store (no zone/act selector)', () => {
    expect(header).not.toContain('useProjectStore');
    expect(header).not.toContain('currentZoneId');
    expect(header).not.toContain('setCurrentZone');
  });
});
