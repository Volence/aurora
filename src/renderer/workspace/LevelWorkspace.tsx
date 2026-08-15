// The facet-based level workspace (spec §4) — aeon-only until Stage 4 re-homes
// classic. Owns the ONE EditorShell; the active facet module fills its slots.
// The workspace header (EditorShell's appBar slot) carries the facet bar plus
// the workspace controls that used to live on the legacy Toolbar: the FG/BG
// plane toggle (on every facet whose canvas is plane-gated) and undo/redo for
// the focused document.
//
// WHICH SLOTS GET FILLED IS NOT DECIDED HERE. facet-chrome.ts owns it — both the
// plane-gated facet list and the rule that a facet with no act loaded draws
// nothing but its canvas — because a decision inside a .tsx is a decision the
// node-only suite cannot test.

import React from 'react';
import EditorShell from '../shell/EditorShell';
import FacetBar from './FacetBar';
import { moduleFor, resolveFacet } from './facet-registry';
import { switchFacet } from './facet-tools';
import { facetChrome } from './facet-chrome';
import { useActLoaded, usePixelToolsLive } from './level-presence';
import { useWorkspaceStore } from './workspaceStore';
import { useOpenEngine, useOpenCapabilities, type OpenEngine } from '../state/open-project';
import { useSessionStore } from '../state/sessionStore';
import { useEditorStore, focusedHistory } from '../state/editorStore';
import { useHistoryVersion } from '../hooks/useHistoryVersion';
import { levelKeysEnabled } from './level-keys';
import { isTypingTarget } from '../components/classic/composer-shared';
import ViewMenu from '../shell/ViewMenu';
import { Chip, T } from '../components/ui';
import type { EditingLayer } from '../state/editorStore';
import type { FacetCapability } from '../../core/project/adapter';

