// src/renderer/components/setup/ProjectSetupTab.tsx
// The Project Setup tab (spec §7): the Resolution Report promoted from readout
// to editor. Each report entry is a row: status light, key, editable path
// override. Edits live-validate via pathExists (debounced); Apply writes the
// merged .aurora/project.json and re-opens the project so resolution re-runs
// for real. Sidecar parse issues (per-entry diagnostics from mapping.ts) and
// overrides matching no profile entry render above the rows. Aeon shows an
// info card until it becomes a full profile (Stage 3).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { T, CollapsibleSection } from '../ui';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useProjectStore } from '../../state/projectStore';
import { useConfirmStore } from '../../state/confirmStore';
import { useToastStore } from '../../state/toastStore';
import { buildSetupRows, applyPathEdits, pendingEditCount, type SetupRow } from './setup-model';
import { serializeProjectConfig } from '../../../core/project/mapping';
import type { EntryStatus } from '../../../core/project/report';

const STATUS_COLOR: Record<EntryStatus, string> = {
  resolved: T.success,
  missing: T.error,
  ambiguous: T.warning,
};

/** Debounced existence probe for a candidate override path. */
function useLiveCheck(dir: string | null) {
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [checks, setChecks] = useState<Record<string, boolean | 'pending'>>({});
  const check = (key: string, rel: string) => {
    if (!dir) return;
    if (rel === '') {
      setChecks((c) => { const { [key]: _, ...rest } = c; return rest; });
      return;
    }
    setChecks((c) => ({ ...c, [key]: 'pending' }));
    clearTimeout(timers.current.get(key));
    timers.current.set(key, setTimeout(() => {
      window.api.pathExists(dir, rel)
        .then((ok) => setChecks((c) => ({ ...c, [key]: ok })))
        .catch(() => setChecks((c) => ({ ...c, [key]: false })));
    }, 300));
  };
  // Clears every pending timer + the checks map (project switch, successful Apply).
  const reset = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current.clear();
    setChecks({});
  };
  // Unmount cleanup: this component is normally kept alive (see the tab-level
  // effect below), so this mainly guards tests/hot-reload, but a leaked timer
  // firing setState after unmount is a real bug either way.
  useEffect(() => () => { timers.current.forEach((t) => clearTimeout(t)); }, []);
  return { checks, check, reset };
}

function Row({ row, edit, live, onEdit }: {
  row: SetupRow;
  edit: string | undefined;                  // undefined = untouched this session
  live: boolean | 'pending' | undefined;
  onEdit: (key: string, value: string) => void;
}) {
  const value = edit !== undefined ? edit : (row.override ?? '');
  const lightColor =
    live === 'pending' ? T.textFaint
    : live === true ? T.success
    : live === false ? T.error
    : STATUS_COLOR[row.status];
  return (
    <div style={styles.row}>
      <span style={{ ...styles.light, background: lightColor }} title={row.detail ?? row.status} />
      <span style={styles.key}>{row.key}</span>
      <input
        value={value}
        placeholder={row.path}
        onChange={(e) => onEdit(row.key, e.target.value)}
        spellCheck={false}
        style={styles.pathInput}
        title={value === '' ? `stock: ${row.path}` : value}
      />
    </div>
  );
}

