import React, { useEffect, useMemo } from 'react';
import { T } from '../ui';
import { useClassicLevelStore, type ComposerTab } from '../../state/classicLevelStore';
import { buildUsageIndex } from '../../../core/level-classic/usage-index';
import ChunkTab from './ChunkTab';
import BlockTab from './BlockTab';
import TileTab from './TileTab';
import { hex, styles } from './composer-shared';
import { classicSurfaceProps } from './classic-surface';

// ---------------------------------------------------------------------------
// Dock shell
// ---------------------------------------------------------------------------

const TABS: { id: ComposerTab; label: string }[] = [
  { id: 'chunk', label: 'Chunk' },
  { id: 'block', label: 'Block' },
  { id: 'tile', label: 'Tile' },
];

/**
 * The shared-selection trail (chunk › block › tile) rendered in the dock header.
 * The three tabs share one selection context but nothing used to SHOW it, which
 * made the drill-down (viewport/picker → chunk cell → block cell → tile) hard to
 * discover. Each segment jumps to its tab; the active tab's segment is lit.
 */
function SelectionTrail() {
  const tab = useClassicLevelStore((s) => s.composerTab);
  const setTab = useClassicLevelStore((s) => s.setComposerTab);
  const selectedChunkId = useClassicLevelStore((s) => s.selectedChunkId);
  const composerBlockId = useClassicLevelStore((s) => s.composerBlockId);
  const composerTileIndex = useClassicLevelStore((s) => s.composerTileIndex);
  const segs: { id: ComposerTab; label: string }[] = [
    { id: 'chunk', label: `Chunk ${selectedChunkId === 0 ? 'air' : hex(selectedChunkId)}` },
    { id: 'block', label: `Block ${hex(composerBlockId)}` },
    { id: 'tile', label: `Tile ${hex(composerTileIndex)}` },
  ];
  return (
    <span style={trailStyle}>
      {segs.map((s, i) => (
        <React.Fragment key={s.id}>
          {i > 0 && <span style={{ color: T.textFaint }}>›</span>}
          <button
            onClick={() => setTab(s.id)}
            title={`Open the ${s.id} tab`}
            style={{ ...trailBtn, ...(tab === s.id ? { color: T.accent } : {}) }}
          >{s.label}</button>
        </React.Fragment>
      ))}
    </span>
  );
}

const trailStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, fontFamily: T.fontMono, fontSize: 10 };
const trailBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: T.textLo, cursor: 'pointer',
  fontFamily: T.fontMono, fontSize: 10, padding: '1px 2px',
};

/**
 * The classic composer dock (Task B3): tile/block/chunk content editing with a
 * shared selection context and shared-structure UX (usage counts + shared-edit
 * warnings + duplicate-then-edit). Sits above the ChunkPicker in the bottom area,
 * collapsible so it never crowds the viewport when not in use. Level-art editing
 * is self-contained here — deliberately NOT wired into aeon's Art mode (S1's
 * strict shared semantics get purpose-built UX). Each tab is a sibling file
 * (ChunkTab/BlockTab/TileTab) over the shared pieces in composer-shared.
 */
export default function ClassicComposerDock() {
  const status = useClassicLevelStore((s) => s.status);
  const doc = useClassicLevelStore((s) => s.doc);
  const open = useClassicLevelStore((s) => s.composerOpen);
  const setOpen = useClassicLevelStore((s) => s.setComposerOpen);
  const tab = useClassicLevelStore((s) => s.composerTab);
  const setTab = useClassicLevelStore((s) => s.setComposerTab);

  // Usage index — rebuilt on every doc change (the doc is small). Recomputes on
  // the identity churn a command produces, so counts stay exact after edits AND
  // after undo/redo (which restore a prior doc identity).
  const usage = useMemo(() => (doc ? buildUsageIndex(doc) : null), [doc]);

  // Undo/redo can shrink the pools under a stale selection (an added chunk/block
  // undone away). Selection is UI state, not in the undo snapshot — clamp it back
  // into range whenever the doc changes so no tab addresses a vanished entity.
  useEffect(() => {
    if (!doc) return;
    const s = useClassicLevelStore.getState();
    const tileCount = Math.floor(doc.tiles.length / 32);
    if (s.composerBlockId >= doc.blocks.length) s.setComposerBlockId(Math.max(0, doc.blocks.length - 1));
    if (s.composerTileIndex >= tileCount) s.setComposerTileIndex(Math.max(0, tileCount - 1));
    if (s.selectedChunkId > doc.chunks.length) s.setSelectedChunkId(0);
  }, [doc]);

  if (status !== 'ready' || !doc || !usage) return null;

  return (
    // Everything in this dock edits the ZONE-ART document (tiles/blocks/chunks),
    // so working here claims the art facet for undo routing (classic-surface.ts).
    <div {...classicSurfaceProps('art')} style={styles.dock}>
      <div style={styles.dockHead}>
        <button onClick={() => setOpen(!open)} style={styles.collapseBtn} title={open ? 'Collapse composer' : 'Expand composer'}>
          {open ? '▾' : '▸'} Composer
        </button>
        {open && (
          <div style={styles.tabBar}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{ ...styles.tabBtn, ...(tab === t.id ? styles.tabBtnActive : {}) }}
              >{t.label}</button>
            ))}
          </div>
        )}
        {open && <SelectionTrail />}
        <span style={{ flex: 1 }} />
        {open && <span style={styles.dockHint}>shared tile/block/chunk editing — usage counts warn before shared edits</span>}
      </div>
      {open && (
        <div style={styles.dockContent}>
          {tab === 'chunk' && <ChunkTab doc={doc} usage={usage} />}
          {tab === 'block' && <BlockTab doc={doc} usage={usage} />}
          {tab === 'tile' && <TileTab doc={doc} usage={usage} />}
        </div>
      )}
    </div>
  );
}
