import { PortfolioAssetService } from './lib/portfolioAssetService.ts';
import {
    isPortfolioCollectionSlug,
    toHubServerError
} from './lib/portfolioAssets.ts';

let assetService = null;
let configuredToken = null;

function getAssetService(env) {
    const token = env.LUCCAS_HUB_TOKEN;
    if (!token) {
        throw new Error('LUCCAS_HUB_TOKEN is not configured on the server.');
    }

    // A token change creates a fresh client and drops data fetched under the old token.
    if (!assetService || configuredToken !== token) {
        assetService = new PortfolioAssetService({ token });
        configuredToken = token;
    }

    return assetService;
}

function corsHeaders(request) {
    const origin = request.headers.get('Origin');
    const allowedOrigins = new Set([
        'https://luccas-portfolio.com',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5173'
    ]);
    const allowOrigin = origin && (
        allowedOrigins.has(origin)
        || origin.includes('luccas-portfolio')
        || origin.includes('pages.dev')
    ) ? origin : '*';

    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    };
}

function json(request, body, { status = 200, cacheControl = 'no-store', headers = {} } = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': cacheControl,
            ...corsHeaders(request),
            ...headers
        }
    });
}

function hubErrorResponse(request, error, resource) {
    console.error(`Luccas Asset Hub error while loading ${resource}:`, error);
    const failure = toHubServerError(error, resource);
    return json(request, {
        error: failure.error,
        details: failure.details
    }, { status: failure.status });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(request) });
        }

        if (request.method !== 'GET') {
            return json(request, { error: 'Method not allowed' }, { status: 405 });
        }

        if (url.pathname === '/api/health') {
            const configured = Boolean(env.LUCCAS_HUB_TOKEN);
            return json(request, {
                status: configured ? 'OK' : 'ERROR',
                message: configured
                    ? 'Luccas Portfolio API is connected to Luccas Asset Hub'
                    : 'LUCCAS_HUB_TOKEN is not configured on the server',
                source: 'luccas-asset-hub'
            }, { status: configured ? 200 : 503 });
        }

        if (url.pathname === '/api/images') {
            try {
                const forceRefresh = url.searchParams.get('refresh') === 'true';
                const { data, cached } = await getAssetService(env).listHomepage(forceRefresh);
                return json(request, {
                    ...data,
                    totalCounts: {
                        base: data.baseImages.length,
                        overlay: data.overlayImages.length
                    },
                    cached,
                    source: 'luccas-asset-hub'
                }, {
                    cacheControl: 'public, max-age=300',
                    headers: { 'X-Cache-Status': cached ? 'fresh' : 'miss' }
                });
            } catch (error) {
                return hubErrorResponse(request, error, 'homepage images');
            }
        }

        if (url.pathname === '/api/generateOverlay') {
            try {
                const pair = await getAssetService(env).nextHomepagePair();
                return json(request, {
                    ...pair,
                    source: 'luccas-asset-hub'
                });
            } catch (error) {
                return hubErrorResponse(request, error, 'homepage image pair');
            }
        }

        const collectionMatch = url.pathname.match(/^\/api\/([^/]+)$/);
        const collectionSlug = collectionMatch ? decodeURIComponent(collectionMatch[1]) : '';
        if (collectionMatch && isPortfolioCollectionSlug(collectionSlug)) {
            try {
                const forceRefresh = url.searchParams.get('refresh') === 'true';
                const { data: images, cached } = await getAssetService(env).listCollection(
                    collectionSlug,
                    forceRefresh
                );
                return json(request, {
                    images,
                    totalCount: images.length,
                    cached,
                    source: 'luccas-asset-hub'
                }, {
                    cacheControl: 'public, max-age=300',
                    headers: { 'X-Cache-Status': cached ? 'fresh' : 'miss' }
                });
            } catch (error) {
                return hubErrorResponse(request, error, collectionSlug);
            }
        }

        return json(request, { error: 'Not found' }, { status: 404 });
    }
};
