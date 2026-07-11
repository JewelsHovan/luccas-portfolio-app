# Architecture — portfolio (luccasbooth.com)

Context for anyone (human or AI agent) changing this repo. **Read this before implementing.**
Note: active development is on the **`dev`** branch.

## Where this app sits: it's a CONSUMER

Luccas has three connected apps that share **one media backend**:
- **Asset Hub** (`luccas-archive`) — the **data plane**: stores and serves all of Luccas's
  images (a Cloudflare Workers API + R2 storage + a Postgres DB + an admin site where
  Luccas uploads/organizes them).
- **portfolio (this repo)** — the art site, a **consumer** of the Hub.
- **tatu** (`luccas-tatu`, perpetualpotential.ink) — the tattoo site, another consumer.

This app **stores no art media of its own** — all artwork is fetched at runtime.

## How portfolio consumes the Hub (browser-direct — see caveats)

- **Client:** `frontend/src/services/api.js` (an `ApiService` singleton) consumed via
  `frontend/src/hooks/useImages.js`.
- **Feature-flagged:** `VITE_USE_ASSET_HUB`. When on, the **browser** calls the Hub
  **directly**: `GET {VITE_ASSET_HUB_URL}/collections/{slug}/files?limit=200&cursor=…`
  with `Authorization: Bearer ${VITE_ASSET_HUB_TOKEN}`, cursor-paginated.
- **Collections:** `portfolio-base` + `portfolio-overlay` (hardcoded in `api.js`). The
  homepage composites a random base+overlay pair on a `<canvas>` (`ImageOverlay.jsx`);
  `Collections.jsx` renders a per-collection gallery.

## ⚠️ Known issues / tech debt (be aware; don't make them worse)

1. **The Hub token is exposed in the browser bundle.** `VITE_ASSET_HUB_TOKEN` is a
   `VITE_*` var, so it's embedded in the built JS. This is weaker than the sibling site
   `tatu`, which keeps its Hub token **server-side** behind its own `/api/*` Worker proxy.
   If you're asked to harden this, the fix is to adopt tatu's server-side-proxy pattern —
   don't add more `VITE_*` secrets. (The token is app-scoped + read-only, limiting blast
   radius, but it's still public.)
2. **Cutover to the Hub is incomplete.** The app still defaults to a **legacy Dropbox-backed
   Worker** (`luccas-portfolio-backend.julienh15.workers.dev`, code in `backend/`), and
   `frontend/src/components/Collections.jsx` **hardcodes that legacy backend regardless of
   the `VITE_USE_ASSET_HUB` flag**. Prefer the Hub path when touching data fetching; flag
   the legacy dependency rather than deepening it.

## Env vars (all client-exposed `VITE_*`)

- `VITE_USE_ASSET_HUB` — `"true"`/`"false"` flag (default off).
- `VITE_ASSET_HUB_URL` — Hub base incl. `/api/v1`.
- `VITE_ASSET_HUB_TOKEN` — app-scoped (`portfolio`) read token — **ships in the bundle**.
- `VITE_API_URL` — legacy backend base (`.env.*` point it at the legacy Worker).

## Cross-app contract (don't break these)

- Hub file objects: `{ id, name, r2_key, url, width, height, ... }` — **no `thumb_url` yet**;
  image-performance work needs Hub-side thumbnails or on-the-fly resizing.
- Collection slugs (`portfolio-base`, `portfolio-overlay`) are defined in the Hub.
- Image **bytes** are public r2.dev URLs; the token only protects the metadata API.

## Content vs. code

Which images appear, their order, and their titles are **content Luccas manages in the Hub
admin** (`luccas-admin.pages.dev`) — not code here. Code changes are about how the overlay
and galleries look, load, and behave.

## Hosting

Cloudflare Pages (`luccasbooth.com`) with Git-integration branch previews. The frontend
hosting config lives in the Cloudflare dashboard, **not** in this repo (no `wrangler.toml`
under `frontend/`). Only the legacy `backend/` Worker has deploy config in-repo.
