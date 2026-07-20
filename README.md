# Luccas Portfolio App

React/Vite portfolio with a server-side media API backed by the Luccas Asset Hub and Cloudflare R2.

## Project structure

```text
frontend/                 React UI
backend/server.js         Local Node HTTP adapter
backend/worker-fixed.js   Production Cloudflare Worker
backend/lib/              Typed Asset Hub client and portfolio adapters
docs/README.md            Asset Hub auth and token operations
```

## Local development

Requires Node.js 18 or newer.

```bash
npm run install:all
cp backend/.env.example backend/.env
# Add the server-only LUCCAS_HUB_TOKEN to backend/.env
npm run dev
```

The frontend runs at `http://localhost:5173` and the local API at `http://localhost:5001`. `frontend/.env.development` points Vite at the local API.

## Environment variables

### Backend

```dotenv
LUCCAS_HUB_TOKEN=<portfolio-scoped token>
PORT=5001
```

`LUCCAS_HUB_TOKEN` is secret and server-only. Do not give it a `VITE_` prefix. See [`docs/README.md`](docs/README.md) for scope and rotation details.

### Frontend

```dotenv
VITE_API_URL=http://localhost:5001
```

This is only the public URL of the portfolio backend. The browser never calls the Asset Hub API with credentials.

## API endpoints

- `GET /api/health` — server configuration status
- `GET /api/images` — homepage base and overlay image lists
- `GET /api/generateOverlay` — next server-generated homepage pair
- `GET /api/:collection` — `paintings`, `photo`, `assemblage`, `drawings`, `sketchbooks`, or `j24`

Responses preserve the frontend's existing image shape while setting each image's `url` and optional `thumb_url` directly from the Hub response. Media bytes load straight from public R2 URLs rather than through this backend.

## Validation

```bash
cd backend && npm test
npm run build
cd frontend && npm run lint
cd ../backend && npx wrangler deploy --dry-run
```

## Deployment

Set the Worker secret, then deploy:

```bash
cd backend
npx wrangler secret put LUCCAS_HUB_TOKEN
npx wrangler deploy --env production
```

Build the frontend with `VITE_API_URL` set to the deployed Worker URL.
