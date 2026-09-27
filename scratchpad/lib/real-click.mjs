/**
 * A REAL CLICK: CDP `Input.dispatchMouseEvent` moved / pressed / released at an
 * INTEGER client pixel.
 *
 * ONE COPY. It was written inside effects-guide-harness.mjs for ROADMAP row 214
 * (rows 3 and 4 there) and row 215 (row 1b's facet switch). Row 220 moved it
 * here, unchanged, so band-preset-harness.mjs could use the same function
 * instead of a second one.
 *
 * Why it exists: `el.click()` is a synthetic `click` with no pointerdown,
 * mousedown or mouseup, no hit test and no coordinates. It reaches a handler
 * that a covering element, a `pointer-events` rule or a mousedown-driven
 * control would have kept a person from reaching. The browser routes this one
 * through its own hit test, the way a person's click is routed.
 *
 * The caller computes the pixel from the element's rect, and prints dpr, rect
 * and aim beside the row. Xvfb's scale factor varies between runs here, and a
 * fractional aim is delivered to the neighbouring device pixel
 * (docs/OVERSEER-REFERENCE.md "Instruments").
 *
 * @param {{ send: (method: string, params?: object) => Promise<unknown> }} c  a CDP session
 * @param {number} x  integer client x
 * @param {number} y  integer client y
 */
export async function realClick(c, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error(`realClick aimed at a non-integer client pixel (${x}, ${y})`);
  }
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await c.send('Input.dispatchMouseEvent',
    { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await c.send('Input.dispatchMouseEvent',
    { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}

/**
 * THE EFFECTS FACET, AS THE APP DEFINES IT (ROADMAP row 215; shared since row
 * 220). `FacetBar` paints `f.label` and calls `switchFacet(tabId, f.id)` from
 * `onClick`. The label is what a row aims at; the id is what it reads back
 * through `__dbg.parallaxPreview().facet` (the workspace store's
 * `facetFor(activeId)`). esbuild bundles `src/core/shell/facets.ts` from the
 * given checkout into memory.
 *
 * Refuses (throws) when the descriptor is missing, so a row aimed at it cannot
 * pass on nothing.
 *
 * @param {string} root  the checkout whose src/ is read
 * @param {string} row   the row that needs it, for the refusal message
 * @returns {Promise<{ id: string, label: string }>}
 */
export async function loadEffectsFacet(root, row) {
  const { build } = await import('esbuild');
  const src = `${root}/src/core/shell/facets.ts`;
  const out = await build({
    entryPoints: [src], bundle: true, format: 'esm', platform: 'node',
    write: false, logLevel: 'error',
  });
  const m = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
  m.registerBuiltinFacets();
  const f = m.facetRegistry.get('parallax');
  if (!f || typeof f.label !== 'string' || f.label.length < 3) {
    throw new Error(`CANNOT MEASURE: ${src} registers no \`parallax\` facet with a label `
      + `(got ${JSON.stringify(f)}) — row ${row} would have nothing to aim at.`);
  }
  return f;
}