export default function LevelWorkspace() {
  const activeId = useSessionStore((s) => s.activeId);
  // The OPEN engine's grant, not the aeon store's — a classic open never
  // populates projectStore, so reading it directly would render an empty facet
  // bar the moment classic re-homes here (spec §3.0). For aeon this resolves to
  // exactly the same manifest it always did.
  const granted = useOpenCapabilities()?.facets ?? [];
  const facetId = useWorkspaceStore((s) => s.facetFor(activeId));
  // Undo/redo enabledness re-evaluates on any stack change; focus moves (a facet
  // switch, a tab switch) are covered by the facetId/activeId subscriptions above,
  // which is exactly what focusedHistory() keys on.
  useHistoryVersion();
  const history = focusedHistory();
  const editingLayer = useEditorStore((s) => s.editingLayer);
  // Hoisted above the `mod` null-guard below: a hook may not sit after an early
  // return.
  const engine = useOpenEngine();
  // One engine-keyed resolve, and no fallback of any kind ACROSS ENGINES.
  // Falling back to aeon's module (what the old canvas registry did) renders
  // aeon's viewport against an empty store — a lie about the data. resolveFacet
  // only ever answers with another facet OF THIS ENGINE, which is a different
  // thing: a change of selection, not of subject. App's mount effect registers
  // before any project can load, so for aeon this is always non-null.
  const resolved = resolveFacet(engine, granted, facetId);
  const mod = resolved !== null ? moduleFor(engine, resolved) : null;

  // …and the heal is written back, so the lit pill matches what is on screen.
  // In an effect, never during render: switchFacet writes two stores, and a
  // store write inside a render body updates a component while another is
  // rendering. Idempotent by construction — resolveFacet(resolved) === resolved
  // (facet-tools.test.ts) — so the re-render this causes does not fire it again.
  React.useEffect(() => {
    if (resolved !== null && resolved !== facetId) switchFacet(activeId, resolved);
  }, [activeId, facetId, resolved]);

  // ONE level-undo binding for both engines. It was duplicated per canvas
  // (MapViewport, art-facet) plus once in the legacy classic shell, which this
  // branch deletes — its copy was classic's ONLY Ctrl+Z, so it is re-homed here
  // rather than lost with the file. With classic and aeon under this workspace,
  // two window bindings would mean one Ctrl+Z undoing twice. SpriteMode keeps
  // its own — different pane, and levelKeysEnabled() is what keeps this one
  // inert under a sprite tab. Nothing here is facet-specific: focusedHistory()
  // resolves the focused document (the act's layout, or the zone-art doc under
  // an art/palette facet), and returns null on a non-document tab, which is the
  // same resolution the header's Undo/Redo chips above use. Not IDENTICAL to
  // them, though: preventDefault runs before that null check, so on a Home or
  // Project Setup tab — where this pane stays mounted keep-alive — Ctrl+Z is
  // swallowed while the chips merely render disabled. Pre-existing (the
  // MapViewport copy did the same from the same pane) and harmless: there is no
  // other Ctrl+Z on those tabs to swallow.
  //
  // isTypingTarget is deliberately LAXER than the guard the map canvases used
  // to carry, which blocked on any focused <input>: it exempts range/checkbox/
  // button/radio, the exception the art facet added so Ctrl+Z works right after
  // a palette-slider commit. Hoisting extends that exemption to the map facets,
  // where exactly three controls are reachable: PaletteEditor's range (palette
  // commits ARE undoable on the zone-art doc — this is the win, Ctrl+Z after a
  // slider used to do nothing), ObjectInspector's checkbox (runs onCommit, so
  // undoing straight after is right), and ViewMenu's overlay checkboxes, which
  // are NOT undoable — there Ctrl+Z now undoes the last map EDIT instead of
  // doing nothing. Mildly surprising, not destructive, and known rather than
  // overlooked.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!levelKeysEnabled()) return;
      if (isTypingTarget(e.target as HTMLElement)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        focusedHistory()?.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        focusedHistory()?.redo();
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // WHICH SLOTS ARE LIVE. The whole decision — including which facets the FG/BG
  // chips do anything on, and the "no act loaded" suppression that stops a facet
  // from drawing its entire frame around nothing — is facet-chrome.ts, a pure
  // module the node-only suite can actually test. Nothing here re-derives it.
  const actLoaded = useActLoaded(engine);
  // …and one thing facet-chrome CANNOT own, because it is a pure function of the
  // module shape: classic's Art facet is three sub-surfaces, and its dock and
  // options only act on the pixel one. `usePixelToolsLive` is the single
  // statement of that (level-presence.ts); it answers true for every other
  // engine/facet pair, so this AND is inert everywhere else. It must be applied
  // HERE and not left to the components returning null, or EditorShell still
  // draws the empty 44px rail around nothing.
  const pixelToolsLive = usePixelToolsLive(engine, mod ? resolved : null);
  const chrome = facetChrome(actLoaded, mod ? resolved : null, {
    toolDock: mod?.ToolDock != null && pixelToolsLive,
    toolOptions: mod?.ToolOptions != null && pixelToolsLive,
    rightPanel: mod?.RightPanel != null,
    bottomExtra: mod?.BottomExtra != null,
    statusBar: mod?.StatusBar != null,
    mapOverlays: mod?.mapOverlays === true,
  });
  const header = (
    <div style={styles.header}>
      <FacetBar tabId={activeId} granted={granted} engine={engine} />
      <span style={{ flex: 1 }} />
      {chrome.planeChips && (['fg', 'bg'] as EditingLayer[]).map((l) => (
        <Chip key={l} active={editingLayer === l}
          onClick={() => useEditorStore.getState().setEditingLayer(l)}>{l.toUpperCase()}</Chip>
      ))}
      {/* The overlay toggles live HERE, next to the canvas they paint on. They
          used to ride the legacy Toolbar, which aeon level tabs stopped
          rendering when they moved onto this workspace (ead6eaf) — after that
          the only Toolbar left standing was the sprite-doc tab's, so the toggles
          were reachable only from a tab where the map is not on screen and
          "nothing happens" was the honest result. Map facets only: the art
          facet's canvas never reads viewStore.overlays. */}
      {chrome.viewMenu && <ViewMenu />}
      {/* Undo/Redo survive the no-act state on purpose: they are the only two
          controls here that are not about the absent document — focusedHistory()
          resolves to null and they render disabled, which is a true statement
          rather than dead chrome. Dropping them would make the header jump. */}
      <Chip disabled={!history?.canUndo} onClick={() => history?.undo()}>Undo</Chip>
      <Chip disabled={!history?.canRedo} onClick={() => history?.redo()}>Redo</Chip>
    </div>
  );

  // Unserved facet: the shell and its header stay, so the facet bar is still
  // there to click away with. An early `return <FacetUnavailable/>` instead
  // would strand the user on a screen with no navigation at all — closing the
  // tab would be the only exit.
  if (!mod) {
    return (
      <EditorShell appBar={header} panels={<span />}>
        <FacetUnavailable engine={engine} facetId={facetId} />
      </EditorShell>
    );
  }

  const { Canvas, ToolDock, ToolOptions, RightPanel, BottomExtra, StatusBar } = mod;
  return (
    <EditorShell
      appBar={header}
      toolOptions={chrome.toolOptions && ToolOptions ? <ToolOptions /> : undefined}
      // `undefined`, not `<span />`: EditorShell drops the 44px rail entirely
      // when a facet has no dock, rather than drawing an empty column. Classic's
      // composer facets are the only ones this reaches — plus every facet of
      // both engines while no act is loaded.
      toolDock={chrome.toolDock && ToolDock ? <ToolDock /> : undefined}
      panels={chrome.rightPanel && RightPanel ? <RightPanel /> : <span />}
      bottomExtra={chrome.bottomExtra && BottomExtra ? <BottomExtra /> : undefined}
      status={chrome.statusBar && StatusBar ? <StatusBar /> : undefined}
    >
      <Canvas />
    </EditorShell>
  );
}

/**
 * A granted facet with no module for the open engine. That is a PROFILE bug —
 * the manifest granted something the renderer cannot serve — so it is stated
 * rather than left blank, which is what a silent `return null` gave and what
 * made the old aeon fallback so hard to notice.
 *
 * Rendered as the shell's CHILD, keeping the facet bar on screen. The bar filters
 * on the same (engine, facet) resolve, so no pill leads here — only a restored
 * session record naming a facet this engine dropped can, and resolveFacet now
 * heals that case to a served facet before it reaches this component. What is
 * left is the case healing CANNOT fix: an engine that serves nothing it grants,
 * where there is no other facet to send anyone to. So it names the facet the
 * user actually asked for, not the resolve's null.
 */
function FacetUnavailable(
  { engine, facetId }: { engine: OpenEngine | null; facetId: FacetCapability },
): React.ReactElement {
  return (
    <div style={styles.unavailable}>
      The {engine ?? 'open'} engine has no {facetId} editor yet.
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', alignItems: 'center', gap: 8, width: '100%' },
  // flex:1 is load-bearing — the shell's content area is a flex container, so
  // without it this is a non-growing item and justifyContent centres nothing.
  unavailable: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100%', color: T.textLo, fontSize: 12,
  },
};
