return {
  screen: { w: screen.width, h: screen.height, availW: screen.availWidth, availH: screen.availHeight },
  inner: { w: innerWidth, h: innerHeight },
  dpr: devicePixelRatio,
  ua: navigator.userAgent.slice(0, 60),
  dbg: typeof window.__dbg,
  title: document.title,
};
