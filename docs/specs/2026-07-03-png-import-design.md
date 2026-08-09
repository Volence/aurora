<!--
Authored 2026-07-03 (Claude Fable 5). Design for ROADMAP.md Phase P7 (§4.9).
Small, self-contained; no engine dependencies.
-->

# PNG / Sprite-Sheet Import — Design

## Goal

Bring external art into Aurora cleanly: import a PNG into (a) a sprite frame, (b) an
Art-mode document (tile/block/chunk), or (c) sliced sprite-sheet frames — with honest
Genesis quantization (one palette line per target, 15 colors + transparent) and a
report of what the conversion cost.

## Non-goals

Aseprite native format (PNG export covers the pipeline); animated GIF/APNG; palette
*authoring* from import beyond the suggestion flow below; level-layout-from-image.

## 1. Entry points

- Sprite mode: "Import PNG → new frame / replace frame"; "Import sheet → frames…"
  (grid slicer: cell W×H + margin/spacing, or auto-bounds by transparent gaps;
  preview grid overlay before commit).
- Art mode: "Import PNG → document" (must match or be cropped/padded to the document
  size; chunks accept any ≤64×64-tile image).
- Drag-and-drop a .png onto either canvas = same dialogs.

## 2. Quantization pipeline (`core/import/quantize.ts`, pure + tested)

1. **Transparency**: alpha < 128 → index 0. Warn if the image has semi-transparency.
2. **Palette matching** (default): map each opaque pixel to the nearest color of the
   chosen target palette line (Genesis 3-bit/channel space; distance in linear-ish
   RGB is fine at this gamut). The target line defaults to the mode's active line;
   selectable in the dialog with live preview.
3. **Palette suggestion** (optional path): median-cut the image to ≤15 colors,
   snap each to the Genesis grid (even nibbles), show side-by-side preview; on
   accept, either write to a free/chosen palette line (undoable `set-palette-line`)
   or, in Sprite standalone mode, set the standalone palette.
4. **Error report** (always shown, never silent): count + heat overlay of pixels
   whose nearest-color distance exceeds a threshold; total distinct source colors vs
   15. The user commits with eyes open — this is the "hardware constraints as a
   feature" principle (Pro Motion pattern) from the vision doc.
5. **Dithering**: off by default; optional ordered-Bayer (2/4/8) toggle for gradients,
   reusing the existing dither patterns.
6. On accept: pixels land as a normal document/frame edit (one undo step). Art-mode
   saves then flow through the existing flip-aware tileset dedup — imported art
   automatically reuses existing tiles where identical.

## 3. Implementation notes

- Decode PNGs in the renderer via `createImageBitmap`/canvas (no new native deps);
  keep `quantize.ts` operating on `ImageData`-shaped buffers so it stays pure/testable.
- Sheet slicing metadata (cell size/origin) remembered per-file (recent-imports map)
  for re-import convenience.
- MCP tools: `import_png {path, target: frame|document, palette_line?, options}` and
  `import_sheet {path, grid, ...}` — same code path, one undo step per import.

## 4. Acceptance

- Import a 16-color indexed PNG that already matches a palette line → pixel-perfect,
  zero-error report.
- Import a truecolor PNG → quantized result matches the preview exactly; error
  overlay counts are correct on a crafted fixture.
- Sheet slice of a 4×2 grid produces 8 frames in order; undo removes the whole import
  in one step.
- `quantize.ts` fully unit-tested (transparency edge, tie-breaking, Genesis snapping).

## Plan seeds

1. `quantize.ts` + tests. 2. Frame/document import dialog + preview + error overlay.
3. Sheet slicer. 4. Palette-suggestion path. 5. MCP tools.
