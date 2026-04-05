import React, { useState, useEffect, useCallback, useRef } from 'react';
import './FloatingGlyphs.css';

const GLYPHS = [
  '𓆉','𓃹','𓆗','𓆜','𓅣','𓇬','𓇽','𓆝','𓁹','𓂂','𓂎','𓄅','𓄋','𓄓',
  '𓄝','𓄰','𓄼','𓅌','𓇄','𓇓','𓇜','𓇠','𓇦','𓇩','𓊐','𓊑','𓊒','𓊗',
  '𓊤','𓊮','𓊸','𓇣','𓆺','𓈕','𓋙','𓋜','𓋝','𓋩','𓋯','𓋭','𓌅','𓌗',
  '𓌸','𓍢','𓍭','𓍼','𓎂','𓎕','𓎤','𓏲','𓏋','𓐜','𓐬','𓐮','𓎾','𓎷',
  '𓍳','𓍮','𓍛','𓍔','𓍕','𓌴','𓌪','𓌕','𓋻','𓋛','𓋐','𓊽','𓊶','𓉾',
  '𓉵','𓈞','𓇸','𓇝'
];

const GLYPH_PADDING_PX = 48; // keep glyphs this far from viewport edges

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function pickRandom(arr, exclude) {
  let pick;
  do {
    pick = arr[Math.floor(Math.random() * arr.length)];
  } while (pick === exclude && arr.length > 1);
  return pick;
}

// Build a grid of cells across the safe area, pick one cell per glyph
function buildGrid(count) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isMobile = Math.min(vw, vh) <= 768;

  // Safe bounds in pixels — avoid header and bottom copyright
  const topPx = isMobile ? 80 : 100; // match main-content padding-top
  const bottomPx = 55; // copyright area
  const sidePx = GLYPH_PADDING_PX;

  const safeTop = topPx;
  const safeBottom = vh - bottomPx;
  const safeLeft = sidePx;
  const safeRight = vw - sidePx;

  const safeW = safeRight - safeLeft;
  const safeH = safeBottom - safeTop;

  // Determine grid dimensions — aim for roughly square cells
  // Use at least 3 cols and enough rows to have >= count cells
  const cols = Math.max(3, Math.ceil(Math.sqrt(count * (safeW / safeH))));
  const rows = Math.max(2, Math.ceil(count / cols));

  const cellW = safeW / cols;
  const cellH = safeH / rows;

  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        xMin: safeLeft + c * cellW,
        xMax: safeLeft + (c + 1) * cellW,
        yMin: safeTop + r * cellH,
        yMax: safeTop + (r + 1) * cellH,
      });
    }
  }

  // Shuffle and pick `count` cells so glyphs spread across different areas
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  return cells.slice(0, count);
}

// Check if a pixel position overlaps the canvas element
function isOverCanvas(xPx, yPx) {
  const canvas = document.querySelector('.overlay-canvas');
  if (!canvas) return false;
  const rect = canvas.getBoundingClientRect();
  return xPx >= rect.left && xPx <= rect.right && yPx >= rect.top && yPx <= rect.bottom;
}

function createGlyphInCell(id, cell, excludeChar) {
  const padding = 10; // inner padding within cell
  const x = randomInRange(cell.xMin + padding, cell.xMax - padding);
  const y = randomInRange(cell.yMin + padding, cell.yMax - padding);
  const char = pickRandom(GLYPHS, excludeChar);
  const size = randomInRange(28, 42);
  const driftX = randomInRange(-3, 3);
  const driftY = randomInRange(-3, 3);
  const driftDuration = randomInRange(16, 28);
  const onCanvas = isOverCanvas(x, y);

  return { id, char, x, y, size, driftX, driftY, driftDuration, onCanvas, visible: true };
}

function createGlyphAnywhere(id, existingGlyphs, excludeChar) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isMobile = Math.min(vw, vh) <= 768;

  const topPx = isMobile ? 80 : 100;
  const bottomPx = 55;
  const sidePx = GLYPH_PADDING_PX;
  const minDist = Math.min(vw, vh) * 0.12;

  let attempts = 0;
  while (attempts < 40) {
    const x = randomInRange(sidePx, vw - sidePx);
    const y = randomInRange(topPx, vh - bottomPx);

    const tooClose = existingGlyphs.some(
      g => Math.hypot(g.x - x, g.y - y) < minDist
    );

    if (!tooClose) {
      const char = pickRandom(GLYPHS, excludeChar);
      const size = randomInRange(28, 42);
      const driftX = randomInRange(-3, 3);
      const driftY = randomInRange(-3, 3);
      const driftDuration = randomInRange(16, 28);
      const onCanvas = isOverCanvas(x, y);
      return { id, char, x, y, size, driftX, driftY, driftDuration, onCanvas, visible: true };
    }
    attempts++;
  }

  // Fallback
  const x = randomInRange(sidePx, vw - sidePx);
  const y = randomInRange(topPx, vh - bottomPx);
  const char = pickRandom(GLYPHS, excludeChar);
  const onCanvas = isOverCanvas(x, y);
  return {
    id, char, x, y, size: 34, driftX: 0, driftY: 0,
    driftDuration: 20, onCanvas, visible: true,
  };
}

const FloatingGlyphs = () => {
  const nextId = useRef(0);
  const [glyphs, setGlyphs] = useState([]);

  useEffect(() => {
    const count = Math.floor(Math.random() * 3) + 3; // 3-5
    const cells = buildGrid(count);
    const initial = cells.map((cell, i) => createGlyphInCell(i, cell, null));
    nextId.current = count;
    setGlyphs(initial);
  }, []);

  // Reposition glyphs on resize / orientation change
  useEffect(() => {
    let resizeTimer;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setGlyphs(prev => {
          const count = prev.length;
          if (count === 0) return prev;
          const cells = buildGrid(count);
          return prev.map((g, i) => {
            if (i < cells.length) {
              const cell = cells[i];
              const pad = 10;
              const x = randomInRange(cell.xMin + pad, cell.xMax - pad);
              const y = randomInRange(cell.yMin + pad, cell.yMax - pad);
              const onCanvas = isOverCanvas(x, y);
              return { ...g, x, y, onCanvas };
            }
            return g;
          });
        });
      }, 150);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const handleClick = useCallback((clickedId) => {
    setGlyphs(prev => prev.map(g =>
      g.id === clickedId ? { ...g, visible: false } : g
    ));

    setTimeout(() => {
      setGlyphs(prev => {
        const clicked = prev.find(g => g.id === clickedId);
        const others = prev.filter(g => g.id !== clickedId);
        const newGlyph = createGlyphAnywhere(
          nextId.current++,
          others,
          clicked?.char
        );
        return [...others, newGlyph];
      });
    }, 350);
  }, []);

  return (
    <div className="floating-glyphs">
      {glyphs.map(g => (
        <span
          key={g.id}
          className={`floating-glyph ${g.visible ? 'visible' : ''} ${g.onCanvas ? 'on-canvas' : ''}`}
          style={{
            left: `${g.x}px`,
            top: `${g.y}px`,
            fontSize: `${g.size}px`,
            '--drift-x': `${g.driftX}px`,
            '--drift-y': `${g.driftY}px`,
            '--drift-duration': `${g.driftDuration}s`,
          }}
          onClick={() => handleClick(g.id)}
        >
          {g.char}
        </span>
      ))}
    </div>
  );
};

export default FloatingGlyphs;