export default function ProjectSetupTab() {
  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  const dir = useClassicProjectStore((s) => s.dir);
  const label = useClassicProjectStore((s) => s.label);
  const report = useClassicProjectStore((s) => s.report);
  const sidecar = useClassicProjectStore((s) => s.sidecar);
  const zoneTree = useClassicProjectStore((s) => s.zoneTree);
  const classicDirty = useClassicLevelStore((s) => Object.values(s.dirty).some(Boolean));
  const config = useProjectStore((s) => s.config);

  // key → edited value ('' = clear the override). Cleared on Apply/re-open.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState(false);
  const { checks, check, reset: resetChecks } = useLiveCheck(dir);

  // This tab is mounted keep-alive (display:none) in the shell — it never
  // unmounts across a project switch — so pending edits/checks from project A
  // would otherwise survive into project B and Apply would write A's overrides
  // into B's .aurora/project.json (data corruption). Reset on project identity
  // change. Keyed on `dir` (not handle identity, cf. ClassicProjectView's
  // module-scoped handle marker): unlike that view, this tab is never
  // unmounted/remounted while the SAME project stays open, so there is no
  // remount-without-a-project-change case to guard against here.
  useEffect(() => {
    setEdits({});
    resetChecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  const model = useMemo(() => {
    if (!report || !sidecar) return null;
    const zoneOrder = [...new Set(zoneTree.map((r) => r.zone))];
    return buildSetupRows(report, sidecar.config, zoneOrder);
  }, [report, sidecar, zoneTree]);

  if (!classicOpen || !dir || !model || !sidecar) {
    if (config) {
      return (
        <div style={styles.scroll}><div style={styles.column}>
          <div style={styles.title}>Project Setup</div>
          <div style={styles.infoCard}>
            <div style={styles.infoLine}><span style={styles.infoKey}>engine</span><span style={styles.mono}>s4 (aeon)</span></div>
            <div style={styles.infoLine}><span style={styles.infoKey}>project</span><span style={styles.mono}>{config.name}</span></div>
            <div style={styles.infoLine}><span style={styles.infoKey}>config</span><span style={styles.mono}>{config.basePath}/project.json</span></div>
            <div style={styles.infoLine}><span style={styles.infoKey}>zones</span><span style={styles.mono}>{config.zones.length}</span></div>
          </div>
          <div style={styles.note}>
            Aeon projects configure through their own project.json today; the full
            mapping-layer editor arrives when aeon becomes a profile (Stage 3).
          </div>
        </div></div>
      );
    }
    return (
      <div style={styles.scroll}><div style={styles.column}>
        <div style={styles.title}>Project Setup</div>
        <div style={styles.note}>Open a project to configure it.</div>
      </div></div>
    );
  }

  const onEdit = (key: string, value: string) => {
    setEdits((e) => ({ ...e, [key]: value }));
    check(key, value);
  };

  // See pendingEditCount's doc comment: compares against the sidecar's
  // config.paths directly (not a row lookup) so removing an unknown override
  // — a key model.unknownOverrides carries but no report row does — still
  // registers as pending and doesn't leave Apply stuck disabled.
  const pendingCount = pendingEditCount(sidecar.config, edits);

  const apply = async () => {
    if (classicDirty) {
      const a = await useConfirmStore.getState().ask({
        title: 'Unsaved level changes',
        body: 'Applying setup changes re-opens the project, which reloads the level from disk.',
        buttons: [
          { key: 'save', label: 'Save & apply', tone: 'primary' },
          { key: 'discard', label: 'Discard & apply', tone: 'danger' },
          { key: 'cancel', label: 'Cancel' },
        ],
      });
      if (a === 'cancel') return;
      if (a === 'save') {
        const { saveClassicProject } = await import('../../state/classic-save');
        const result = await saveClassicProject();
        // saveClassicProject never rejects — every failure mode is a returned
        // variant (see classic-save.ts). Mirror tab-activation.ts's isSaveSuccess
        // guard: only 'saved' and 'nothing' mean it's safe to proceed. A failed
        // save (conflict/partial/error) already toasted; falling through to
        // apply here would re-open the project and discard the edits the user
        // clicked "Save & apply" to protect.
        if (result.kind !== 'saved' && result.kind !== 'nothing') return;
      }
    }
    setApplying(true);
    try {
      const editMap: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(edits)) editMap[k] = v === '' ? null : v;
      const next = applyPathEdits(sidecar.config, editMap);
      const bytes = serializeProjectConfig(next);
      await window.api.writeBinaryFile(dir, '.aurora/project.json', bytes.buffer as ArrayBuffer);
      setEdits({});
      resetChecks(); // row lights fall back to the fresh report status, not stale live-check colors
      const outcome = await useClassicProjectStore.getState().openDirectory(dir);
      useToastStore.getState().addToast(
        outcome === 'opened' ? 'Setup applied — project re-validated' : 'Setup written, but re-open failed',
        outcome === 'opened' ? 'success' : 'error',
      );
    } catch (e) {
      useToastStore.getState().addToast(`Apply failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setApplying(false);
    }
  };

  const full = report!.resolved === report!.total;

  return (
    <div style={styles.rootWithFooter}>
      <div style={styles.scroll}>
        <div style={styles.column}>
          <div style={styles.title}>Project Setup</div>
          <div style={styles.infoCard}>
            <div style={styles.infoLine}><span style={styles.infoKey}>base profile</span><span style={styles.mono}>{label}</span></div>
            <div style={styles.infoLine}><span style={styles.infoKey}>directory</span><span style={styles.mono}>{dir}</span></div>
            <div style={styles.infoLine}>
              <span style={styles.infoKey}>resolution</span>
              <span style={{ ...styles.mono, color: full ? T.success : T.warning }}>
                {report!.resolved}/{report!.total} files resolved
              </span>
            </div>
          </div>

          {sidecar.issues.length > 0 && (
            <div style={styles.issueCard}>
              <div style={styles.issueTitle}>Sidecar issues (.aurora/project.json)</div>
              {sidecar.issues.map((i) => (
                <div key={i.where} style={styles.issueLine}>
                  <span style={styles.mono}>{i.where}</span> — {i.message}
                </div>
              ))}
            </div>
          )}

          {model.unknownOverrides.length > 0 && (
            <div style={styles.issueCard}>
              <div style={styles.issueTitle}>Overrides matching no known entry</div>
              {model.unknownOverrides.map((o) => (
                <div key={o.key} style={styles.issueLine}>
                  <span style={styles.mono}>{o.key}</span> → <span style={styles.mono}>{o.path}</span>
                  <button style={styles.removeButton} onClick={() => onEdit(o.key, '')}>remove</button>
                </div>
              ))}
            </div>
          )}

          {model.groups.map((g) => (
            <CollapsibleSection
              key={g.id}
              id={`setup.${g.id}`}
              title={g.id.toUpperCase()}
              defaultCollapsed={g.resolved === g.total}
              right={
                <span style={{ color: g.resolved === g.total ? T.success : T.warning, fontSize: 10 }}>
                  {g.resolved}/{g.total}
                </span>
              }
            >
              <div style={styles.rows}>
                {g.rows.map((row) => (
                  <Row key={row.key} row={row} edit={edits[row.key]} live={checks[row.key]} onEdit={onEdit} />
                ))}
              </div>
            </CollapsibleSection>
          ))}
        </div>
      </div>
      <div style={styles.footer}>
        <span style={styles.footerHint}>
          {pendingCount > 0 ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} pending` : 'Edit a path to override the base profile'}
        </span>
        <button onClick={() => void apply()} disabled={pendingCount === 0 || applying} style={{
          ...styles.applyButton, ...(pendingCount === 0 || applying ? styles.applyDisabled : {}),
        }}>
          {applying ? 'Applying…' : 'Apply & re-validate'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  rootWithFooter: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.surface },
  scroll: { flex: 1, overflowY: 'auto', background: T.surface },
  column: { maxWidth: 860, margin: '0 auto', padding: '32px 32px 24px', display: 'flex', flexDirection: 'column', gap: 12 },
  title: { fontSize: 16, fontWeight: 600, color: T.textHi },
  infoCard: {
    display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 14px',
    background: T.void, border: `1px solid ${T.border}`, borderRadius: T.rLg,
  },
  infoLine: { display: 'flex', gap: 12, fontSize: 12 },
  infoKey: { width: 90, flexShrink: 0, color: T.textLo, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: 1, paddingTop: 1 },
  mono: { fontFamily: T.fontMono, fontSize: 11, color: T.textBase, overflowWrap: 'anywhere' as const },
  note: { fontSize: 12, color: T.textLo },
  issueCard: {
    padding: '10px 14px', background: T.void, border: `1px solid ${T.warning}`,
    borderRadius: T.rLg, display: 'flex', flexDirection: 'column', gap: 4,
  },
  issueTitle: { fontSize: 11, fontWeight: 600, color: T.warning },
  issueLine: { fontSize: 11, color: T.textBase, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const },
  removeButton: {
    padding: '0 6px', background: 'transparent', border: `1px solid ${T.border}`,
    borderRadius: T.rSm, color: T.textLo, cursor: 'pointer', fontSize: 10,
  },
  rows: { display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 0 8px' },
  row: { display: 'flex', alignItems: 'center', gap: 8, padding: '1px 8px' },
  light: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  key: { fontFamily: T.fontMono, fontSize: 11, color: T.textBase, width: 220, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  pathInput: {
    flex: 1, minWidth: 0, padding: '2px 8px', background: T.surface,
    border: `1px solid ${T.border}`, borderRadius: T.rSm, outline: 'none',
    color: T.textHi, fontSize: 11, fontFamily: T.fontMono,
  },
  footer: {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12,
    padding: '8px 16px', borderTop: `1px solid ${T.border}`, background: T.void, flexShrink: 0,
  },
  footerHint: { fontSize: 11, color: T.textLo },
  applyButton: {
    padding: '5px 16px', background: T.accent, color: T.onAccent, fontWeight: 600,
    border: 'none', borderRadius: T.rMd, cursor: 'pointer', fontSize: 12,
  },
  applyDisabled: { opacity: 0.4, cursor: 'default' },
};
