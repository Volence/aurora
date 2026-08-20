// Classic (S1 disasm) port for the neutral shared/MapStatusBar.
//
// The replacement for the bespoke statusLeft/statusRight that used to be built
// inline in ClassicProjectView. Live since the shell flip (stage-4 plan 5, task
// 9) deleted that view: both s1 MAP facets render it (workspace/facets/
// s1-facets.tsx), and it is now the only place classic's status line is said.
//
// Reads only — the bar reports, it never edits, so nothing here calls a classic
// command (and so it does not appear in classic-surface.test.ts's COMMAND_SITES).
//
// Two things from the old bar deliberately do NOT come across:
//
//  - **The dirty dot.** The tab strip already carries unsaved state
//    (shell/dirty-tabs.ts); showing it twice was a legacy-shell artifact from
//    when classic had no tabs of its own.
//  - **The resolution summary** ("N/M files resolved"), which is a project-level
//    fact rather than a map-level one. Its home is the Project Setup tab's info
//    card (setup/ProjectSetupTab.tsx), which prints the same roll-up above the
//    editable path rows — not the `right` slot, which carries the Aether badge
//    (below).
//
// The `right` slot carries the same Aether bus indicator as aeon's port since
// the classic playtest loop landed: Build & Run and the live palette push both
// run against classic now, and the badge is where connecting happens.

import React from 'react';
import type { MapStatusPort } from '../components/shared/map-status-model';
import type { LevelDoc } from '../../core/level-classic/model';
import { useEditorStore } from '../state/editorStore';
import { useViewStore } from '../state/viewStore';
import { useClassicLevelStore, type ClassicLevelStatus } from '../state/classicLevelStore';
import type { ZoneActRef } from '../../core/project/adapter';
import AetherStatus from '../components/AetherStatus';

/** Same hoisted element as the aeon port: no props, never varies. */
const AETHER = React.createElement(AetherStatus);

/**
 * The four fields the scope line reads, and no more. Narrower than `LevelDoc` on
 * purpose: it states exactly what the bar depends on, and it lets the test build
 * an honest fixture instead of casting eight unrelated fields away — a cast that
 * would keep compiling if `fg` were renamed out from under this function.
 */
export type ScopeDoc = Pick<LevelDoc, 'fg' | 'chunks' | 'blocks' | 'objects'>;

/**
 * What sits to the right of the act name: the act's shape and contents once it
 * is loaded, and the load state itself before that. The old bar folded these
 * into one span; they are the same five cases.
 */
export function classicScopeInfo(
  ref: ZoneActRef | null,
  status: ClassicLevelStatus,
  doc: ScopeDoc | null,
): string {
  if (!ref) return 'no act selected';
  if (status === 'loading') return 'loading…';
  if (status === 'error') return 'load failed';
  if (status !== 'ready' || !doc) return '';
  return `${doc.fg.width}×${doc.fg.height} chunks · ${doc.chunks.length} chunks · `
    + `${doc.blocks.length} blocks · ${doc.objects.length} objects`;
}

/**
 * Whether that scope string is a fact or a failure. Split out rather than folded
 * into classicScopeInfo's return so the string function keeps its narrow
 * signature (and its doc parameter, which the tone does not need); the test
 * pairs them over every (ref, status) so the two cannot drift apart.
 */
export function classicScopeTone(
  ref: ZoneActRef | null,
  status: ClassicLevelStatus,
): 'normal' | 'error' {
  // `ref === null` first, matching classicScopeInfo: with no act selected the
  // line reads 'no act selected' whatever the load state, and there is no
  // failure being reported to colour.
  return ref !== null && status === 'error' ? 'error' : 'normal';
}

export function useClassicMapStatusPort(): MapStatusPort {
  // The tool vocabulary and the editing plane are shared with aeon (plan 4), so
  // these are the same three editorStore reads the aeon port makes.
  const tool = useEditorStore((s) => s.tool);
  const pasting = useEditorStore((s) => s.pasting);
  const editingLayer = useEditorStore((s) => s.editingLayer);
  // Classic's viewport syncs its own camera into viewStore, so the zoom control
  // drives it exactly as it drives aeon's.
  const zoom = useViewStore((s) => s.zoom);
  const setZoom = useViewStore((s) => s.setZoom);

  const ref = useClassicLevelStore((s) => s.ref);
  const doc = useClassicLevelStore((s) => s.doc);
  const status = useClassicLevelStore((s) => s.status);

  const scopeInfo = classicScopeInfo(ref, status, doc);
  const scopeTone = classicScopeTone(ref, status);

  return React.useMemo((): MapStatusPort => ({
    tool,
    pasting,
    layer: editingLayer,
    // The S1 badge the old bar drew in accent is folded into the name: the bar's
    // accent slot is the tool label, and which engine is open is a fact about
    // the act, not a heading of its own.
    zoneName: ref ? `S1 · ${ref.label}` : 'S1',
    scopeInfo,
    // Carries the red the old bar drew a failed load in — the one thing on this
    // line that is not a fact about the act (the old bespoke classic bar).
    scopeTone,
    // Empty on purpose: classic's stamp context already rides its own hint line
    // — ClassicMapToolOptions, the bar directly above the canvas, which prints
    // `stamp $2A ∞loop · drag to paint · right-click eyedrops` — and repeating it
    // here would say it twice. (It is NOT the chunk picker's status line, which
    // this comment claimed for a while; that one says how to use the picker.)
    contextInfo: '',
    // …and for the same reason the bar must not fall back to the generic tool
    // hint either. BOTH classic map facets mount that ToolOptions bar
    // (workspace/facets/s1-facets.tsx), so every tool classic offers is already
    // explained one row above — by a line that knows the PLANE, which the
    // generic hint does not. With `select` on BG the two flatly contradicted
    // each other: the options bar said "objects are FG-only — switch to FG to
    // edit · drag to pan" (what the canvas does) and this bar said "Click to
    // select, drag to move, Del to remove" (what it does not).
    ownHintLine: true,
    zoom,
    onZoom: setZoom,
    // The Aether bus badge — connect/disconnect for Build & Run and the live
    // palette push, which both serve classic since the playtest-loop parcel.
    right: AETHER,
  }), [tool, pasting, editingLayer, ref, scopeInfo, scopeTone, zoom, setZoom]);
}
