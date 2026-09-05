import React, { useEffect, useMemo } from 'react';
import { T } from '../ui';
import { useClassicLevelStore, type ComposerTab } from '../../state/classicLevelStore';
import { useArtStore } from '../../state/artStore';
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

const trailStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, fontFamily: T.fontMono, fontSize: T.t2xs };
const trailBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: T.textLo, cursor: 'pointer',
  fontFamily: T.fontMono, fontSize: T.t2xs, padding: '1px 2px',
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
  const tab = useClassicLevelStore((s) => s.composerTab);
  const setTab = useClassicLevelStore((s) => s.setComposerTab);

  // THE ONE WRITER of the art zoom's tier, for classic. Each tier keeps its own
  // zoom (artStore.ART_TIER_DEFAULT_ZOOM): 24x suits an 8x8 tile and would open
  // a 256x256 chunk at 6144px. `composerTab` already names the tier that is on
  // screen, so mirroring it here beats a second source of truth in each tab.
  const setArtTier = useArtStore((s) => s.setArtTier);
  const clearAction = useArtStore((s) => s.clearAction);
  useEffect(() => {
    setArtTier(tab);
    // AND DROP ANY PENDING TRANSFORM. `pendingAction` is a one-shot request with
    // exactly one consumer (TileTab, which clears it in a `finally`), so an
    // action left parked by any other host would fire the next time the Tile tab
    // mounted — committing a real transform against a tile the artist never
    // chose. The tiers that cannot consume it no longer OFFER it
    // (CLASSIC_SURFACE_CAPS), and this is the belt to that braces: crossing a
    // tier boundary discards the request rather than carrying it.
    clearAction();
  }, [tab, setArtTier, clearAction]);

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
    // To the LAST valid id, not to 0: ids are 1-based over doc.chunks, so
    // doc.chunks.length is the highest real chunk and 0 is air — the one id the
    // Chunk tab cannot edit. Clamping to air answered "your chunk was undone
    // away" with the facet's dead resting state (see firstEditableChunkId).
    if (s.selectedChunkId > doc.chunks.length) s.setSelectedChunkId(doc.chunks.length);
  }, [doc]);

  if (status !== 'ready' || !doc || !usage) return null;

  return (
    // Everything in this dock edits the ZONE-ART document (tiles/blocks/chunks),
    // so working here claims the art facet for undo routing (classic-surface.ts).
    <div {...classicSurfaceProps('art')} style={styles.dock}>
      {/* The header bar is the TIER STRIP: which of chunk/block/tile you are
          editing, which one is selected, and the shared-edit warning. It used to
          also carry a "▾ COMPOSER" collapse toggle — removed with the bottom
          strip it belonged to. Collapsing made sense when this sat BESIDE the
          map and you wanted the map back; as the canvas itself there is nothing
          behind it to reveal, so the only thing the control could do was empty
          the facet with no affordance explaining how to undo that. The word
          "Composer" went with it: the Art pill already says where you are and
          the tier tabs say what you are editing. */}
      <div style={styles.dockHead}>
        <div style={styles.tabBar}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{ ...styles.tabBtn, ...(tab === t.id ? styles.tabBtnActive : {}) }}
            >{t.label}</button>
          ))}
        </div>
        <SelectionTrail />
        <span style={{ flex: 1 }} />
        <span style={styles.dockHint}>shared tile/block/chunk editing: usage counts warn before shared edits</span>
      </div>
      <div style={styles.dockContent}>
        {tab === 'chunk' && <ChunkTab doc={doc} usage={usage} />}
        {tab === 'block' && <BlockTab doc={doc} usage={usage} />}
        {tab === 'tile' && <TileTab doc={doc} usage={usage} />}
      </div>
    </div>
  );
}
