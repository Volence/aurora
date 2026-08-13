import React from 'react';
import EditorShell from '../../shell/EditorShell';
import { Panel, PanelHeader, StatusBar, T } from '../ui';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import ZoneActTree from './ZoneActTree';
import ClassicLevelViewport from './ClassicLevelViewport';
import ChunkPicker from './ChunkPicker';
import ClassicComposerDock from './ClassicComposerDock';
import ResolutionReportPanel from './ResolutionReportPanel';
import ObjectInspector from './ObjectInspector';
import ObjectList from '../shared/ObjectList';
import { useClassicObjectListPort } from '../../providers/object-list-classic';
import ClassicPalettePanel from './ClassicPalettePanel';
import { isTypingTarget } from './composer-shared';
import { levelKeysEnabled } from '../../workspace/level-keys';
import { focusedHistory } from '../../state/editorStore';
import type { ProjectHandle } from '../../../core/project/adapter';

// The handle the classic level store was last reset for. Module scope (survives
// this view's unmount/remount on a Map⇄Sprite mode round trip) so returning from
// Sprite mode does NOT re-run the stale-doc reset — see the effect below.
let lastResetHandle: ProjectHandle | null = null;

/**
 * Read-only surface for an opened classic (disasm) project (Task 9 → Task 11).
 * Task 9 showed a static zone/act list + resolution report; Task 11 turns the
 * main area into a live level viewport: selecting an act loads its LevelDoc and
 * renders it. The zone tree moves into the right dock (the 44px tool column is
 * too narrow), the resolution report sits below it, and the status bar reports
 * the open act's dimensions + counts alongside the resolution summary.
 */
export default function ClassicProjectView({ appBar }: { appBar: React.ReactNode }) {
  const dir = useClassicProjectStore((s) => s.dir);
  const zoneTree = useClassicProjectStore((s) => s.zoneTree);
  const report = useClassicProjectStore((s) => s.report);

  const handle = useClassicProjectStore((s) => s.handle);

  // ObjectLibraryPanel became the neutral shared/ObjectList (stage-4 plan 3).
  // The port is resolved here, unconditionally, because the list itself renders
  // inside the `status === 'ready'` branch below and a hook may not be called
  // from inside a conditional. It claims the layout surface through the port's
  // rootProps — see providers/object-list-classic.ts.
  const objectListPort = useClassicObjectListPort();

  const selected = useClassicLevelStore((s) => s.ref);
  const doc = useClassicLevelStore((s) => s.doc);
  const status = useClassicLevelStore((s) => s.status);
  const openAct = useClassicLevelStore((s) => s.openAct);
  const dirty = useClassicLevelStore((s) => s.dirty);
  const isDirty = Object.values(dirty).some(Boolean);

  // Opening a different project must not leave a stale act selected/loaded — the
  // old doc was read through the previous handle. Keyed on HANDLE IDENTITY, not
  // `dir`, and guarded by a module-level marker so a remount does NOT reset: the
  // level pane (this view's host) can remount across tab switches, and a
  // dir-keyed mount effect would wipe the classic level store (doc + undo history
  // + unsaved edits) on every such round trip. A new project always produces a
  // NEW handle object, so comparing handles resets on a genuine project change
  // only.
  // NOTE (Task 7): classicProjectStore.openDirectory now calls
  // useClassicLevelStore.reset() itself as soon as a switch begins, closing the
  // stale-handle window that existed if this view was unmounted mid-switch. This
  // effect's reset is now redundant for that case but stays as a harmless
  // idempotent backstop — it still owns the "remount without a real handle change
  // should not reset" guard above.
  React.useEffect(() => {
    if (handle !== lastResetHandle) {
      lastResetHandle = handle;
      useClassicLevelStore.getState().reset();
    }
  }, [handle]);

  // Undo/redo keyboard for the classic view (Task 13), through the ONE focused-
  // document entry point. Sprite (s1-object) editing IS reachable from a classic
  // project — the edit-art context menu opens an s1 sprite-doc tab, which mounts
  // SpriteMode and hides (keep-alive) this pane. The levelKeysEnabled() gate
  // below is the mitigation: while that sprite tab owns the keyboard this handler
  // stays inert, so Ctrl+Z doesn't fire both this and SpriteMode's binding.
  // Matches the repo's binding scheme (SpriteMode / the facet canvases): Ctrl+Z
  // undo, Ctrl+Shift+Z / Ctrl+Y redo, ignored while typing in a text field.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!levelKeysEnabled()) return;
      if (isTypingTarget(e.target as HTMLElement)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        focusedHistory()?.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        focusedHistory()?.redo();
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const full = report ? report.resolved === report.total : true;
  const statusLeft = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      <span style={{ color: T.accent, fontWeight: 600 }}>S1</span>
      {!selected ? (
        <span style={{ color: T.textLo }}>no act selected</span>
      ) : status === 'ready' && doc ? (
        <span style={{ color: T.textBase, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {isDirty && (
            <span
              title="Unsaved changes — Ctrl+S to save"
              style={{ width: 7, height: 7, borderRadius: '50%', background: T.warning, flexShrink: 0 }}
            />
          )}
          {selected.label}{isDirty ? ' •' : ''} — {doc.fg.width}×{doc.fg.height} chunks · {doc.chunks.length} chunks ·{' '}
          {doc.blocks.length} blocks · {doc.objects.length} objects
        </span>
      ) : status === 'loading' ? (
        <span style={{ color: T.textLo }}>{selected.label} — loading…</span>
      ) : status === 'error' ? (
        <span style={{ color: T.error }}>{selected.label} — load failed</span>
      ) : (
        <span style={{ color: T.textLo }}>{selected.label}</span>
      )}
    </span>
  );
  const statusRight = report ? (
    <span style={{ color: full ? T.success : T.warning }}>
      {report.resolved}/{report.total} files resolved
    </span>
  ) : null;

  return (
    <EditorShell
      appBar={appBar}
      toolDock={null}
      bottomExtra={<><ClassicComposerDock /><ChunkPicker /></>}
      status={<StatusBar left={statusLeft} right={statusRight} />}
      panels={
        <Panel width={260} scroll>
          <PanelHeader
            right={
              <span style={{ fontSize: 10, color: T.textFaint, fontFamily: T.fontMono, fontWeight: 400, textTransform: 'none' }}>
                {dir}
              </span>
            }
          >
            Zones &amp; Acts
          </PanelHeader>
          <ZoneActTree refs={zoneTree} selected={selected} onSelect={openAct} />
          {status === 'ready' && doc && (
            <>
              <PanelHeader>Object Inspector</PanelHeader>
              <ObjectInspector />
              <PanelHeader>Object Library</PanelHeader>
              <ObjectList port={objectListPort} label="Object library" />
              <PanelHeader>Palette</PanelHeader>
              <ClassicPalettePanel />
            </>
          )}
          <PanelHeader>Resolution Report</PanelHeader>
          <ResolutionReportPanel />
        </Panel>
      }
    >
      <ClassicLevelViewport />
    </EditorShell>
  );
}
