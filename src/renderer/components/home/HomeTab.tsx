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
import { loadRecents } from '../../state/recents';
import { normalizeProjectPath } from '../../../shared/project-path';
import { GUIDES } from '../guide/guides';
import { openGuide } from '../../state/guideStore';
import OpenByPath from './OpenByPath';
import type { TypedPathOpener } from './typed-path-open';

/**
 * THE GUIDES, ON HOME, IN BOTH STATES.
 *
 * It renders on the no-project page as well as the project page, and that is
 * the point rather than an oversight: the cold walkthrough's very first finding
 * (§a1) is a reader arriving at Home with nothing open and finding "exactly two
 * things: Open Project… and a list of recent projects". Someone who has not
 * opened a project yet is the reader most likely to need this, and gating it on
 * a project would hide it from them.
 *
 * The blurb is the guide's own (`guides.ts`), not a second sentence written
 * here — the drift this codebase has paid for repeatedly is one fact spelled in
 * two places.
 */
function GuideCards(): React.ReactElement {
  return (
    <>
      <div style={styles.sectionTitle}>Guides</div>
      <div style={styles.cards}>
        {GUIDES.map((g) => (
          <button key={g.slug} onClick={() => openGuide(g.slug)} style={styles.guideCard}
            title={g.blurb}>
            <span style={styles.cardLabel}>{g.title}</span>
            <span style={styles.guideBlurb}>{g.blurb}</span>
          </button>
        ))}
      </div>
    </>
  );
}

export interface HomeTabProps {
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
  /**
   * THE SECOND DOOR (seat A's F1). Separate from `onOpenRecent` even though App
   * passes the same function to both: a recent is a path Aurora already vouched
   * for, a typed one is not, and a prop named for recents carrying hand-typed
   * strings is the kind of name lie that survives until someone changes one of
   * the two roads. See OpenByPath.tsx for why a field rather than argv.
   * It reports whether the open succeeded, because only a success clears the
   * field (HOME-PATH-FIELD-KEEPS-OLD-PATH).
   */
  onOpenPath: TypedPathOpener;
}

export default function HomeTab({ onOpenProject, onOpenRecent, onOpenPath }: HomeTabProps) {
  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  const classicLabel = useClassicProjectStore((s) => s.label);
  const dir = useClassicProjectStore((s) => s.dir);
  const zoneTree = useClassicProjectStore((s) => s.zoneTree);
  const report = useClassicProjectStore((s) => s.report);
  const sidecar = useClassicProjectStore((s) => s.sidecar);
  const config = useProjectStore((s) => s.config);

  const noProject = !classicOpen && !config;

  // THE TYPED PATH IS HOME'S, NOT EITHER FIELD'S (CLASSIC-PATH-FIELD-RESIDENT).
  // The path field renders at two positions, one per page below, and a classic
  // open flips between them: `openDirectory` sets the classic store to
  // 'opening' (CLOSED fields) before it asks the bridge, so with no aeon config
  // underneath `noProject` goes true for the length of the open and stays true
  // after a failure. React mounts a fresh field at the other position, so a
  // value held in the field itself was lost on exactly the open that failed,
  // the one where the person needs it back to fix a typo. Held here it
  // survives the flip: HomeTab is kept alive (App.tsx, display:none) and this
  // hook runs above the branch, so both positions read and write one value.
  // WHEN it changes is unchanged and is typed-path-open.ts's rule.
  const [typedPath, setTypedPath] = useState('');
  // Current project's identity, for excluding it from the with-project recents
  // list below (classic → workspace dir; aeon → config.basePath).
  const currentPath = classicOpen ? dir : (config?.basePath ?? null);

  const [recents, setRecents] = useState<RecentProject[]>([]);
  useEffect(() => {
    // Fetched in both states now (not just no-project): the with-project view
    // below offers switching to a different recent project too.
    loadRecents().then(setRecents).catch(() => setRecents([]));
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
          {/* THE SECOND DOOR, beside the first and on the page a cold reader
              lands on. It is here rather than behind a disclosure because the
              reader who needs it is the one for whom the button above did
              nothing, and a fallback you have to discover is not a fallback. */}
          <OpenByPath onOpenPath={onOpenPath} label="…or type a project directory path"
            text={typedPath} setText={setTypedPath} />
          <GuideCards />
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
  // Compared under normalizeProjectPath: the stored side is normalized by the
  // recents store, but currentPath is whatever spelling the project was opened
  // with (an agent can pass `proj/`), and a raw compare would then show the
  // open project as an "other" recent.
  const currentNorm = currentPath !== null ? normalizeProjectPath(currentPath) : null;
  const otherRecents = recents.filter((r) => normalizeProjectPath(r.path) !== currentNorm);

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

        <GuideCards />

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
        {/* The same door in the switch case. A person with one project open and
            a broken portal is as stuck as one with none, and the reason it is
            outside the card grid is that a text field is not a card: it does not
            open one named thing, it takes an argument. */}
        <OpenByPath onOpenPath={onOpenPath} label="…or type another project directory path"
          text={typedPath} setText={setTypedPath} />
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
    marginTop: 20, fontSize: T.t2xs, fontWeight: T.wSemibold, color: T.textLo,
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
    fontSize: T.t2xs, color: T.textFaint, fontFamily: T.fontMono,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: '100%',
  },
  projectHeader: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const },
  chip: {
    padding: '1px 8px', background: T.raised, border: `1px solid ${T.borderStrong}`,
    borderRadius: T.rPill, fontSize: T.t2xs, fontWeight: T.wSemibold, color: T.accent, fontFamily: T.fontMono,
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
  // A card that stacks a title over its blurb — the `card` grid cell, but
  // column-flowed, because a guide's one line of explanation is what makes it
  // worth clicking and a `title` attribute is not an affordance.
  guideCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3,
    minWidth: 0, padding: '12px 14px', background: T.void,
    border: `1px solid ${T.border}`, borderRadius: T.rLg,
    cursor: 'pointer', color: T.textBase, textAlign: 'left' as const,
  },
  guideBlurb: { fontSize: T.t2xs, color: T.textLo, lineHeight: 1.45 },
  cardLabel: { flex: 1, minWidth: 0, fontSize: T.tSm, fontWeight: T.wMedium, color: T.textHi },
  cardBadge: { fontSize: T.t2xs, color: T.textLo, fontFamily: T.fontMono, flexShrink: 0 },
};
