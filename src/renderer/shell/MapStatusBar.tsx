import React from 'react';
import { StatusBar, T, IconButton, Icons } from '../components/ui';
import { useEditorStore, type EditorTool } from '../state/editorStore';
import { useViewStore } from '../state/viewStore';
import { useProjectStore, getCurrentZone } from '../state/projectStore';
import { useBusStore } from '../state/busStore';

const TOOL_INFO: Record<EditorTool, { label: string; hint: string }> = {
  'view': { label: 'View', hint: 'Click + drag to pan, scroll to zoom' },
  'select': { label: 'Select', hint: 'Click objects/rings to select, drag to move' },
  'paint-tile': { label: 'Paint Tile', hint: 'Click to place selected tile, right-click to pick' },
  'paint-block': { label: 'Paint Block', hint: 'Click to place a 16×16 px block (2×2 tiles)' },
  'stamp-chunk': { label: 'Stamp Chunk', hint: 'Select a chunk from the library, then click to stamp' },
  'paint-collision': { label: 'Paint Collision', hint: 'Click to set collision type on tiles' },
  'eraser': { label: 'Eraser', hint: 'Click to erase tiles' },
  'place-object': { label: 'Place Object', hint: 'Click to place selected object type' },
  'place-ring': { label: 'Place Ring', hint: 'Click to place ring pattern' },
};

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

  const info = TOOL_INFO[tool];
  const zoomPercent = Math.round(zoom * 100);

  const chunkCount = project?.chunkLibrary.length ?? 0;
  let contextInfo = '';
  if (tool === 'stamp-chunk') {
    if (chunkCount === 0) contextInfo = 'No chunks loaded — import chunks first';
    else if (!selectedChunkId) contextInfo = 'Select a chunk from the library panel';
    else contextInfo = `Chunk: ${selectedChunkId}`;
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
