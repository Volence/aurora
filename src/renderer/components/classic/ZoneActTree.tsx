import React from 'react';
import { T } from '../ui';
import type { ZoneActRef } from '../../../core/project/adapter';

/**
 * Left-dock zone/act tree for a classic (disasm) project. Zones group their
 * acts; unavailable acts are greyed with their resolution reason as a tooltip
 * (Task 9's ClassicProjectView rendered a static version of this — Task 11
 * extracts it, adds selection, and moves it into the dock so the viewport takes
 * the main area). Selecting an available act calls `onSelect`.
 */
export default function ZoneActTree({
  refs,
  selected,
  onSelect,
}: {
  refs: ZoneActRef[];
  selected: ZoneActRef | null;
  onSelect: (ref: ZoneActRef) => void;
}) {
  // Group the flat act list by zone, preserving first-seen order.
  const zones: { zone: string; acts: ZoneActRef[] }[] = [];
  for (const ref of refs) {
    let group = zones.find((z) => z.zone === ref.zone);
    if (!group) {
      group = { zone: ref.zone, acts: [] };
      zones.push(group);
    }
    group.acts.push(ref);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: T.s4, padding: T.s3 }}>
      {zones.map((z) => (
        <div key={z.zone}>
          <div
            style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
              color: T.textLo, marginBottom: T.s2, paddingLeft: T.s2,
            }}
          >
            {z.zone}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {z.acts.map((a) => {
              const isSelected = selected?.zone === a.zone && selected?.act === a.act;
              return (
                <div
                  key={`${a.zone}.${a.act}`}
                  title={a.available ? a.label : a.reason}
                  onClick={a.available ? () => onSelect(a) : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: T.s3,
                    padding: `${T.s2} ${T.s3}`, borderRadius: T.rMd,
                    background: isSelected ? T.accent : T.raised,
                    color: isSelected ? T.onAccent : T.textHi,
                    border: `1px solid ${isSelected ? T.accent : T.border}`,
                    opacity: a.available ? 1 : 0.55,
                    cursor: a.available ? 'pointer' : 'default',
                  }}
                >
                  <span
                    style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: a.available ? (isSelected ? T.onAccent : T.success) : T.error,
                    }}
                  />
                  <span style={{ fontSize: 12, flex: 1 }}>{a.label}</span>
                  <span
                    style={{
                      fontSize: 10, fontFamily: T.fontMono,
                      color: isSelected ? T.onAccent : T.textFaint,
                    }}
                  >
                    act {a.act}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
