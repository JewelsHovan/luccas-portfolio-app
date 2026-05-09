# Floating Glyphs on Home — Plan

## Goal

Render 3–4 Egyptian-hieroglyph symbols floating on the Home page that:

- Drift gently (subtle animation, not static)
- Never overlap the **image-overlay container** (with safety margin around its border)
- Never overlap the **artwork-info caption** below the image
- Never overlap the **copyright** in the bottom-right
- Stay below the **header**
- Work on both desktop (~1280×800) and mobile (~375×812)

Glyph pool is the same `SYMBOL_GLYPHS` array used on `/library/symbols` (105 chars, one known duplicate `𓇠` — harmless because we de-dupe at pick time).

## UX assumptions (open to your feedback)

- 4 glyphs on desktop, 3 on mobile (less viewport real estate after subtracting forbidden zones).
- Glyph font-size: 36px desktop / 24px mobile, color `#333`, opacity 0.85 — matches the design's `HomePage` glyph styling.
- Drift: ±10–14px translate over 6–10s, ease-in-out, infinite alternate. Each glyph gets its own randomized phase + duration so they don't move in lock-step.
- Re-randomize positions on:
  - mount
  - window resize (debounced)
  - **image overlay regenerate** — when the canvas resizes after a new base image loads, the forbidden rect changes shape, so glyphs must re-place
- Glyphs are non-interactive (`pointer-events: none`), `user-select: none`.

## Geometry

### Forbidden zones (in viewport coords)

The overlay's forbidden zone is a **ring (border band)**, not a solid block —
glyphs are allowed to land *inside* the canvas, just not on its border. The
band extends from `OVERLAY_OUTER` outside the canvas to `OVERLAY_INNER` inside.

```
F1 = header rect                                              { x:0, y:0, w:vw, h: HEADER_H }
F2 = overlay border band (4 rects: top/bottom/left/right
     strips between the outer-expanded and inner-contracted
     overlay rects)
F3 = expand(captionRect, CAPTION_PAD)
F4 = expand(copyrightRect, COPYRIGHT_PAD)
```

Constants:

| const | desktop | mobile | role |
|---|---|---|---|
| `HEADER_H` | 72 | 60 | top exclusion |
| `OVERLAY_OUTER` | 60 | 32 | band thickness OUTSIDE canvas (ring outward) |
| `OVERLAY_INNER` | 28 | 16 | band thickness INSIDE canvas (ring inward — glyphs avoid the border seam) |
| `CAPTION_PAD` | 24 | 16 | margin around the artwork-info block |
| `COPYRIGHT_PAD` | 20 | 12 | margin around `©luccasbooth` |
| `EDGE_MARGIN` | 56 | 28 | inset from viewport edges |
| `GLYPH_SIZE` | 48 | 32 | hit-box size for collision |
| `GLYPH_FONT` | 36 | 24 | rendered glyph size |
| `GLYPH_COUNT` | 4 | 3 | default count per breakpoint |
| `COLOR_OUTSIDE` | `#999` | same | light-gray on the page background |
| `COLOR_INSIDE` | `rgba(255,255,255,0.9)` | same | white-gray when sitting on top of the overlay canvas |

`expand(rect, p)` → `{ x: rect.x-p, y: rect.y-p, w: rect.w+2p, h: rect.h+2p }`.

If the overlay's inner-contracted rect collapses (canvas too small for
`OVERLAY_INNER`), the band falls back to a single solid rect — no glyphs
will land inside the canvas, just outside it.

### Placement bounds (contracted by EDGE_MARGIN)

```
minX = EDGE_MARGIN
maxX = vw - EDGE_MARGIN - GLYPH_SIZE
minY = HEADER_H + EDGE_MARGIN
maxY = vh - EDGE_MARGIN - GLYPH_SIZE
```

If `maxX <= minX` or `maxY <= minY` (viewport too narrow), abort placement and render zero glyphs — better than cramming.

A glyph's hit box is `{ x, y, w: GLYPH_SIZE, h: GLYPH_SIZE }`.

### Rejection sampling

```js
function placeOne(forbidden, placed, bounds, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    const x = rand(bounds.x, bounds.x + bounds.w - GLYPH_SIZE);
    const y = rand(bounds.y, bounds.y + bounds.h - GLYPH_SIZE);
    const r = { x, y, w: GLYPH_SIZE, h: GLYPH_SIZE };
    const collides = forbidden.some(f => intersects(r, f))
                  || placed.some(p => intersects(r, p));
    if (!collides) return r;
  }
  return null; // give up — caller drops this slot
}
```

`intersects(a, b)` → standard AABB.

