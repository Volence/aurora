// One line per control: the census unit.
const vis = (el) => { const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
const sel = 'button,[role="tab"],[role="button"],input,select,textarea,a[href],summary,[tabindex]:not([tabindex="-1"])';
const seen = new Set(); const lines = [];
for (const el of document.querySelectorAll(sel)) {
  if (!vis(el)) continue;
  const r = el.getBoundingClientRect();
  const lab = ((el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.title || '').trim()).replace(/\s+/g, ' ').slice(0, 46);
  lines.push(`${el.tagName.toLowerCase().padEnd(8)} ${el.disabled ? 'DIS ' : '    '}${String(Math.round(r.left + r.width/2)).padStart(5)},${String(Math.round(r.top + r.height/2)).padStart(4)} ${String(Math.round(r.width)).padStart(4)}x${String(Math.round(r.height)).padStart(3)}  ${lab}${el.getAttribute('title') && el.getAttribute('title') !== lab ? '   [title] ' + el.getAttribute('title').replace(/\s+/g,' ').slice(0,60) : ''}`);
}
// non-button clickables too
for (const el of document.querySelectorAll('div,span,li,td,svg,path,label')) {
  if (!vis(el)) continue;
  if (getComputedStyle(el).cursor !== 'pointer') continue;
  let p = el.parentElement, dup = false;
  while (p) { if (getComputedStyle(p).cursor === 'pointer') { dup = true; break; } p = p.parentElement; }
  if (dup) continue;
  const r = el.getBoundingClientRect();
  lines.push(`~${el.tagName.toLowerCase().padEnd(7)}     ${String(Math.round(r.left + r.width/2)).padStart(5)},${String(Math.round(r.top + r.height/2)).padStart(4)} ${String(Math.round(r.width)).padStart(4)}x${String(Math.round(r.height)).padStart(3)}  ${((el.innerText||'').trim().replace(/\s+/g,' ')).slice(0,46)}${el.getAttribute('title') ? '   [title] ' + el.getAttribute('title').replace(/\s+/g,' ').slice(0,60) : ''}`);
}
return lines.join('\n') + `\n--- ${lines.length} controls`;
