import React from 'react';
import EditorShell from '../../shell/EditorShell';
import { Panel, PanelHeader, StatusBar, T } from '../ui';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import ZoneActTree from './ZoneActTree';
import ClassicLevelViewport from './ClassicLevelViewport';
import ResolutionReportPanel from './ResolutionReportPanel';

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

  const selected = useClassicLevelStore((s) => s.ref);
  const doc = useClassicLevelStore((s) => s.doc);
  const status = useClassicLevelStore((s) => s.status);
  const openAct = useClassicLevelStore((s) => s.openAct);

  // Opening a different project must not leave a stale act selected/loaded — the
  // old doc was read through the previous handle.
  React.useEffect(() => {
    useClassicLevelStore.getState().reset();
  }, [dir]);

  const full = report ? report.resolved === report.total : true;
  const statusLeft = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      <span style={{ color: T.accent, fontWeight: 600 }}>S1</span>
      {!selected ? (
        <span style={{ color: T.textLo }}>no act selected</span>
      ) : status === 'ready' && doc ? (
        <span style={{ color: T.textBase }}>
          {selected.label} — {doc.fg.width}×{doc.fg.height} chunks · {doc.chunks.length} chunks ·{' '}
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
          <PanelHeader>Resolution Report</PanelHeader>
          <ResolutionReportPanel />
        </Panel>
      }
    >
      <ClassicLevelViewport />
    </EditorShell>
  );
}