If we fail to place all `GLYPH_COUNT` glyphs (cramped viewport), we render however many we found. No fallback "force into corner" — better to show 2 well-placed glyphs than 4 squashed ones.

### Why the image-overlay rect is tricky

The image overlay is a `<canvas>` whose size changes after each base image loads (we made it match image aspect ratio). So the "forbidden" rect must be measured **after** the canvas finishes drawing, not on initial mount. Two approaches:

1. **`ResizeObserver`** on the canvas element → re-place on every size change. Robust.
2. Re-place inside the `ImageOverlay` component's post-draw effect → tighter coupling.

Plan: use `ResizeObserver` on the canvas + the caption div, debounced ~150ms, fires `placeGlyphs()` on the parent.

## Animation

Per-glyph CSS keyframes:

```css
@keyframes glyph-drift-N {
  0%   { transform: translate(0, 0); }
  50%  { transform: translate(<dx>px, <dy>px); }
  100% { transform: translate(0, 0); }
}
```

We don't want to inject 4 unique `@keyframes` rules dynamically. Cleaner: use CSS variables + a single keyframe that uses them.

```css
.glyph-floater {
  --dx: 8px; --dy: -10px;
  animation: glyph-drift var(--dur) ease-in-out infinite alternate;
  animation-delay: var(--delay);
}
@keyframes glyph-drift {
  to { transform: translate(var(--dx), var(--dy)); }
}
```

Each glyph element gets `style={{ '--dx': ..., '--dy': ..., '--dur': ..., '--delay': ... }}`.

## Component API

```jsx
<FloatingGlyphs
  count={4}                                       // optional; default 4/3 by breakpoint
  overlayRef={canvasRef}                          // the image canvas — glyphs may sit inside, ringed by border band
  captionRef={captionRef}                         // forbidden block
  copyrightRef={copyrightRef}                     // forbidden block
  pool={SYMBOL_GLYPHS}                            // optional pool override
/>
```

Internally:

1. Hooks `ResizeObserver` onto each ref + listens to `window` resize (debounced 150ms)
2. Maintains a registry of `{ rect, char, el, insideOverlay }` per glyph
3. Each glyph's span has `pointer-events: auto` and a click handler that:
   - Fades the clicked glyph out (CSS opacity transition, 400ms)
   - Removes it from the registry
   - Computes a fresh placement against the live registry, picks a previously-unused char, fades a new glyph in
   - The replacement glyph's color is recomputed based on whether its rect lands inside `overlay-inner`

## Click-to-replace flow

```
user clicks glyph
   ↓
add `.fading` class (opacity → 0 over 400ms)
remove from registry immediately
   ↓
schedule DOM removal in 400ms
   ↓
synchronously: compute new rect via placeOne() against [other registered rects, just-vacated rect]
   ↓
if rect found:
  pick fresh char (avoid existing chars + the vacated one)
  insideOverlay = isInside(rect, overlayInnerRect)
  render new span, requestAnimationFrame → add `.visible`
else:
  no replacement (cramped viewport — leave the slot empty)
```

## Edge cases

- **Initial paint flash** — placement happens after refs are mounted + canvas drawn. Render glyphs with `opacity: 0` until first place is computed, then fade in (200ms).
- **Window narrower than overlay+pads** — virtually no free area. Algorithm just returns 0 placements; page renders without glyphs. Acceptable.
- **Tab inactive** — CSS animation auto-pauses; no logic change needed.
- **Scrolling** — Home page is a single viewport (`overflow: hidden` on root), no scroll. Glyphs are positioned in viewport coords. If we ever add scroll, switch to `position: absolute` inside a positioned ancestor.
- **Glyph picking** — `Set`-based dedupe to avoid `𓇠` showing twice in the same frame.

## Files to add / change (post-prototype, NOT yet)

- `frontend/src/components/FloatingGlyphs.jsx` (new)
- `frontend/src/components/FloatingGlyphs.css` (new)
- `frontend/src/components/Home.jsx` — wrap caption in a div+ref, pass refs to `<FloatingGlyphs avoid={[...]}/>`
- `frontend/src/components/ImageOverlay.jsx` — expose canvas ref via prop or context

## Open questions for you

1. **4 desktop / 3 mobile** — feel right, or do you want 3/3 or 5/4?
2. **Drift animation** — yes (subtle) or static placement only?
3. **Re-shuffle** — do you want positions to re-randomize after every overlay regenerate, or stay fixed once placed?
4. **Symbol pick** — random from full 105-glyph pool every load, or curated subset? (E.g. avoid the more visually-busy ones.)

Prototype below answers these with my defaults; once you've seen it we adjust then port to React.
