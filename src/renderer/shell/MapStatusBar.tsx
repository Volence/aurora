import React from 'react';
import { StatusBar, T, IconButton, Icons } from '../components/ui';
import { useEditorStore } from '../state/editorStore';
import { TOOL_LABELS, TOOL_HINTS } from '../workspace/tool-meta';
import { useViewStore } from '../state/viewStore';
import { useProjectStore, getCurrentZone } from '../state/projectStore';
import { useBusStore } from '../state/busStore';

// Labels and hints come from workspace/tool-meta.ts — one vocabulary, named
// once, so this bar and classic's chip row cannot call the same tool different
// things. What stays here is the aeon-specific CONTEXT line below, which is
// where an aeon-only modifier like stamp's Alt belongs.

/** Aether bus indicator — `Aether ◇ <status>`; emerald diamond when connected. */
function AetherStatus() {
  const status = useBusStore((s) => s.status);
  const peer = useBusStore((s) => s.peer);
  const connected = status === 'connected';
  const label = connected ? (peer ? `connected · ${peer}` : 'connected') : status;
  return (
    <span title="Aether bus status" style={{ letterSpacing: '0.02em' }}>
      Aether{' '}
      <span style={{ color: connected ? T.accent : T.textFaint }}>◇</span>{' '}
      <span style={{ color: connected ? T.textBase : T.textLo }}>{label}</span>
    </span>
  );
}

export default function MapStatusBar() {
  const tool = useEditorStore((s) => s.tool);
  const editingLayer = useEditorStore((s) => s.editingLayer);
  const activeSectionIndex = useEditorStore((s) => s.activeSectionIndex);
  const zoom = useViewStore((s) => s.zoom);
  const setZoom = useViewStore((s) => s.setZoom);
  const project = useProjectStore((s) => s.project);
  const zone = getCurrentZone(useProjectStore.getState());

  const selectedChunkId = useEditorStore((s) => s.selectedChunkId);
  // Pasting is independent of the active tool (Ctrl+V doesn't switch tools),
  // so its label/hint overrides whatever TOOL_INFO would otherwise show.
  const pasting = useEditorStore((s) => s.pasting);

  const info = pasting
    ? { label: 'Paste', hint: 'Click to paste · Alt: art only · Shift: collision only · Esc to stop' }
    : { label: TOOL_LABELS[tool], hint: TOOL_HINTS[tool] };
  const zoomPercent = Math.round(zoom * 100);

  const chunkCount = project?.chunkLibrary.length ?? 0;
  let contextInfo = '';
  if (tool === 'stamp-chunk') {
    if (chunkCount === 0) contextInfo = 'No chunks loaded — import chunks first';
    else if (!selectedChunkId) contextInfo = 'Select a chunk from the library panel';
    // The Alt modifier is aeon's stamp only, so it rides on this line rather
    // than in the shared hint (see tool-meta.ts).
    else contextInfo = `Chunk: ${selectedChunkId} — Alt: art only`;
  }

  const left = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: T.accent, fontWeight: 600 }}>{info.label}</span>
      <span style={{ color: T.textBase }}>{editingLayer.toUpperCase()}</span>
      <span style={{ color: T.textLo }}>{zone?.name ?? ''}</span>
      <span style={{ color: T.textLo }}>Section {activeSectionIndex}</span>
      <span style={{ color: T.textLo }}>{contextInfo || info.hint}</span>
    </span>
  );

  const right = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <IconButton icon={<span>−</span>} label="Zoom out" onClick={() => setZoom(zoom / 1.5)} />
      <span style={{ minWidth: 36, textAlign: 'center', color: T.textBase }}>{zoomPercent}%</span>
      <IconButton icon={<span>+</span>} label="Zoom in" onClick={() => setZoom(zoom * 1.5)} />
      <span style={{ marginLeft: 8 }}><AetherStatus /></span>
    </span>
  );

  return <StatusBar left={left} right={right} />;
}
