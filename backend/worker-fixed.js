// Token management cache
let tokenCache = {
    accessToken: null,
    expiresAt: null,
    refreshToken: null
};

// Cache for images (stored in global scope for persistence across requests)
let imageCache = {
    baseImages: [],
    overlayImages: [],
    lastFetch: null,
    cacheTimeout: 1 * 60 * 60 * 1000 // 1 hours (temp links expire)
};

// Cache for collections (sketchbooks, paintings, photo)
let collectionsCache = {
    sketchbooks: {
        images: [],
        lastFetch: null
    },
    paintings: {
        images: [],
        lastFetch: null
    },
    photo: {
        images: [],
        lastFetch: null
    },
    cacheTimeout: 4 * 60 * 60 * 1000 // 4 hours (temp links expire)
};

// Queue for unique image pairs
let pairsQueue = {
    queue: [],
    currentIndex: 0
};

// Function to refresh access token
async function refreshAccessToken(env) {
    if (!env.DROPBOX_REFRESH_TOKEN || !env.DROPBOX_APP_KEY || !env.DROPBOX_APP_SECRET) {
        throw new Error('Missing required Dropbox credentials for token refresh');
    }

    console.log('Refreshing Dropbox access token...');

    const response = await fetch('https://api.dropbox.com/oauth2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: env.DROPBOX_REFRESH_TOKEN,
            client_id: env.DROPBOX_APP_KEY,
            client_secret: env.DROPBOX_APP_SECRET
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to refresh token: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Update token cache
    tokenCache.accessToken = data.access_token;
    tokenCache.expiresAt = Date.now() + (data.expires_in * 1000) - (5 * 60 * 1000); // Subtract 5 minutes for safety
    
    console.log('Access token refreshed successfully, expires in', data.expires_in, 'seconds');
    
    return data.access_token;
}

// Function to get valid access token
async function getValidAccessToken(env) {
    // If using a long-lived token (legacy), return it directly
    if (env.DROPBOX_ACCESS_TOKEN && !env.DROPBOX_REFRESH_TOKEN) {
        return env.DROPBOX_ACCESS_TOKEN;
    }

    // Check if we have a cached token that's still valid
    if (tokenCache.accessToken && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt) {
        return tokenCache.accessToken;
    }

    // Need to refresh the token
    return await refreshAccessToken(env);
}

// Function to shuffle array using Fisher-Yates algorithm
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Function to generate one-to-one unique pairs
function generateUniquePairs(baseImages, overlayImages) {
    // Shuffle both arrays to ensure randomness
    const shuffledBase = shuffleArray(baseImages);
    const shuffledOverlay = shuffleArray(overlayImages);
    
    const pairs = [];
    const maxPairs = Math.max(shuffledBase.length, shuffledOverlay.length);
    
    console.log(`Generating one-to-one pairs: ${shuffledBase.length} base images, ${shuffledOverlay.length} overlay images`);
    
    // Create one-to-one pairs, cycling through the shorter array if needed
    for (let i = 0; i < maxPairs; i++) {
        const baseIndex = i % shuffledBase.length;
        const overlayIndex = i % shuffledOverlay.length;
        
        pairs.push({
            baseImage: shuffledBase[baseIndex],
            overlayImage: shuffledOverlay[overlayIndex]
        });
    }
    
    console.log(`Generated ${pairs.length} unique one-to-one pairs`);
    return pairs;
}

// Function to initialize or refresh the pairs queue
function refreshPairsQueue() {
    if (imageCache.baseImages.length === 0 || imageCache.overlayImages.length === 0) {
        console.log('Cannot refresh pairs queue - no images in cache');
        return false;
    }
    
    console.log(`Generating new pairs queue from ${imageCache.baseImages.length} base images and ${imageCache.overlayImages.length} overlay images`);
    
    pairsQueue.queue = generateUniquePairs(imageCache.baseImages, imageCache.overlayImages);
    pairsQueue.currentIndex = 0;
    
    console.log(`Created one-to-one pairs queue with ${pairsQueue.queue.length} unique pairs (each image appears once per cycle)`);
    return true;
}

// Function to get next pair from queue
function getNextPairFromQueue() {
    // Check if we need to refresh the queue
    if (pairsQueue.queue.length === 0 || pairsQueue.currentIndex >= pairsQueue.queue.length) {
        console.log('Queue exhausted, refreshing...');
        if (!refreshPairsQueue()) {
            return null;
        }
    }
    
    // Get the next pair
    const pair = pairsQueue.queue[pairsQueue.currentIndex];
    pairsQueue.currentIndex++;
    
    console.log(`Returning pair ${pairsQueue.currentIndex}/${pairsQueue.queue.length}: ${pair.baseImage.name} + ${pair.overlayImage.name}`);
    
    return pair;
}

// Direct Dropbox API call using fetch with automatic token refresh
async function dropboxApiCall(endpoint, env, body = null, retryCount = 0) {
    const accessToken = await getValidAccessToken(env);
    
    const options = {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    };
    
    // Dropbox API requires body to be either null or a JSON object
    // For endpoints that don't need parameters, we send 'null' as a string
    if (body !== null) {
        options.body = JSON.stringify(body);
    } else {
        options.body = 'null';
    }
    
    const response = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, options);
    
    // If unauthorized and we haven't retried yet, refresh token and retry
    if (response.status === 401 && retryCount === 0) {
        console.log('Access token expired, refreshing and retrying...');
        await refreshAccessToken(env);
        return dropboxApiCall(endpoint, env, body, retryCount + 1);
    }
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Dropbox API error: ${response.status} - ${errorText}`);
    }
    
    return await response.json();
}

// Function to get all images from a directory using recursive listing and batch API
async function getAllImagesFromFolder(env, folderPath) {
    const images = [];
    const imagePaths = [];
    
    try {
        console.log(`Scanning folder recursively: ${folderPath}`);
        
        // List folder contents recursively
        let response = await dropboxApiCall('files/list_folder', env, {
            path: folderPath,
            recursive: true,
            include_deleted: false,
            include_has_explicit_shared_members: false,
            include_mounted_folders: false,
            include_media_info: true
        });
        
        // Collect all image file paths
        const processEntries = (entries) => {
            for (const entry of entries) {
                if (entry['.tag'] === 'file') {
                    const name = entry.name.toLowerCase();
                    if (name.endsWith('.jpg') || name.endsWith('.jpeg') || 
                        name.endsWith('.png') || name.endsWith('.gif') || 
                        name.endsWith('.webp')) {
                        imagePaths.push({
                            path: entry.path_display,
                            name: entry.name,
                            size: entry.size
                        });
                    }
                }
            }
        };
        
        processEntries(response.entries);
        
        // Handle pagination
        while (response.has_more) {
            response = await dropboxApiCall('files/list_folder/continue', env, {
                cursor: response.cursor
            });
            processEntries(response.entries);
        }
        
        console.log(`Found ${imagePaths.length} images in ${folderPath}`);
        
        // Get temporary links in batches (Dropbox batch API supports max 25 entries per batch)
        const batchSize = 25;
        for (let i = 0; i < imagePaths.length; i += batchSize) {
            const batch = imagePaths.slice(i, i + batchSize);
            const batchEntries = batch.map(item => ({
                '.tag': 'get_temporary_link',
                path: item.path
            }));
            
            try {
                console.log(`Getting temporary links for batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(imagePaths.length/batchSize)}`);
                
                const batchResponse = await dropboxApiCall('files/get_temporary_link_batch', env, {
                    entries: batchEntries
                });
                
                // Process batch results
                for (let j = 0; j < batchResponse.entries.length; j++) {
                    const result = batchResponse.entries[j];
                    const originalItem = batch[j];
                    
                    if (result['.tag'] === 'success') {
                        images.push({
                            name: originalItem.name,
                            url: result.link,
                            size: originalItem.size,
                            path: originalItem.path
                        });
                    } else {
                        console.error(`Failed to get link for ${originalItem.name}:`, result['.tag']);
                    }
                }
            } catch (error) {
                console.error(`Error in batch ${Math.floor(i/batchSize) + 1}:`, error.message);
                // Fall back to individual requests for this batch
                for (const item of batch) {
                    try {
                        const tempLinkResponse = await dropboxApiCall('files/get_temporary_link', env, {
                            path: item.path
                        });
                        
                        images.push({
                            name: item.name,
                            url: tempLinkResponse.link,
                            size: item.size,
                            path: item.path
                        });
                    } catch (linkError) {
                        console.error(`Error getting link for ${item.name}:`, linkError.message);
                    }
                }
            }
        }
        
        console.log(`Successfully retrieved ${images.length} image links from ${folderPath}`);
        return images;
        
    } catch (error) {
        console.error(`Error scanning folder ${folderPath}:`, error.message);
        throw error;
    }
}

// Function to refresh image cache
async function refreshImageCache(env) {
    console.log('Refreshing image cache...');
    
    try {
        const [baseImages, overlayImages] = await Promise.all([
            getAllImagesFromFolder(env, '/Homepage/large_rectangle_database'),
            getAllImagesFromFolder(env, '/Homepage/small_rectangle_database')
        ]);
        
        imageCache.baseImages = baseImages;
        imageCache.overlayImages = overlayImages;
        imageCache.lastFetch = Date.now();
        
        console.log(`Cached ${baseImages.length} base images and ${overlayImages.length} overlay images`);
    } catch (error) {
        console.error('Error refreshing cache:', error);
        throw error;
    }
}

// Handle CORS headers
function handleCors(request, response) {
    const origin = request.headers.get('Origin');
    const allowedOrigins = [
        'https://luccas-portfolio.com',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5173'
    ];

    let isAllowed = false;

    if (allowedOrigins.includes(origin)) {
        isAllowed = true;
    } else if (origin) {
        try {
            const hostname = new URL(origin).hostname;
            isAllowed = hostname === 'luccas-portfolio.com' ||
                        hostname.endsWith('.luccas-portfolio.com') ||
                        hostname.endsWith('.pages.dev');
        } catch (e) {
            // Invalid origin URL
        }
    }

    if (isAllowed) {
        response.headers.set('Access-Control-Allow-Origin', origin);
    }

    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    response.headers.set('Access-Control-Max-Age', '86400');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return response;
}

// Helper functions for KV operations
async function getCachedData(env, key) {
    try {
        const cached = await env.PORTFOLIO_KV.get(key);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (error) {
        console.error(`Error reading from KV for key ${key}:`, error);
    }
    return null;
}

async function setCachedData(env, key, data, expirationTtl = 3600) {
    try {
        await env.PORTFOLIO_KV.put(key, JSON.stringify(data), {
            expirationTtl: expirationTtl
        });
    } catch (error) {
        console.error(`Error writing to KV for key ${key}:`, error);
    }
}

// Function to refresh all caches and store in KV
async function refreshAllCaches(env) {
    console.log('Starting scheduled cache refresh...');
    
    try {
        // Refresh image cache
        await refreshImageCache(env);
        await setCachedData(env, 'imageCache', imageCache, 3600);
        
        // Refresh collections caches in parallel
        const collections = ['sketchbooks', 'paintings', 'photo'];
        await Promise.all(collections.map(async (collection) => {
            const folderPath = `/${collection.charAt(0).toUpperCase() + collection.slice(1)}`;
            const images = await getAllImagesFromFolder(env, folderPath);
            collectionsCache[collection] = {
                images: images,
                lastFetch: Date.now()
            };
            await setCachedData(env, `collection_${collection}`, collectionsCache[collection], 14400);
        }));
        
        console.log('Scheduled cache refresh completed successfully');
    } catch (error) {
        console.error('Error in scheduled cache refresh:', error);
        throw error;
    }
}

// Main request handler
export default {
    // Scheduled handler for Cron triggers
    async scheduled(event, env, ctx) {
        // Refresh all caches on schedule
        await refreshAllCaches(env);
    },
    
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return handleCors(request, new Response(null, { status: 204 }));
        }
        
        // Check for Dropbox credentials
        if (!env.DROPBOX_ACCESS_TOKEN && !env.DROPBOX_REFRESH_TOKEN) {
            return handleCors(request, new Response(JSON.stringify({
                error: 'No Dropbox credentials configured'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }));
        }
        
        // Handle /api/health endpoint
        if (url.pathname === '/api/health') {
            return handleCors(request, new Response(JSON.stringify({
                status: 'OK',
                message: 'Luccas Portfolio API is running on Cloudflare Workers'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }));
        }
        
        // Handle /api/images endpoint - returns all cached images
        if (url.pathname === '/api/images' && request.method === 'GET') {
            try {
                // First, try to get from KV cache
                const kvCache = await getCachedData(env, 'imageCache');
                
                if (kvCache) {
                    // We have KV cache! Check if it's stale
                    const isStale = !kvCache.lastFetch || 
                                   (Date.now() - kvCache.lastFetch) > (30 * 60 * 1000); // 30 minutes
                    
                    // Serve cached data immediately
                    console.log(`Serving images from KV cache (stale: ${isStale})`);
                    
                    // If stale, refresh in background
                    if (isStale) {
                        ctx.waitUntil(
                            (async () => {
                                try {
                                    await refreshImageCache(env);
                                    await setCachedData(env, 'imageCache', imageCache, 3600);
                                    console.log('Background cache refresh completed');
                                } catch (error) {
                                    console.error('Background cache refresh failed:', error);
                                }
                            })()
                        );
                    }
                    
                    // Return KV cached data immediately
                    const response = new Response(JSON.stringify({
                        baseImages: kvCache.baseImages || [],
                        overlayImages: kvCache.overlayImages || [],
                        totalCounts: {
                            base: (kvCache.baseImages || []).length,
                            overlay: (kvCache.overlayImages || []).length
                        },
                        cached: true,
                        cacheAge: Date.now() - (kvCache.lastFetch || 0)
                    }), {
                        status: 200,
                        headers: { 
                            'Content-Type': 'application/json',
                            'Cache-Control': 'public, max-age=300', // 5 minute browser cache
                            'X-Cache-Status': isStale ? 'stale' : 'fresh',
                            'Vary': 'Origin'
                        }
                    });
                    
                    return handleCors(request, response);
                }
                
                // No KV cache, need to fetch fresh data
                console.log('No KV cache found, fetching fresh data');
                await refreshImageCache(env);
                
                // Store in KV for next time
                ctx.waitUntil(setCachedData(env, 'imageCache', imageCache, 3600));
                
                const response = new Response(JSON.stringify({
                    baseImages: imageCache.baseImages,
                    overlayImages: imageCache.overlayImages,
                    totalCounts: {
                        base: imageCache.baseImages.length,
                        overlay: imageCache.overlayImages.length
                    },
                    cached: false
                }), {
                    status: 200,
                    headers: { 
                        'Content-Type': 'application/json',
                        'Cache-Control': 'public, max-age=300',
                        'X-Cache-Status': 'miss',
                        'Vary': 'Origin'
                    }
                });
                
                return handleCors(request, response);
                
            } catch (error) {
                console.error('Error fetching images:', error);
                return handleCors(request, new Response(JSON.stringify({
                    error: 'Failed to fetch images'
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
        }
        
        // Handle /api/generateOverlay endpoint - returns next pair from queue
        if (url.pathname === '/api/generateOverlay' && request.method === 'GET') {
            try {
                // Make sure cache is populated
                if (imageCache.baseImages.length === 0 || imageCache.overlayImages.length === 0) {
                    // Try to load from KV first
                    const kvCache = await getCachedData(env, 'imageCache');
                    if (kvCache && kvCache.baseImages && kvCache.overlayImages) {
                        console.log('Restoring image cache from KV');
                        imageCache = kvCache;
                        // Refresh queue with KV data
                        refreshPairsQueue();
                    } else {
                        // No KV cache, need to fetch fresh
                        await refreshImageCache(env);
                        ctx.waitUntil(setCachedData(env, 'imageCache', imageCache, 3600));
                    }
                }
                
                if (imageCache.baseImages.length === 0 || imageCache.overlayImages.length === 0) {
                    return handleCors(request, new Response(JSON.stringify({
                        error: 'No images found in cache'
                    }), {
                        status: 404,
                        headers: { 'Content-Type': 'application/json' }
                    }));
                }
                
                // Get next pair from queue
                const pair = getNextPairFromQueue();
                
                if (!pair) {
                    return handleCors(request, new Response(JSON.stringify({
                        error: 'Failed to get image pair from queue'
                    }), {
                        status: 500,
                        headers: { 'Content-Type': 'application/json' }
                    }));
                }
                
                const response = new Response(JSON.stringify({
                    baseImage: pair.baseImage,
                    overlayImage: pair.overlayImage,
                    queueInfo: {
                        currentPosition: pairsQueue.currentIndex,
                        totalPairs: pairsQueue.queue.length,
                        remainingPairs: pairsQueue.queue.length - pairsQueue.currentIndex
                    }
                }), {
                    status: 200,
                    headers: { 
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache',
                        'Expires': '0'
                    }
                });
                
                return handleCors(request, response);
                
            } catch (error) {
                console.error('Error generating overlay:', error);
                return handleCors(request, new Response(JSON.stringify({
                    error: 'Failed to generate overlay'
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
        }
        
        // Collection endpoints
        const collectionRoutes = {
            '/api/sketchbooks': { name: 'sketchbooks', folder: '/Sketchbooks' },
            '/api/paintings': { name: 'paintings', folder: '/Paintings' },
            '/api/photo': { name: 'photo', folder: '/Photo' },
        };

        const collectionRoute = collectionRoutes[url.pathname];
        if (collectionRoute && request.method === 'GET') {
            try {
                const { name, folder } = collectionRoute;
                const cache = collectionsCache[name];
                const forceRefresh = url.searchParams.get('refresh') === 'true';

                const needsRefresh = forceRefresh ||
                                   !cache.lastFetch ||
                                   (Date.now() - cache.lastFetch) > collectionsCache.cacheTimeout ||
                                   cache.images.length === 0;

                if (needsRefresh) {
                    console.log(`Fetching fresh ${name} images...`);
                    const images = await getAllImagesFromFolder(env, folder);
                    cache.images = images;
                    cache.lastFetch = Date.now();
                    console.log(`Cached ${images.length} ${name} images`);
                }

                return handleCors(request, new Response(JSON.stringify({
                    images: cache.images,
                    totalCount: cache.images.length,
                    cached: !needsRefresh
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));

            } catch (error) {
                console.error(`Error fetching ${collectionRoute.name}:`, error);
                return handleCors(request, new Response(JSON.stringify({
                    error: `Failed to fetch ${collectionRoute.name}`
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
        }
        
        // 404 for unmatched routes
        return handleCors(request, new Response(JSON.stringify({
            error: 'Not found'
        }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        }));
    }
};