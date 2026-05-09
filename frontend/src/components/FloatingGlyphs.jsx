import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import './FloatingGlyphs.css';

// Pool of 105 Egyptian hieroglyphs (one duplicate `𓇠` — harmless, the
// per-frame Set dedupes it when picking).
const SYMBOL_GLYPHS = [
  '𓆉','𓃹','𓆗','𓆜','𓅣','𓇬','𓇽','𓆝','𓁹','𓂂',
  '𓂎','𓄅','𓄋','𓄓','𓄝','𓄰','𓄼','𓅌','𓇄','𓇓',
  '𓇜','𓇠','𓇦','𓇩','𓊐','𓊑','𓊒','𓊗','𓊤','𓊮',
  '𓊸','𓇣','𓆺','𓈕','𓋙','𓋜','𓋝','𓋩','𓋯','𓋭',
  '𓌅','𓌗','𓌸','𓍢','𓍭','𓍼','𓎂','𓎕','𓎤',
  '𓏲','𓏋','𓐜','𓐬','𓐮','𓎾','𓎷','𓍳','𓍮','𓍛',
  '𓍔','𓍕','𓌴','𓌪','𓌕','𓋻','𓋛','𓋐','𓊽','𓊶',
  '𓉾','𓉵','𓈞','𓇸','𓇝','𓍶','𓂪','𓄔','𓄢','𓄽',
  '𓇠','𓊃','𓋎','𓋤','𓌽','𓍓','𓍡','𓎦','𓏉','𓏊',
  '𓏖','𓏡','𓏯','𓏴','𓐢','𓐧','𓂄','𓂇','𓂈','𓄨',
  '𓇞','𓌥','𓊇','𓌆','𓍬','𓎘',
];

const isMobile = () => window.innerWidth <= 768;

function getConsts() {
  const m = isMobile();
  return {
    HEADER_H:        m ? 60 : 72,
    OVERLAY_OUTER:   m ? 32 : 60, // forbidden ring thickness OUTSIDE the canvas
    OVERLAY_INNER:   m ? 16 : 28, // forbidden ring thickness INSIDE the canvas
    CAPTION_PAD:     m ? 16 : 24,
    COPYRIGHT_PAD:   m ? 12 : 20,
    EDGE_MARGIN:     m ? 28 : 56, // inset from viewport edges
    GLYPH_SIZE:      m ? 32 : 48, // hit-box for collisions
    GLYPH_FONT:      m ? 24 : 36,
    DEFAULT_COUNT:   m ? 3 : 4,
    COLOR_OUTSIDE:   '#999',
    COLOR_INSIDE:    'rgba(255,255,255,0.9)',
    OPACITY_OUTSIDE: 0.85,
    OPACITY_INSIDE:  0.95,
  };
}

const expand = (rect, p) => ({
  x: rect.left - p,
  y: rect.top - p,
  w: rect.width + 2 * p,
  h: rect.height + 2 * p,
});

const intersects = (a, b) =>
  !(a.x + a.w <= b.x || a.x >= b.x + b.w || a.y + a.h <= b.y || a.y >= b.y + b.h);

const isInside = (g, area) =>
  area.w > 0 && area.h > 0 &&
  g.x >= area.x && g.x + g.w <= area.x + area.w &&
  g.y >= area.y && g.y + g.h <= area.y + area.h;

function getZones(canvasEl, captionEl, copyrightEl) {
  const C = getConsts();
  if (!canvasEl || !captionEl || !copyrightEl) return null;
  const overlay   = canvasEl.getBoundingClientRect();
  const caption   = captionEl.getBoundingClientRect();
  const copyright = copyrightEl.getBoundingClientRect();

  // Overlay forbidden zone is a 4-rect ring (band) around the canvas border —
  // glyphs may land inside the canvas, just not on its edge seam.
  const outer = {
    left:   overlay.left   - C.OVERLAY_OUTER,
    top:    overlay.top    - C.OVERLAY_OUTER,
    right:  overlay.right  + C.OVERLAY_OUTER,
    bottom: overlay.bottom + C.OVERLAY_OUTER,
  };
  const inner = {
    left:   overlay.left   + C.OVERLAY_INNER,
    top:    overlay.top    + C.OVERLAY_INNER,
    right:  overlay.right  - C.OVERLAY_INNER,
    bottom: overlay.bottom - C.OVERLAY_INNER,
  };
  const innerW = Math.max(0, inner.right - inner.left);
  const innerH = Math.max(0, inner.bottom - inner.top);

  const overlayBand = (innerW > 0 && innerH > 0) ? [
    { x: outer.left,  y: outer.top,    w: outer.right - outer.left, h: inner.top - outer.top },
    { x: outer.left,  y: inner.bottom, w: outer.right - outer.left, h: outer.bottom - inner.bottom },
    { x: outer.left,  y: inner.top,    w: inner.left - outer.left,  h: innerH },
    { x: inner.right, y: inner.top,    w: outer.right - inner.right, h: innerH },
  ] : [
    // Canvas too small for inner margin — fall back to solid block (no inside placement).
    { x: outer.left, y: outer.top, w: outer.right - outer.left, h: outer.bottom - outer.top },
  ];

  return {
    forbidden: [
      { x: 0, y: 0, w: window.innerWidth, h: C.HEADER_H },
      ...overlayBand,
      expand(caption,   C.CAPTION_PAD),
      expand(copyright, C.COPYRIGHT_PAD),
    ],
    overlayInner: { x: inner.left, y: inner.top, w: innerW, h: innerH },
  };
}

