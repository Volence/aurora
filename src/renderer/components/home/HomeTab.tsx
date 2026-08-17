// src/renderer/components/home/HomeTab.tsx
// The Home tab (spec §3): with no project, opening things is the star (open
// project + recents); with a project, its levels and health are. Every card
// routes through the same guarded tab-open path as the explorer. Stage 5 adds
// the standalone-document actions (New Sprite, Convert) — deliberately absent
// until they exist.

import React, { useEffect, useState } from 'react';
import { T, Icons } from '../ui';
import AuroraMark from '../AuroraMark';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useProjectStore } from '../../state/projectStore';
import { requestOpenTab } from '../../shell/tab-activation';
import { classicLevelTab, aeonLevelTab, PROJECT_SETUP_TAB } from '../../shell/tabs';
import type { RecentProject } from '../../../shared/ipc-types';

export interface HomeTabProps {
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
}

export default function HomeTab({ onOpenProject, onOpenRecent }: HomeTabProps) {
  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  const classicLabel = useClassicProjectStore((s) => s.label);
  const dir = useClassicProjectStore((s) => s.dir);
  const zoneTree = useClassicProjectStore((s) => s.zoneTree);
  const report = useClassicProjectStore((s) => s.report);
  const sidecar = useClassicProjectStore((s) => s.sidecar);
  const config = useProjectStore((s) => s.config);

  const noProject = !classicOpen && !config;
  // Current project's identity, for excluding it from the with-project recents
  // list below (classic → workspace dir; aeon → config.basePath).
  const currentPath = classicOpen ? dir : (config?.basePath ?? null);

  const [recents, setRecents] = useState<RecentProject[]>([]);
  useEffect(() => {
    // Fetched in both states now (not just no-project): the with-project view
    // below offers switching to a different recent project too.
    window.api.getRecentProjects().then(setRecents).catch(() => setRecents([]));
  }, [noProject, currentPath]);

  if (noProject) {
    return (
      <div style={styles.scroll}>
        <div style={styles.column}>
          <div style={styles.hero}>
            <AuroraMark size={44} />
            <div>
              <div style={styles.heroTitle}>Aurora</div>
              <div style={styles.heroSub}>Visual authoring for the Empyrean suite</div>
            </div>
          </div>
          <button onClick={onOpenProject} style={styles.primaryButton}>Open Project…</button>
          {recents.length > 0 && (
            <>
              <div style={styles.sectionTitle}>Recent projects</div>
              <div style={styles.recentList}>
                {recents.map((r) => (
                  <button key={r.path} onClick={() => onOpenRecent(r.path)} style={styles.recentRow} title={r.path}>
                    <span style={styles.recentName}>{r.name}</span>
                    <span style={styles.recentPath}>{r.path}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---- project home ----
  const projectName = classicOpen ? (classicLabel ?? 'Project') : config!.name;
  const engineChip = classicOpen ? 'S1' : 'AEON';
  const levels = classicOpen
    ? zoneTree.map((r) => ({
        tab: classicLevelTab(r), label: r.label,
        disabled: !r.available, reason: r.reason,
      }))
    : config!.zones.flatMap((z) =>
        z.acts.map((a) => ({
          tab: aeonLevelTab(z.id, z.name, a.id), label: `${z.name} · ${a.id}`,
          disabled: false, reason: undefined as string | undefined,
        })),
      );
  const health = report
    ? { resolved: report.resolved, total: report.total, issues: sidecar?.issues.length ?? 0 }
    : null;
  // Recents minus the project already open — switching "to" it would be a no-op.
  const otherRecents = recents.filter((r) => r.path !== currentPath);

  return (
    <div style={styles.scroll}>
      <div style={styles.column}>
        <div style={styles.projectHeader}>
          <span style={styles.chip}>{engineChip}</span>
          <span style={styles.heroTitle}>{projectName}</span>
          {dir && <span style={styles.recentPath}>{dir}</span>}
        </div>

        <div style={styles.sectionTitle}>Levels</div>
        <div style={styles.cards}>
          {levels.map((l) => (
            <button
              key={l.tab.id}
              onClick={() => { if (!l.disabled) void requestOpenTab(l.tab); }}
              disabled={l.disabled}
              title={l.disabled ? l.reason : `Open ${l.label}`}
              style={{ ...styles.card, ...(l.disabled ? styles.cardDisabled : {}) }}
            >
              <Icons.IconLayers size={16} />
              <span style={styles.cardLabel}>{l.label}</span>
              {l.disabled && <span style={styles.cardBadge}>missing files</span>}
            </button>
          ))}
        </div>

        <div style={styles.sectionTitle}>Project</div>
        <div style={styles.cards}>
          <button onClick={() => void requestOpenTab(PROJECT_SETUP_TAB)} style={styles.card}>
            <Icons.IconTools size={16} />
            <span style={styles.cardLabel}>Project Setup</span>
            {health && (
              <span style={{
                ...styles.cardBadge,
                color: health.resolved === health.total && health.issues === 0 ? T.success : T.warning,
              }}>
                {health.resolved}/{health.total} resolved{health.issues > 0 ? ` · ${health.issues} config issue${health.issues === 1 ? '' : 's'}` : ''}
              </span>
            )}
          </button>
        </div>

        <div style={styles.sectionTitle}>Switch project</div>
        {/* The recents sit IN the card grid, not in a list below it. They were a
            flex column outside it, which on this page — where every other card
            is one grid column — made a single recent project span all three, a
            layout escape rather than emphasis. They are cards doing what the
            card beside them does (open a project), so they are shaped like it. */}
        <div style={styles.cards}>
          <button onClick={onOpenProject} style={styles.card}>
            <Icons.IconLayers size={16} />
            <span style={styles.cardLabel}>Open project…</span>
          </button>
          {otherRecents.map((r) => (
            <button key={r.path} onClick={() => onOpenRecent(r.path)}
              style={styles.recentCard} title={r.path}>
              <span style={styles.recentName}>{r.name}</span>
              <span style={styles.recentPath}>{r.path}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  scroll: { flex: 1, overflowY: 'auto', background: T.surface },
  column: {
    maxWidth: 760, margin: '0 auto', padding: '48px 32px',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  hero: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 },
  heroTitle: { fontSize: T.tXl, fontWeight: T.wSemibold, color: T.textHi, letterSpacing: '0.02em' },
  heroSub: { fontSize: T.tSm, color: T.textLo, marginTop: 2 },
  primaryButton: {
    alignSelf: 'flex-start', padding: '8px 18px', background: T.accent, color: T.onAccent,
    fontWeight: T.wSemibold, fontSize: T.tBase, border: 'none', borderRadius: T.rMd, cursor: 'pointer',
  },
  sectionTitle: {
    marginTop: 20, fontSize: 10, fontWeight: T.wSemibold, color: T.textLo,
    textTransform: 'uppercase' as const, letterSpacing: 1,
  },
  recentList: { display: 'flex', flexDirection: 'column', gap: 2 },
  recentRow: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
    padding: '8px 12px', background: T.void, border: `1px solid ${T.border}`,
    borderRadius: T.rMd, cursor: 'pointer', textAlign: 'left' as const,
  },
  // A recentRow shaped to sit in the `cards` grid: same padding, radius and
  // border as `card`, stacked because it carries a path under the name.
  recentCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
    minWidth: 0, padding: '12px 14px', background: T.void,
    border: `1px solid ${T.border}`, borderRadius: T.rLg,
    cursor: 'pointer', textAlign: 'left' as const,
  },
  recentName: { fontSize: T.tBase, color: T.textHi, fontWeight: T.wMedium },
  recentPath: {
    fontSize: 10, color: T.textFaint, fontFamily: T.fontMono,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: '100%',
  },
  projectHeader: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const },
  chip: {
    padding: '1px 8px', background: T.raised, border: `1px solid ${T.borderStrong}`,
    borderRadius: T.rPill, fontSize: 10, fontWeight: 700, color: T.accent, fontFamily: T.fontMono,
  },
  cards: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8,
  },
  card: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
    background: T.void, border: `1px solid ${T.border}`, borderRadius: T.rLg,
    cursor: 'pointer', color: T.textBase, textAlign: 'left' as const,
  },
  cardDisabled: { opacity: 0.45, cursor: 'default' },
  cardLabel: { flex: 1, minWidth: 0, fontSize: T.tSm, fontWeight: T.wMedium, color: T.textHi },
  cardBadge: { fontSize: 10, color: T.textLo, fontFamily: T.fontMono, flexShrink: 0 },
};
