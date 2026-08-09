import React from 'react';
import EditorShell from '../../shell/EditorShell';
import { Panel, PanelHeader, Chip, T } from '../ui';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import ResolutionReportBar from './ResolutionReportBar';
import ResolutionReportPanel from './ResolutionReportPanel';

/**
 * Read-only surface shown when a classic (disasm) project is open (Task 9). It
 * reuses the EditorShell chrome so the classic path feels native: the shared
 * app bar (Open still works), the resolution-report detail in the right panel,
 * the resolution summary in the status bar, and the zone/act tree in the main
 * area. Level editing is out of scope here — Tasks 11/12 add the viewport.
 */
export default function ClassicProjectView({ appBar }: { appBar: React.ReactNode }) {
  const dir = useClassicProjectStore((s) => s.dir);
  const zoneTree = useClassicProjectStore((s) => s.zoneTree);
  const reset = useClassicProjectStore((s) => s.reset);

  // Group the flat act list by zone, preserving order.
  const zones: { zone: string; acts: typeof zoneTree }[] = [];
  for (const ref of zoneTree) {
    let group = zones.find((z) => z.zone === ref.zone);
    if (!group) { group = { zone: ref.zone, acts: [] }; zones.push(group); }
    group.acts.push(ref);
  }

  return (
    <EditorShell
      appBar={appBar}
      toolDock={null}
      status={<ResolutionReportBar />}
      panels={
        <Panel width={320} scroll>
          <PanelHeader>Resolution Report</PanelHeader>
          <ResolutionReportPanel />
        </Panel>
      }
    >
      <div style={{ flex: 1, overflow: 'auto', padding: T.s6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: T.s4, marginBottom: T.s5 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.textHi }}>Zones &amp; Acts</span>
          <span style={{ fontSize: 11, color: T.textLo, fontFamily: T.fontMono }}>{dir}</span>
          <span style={{ flex: 1 }} />
          <Chip onClick={reset}>Close project</Chip>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: T.s5, maxWidth: 640 }}>
          {zones.map((z) => (
            <div key={z.zone}>
              <div
                style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
                  color: T.textLo, marginBottom: T.s2,
                }}
              >
                {z.zone}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {z.acts.map((a) => (
                  <div
                    key={`${a.zone}.${a.act}`}
                    title={a.available ? undefined : a.reason}
                    style={{
                      display: 'flex', alignItems: 'center', gap: T.s3,
                      padding: `${T.s2} ${T.s3}`, borderRadius: T.rMd,
                      background: T.raised, border: `1px solid ${T.border}`,
                      opacity: a.available ? 1 : 0.7,
                    }}
                  >
                    <span
                      style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: a.available ? T.success : T.error, flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 12, color: T.textHi, minWidth: 120 }}>{a.label}</span>
                    <span style={{ fontSize: 11, color: T.textFaint }}>act {a.act}</span>
                    {!a.available && (
                      <span style={{ fontSize: 11, color: T.warning, marginLeft: 'auto' }}>
                        unavailable
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </EditorShell>
  );
}