function placeOne(forbidden, placedRects, attempts = 80) {
  const C = getConsts();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const minX = C.EDGE_MARGIN;
  const maxX = vw - C.EDGE_MARGIN - C.GLYPH_SIZE;
  const minY = C.HEADER_H + C.EDGE_MARGIN;
  const maxY = vh - C.EDGE_MARGIN - C.GLYPH_SIZE;
  if (maxX <= minX || maxY <= minY) return null;
  for (let i = 0; i < attempts; i++) {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    const r = { x, y, w: C.GLYPH_SIZE, h: C.GLYPH_SIZE };
    if (forbidden.some(f => intersects(r, f))) continue;
    if (placedRects.some(p => intersects(r, p))) continue;
    return r;
  }
  return null;
}

function pickUniqueChar(usedChars) {
  for (let i = 0; i < 50; i++) {
    const c = SYMBOL_GLYPHS[Math.floor(Math.random() * SYMBOL_GLYPHS.length)];
    if (!usedChars.has(c)) return c;
  }
  return SYMBOL_GLYPHS[Math.floor(Math.random() * SYMBOL_GLYPHS.length)];
}

const makeDriftStyle = () => ({
  '--dx':    (Math.random() * 24 - 12).toFixed(1) + 'px',
  '--dy':    (Math.random() * 24 - 12).toFixed(1) + 'px',
  '--dur':   (6 + Math.random() * 5).toFixed(2) + 's',
  '--delay': '-' + (Math.random() * 4).toFixed(2) + 's',
});

let nextGlyphId = 1;

function buildGlyph(rect, char, insideOverlay) {
  const C = getConsts();
  return {
    id: nextGlyphId++,
    char,
    rect,
    insideOverlay,
    color:   insideOverlay ? C.COLOR_INSIDE   : C.COLOR_OUTSIDE,
    opacity: insideOverlay ? C.OPACITY_INSIDE : C.OPACITY_OUTSIDE,
    drift:   makeDriftStyle(),
    mounted: false, // becomes true after first paint so opacity transition fires
    fading:  false,
  };
}

const FloatingGlyphs = ({ canvasRef, captionRef, copyrightRef, count }) => {
  const [glyphs, setGlyphs] = useState([]);

  const placeAll = useCallback(() => {
    const zones = getZones(
      canvasRef?.current,
      captionRef?.current,
      copyrightRef?.current,
    );
    if (!zones) return;
    const C = getConsts();
    const want = count ?? C.DEFAULT_COUNT;
    const placedRects = [];
    const usedChars = new Set();
    const next = [];
    for (let i = 0; i < want; i++) {
      const r = placeOne(zones.forbidden, placedRects);
      if (!r) continue;
      const inside = isInside(r, zones.overlayInner);
      const char = pickUniqueChar(usedChars);
      usedChars.add(char);
      placedRects.push(r);
      next.push(buildGlyph(r, char, inside));
    }
    setGlyphs(next);
  }, [canvasRef, captionRef, copyrightRef, count]);

  // Re-place on mount + observed-element resize + window resize
  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => placeAll());
    };
    schedule();

    const ro = new ResizeObserver(schedule);
    if (canvasRef?.current)    ro.observe(canvasRef.current);
    if (captionRef?.current)   ro.observe(captionRef.current);
    if (copyrightRef?.current) ro.observe(copyrightRef.current);
    window.addEventListener('resize', schedule);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [placeAll, canvasRef, captionRef, copyrightRef]);

  // Mark newly-added glyphs as mounted after first paint so the CSS opacity
  // transition fires (initial render keeps them at opacity:0).
  useLayoutEffect(() => {
    if (!glyphs.some(g => !g.mounted)) return;
    const raf = requestAnimationFrame(() => {
      setGlyphs(prev => prev.map(g => g.mounted ? g : { ...g, mounted: true }));
    });
    return () => cancelAnimationFrame(raf);
  }, [glyphs]);

  const handleClick = useCallback((id) => {
    // Phase 1: fade the clicked glyph out
    setGlyphs(prev => prev.map(g => g.id === id ? { ...g, fading: true } : g));

    // Phase 2: after fade completes, drop it and add a fresh one elsewhere
    setTimeout(() => {
      setGlyphs(prev => {
        const old = prev.find(g => g.id === id);
        const remaining = prev.filter(g => g.id !== id);
        const zones = getZones(
          canvasRef?.current,
          captionRef?.current,
          copyrightRef?.current,
        );
        if (!zones) return remaining;

        const placedRects = remaining.map(g => g.rect);
        if (old) placedRects.push(old.rect); // discourage re-using exact same spot

        const r = placeOne(zones.forbidden, placedRects);
        if (!r) return remaining; // cramped — leave the slot empty

        const inside = isInside(r, zones.overlayInner);
        const usedChars = new Set(remaining.map(g => g.char));
        if (old) usedChars.add(old.char); // discourage instant char repeat
        const char = pickUniqueChar(usedChars);
        return [...remaining, buildGlyph(r, char, inside)];
      });
    }, 400);
  }, [canvasRef, captionRef, copyrightRef]);

  return (
    <div className="glyph-layer" aria-hidden="true">
      {glyphs.map(g => {
        const cls = g.fading
          ? 'glyph-floater fading'
          : g.mounted
            ? 'glyph-floater visible'
            : 'glyph-floater';
        return (
          <span
            key={g.id}
            className={cls}
            style={{
              left:     g.rect.x + 'px',
              top:      g.rect.y + 'px',
              fontSize: getConsts().GLYPH_FONT + 'px',
              '--glyph-color':   g.color,
              '--glyph-opacity': g.opacity,
              ...g.drift,
            }}
            onClick={() => handleClick(g.id)}
          >
            {g.char}
          </span>
        );
      })}
    </div>
  );
};

export default FloatingGlyphs;
