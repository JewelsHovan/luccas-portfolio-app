# Luccas Asset Hub integration

The portfolio uses the Luccas Asset Hub API as its media source. The API base is `https://luccas-asset-hub-api.julienh15.workers.dev/api/v1`.

## Authentication model

Every Hub request requires `Authorization: Bearer <TOKEN>`. The token is stored only as `LUCCAS_HUB_TOKEN` in the local backend environment or as a Cloudflare Worker secret. It must never use a `VITE_` prefix, be committed, be placed in browser storage, or be returned by a portfolio API response.

The request path is:

1. The browser calls the portfolio endpoint, such as `/api/images` or `/api/paintings`, without Hub credentials.
2. The Express server or Cloudflare Worker adds the Bearer token and calls the Hub.
3. The server maps Hub file metadata to the existing frontend shape.
4. The browser loads media directly from the returned Hub `url` or `thumb_url`, which points to public R2 content. Media is not re-proxied through the portfolio server.

A Hub `401` (`missing_bearer_token`, `invalid_token`, or `token_revoked`) is converted to a clear `502` portfolio API response naming the Asset Hub authentication problem. Scope and other upstream failures also return explicit server errors instead of an empty result.

## `app_scope` contract

The production token is minted with `app_scope="portfolio"` and read access for files and collections. The Hub automatically limits responses to collections whose `app_scope` is either:

- `portfolio`, matching this token; or
- `shared`, available to scoped applications.

The portfolio must not try to reproduce this authorization filter in frontend code. A `403 collection_not_in_scope` means the collection or token configuration must be corrected in the Hub admin app. A `403 insufficient_scope` means the replacement token needs the reported read scope.

## Token rotation

Rotate without exposing or unnecessarily interrupting the old token:

1. In the Asset Hub admin app, mint a new token with `app_scope="portfolio"` and the same required read scopes.
2. Copy the plaintext token when shown; it is only displayed once.
3. Replace `LUCCAS_HUB_TOKEN` in local/server environments. For Cloudflare, run `npx wrangler secret put LUCCAS_HUB_TOKEN` from `backend/` and paste the new value.
4. Restart or redeploy the backend so new Worker isolates and local processes use the replacement token.
5. Verify `/api/health`, `/api/images`, and at least one collection route return real R2 URLs and render successfully.
6. Revoke the old token in the admin app only after verification.

If verification returns a clear authentication error, restore the previous secret while it is still valid, inspect the new token's scopes and `app_scope`, and repeat the swap before revoking anything.
