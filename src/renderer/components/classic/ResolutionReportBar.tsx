import React from 'react';
import { StatusBar, T } from '../ui';
import { useClassicProjectStore } from '../../state/classicProjectStore';

/**
 * Classic-project status bar: resolution summary on the left ("70/70 files
 * resolved", warning-colored with a miss count when < 100%), available-act count
 * on the right. Mirrors the other mode status bars (MapStatusBar etc.) — same
 * StatusBar primitive, mono type, accent labels.
 */
export default function ResolutionReportBar() {
  const type = useClassicProjectStore((s) => s.type);
  const report = useClassicProjectStore((s) => s.report);
  const zoneTree = useClassicProjectStore((s) => s.zoneTree);

  if (!report) return <StatusBar />;

  const full = report.resolved === report.total;
  const missCount = report.total - report.resolved;
  const availActs = zoneTree.filter((r) => r.available).length;

  const left = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: T.accent, fontWeight: 600 }}>{(type ?? 'project').toUpperCase()}</span>
      <span style={{ color: full ? T.success : T.warning }}>
        {report.resolved}/{report.total} files resolved
        {!full && ` — ${missCount} missing`}
      </span>
    </span>
  );

  const right = (
    <span style={{ color: availActs === zoneTree.length ? T.textBase : T.warning }}>
      {availActs}/{zoneTree.length} acts available
    </span>
  );

  return <StatusBar left={left} right={right} />;
}
