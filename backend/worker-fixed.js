// Cache for images (stored in global scope for persistence across requests)
let imageCache = {
    baseImages: [],
    overlayImages: [],
    lastFetch: null,
    cacheTimeout: 4 * 60 * 60 * 1000 // 4 hours (temp links expire)
};

// Function to get random item from array
function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// Direct Dropbox API call using fetch
async function dropboxApiCall(endpoint, accessToken, body = null) {
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
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Dropbox API error: ${response.status} - ${errorText}`);
    }
    
    return await response.json();
}

// Function to recursively get all images from a directory using direct API calls
async function getAllImagesFromFolder(accessToken, folderPath) {
    const images = [];
    
    async function scanFolder(path) {
        try {
            console.log(`Scanning folder: ${path}`);
            
            // List folder contents
            let response = await dropboxApiCall('files/list_folder', accessToken, {
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
                            const tempLinkResponse = await dropboxApiCall('files/get_temporary_link', accessToken, {
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
                response = await dropboxApiCall('files/list_folder/continue', accessToken, {
                    cursor: response.cursor
                });
                
                for (const entry of response.entries) {
                    if (entry['.tag'] === 'file') {
                        const name = entry.name.toLowerCase();
                        if (name.endsWith('.jpg') || name.endsWith('.jpeg') || 
                            name.endsWith('.png') || name.endsWith('.gif') || 
                            name.endsWith('.webp')) {
                            
                            try {
                                const tempLinkResponse = await dropboxApiCall('files/get_temporary_link', accessToken, {
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
async function refreshImageCache(accessToken) {
    console.log('Refreshing image cache...');
    
    try {
        const [baseImages, overlayImages] = await Promise.all([
            getAllImagesFromFolder(accessToken, '/Homepage/large_rectangle_database'),
            getAllImagesFromFolder(accessToken, '/Homepage/small_rectangle_database')
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
        
        // Check for Dropbox access token
        if (!env.DROPBOX_ACCESS_TOKEN) {
            return handleCors(request, new Response(JSON.stringify({
                error: 'DROPBOX_ACCESS_TOKEN not configured'
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
        
        // Handle /api/images endpoint
        if (url.pathname === '/api/images' && request.method === 'GET') {
            try {
                // Check if cache needs refresh
                const needsRefresh = !imageCache.lastFetch || 
                                   (Date.now() - imageCache.lastFetch) > imageCache.cacheTimeout ||
                                   imageCache.baseImages.length === 0 || 
                                   imageCache.overlayImages.length === 0;
                
                if (needsRefresh) {
                    await refreshImageCache(env.DROPBOX_ACCESS_TOKEN);
                }
                
                // Return 2 random images (1 base + 1 overlay)
                if (imageCache.baseImages.length === 0 || imageCache.overlayImages.length === 0) {
                    return handleCors(request, new Response(JSON.stringify({
                        error: 'No images found in Dropbox folders',
                        details: {
                            baseImagesCount: imageCache.baseImages.length,
                            overlayImagesCount: imageCache.overlayImages.length
                        }
                    }), {
                        status: 404,
                        headers: { 'Content-Type': 'application/json' }
                    }));
                }
                
                const randomBaseImage = getRandomItem(imageCache.baseImages);
                const randomOverlayImage = getRandomItem(imageCache.overlayImages);
                
                console.log(`Serving random images: ${randomBaseImage.name} + ${randomOverlayImage.name}`);
                
                return handleCors(request, new Response(JSON.stringify({
                    baseImage: randomBaseImage,
                    overlayImage: randomOverlayImage,
                    totalCounts: {
                        base: imageCache.baseImages.length,
                        overlay: imageCache.overlayImages.length
                    }
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
                
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
        
        // Handle /api/debug endpoint for troubleshooting
        if (url.pathname === '/api/debug' && request.method === 'GET') {
            try {
                // Test basic Dropbox connection
                const testResponse = await dropboxApiCall('users/get_current_account', env.DROPBOX_ACCESS_TOKEN);
                
                return handleCors(request, new Response(JSON.stringify({
                    dropboxConnected: true,
                    accountInfo: {
                        name: testResponse.name.display_name,
                        email: testResponse.email
                    },
                    cacheStatus: {
                        lastFetch: imageCache.lastFetch,
                        baseImagesCount: imageCache.baseImages.length,
                        overlayImagesCount: imageCache.overlayImages.length
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