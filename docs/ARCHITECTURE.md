# Architecture — portfolio (luccasbooth.com)

Context for anyone changing this repo. Active development is on `dev`.

## Where this app sits: it is a consumer

Luccas has three connected apps sharing one media backend:

- **Asset Hub** (`luccas-archive`) — the data plane: Cloudflare Workers API, R2 storage, Postgres, and the admin UI where media is organized.
- **portfolio** (this repo) — the art-site consumer.
- **tatu** (`luccas-tatu`) — the tattoo-site consumer.

The portfolio stores no art media. It reads metadata from the Hub and renders the public R2 URLs returned by the API.

## Server-side Hub access

The browser calls only this app's `/api/*` endpoints through `frontend/src/services/api.js`.

- Production requests go to `backend/worker-fixed.js`, deployed as a Cloudflare Worker.
- Local requests go to `backend/server.js`, a Node HTTP adapter around the same Worker handler.
- `backend/lib/luccasHub.ts` is the typed Hub client. It adds `Authorization: Bearer …` using the server-only `LUCCAS_HUB_TOKEN` secret.
- `backend/lib/portfolioAssetService.ts` handles list caching, collection aggregation, and homepage pair generation.
- `backend/lib/portfolioAssets.ts` maps Hub file records back to the frontend's existing image shape.

Never add a secret with a `VITE_` prefix. Vite values ship in the browser bundle.

## Public portfolio API

- `/api/images` — homepage base and overlay lists.
- `/api/generateOverlay` — next server-side homepage pair.
- `/api/:collection` — galleries for `paintings`, `photo`, `assemblage`, `drawings`, `sketchbooks`, and `j24`.
- `/api/health` — backend configuration status.

The Hub models nested folders as separate collections. The server aggregates the relevant child collection slugs to preserve recursive gallery behavior and deduplicates files by ID.

## Environment variables

- `LUCCAS_HUB_TOKEN` — server-only, app-scoped read token. Configure it in `backend/.env` locally and as a Worker secret in production.
- `VITE_API_URL` — public base URL for this app's `/api/*` backend. It is not a secret.

See `docs/README.md` for the authorization, `app_scope`, and token-rotation contract.

## Cross-app contract

- Hub file objects provide `id`, `url`, and media metadata. The live API currently uses `name`; the documented API may use `filename`, so the adapter accepts both.
- File bytes are public R2 URLs. The portfolio backend protects metadata access but does not proxy media bytes.
- The portfolio token has `app_scope="portfolio"`; the Hub returns `portfolio` and `shared` collections.
- A Hub authentication failure must remain a clear server/UI error, never an empty gallery.

## Canvas and R2 CORS

Normal `<img>` rendering works directly from the public R2 URLs. The current R2 host does not return an `Access-Control-Allow-Origin` header for anonymous image requests, so the homepage canvas loads images without setting `crossOrigin`.

That permits drawing but intentionally makes the canvas origin-tainted. The current homepage does not expose canvas export controls. If export/download is added, configure an R2 bucket CORS policy allowing the production and preview origins, then restore `crossOrigin="anonymous"` before setting each image `src`. Do not solve this by exposing the Hub token or proxying metadata through the browser.

## Content vs. code

Image selection, titles, and organization are content managed in the Hub admin. This repo controls presentation, loading, and interaction behavior.

## Hosting

- Frontend: Cloudflare Pages (`luccasbooth.com`) with Git-integrated previews and `main` production deployments.
- Backend: Cloudflare Worker configured by `backend/wrangler.toml`.
