// Anything the CSS says is clickable but that is not a <button>: the class of
// control a keyboard user and a newcomer both have the hardest time with.
const vis = (el) => { const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.top < innerHeight && r.left < innerWidth && r.bottom > 0; };
const out = [];
for (const el of document.querySelectorAll('*')) {
  if (!vis(el)) continue;
  if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') continue;
  const cs = getComputedStyle(el);
  if (cs.cursor !== 'pointer') continue;
  // skip if an ancestor already qualified (report the outermost)
  let p = el.parentElement, dup = false;
  while (p) { if (getComputedStyle(p).cursor === 'pointer' && p.tagName !== 'BUTTON') { dup = true; break; } p = p.parentElement; }
  if (dup) continue;
  const r = el.getBoundingClientRect();
  out.push({ tag: el.tagName.toLowerCase(), cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || '')).slice(0, 40),
    text: (el.innerText || '').trim().slice(0, 50), title: el.getAttribute('title') || null,
    x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) });
}
return { count: out.length, clickables: out };
