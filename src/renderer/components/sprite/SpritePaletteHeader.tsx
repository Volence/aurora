// src/renderer/components/sprite/SpritePaletteHeader.tsx
import React from 'react';
import { useSpriteStore } from '../../state/spriteStore';
import { T, Chip } from '../ui';

const btn: React.CSSProperties = {
  padding: `${T.s1} ${T.s3}`,
  background: T.overlay,
  color: T.textBase,
  border: `1px solid ${T.border}`,
  borderRadius: T.rMd,
  cursor: 'pointer',
  fontSize: 11,
  whiteSpace: 'nowrap',
};

const selectStyle: React.CSSProperties = {
  background: T.raised,
  color: T.textHi,
  border: `1px solid ${T.border}`,
  borderRadius: T.rMd,
  fontSize: 11,
  padding: `0 ${T.s1}`,
};

export default function SpritePaletteHeader() {
  const mode = useSpriteStore((s) => s.paletteMode);
  const zoneLine = useSpriteStore((s) => s.zoneLine);
  const st = useSpriteStore.getState;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: T.s2,
      padding: `${T.s2} ${T.s4}`,
      fontSize: 11,
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
      <Chip active={mode === 'standalone'} onClick={() => st().setPaletteMode('standalone')}>Standalone</Chip>
      <span style={{ flex: 1 }} />
      <button
        style={btn}
        title="Clear palette → standalone, blank"
        onClick={() => st().clearPalette()}
      >
        Clear palette
      </button>
      <button
        style={btn}
        title="Clear canvas → blank pixels"
        onClick={() => st().clearCanvas()}
      >
        Clear canvas
      </button>
    </div>
  );
}
