# KV Setup Instructions for Performance Optimization

## Overview
This setup implements a caching system that eliminates Dropbox API latency from the user experience. Response times will improve from 2-5 seconds to under 100ms.

## Setup Steps

### 1. Create KV Namespace

```bash
# For development
wrangler kv:namespace create "PORTFOLIO_KV"
# Copy the output ID

# For production
wrangler kv:namespace create "PORTFOLIO_KV" --env production
# Copy the output ID
```

### 2. Update wrangler.toml

Replace the placeholder IDs in wrangler.toml with the actual IDs from step 1:

```toml
[[kv_namespaces]]
binding = "PORTFOLIO_KV"
id = "YOUR_DEV_KV_ID_HERE"  # Replace with dev namespace ID

[[env.production.kv_namespaces]]
binding = "PORTFOLIO_KV"
id = "YOUR_PROD_KV_ID_HERE"  # Replace with production namespace ID
```

### 3. Deploy the Worker

```bash
# Deploy to development
wrangler deploy

# Deploy to production
wrangler deploy --env production
```

### 4. Verify Cron Trigger

The worker will automatically refresh the cache every 30 minutes. You can verify this in the Cloudflare dashboard under Workers > Your Worker > Triggers.

### 5. Initial Cache Population

After deployment, trigger the first cache population:

```bash
# Manually trigger the scheduled event
curl -X POST https://your-worker-url/api/health
```

The first user request will also populate the cache if it's empty.

## How It Works

1. **Cron Job**: Runs every 30 minutes to refresh Dropbox links and store in KV
2. **Stale-While-Revalidate**: Serves cached data instantly, refreshes in background if stale
3. **Frontend Preload**: Browser starts fetching API data while HTML loads
4. **Skeleton UI**: Shows placeholder while data loads for better perceived performance

## Performance Impact

- **Before**: 2-5 second wait for Dropbox API
- **After**: <100ms response time from KV cache
- **User Experience**: Instant page loads with smooth transitions

## Monitoring

Check worker logs for:
- `Serving images from KV cache` - Cache hit
- `Background cache refresh completed` - Successful background update
- `Scheduled cache refresh completed` - Cron job success

## Frontend Changes

The frontend now includes:
- Preload link in HTML head for early API fetch
- Skeleton loading UI instead of spinner
- Optimized for perceived performance

No frontend deployment changes needed - the optimizations are already in the code.