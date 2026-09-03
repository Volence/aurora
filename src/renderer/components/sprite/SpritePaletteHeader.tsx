// src/renderer/components/sprite/SpritePaletteHeader.tsx
import React, { useMemo } from 'react';
import { useSpriteStore } from '../../state/spriteStore';
import { useProjectStore, getCurrentAct } from '../../state/projectStore';
import { useHistoryVersion } from '../../hooks/useHistoryVersion';
import { paletteLineUsageCounts } from '../../../core/art/usage';
import { T, Chip } from '../ui';
import { actAndDropFocus } from '../ui/act-and-drop-focus';

const btn: React.CSSProperties = {
  padding: `${T.s1} ${T.s3}`,
  background: T.overlay,
  color: T.textBase,
  border: `1px solid ${T.border}`,
  borderRadius: T.rMd,
  cursor: 'pointer',
  fontSize: T.tXs,
  whiteSpace: 'nowrap',
};

const selectStyle: React.CSSProperties = {
  background: T.raised,
  color: T.textHi,
  border: `1px solid ${T.border}`,
  borderRadius: T.rMd,
  fontSize: T.tXs,
  padding: `0 ${T.s1}`,
};

const note: React.CSSProperties = {
  color: T.warning,
  fontSize: T.t2xs,
  whiteSpace: 'nowrap',
};

export default function SpritePaletteHeader() {
  const mode = useSpriteStore((s) => s.paletteMode);
  const zoneLine = useSpriteStore((s) => s.zoneLine);
  const st = useSpriteStore.getState;
  const historyVersion = useHistoryVersion(); // recompute after level edits
  const currentActId = useProjectStore((s) => s.currentActId);
  const lineNote = useMemo(() => {
    if (mode !== 'zone') return null;
    if (zoneLine === 0) return 'player · shared';
    const act = getCurrentAct(useProjectStore.getState());
    if (!act) return null;
    const uses = paletteLineUsageCounts(act).get(zoneLine) ?? 0;
    return uses > 0 ? `used by ${uses.toLocaleString()} level tiles` : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, zoneLine, currentActId, historyVersion]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: T.s2,
      padding: `${T.s2} ${T.s4}`,
      fontSize: T.tXs,
      color: T.textBase,
      borderBottom: `1px solid ${T.border}`,
      flexWrap: 'wrap',
    }}>
      <Chip active={mode === 'zone'} onClick={() => st().setPaletteMode('zone')}>Zone</Chip>
      {mode === 'zone' && (
        <select
          value={zoneLine}
          onChange={(e) => st().setZoneLine(Number(e.target.value))}
          style={selectStyle}
        >
          <option value={0}>line 0 · player</option>
          <option value={1}>line 1</option>
          <option value={2}>line 2</option>
          <option value={3}>line 3</option>
        </select>
      )}
      {lineNote && <span style={note}>⚠ {lineNote}</span>}
      <Chip active={mode === 'standalone'} onClick={() => st().setPaletteMode('standalone')}>Standalone</Chip>
      <span style={{ flex: 1 }} />
      {/* ⚠ BOTH OF THESE ACT AND THEN DROP FOCUS (d-27) — see
          `ui/act-and-drop-focus.ts`. This header is always mounted, so before
          the ruling a click left the button focused and a bare Space wiped
          again with no confirmation. TWO separate dispatch lines and two
          separate harness rows: a blur wired to one of two near-identical call
          sites is this repo's dominant way for a defect to survive a
          convincing green.
          Neither writer has an early return — `clearPalette` and `clearCanvas`
          both `recordEdit` and set unconditionally — so their no-op press is a
          SECOND consecutive press over already-blank state. It changes nothing
          an author can see, which is exactly the press d-27 says must still
          drop focus. */}
      <button
        style={btn}
        title="Clear palette → standalone, blank"
        onClick={(e) => actAndDropFocus(e, () => st().clearPalette())}
      >
        Clear palette
      </button>
      <button
        style={btn}
        title="Clear canvas → blank pixels"
        onClick={(e) => actAndDropFocus(e, () => st().clearCanvas())}
      >
        Clear canvas
      </button>
    </div>
  );
}
