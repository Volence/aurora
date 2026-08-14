// Classic (S1 disasm) port for the neutral shared/MapStatusBar.
//
// The eventual replacement for the bespoke statusLeft/statusRight built inline
// in ClassicProjectView. NOTHING RENDERS THIS YET: the two coexist until classic
// moves onto the shared LevelWorkspace shell and ClassicProjectView is deleted,
// which is what removes the duplicate. Until then, a change to what classic's
// status bar says has to be made in BOTH places.
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
//    fact rather than a map-level one and belongs to whatever surface owns the
//    resolution report — not to the `right` slot, which is reserved for
//    engine-only trailing content and is empty for classic (no Aether bus).

import React from 'react';
import type { MapStatusPort } from '../components/shared/map-status-model';
import type { LevelDoc } from '../../core/level-classic/model';
import { useEditorStore } from '../state/editorStore';
import { useViewStore } from '../state/viewStore';
import { useClassicLevelStore, type ClassicLevelStatus } from '../state/classicLevelStore';
import type { ZoneActRef } from '../../core/project/adapter';

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
    // line that is not a fact about the act (ClassicProjectView.tsx:118).
    scopeTone,
    // Empty on purpose: classic's stamp context already rides its own hint line
    // in the chunk picker, and repeating it here would say it twice.
    contextInfo: '',
    zoom,
    onZoom: setZoom,
    // No Aether bus for classic.
    right: undefined,
  }), [tool, pasting, editingLayer, ref, scopeInfo, scopeTone, zoom, setZoom]);
}
