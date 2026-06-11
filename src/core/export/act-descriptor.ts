import type { Section } from '../model/s4-types';

export interface ActDescriptorInput {
  gridWidth: number;
  gridHeight: number;
  sections: (Section | null)[];
  startPosition: { secX: number; secY: number; localX: number; localY: number };
  parallaxRef: string | null;
}

/** Sanitize a BG-library id (slug-timestamp, dash-separated) into an asm label fragment. */
function asmLabelFragment(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, '_');
}

export function generateActDescriptorAsm(
  zonePrefix: string,
  actId: string,
  input: ActDescriptorInput,
): string {
  const { gridWidth, gridHeight, sections, startPosition, parallaxRef } = input;
  const label = `${zonePrefix}_${actId}`;
  const lines: string[] = [];

  // Act descriptor (34 bytes)
  lines.push(`${label}_Descriptor:`);
  lines.push(`    dc.l    ${label}_Sections       ; sec_grid_ptr`);
  lines.push(`    dc.w    ${gridWidth}                       ; grid_w`);
  lines.push(`    dc.w    ${gridHeight}                       ; grid_h`);
  lines.push(`    dc.w    $${startPosition.localX.toString(16).toUpperCase().padStart(4, '0')}                   ; start_local_x`);
  lines.push(`    dc.w    $${startPosition.localY.toString(16).toUpperCase().padStart(4, '0')}                   ; start_local_y`);
  lines.push(`    dc.b    ${startPosition.secX}                       ; start_sec_x`);
  lines.push(`    dc.b    ${startPosition.secY}                       ; start_sec_y`);
  lines.push(`    dc.w    SLOT_ORIGIN_L           ; cam_min_x`);
  lines.push(`    dc.w    SLOT_ORIGIN_L + (${gridWidth} * SECTION_SIZE) - SCREEN_WIDTH ; cam_max_x`);
  lines.push(`    dc.w    SLOT_ORIGIN_U           ; cam_min_y`);
  lines.push(`    dc.w    SLOT_ORIGIN_U + (${gridHeight} * SECTION_SIZE) - 224 ; cam_max_y`);
  lines.push(`    dc.l    ${label}_BG_Layout      ; act_bg_layout`);
  lines.push(`    dc.l    ${label}_BG_Tiles       ; act_bg_tiles`);
  lines.push(`    dc.l    ${parallaxRef ?? '0'}    ; act_parallax_config`);
  lines.push('');

  // Section table
  // The BINCLUDE note is the build-pipeline contract for per-section
  // backgrounds: the editor emits the label, the engine build provides it.
  if (sections.some(s => s !== null && s.bgLayoutRef !== null)) {
    lines.push(`; NOTE: non-zero sec_bg_layout entries reference editor BG-library`);
    lines.push(`; binaries (data/editor/${zonePrefix}_bg_{id}.bin). The build pipeline must`);
    lines.push(`; BINCLUDE each referenced binary at its ${zonePrefix}_BG_{id} label.`);
  }
  lines.push(`${label}_Sections:`);
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const col = i % gridWidth;
    const row = Math.floor(i / gridWidth);

    if (!section) {
      lines.push(`; --- Section ${i} (null) ---`);
      lines.push(`    dcb.b 72, 0`);
      continue;
    }

    const secLabel = `${zonePrefix}_Sec${i}`;
    lines.push(`; --- Section ${i} (${col},${row}) — flat_id ${i} ---`);
    lines.push(`${secLabel}:`);
    lines.push(`    dc.l    ${secLabel}_Blocks           ; sec_block_index`);
    lines.push(`    dc.l    ${secLabel}_Objects          ; sec_objects`);
    lines.push(`    dc.l    ${secLabel}_Rings            ; sec_rings`);
    lines.push(`    dc.l    0                         ; sec_plc`);
    lines.push(`    dc.l    ${section.paletteRef ?? `${zonePrefix}_Palette`}  ; sec_pal`);
    lines.push(`    dc.l    ${section.parallaxRef ?? '0'}  ; sec_parallax_config`);
    lines.push(`    dc.l    0                         ; sec_raster_table`);
    lines.push(`    dc.l    ${section.bgLayoutRef !== null ? `${zonePrefix}_BG_${asmLabelFragment(section.bgLayoutRef)}` : '0'}  ; sec_bg_layout`);
    lines.push(`    dc.l    ${secLabel}_TypeTable        ; sec_type_table`);
    lines.push(`    dc.l    0                         ; sec_pal_cycle`);
    lines.push(`    dc.l    0                         ; sec_sound_bank`);
    lines.push(`    dc.l    0                         ; sec_reserved_2C`);
    lines.push(`    dc.l    0                         ; sec_anim_blocks`);
    lines.push(`    dc.l    0                         ; sec_collision_s4lz`);
    lines.push(`    dc.w    ${section.flags}                         ; sec_flags`);
    lines.push(`    dc.w    ${section.music}                         ; sec_music`);
    lines.push(`    dc.b    0, 0, 0, 0               ; reserved bytes`);
    lines.push(`    dc.l    ${secLabel}_Tiles_S4LZ       ; sec_tile_art_s4lz`);
    lines.push(`    dc.w    ${zonePrefix}_SEC${i}_VRAM   ; sec_tile_art_vram`);
    lines.push(`    dc.w    0                         ; pad`);
  }

  return lines.join('\n');
}
