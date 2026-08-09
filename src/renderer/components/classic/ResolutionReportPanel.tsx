import React from 'react';
import { CollapsibleSection, T } from '../ui';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { groupEntriesByZone } from './report-grouping';
import type { EntryStatus } from '../../../core/project/report';

const STATUS_COLOR: Record<EntryStatus, string> = {
  resolved: T.success,
  missing: T.error,
  ambiguous: T.warning,
};

/**
 * Expandable resolution-report detail: one CollapsibleSection per zone (globals
 * last), each listing its entries key / path / status / detail. Mirrors the map
 * side-panel composition (CollapsibleSection + PanelHeader). Zones with any miss
 * default to expanded so problems are visible without hunting; fully-resolved
 * zones start collapsed.
 */
export default function ResolutionReportPanel() {
  const report = useClassicProjectStore((s) => s.report);
  const zoneTree = useClassicProjectStore((s) => s.zoneTree);

  if (!report) return null;

  const zoneOrder = [...new Set(zoneTree.map((r) => r.zone))];
  const groups = groupEntriesByZone(report.entries, zoneOrder);

  return (
    <>
      {groups.map((g) => {
        const full = g.resolved === g.total;
        return (
          <CollapsibleSection
            key={g.id}
            id={`classic.report.${g.id}`}
            title={g.id.toUpperCase()}
            defaultCollapsed={full}
            right={
              <span style={{ color: full ? T.success : T.warning, fontSize: 10 }}>
                {g.resolved}/{g.total}
              </span>
            }
          >
            <div style={{ padding: `${T.s2} 0` }}>
              {g.entries.map((e) => (
                <div
                  key={e.key}
                  title={e.detail ? `${e.path} — ${e.detail}` : e.path}
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: T.s3,
                    padding: `2px ${T.s4}`, fontSize: 11, fontFamily: T.fontMono,
                  }}
                >
                  <span
                    style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: STATUS_COLOR[e.status], alignSelf: 'center',
                    }}
                  />
                  <span style={{ color: T.textBase, minWidth: 0, flex: '0 0 auto' }}>{e.key}</span>
                  <span
                    style={{
                      color: T.textLo, overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', flex: 1, textAlign: 'right',
                    }}
                  >
                    {e.detail ?? e.path}
                  </span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        );
      })}
    </>
  );
}
