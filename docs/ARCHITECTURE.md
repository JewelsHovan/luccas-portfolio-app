# Architecture — portfolio (luccasbooth.com)

Context for anyone changing this repo. Active development is on `dev`.

## Where this app sits: it is a consumer

Luccas has three connected apps sharing one media backend:

- **Asset Hub** (`luccas-archive`) — the data plane: Cloudflare Workers API, R2 storage, Postgres, and the admin UI where media is organized.
- **portfolio** (this repo) — the art-site consumer.
- **tatu** (`luccas-tatu`) — the tattoo-site consumer.

The portfolio stores no art media. It reads metadata from the Hub and renders the public R2 URLs returned by the API. Production media uses `https://media.luccasbooth.com`, the R2 custom domain with Cloudflare CDN caching. The previous `r2.dev` URLs remain enabled for rollback; they are rate-limited development endpoints, not the primary delivery path.

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
- `/api/library` — a paginated shelf of individual book summaries and cover images. `next_cursor` is the last candidate collection ID, including empty groups; clients must continue until it is null.
- `/api/library/:id` — the selected book and its complete, ordered image pages; IDs must resolve inside the current Library scope.
- `/api/health` — backend configuration status.

Boolien Box (the Hub admin) represents its folder tree in slash-separated collection **names**, not database parent IDs. Slugs are stable even when a collection is renamed or moved, so slug prefixes are not a reliable discovery rule.

Gallery routes retain their canonical root slug, discover the current root/descendants by name path, and traverse direct parent files followed by alphabetical child folders, matching Box's tree. Each file listing requests `order=display` on every cursor page. File IDs are deduplicated by first occurrence across a gallery; filenames and upload timestamps are never used to reorder the returned sequence. Homepage lists and pair generation retain their previous/default ordering behavior.

### Library contract and presentation

The shelf discovers portfolio/shared collections below `Art website / Library`, by full name-path segments. Empty/PDF-only groups and the static Symbols path are omitted. A populated collection is one book, even when it has children; its own pages are not mixed with descendants. The first renderable image in saved order is its cover and page one. Shared image IDs may legitimately appear in separate books.

The shelf scans at most 20 candidate collections per response; clients follow `next_cursor` even if a batch has no populated books. Page data is fetched only when a book opens. File-page reads share a conservative 40-request budget, below the Worker's free-plan limit, and fail explicitly rather than returning incomplete content. Book listing uses 200-file cursor pages, rejects repeated cursors, and deduplicates repeated IDs within that book.

The React Library uses one horizontal cover shelf and a separate horizontal snapped reader, with labelled previous/next controls, page counter, keyboard navigation, Escape/back-to-shelf, shelf-position/focus restoration, and adjacent-page warmup. Book URLs use `/library?book=<stable-id>`. Old `/library/j24` links resolve to that book; `/library/sketchbooks` links resolve to the shelf. `/library/symbols` remains the static glyph page. The old `/api/j24` and `/api/sketchbooks` gallery endpoints remain available.

Gallery wrappers/captions are always fully opaque; scroll tracking still updates progress but no longer fades or scales the artwork. Existing original-image sizing/retry behavior is preserved.

### Content freshness

Metadata, galleries, shelf batches, and selected books use 60-second in-memory caches with concurrent-request coalescing. Media API responses use `Cache-Control: no-store`, and frontend media reads bypass stored browser responses. Composed metadata/media caches can contribute up to approximately two minutes of lag for folder organization changes after reload, plus upstream cache-generation propagation and request time; within an existing collection, page-order changes normally contribute at most one minute of portfolio caching lag. These are portfolio cache budgets, not a global propagation guarantee. `?refresh=true` bypasses both relevant service/metadata caches. Hub admin writes invalidate the Hub's own cache generation. An already-open browser view is not live-subscribed; reload to see edits.

Homepage lists keep their four-hour in-memory cache and five-minute HTTP policy. A changed server token resets the entire service and drops data fetched under the old token.

Custom book-shelf ordering and whole-book mobile movement remain separate Boolien Box/admin work. This website implementation does not move memberships, recolor original files, or restructure admin folders.

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
