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

// Zones around the center canvas where glyphs can spawn
// Expressed as percentage ranges [minX, maxX, minY, maxY]
const SPAWN_ZONES = [
  [2, 18, 10, 90],   // left strip
  [82, 98, 10, 90],  // right strip
  [18, 82, 8, 22],   // top strip (above canvas)
  [18, 82, 82, 95],  // bottom strip (below canvas)
];

function getIsMobile() {
  return window.innerWidth <= 768;
}

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

function generatePosition(existingPositions) {
  const minDist = 12; // minimum percentage distance between glyphs
  let attempts = 0;

  while (attempts < 30) {
    const zone = SPAWN_ZONES[Math.floor(Math.random() * SPAWN_ZONES.length)];
    const x = randomInRange(zone[0], zone[1]);
    const y = randomInRange(zone[2], zone[3]);

    const tooClose = existingPositions.some(
      pos => Math.hypot(pos.x - x, pos.y - y) < minDist
    );

    if (!tooClose) return { x, y };
    attempts++;
  }

  // Fallback: just pick a spot in a random zone
  const zone = SPAWN_ZONES[Math.floor(Math.random() * SPAWN_ZONES.length)];
  return { x: randomInRange(zone[0], zone[1]), y: randomInRange(zone[2], zone[3]) };
}

function createGlyph(id, existingPositions, excludeChar) {
  const pos = generatePosition(existingPositions);
  const char = pickRandom(GLYPHS, excludeChar);
  const size = randomInRange(28, 42);
  // Random subtle drift direction per glyph
  const driftX = randomInRange(-3, 3);
  const driftY = randomInRange(-3, 3);
  const driftDuration = randomInRange(16, 28);

  return { id, char, x: pos.x, y: pos.y, size, driftX, driftY, driftDuration, visible: true };
}

function initGlyphs(count) {
  const glyphs = [];
  for (let i = 0; i < count; i++) {
    const positions = glyphs.map(g => ({ x: g.x, y: g.y }));
    glyphs.push(createGlyph(i, positions, null));
  }
  return glyphs;
}

const FloatingGlyphs = () => {
  const nextId = useRef(0);
  const [glyphs, setGlyphs] = useState([]);

  // Initialize on mount and handle resize
  useEffect(() => {
    const count = Math.floor(Math.random() * 3) + 3;  // 3-5 on all devices

    const initial = initGlyphs(count);
    nextId.current = count;
    setGlyphs(initial);
  }, []);

  const handleClick = useCallback((clickedId) => {
    // Fade out the clicked glyph
    setGlyphs(prev => prev.map(g =>
      g.id === clickedId ? { ...g, visible: false } : g
    ));

    // After fade-out, respawn with new character and position
    setTimeout(() => {
      setGlyphs(prev => {
        const clicked = prev.find(g => g.id === clickedId);
        const others = prev.filter(g => g.id !== clickedId);
        const positions = others.map(g => ({ x: g.x, y: g.y }));
        const newGlyph = createGlyph(
          nextId.current++,
          positions,
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
          className={`floating-glyph ${g.visible ? 'visible' : ''}`}
          style={{
            left: `${g.x}%`,
            top: `${g.y}%`,
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
