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
    cacheTimeout: 4 * 60 * 60 * 1000 // 4 hours (temp links expire)
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

// Recent selections to prevent duplicates
let recentSelections = {
    base: [],
    overlay: [],
    maxHistory: 10 // Prevent last 10 selections from repeating
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

// Function to get random item from array
function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// Function to get random item excluding recent selections
function getRandomItemExcluding(array, type) {
    const excludeList = recentSelections[type];
    const available = array.filter(item => 
        !excludeList.some(excluded => excluded.path === item.path)
    );
    
    console.log(`[${type}] Total: ${array.length}, Excluded: ${excludeList.length}, Available: ${available.length}`);
    
    // If we've excluded too many items (less than 20% available), reset
    if (available.length === 0 || available.length < Math.max(1, Math.floor(array.length * 0.2))) {
        console.log(`[${type}] Resetting history - too few available items`);
        // Keep only the last 2 to avoid immediate repeats
        recentSelections[type] = excludeList.slice(-2);
        // Recalculate available
        const newAvailable = array.filter(item => 
            !recentSelections[type].some(excluded => excluded.path === item.path)
        );
        return getRandomItem(newAvailable.length > 0 ? newAvailable : array);
    }
    
    // Get random from available items
    const selected = available[Math.floor(Math.random() * available.length)];
    
    // Add to recent selections
    recentSelections[type].push(selected);
    
    // Dynamically adjust history size based on array size
    const dynamicMaxHistory = Math.min(10, Math.floor(array.length * 0.5));
    
    // Keep only last N selections
    if (recentSelections[type].length > dynamicMaxHistory) {
        recentSelections[type].shift();
    }
    
    return selected;
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

// Function to recursively get all images from a directory using direct API calls
async function getAllImagesFromFolder(env, folderPath) {
    const images = [];
    
    async function scanFolder(path) {
        try {
            console.log(`Scanning folder: ${path}`);
            
            // List folder contents
            let response = await dropboxApiCall('files/list_folder', env, {
                path: path,
                recursive: false,
                include_deleted: false,
                include_has_explicit_shared_members: false,
                include_mounted_folders: true
            });
            
            // Process entries
            for (const entry of response.entries) {
                if (entry['.tag'] === 'file') {
                    const name = entry.name.toLowerCase();
                    if (name.endsWith('.jpg') || name.endsWith('.jpeg') || 
                        name.endsWith('.png') || name.endsWith('.gif') || 
                        name.endsWith('.webp')) {
                        
                        try {
                            // Get temporary link
                            const tempLinkResponse = await dropboxApiCall('files/get_temporary_link', env, {
                                path: entry.path_display
                            });
                            
                            images.push({
                                name: entry.name,
                                url: tempLinkResponse.link,
                                size: entry.size,
                                path: entry.path_display
                            });
                            
                            console.log(`Added image: ${entry.name}`);
                        } catch (error) {
                            console.error(`Error getting link for ${entry.name}:`, error.message);
                        }
                    }
                } else if (entry['.tag'] === 'folder') {
                    await scanFolder(entry.path_display);
                }
            }
            
            // Handle pagination
            while (response.has_more) {
                response = await dropboxApiCall('files/list_folder/continue', env, {
                    cursor: response.cursor
                });
                
                for (const entry of response.entries) {
                    if (entry['.tag'] === 'file') {
                        const name = entry.name.toLowerCase();
                        if (name.endsWith('.jpg') || name.endsWith('.jpeg') || 
                            name.endsWith('.png') || name.endsWith('.gif') || 
                            name.endsWith('.webp')) {
                            
                            try {
                                const tempLinkResponse = await dropboxApiCall('files/get_temporary_link', env, {
                                    path: entry.path_display
                                });
                                
                                images.push({
                                    name: entry.name,
                                    url: tempLinkResponse.link,
                                    size: entry.size,
                                    path: entry.path_display
                                });
                                
                                console.log(`Added image: ${entry.name}`);
                            } catch (error) {
                                console.error(`Error getting link for ${entry.name}:`, error.message);
                            }
                        }
                    } else if (entry['.tag'] === 'folder') {
                        await scanFolder(entry.path_display);
                    }
                }
            }
        } catch (error) {
            console.error(`Error scanning folder ${path}:`, error.message);
            throw error;
        }
    }
    
    await scanFolder(folderPath);
    return images;
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
    
    if (allowedOrigins.includes(origin)) {
        response.headers.set('Access-Control-Allow-Origin', origin);
    } else if (origin && (origin.includes('luccas-portfolio') || origin.includes('pages.dev'))) {
        // Allow any subdomain of luccas-portfolio or Cloudflare Pages
        response.headers.set('Access-Control-Allow-Origin', origin);
    } else {
        // For development, allow all origins
        response.headers.set('Access-Control-Allow-Origin', '*');
    }
    
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    response.headers.set('Access-Control-Max-Age', '86400');
    
    return response;
}

// Main request handler
export default {
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
                message: 'Luccas Portfolio API is running on Cloudflare Workers',
                tokenType: env.DROPBOX_REFRESH_TOKEN ? 'refresh_token' : 'access_token'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }));
        }
        
        // Handle /api/images endpoint - returns all cached images
        if (url.pathname === '/api/images' && request.method === 'GET') {
            try {
                // Check if cache needs refresh
                const needsRefresh = !imageCache.lastFetch || 
                                   (Date.now() - imageCache.lastFetch) > imageCache.cacheTimeout ||
                                   imageCache.baseImages.length === 0 || 
                                   imageCache.overlayImages.length === 0;
                
                if (needsRefresh) {
                    await refreshImageCache(env);
                }
                
                console.log(`Returning all images: ${imageCache.baseImages.length} base, ${imageCache.overlayImages.length} overlay`);
                
                const response = new Response(JSON.stringify({
                    baseImages: imageCache.baseImages,
                    overlayImages: imageCache.overlayImages,
                    totalCounts: {
                        base: imageCache.baseImages.length,
                        overlay: imageCache.overlayImages.length
                    },
                    cached: !needsRefresh
                }), {
                    status: 200,
                    headers: { 
                        'Content-Type': 'application/json',
                        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
                        'Vary': 'Origin'
                    }
                });
                
                return handleCors(request, response);
                
            } catch (error) {
                console.error('Error fetching images:', error);
                return handleCors(request, new Response(JSON.stringify({
                    error: 'Failed to fetch images',
                    details: error.message
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
        }
        
        // Handle /api/generateOverlay endpoint - returns 2 random images
        if (url.pathname === '/api/generateOverlay' && request.method === 'GET') {
            try {
                // Make sure cache is populated
                if (imageCache.baseImages.length === 0 || imageCache.overlayImages.length === 0) {
                    await refreshImageCache(env);
                }
                
                if (imageCache.baseImages.length === 0 || imageCache.overlayImages.length === 0) {
                    return handleCors(request, new Response(JSON.stringify({
                        error: 'No images found in cache'
                    }), {
                        status: 404,
                        headers: { 'Content-Type': 'application/json' }
                    }));
                }
                
                // Simple random selection
                const randomBaseImage = getRandomItem(imageCache.baseImages);
                const randomOverlayImage = getRandomItem(imageCache.overlayImages);
                
                console.log(`[generateOverlay] ${randomBaseImage.name} + ${randomOverlayImage.name}`);
                
                const response = new Response(JSON.stringify({
                    baseImage: randomBaseImage,
                    overlayImage: randomOverlayImage
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
                    error: 'Failed to generate overlay',
                    details: error.message
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
        }
        
        // Handle /api/sketchbooks endpoint
        if (url.pathname === '/api/sketchbooks' && request.method === 'GET') {
            try {
                // Check for force refresh parameter
                const forceRefresh = url.searchParams.get('refresh') === 'true';
                
                // Check if cache needs refresh
                const needsRefresh = forceRefresh ||
                                   !collectionsCache.sketchbooks.lastFetch || 
                                   (Date.now() - collectionsCache.sketchbooks.lastFetch) > collectionsCache.cacheTimeout ||
                                   collectionsCache.sketchbooks.images.length === 0;
                
                if (needsRefresh) {
                    console.log('Cache expired or empty, fetching fresh sketchbooks images...');
                    
                    // Get all images from the Sketchbooks folder
                    const sketchbookImages = await getAllImagesFromFolder(env, '/Sketchbooks');
                    
                    // Update cache
                    collectionsCache.sketchbooks.images = sketchbookImages;
                    collectionsCache.sketchbooks.lastFetch = Date.now();
                    
                    console.log(`Cached ${sketchbookImages.length} images in Sketchbooks folder`);
                } else {
                    console.log(`Serving ${collectionsCache.sketchbooks.images.length} cached sketchbooks images`);
                }
                
                return handleCors(request, new Response(JSON.stringify({
                    images: collectionsCache.sketchbooks.images,
                    totalCount: collectionsCache.sketchbooks.images.length,
                    cached: !needsRefresh
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
                
            } catch (error) {
                console.error('Error fetching sketchbooks:', error);
                return handleCors(request, new Response(JSON.stringify({
                    error: 'Failed to fetch sketchbooks',
                    details: error.message
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
        }
        
        // Handle /api/paintings endpoint
        if (url.pathname === '/api/paintings' && request.method === 'GET') {
            try {
                // Check if cache needs refresh
                const needsRefresh = !collectionsCache.paintings.lastFetch || 
                                   (Date.now() - collectionsCache.paintings.lastFetch) > collectionsCache.cacheTimeout ||
                                   collectionsCache.paintings.images.length === 0;
                
                if (needsRefresh) {
                    console.log('Cache expired or empty, fetching fresh paintings images...');
                    
                    // Get all images from the Paintings folder
                    const paintingsImages = await getAllImagesFromFolder(env, '/Paintings');
                    
                    // Update cache
                    collectionsCache.paintings.images = paintingsImages;
                    collectionsCache.paintings.lastFetch = Date.now();
                    
                    console.log(`Cached ${paintingsImages.length} images in Paintings folder`);
                } else {
                    console.log(`Serving ${collectionsCache.paintings.images.length} cached paintings images`);
                }
                
                return handleCors(request, new Response(JSON.stringify({
                    images: collectionsCache.paintings.images,
                    totalCount: collectionsCache.paintings.images.length,
                    cached: !needsRefresh
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
                
            } catch (error) {
                console.error('Error fetching paintings:', error);
                return handleCors(request, new Response(JSON.stringify({
                    error: 'Failed to fetch paintings',
                    details: error.message
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
        }
        
        // Handle /api/photo endpoint
        if (url.pathname === '/api/photo' && request.method === 'GET') {
            try {
                // Check if cache needs refresh
                const needsRefresh = !collectionsCache.photo.lastFetch || 
                                   (Date.now() - collectionsCache.photo.lastFetch) > collectionsCache.cacheTimeout ||
                                   collectionsCache.photo.images.length === 0;
                
                if (needsRefresh) {
                    console.log('Cache expired or empty, fetching fresh photo images...');
                    
                    // Get all images from the Photo folder
                    const photoImages = await getAllImagesFromFolder(env, '/Photo');
                    
                    // Update cache
                    collectionsCache.photo.images = photoImages;
                    collectionsCache.photo.lastFetch = Date.now();
                    
                    console.log(`Cached ${photoImages.length} images in Photo folder`);
                } else {
                    console.log(`Serving ${collectionsCache.photo.images.length} cached photo images`);
                }
                
                return handleCors(request, new Response(JSON.stringify({
                    images: collectionsCache.photo.images,
                    totalCount: collectionsCache.photo.images.length,
                    cached: !needsRefresh
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
                
            } catch (error) {
                console.error('Error fetching photo:', error);
                return handleCors(request, new Response(JSON.stringify({
                    error: 'Failed to fetch photo',
                    details: error.message
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
        }
        
        // Handle /api/debug endpoint for troubleshooting
        if (url.pathname === '/api/debug' && request.method === 'GET') {
            try {
                // Test basic Dropbox connection
                const testResponse = await dropboxApiCall('users/get_current_account', env);
                
                return handleCors(request, new Response(JSON.stringify({
                    dropboxConnected: true,
                    accountInfo: {
                        name: testResponse.name.display_name,
                        email: testResponse.email
                    },
                    tokenInfo: {
                        type: env.DROPBOX_REFRESH_TOKEN ? 'refresh_token' : 'access_token',
                        tokenCached: !!tokenCache.accessToken,
                        expiresAt: tokenCache.expiresAt,
                        expiresIn: tokenCache.expiresAt ? Math.round((tokenCache.expiresAt - Date.now()) / 1000) : null
                    },
                    cacheStatus: {
                        lastFetch: imageCache.lastFetch,
                        baseImagesCount: imageCache.baseImages.length,
                        overlayImagesCount: imageCache.overlayImages.length
                    },
                    collectionsCacheStatus: {
                        sketchbooks: {
                            lastFetch: collectionsCache.sketchbooks.lastFetch,
                            imagesCount: collectionsCache.sketchbooks.images.length
                        },
                        paintings: {
                            lastFetch: collectionsCache.paintings.lastFetch,
                            imagesCount: collectionsCache.paintings.images.length
                        },
                        photo: {
                            lastFetch: collectionsCache.photo.lastFetch,
                            imagesCount: collectionsCache.photo.images.length
                        }
                    }
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
            } catch (error) {
                return handleCors(request, new Response(JSON.stringify({
                    dropboxConnected: false,
                    error: error.message
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