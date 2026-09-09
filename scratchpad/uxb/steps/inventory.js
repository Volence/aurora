// Enumerate every interactive control on screen, with its visible label, role,
// enabled state and centre point — the inventory the census is counted from.
const vis = (el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0
    && r.top < innerHeight && r.left < innerWidth;
};
const sel = 'button,[role="tab"],[role="button"],input,select,textarea,a[href],summary,[tabindex]:not([tabindex="-1"])';
const out = [];
for (const el of document.querySelectorAll(sel)) {
  if (!vis(el)) continue;
  const r = el.getBoundingClientRect();
  out.push({
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role') || null,
    type: el.getAttribute('type') || null,
    label: ((el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.title || '').trim()).slice(0, 60),
    title: (el.getAttribute('title') || '').slice(0, 70) || null,
    disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
    sel: el.getAttribute('aria-selected'),
    x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
    w: Math.round(r.width), h: Math.round(r.height),
  });
}
// Also: headings and section labels, so panels with no controls still appear.
const heads = [...document.querySelectorAll('h1,h2,h3,h4,[class*="header"],[class*="Header"]')]
  .filter(vis).map(e => (e.innerText || '').trim().slice(0, 50)).filter(Boolean);
return { count: out.length, controls: out, headings: [...new Set(heads)].slice(0, 40) };
