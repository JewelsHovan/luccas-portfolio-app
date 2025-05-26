import { Dropbox } from 'dropbox';

// Cache for images (stored in global scope for persistence across requests)
let imageCache = {
    baseImages: [],
    overlayImages: [],
    lastFetch: null,
    cacheTimeout: 4 * 60 * 60 * 1000 // 4 hours (temp links expire)
};

// Debug data storage
let debugData = {
    lastScan: null,
    errors: [],
    folderContents: {},
    fileExtensions: new Set(),
    apiCalls: []
};

// Function to get random item from array
function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// Function to recursively get all images from a directory WITH LOGGING
async function getAllImagesFromFolder(dbx, folderPath) {
    console.log(`[DEBUG] Starting scan of folder: ${folderPath}`);
    const images = [];
    const allFiles = []; // Store all files for debug endpoint
    
    async function scanFolder(path) {
        try {
            console.log(`[DEBUG] Scanning folder: ${path}`);
            debugData.apiCalls.push({
                type: 'filesListFolder',
                path: path,
                timestamp: new Date().toISOString()
            });
            
            const response = await dbx.filesListFolder({ path });
            console.log(`[DEBUG] Dropbox API response for ${path}:`, {
                entriesCount: response.result.entries.length,
                hasMore: response.result.has_more,
                cursor: response.result.cursor ? 'present' : 'none'
            });
            
            for (const entry of response.result.entries) {
                console.log(`[DEBUG] Found entry: ${entry.name} (type: ${entry['.tag']})`);
                
                if (entry['.tag'] === 'file') {
                    const name = entry.name.toLowerCase();
                    const extension = name.split('.').pop();
                    debugData.fileExtensions.add(extension);
                    
                    // Store all files for debug
                    allFiles.push({
                        name: entry.name,
                        path: entry.path_display,
                        size: entry.size,
                        extension: extension,
                        tag: entry['.tag']
                    });
                    
                    console.log(`[DEBUG] File extension: .${extension}`);
                    
                    if (name.endsWith('.jpg') || name.endsWith('.jpeg') || 
                        name.endsWith('.png') || name.endsWith('.gif') || 
                        name.endsWith('.webp')) {
                        
                        console.log(`[DEBUG] Image file detected: ${entry.name}`);
                        
                        try {
                            console.log(`[DEBUG] Getting temporary link for: ${entry.path_display}`);
                            const tempLinkResponse = await dbx.filesGetTemporaryLink({ 
                                path: entry.path_display 
                            });
                            
                            console.log(`[DEBUG] Successfully got temp link for: ${entry.name}`);
                            
                            images.push({
                                name: entry.name,
                                url: tempLinkResponse.result.link,
                                size: entry.size,
                                path: entry.path_display
                            });
                        } catch (error) {
                            console.error(`[DEBUG ERROR] Failed to get link for ${entry.name}:`, error);
                            debugData.errors.push({
                                type: 'filesGetTemporaryLink',
                                file: entry.name,
                                path: entry.path_display,
                                error: error.message,
                                stack: error.stack,
                                timestamp: new Date().toISOString()
                            });
                        }
                    } else {
                        console.log(`[DEBUG] Non-image file skipped: ${entry.name}`);
                    }
                } else if (entry['.tag'] === 'folder') {
                    console.log(`[DEBUG] Found subfolder: ${entry.path_display}`);
                    await scanFolder(entry.path_display);
                }
            }
            
            // Handle pagination
            if (response.result.has_more) {
                console.log(`[DEBUG] More entries available, fetching with cursor...`);
                let cursor = response.result.cursor;
                while (cursor) {
                    debugData.apiCalls.push({
                        type: 'filesListFolderContinue',
                        cursor: 'present',
                        timestamp: new Date().toISOString()
                    });
                    
                    const moreResponse = await dbx.filesListFolderContinue({ cursor });
                    console.log(`[DEBUG] Pagination response:`, {
                        entriesCount: moreResponse.result.entries.length,
                        hasMore: moreResponse.result.has_more
                    });
                    
                    for (const entry of moreResponse.result.entries) {
                        if (entry['.tag'] === 'file') {
                            const name = entry.name.toLowerCase();
                            const extension = name.split('.').pop();
                            debugData.fileExtensions.add(extension);
                            
                            allFiles.push({
                                name: entry.name,
                                path: entry.path_display,
                                size: entry.size,
                                extension: extension,
                                tag: entry['.tag']
                            });
                            
                            if (name.endsWith('.jpg') || name.endsWith('.jpeg') || 
                                name.endsWith('.png') || name.endsWith('.gif') || 
                                name.endsWith('.webp')) {
                                
                                console.log(`[DEBUG] Image file in pagination: ${entry.name}`);
                                
                                try {
                                    const tempLinkResponse = await dbx.filesGetTemporaryLink({ 
                                        path: entry.path_display 
                                    });
                                    
                                    images.push({
                                        name: entry.name,
                                        url: tempLinkResponse.result.link,
                                        size: entry.size,
                                        path: entry.path_display
                                    });
                                } catch (error) {
                                    console.error(`[DEBUG ERROR] Failed to get link for ${entry.name}:`, error);
                                    debugData.errors.push({
                                        type: 'filesGetTemporaryLink',
                                        file: entry.name,
                                        path: entry.path_display,
                                        error: error.message,
                                        stack: error.stack,
                                        timestamp: new Date().toISOString()
                                    });
                                }
                            }
                        } else if (entry['.tag'] === 'folder') {
                            await scanFolder(entry.path_display);
                        }
                    }
                    cursor = moreResponse.result.has_more ? moreResponse.result.cursor : null;
                }
            }
            
            // Store folder contents in debug data
            if (!debugData.folderContents[path]) {
                debugData.folderContents[path] = [];
            }
            debugData.folderContents[path] = allFiles.filter(f => f.path.startsWith(path));
            
        } catch (error) {
            console.error(`[DEBUG ERROR] Failed to scan folder ${path}:`, error);
            debugData.errors.push({
                type: 'filesListFolder',
                folder: path,
                error: error.message,
                stack: error.stack,
                response: error.response ? {
                    status: error.response.status,
                    statusText: error.response.statusText,
                    data: error.response.data
                } : null,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    await scanFolder(folderPath);
    console.log(`[DEBUG] Scan complete for ${folderPath}. Found ${images.length} images out of ${allFiles.length} total files`);
    return images;
}

// Function to refresh image cache
async function refreshImageCache(dbx) {
    console.log('[DEBUG] Starting cache refresh...');
    debugData.lastScan = new Date().toISOString();
    debugData.errors = [];
    debugData.apiCalls = [];
    
    const [baseImages, overlayImages] = await Promise.all([
        getAllImagesFromFolder(dbx, '/Homepage/large_rectangle_database'),
        getAllImagesFromFolder(dbx, '/Homepage/small_rectangle_database')
    ]);
    
    imageCache.baseImages = baseImages;
    imageCache.overlayImages = overlayImages;
    imageCache.lastFetch = Date.now();
    
    console.log(`[DEBUG] Cache refresh complete:`, {
        baseImages: baseImages.length,
        overlayImages: overlayImages.length,
        totalErrors: debugData.errors.length,
        uniqueExtensions: Array.from(debugData.fileExtensions),
        apiCallsCount: debugData.apiCalls.length
    });
}

// Handle CORS headers
function handleCors(request, response) {
    const origin = request.headers.get('Origin');
    const allowedOrigins = ['https://luccas-portfolio.com', 'http://localhost:3000', 'http://localhost:3001'];
    
    if (allowedOrigins.includes(origin)) {
        response.headers.set('Access-Control-Allow-Origin', origin);
    } else if (origin && origin.includes('luccas-portfolio')) {
        // Allow any subdomain of luccas-portfolio
        response.headers.set('Access-Control-Allow-Origin', origin);
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
            console.error('[DEBUG ERROR] DROPBOX_ACCESS_TOKEN not configured in environment');
            return handleCors(request, new Response(JSON.stringify({
                error: 'DROPBOX_ACCESS_TOKEN not configured',
                debug: {
                    envKeys: Object.keys(env),
                    hasToken: false
                }
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }));
        }
        
        console.log('[DEBUG] Dropbox token present, length:', env.DROPBOX_ACCESS_TOKEN.length);
        
        // Initialize Dropbox client
        const dbx = new Dropbox({ 
            accessToken: env.DROPBOX_ACCESS_TOKEN,
            fetch: fetch
        });
        
        // Handle /api/debug endpoint - NEW ENDPOINT
        if (url.pathname === '/api/debug' && request.method === 'GET') {
            console.log('[DEBUG] Debug endpoint called');
            
            try {
                // Force a fresh scan
                await refreshImageCache(dbx);
                
                return handleCors(request, new Response(JSON.stringify({
                    status: 'DEBUG_COMPLETE',
                    timestamp: new Date().toISOString(),
                    lastScan: debugData.lastScan,
                    summary: {
                        baseImagesFound: imageCache.baseImages.length,
                        overlayImagesFound: imageCache.overlayImages.length,
                        totalErrors: debugData.errors.length,
                        totalApiCalls: debugData.apiCalls.length,
                        uniqueFileExtensions: Array.from(debugData.fileExtensions).sort(),
                        foldersScanned: Object.keys(debugData.folderContents).length
                    },
                    folderContents: debugData.folderContents,
                    errors: debugData.errors,
                    apiCalls: debugData.apiCalls,
                    imageCache: {
                        baseImages: imageCache.baseImages.map(img => ({
                            name: img.name,
                            path: img.path,
                            size: img.size
                        })),
                        overlayImages: imageCache.overlayImages.map(img => ({
                            name: img.name,
                            path: img.path,
                            size: img.size
                        }))
                    }
                }, null, 2), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
            } catch (error) {
                console.error('[DEBUG ERROR] Debug endpoint error:', error);
                return handleCors(request, new Response(JSON.stringify({
                    error: 'Debug scan failed',
                    details: error.message,
                    stack: error.stack,
                    debugData: debugData
                }, null, 2), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
        }
        
        // Handle /api/health endpoint
        if (url.pathname === '/api/health') {
            return handleCors(request, new Response(JSON.stringify({
                status: 'OK',
                message: 'Luccas Portfolio Debug API is running on Cloudflare Workers',
                debug: {
                    hasDropboxToken: !!env.DROPBOX_ACCESS_TOKEN,
                    lastCacheFetch: imageCache.lastFetch ? new Date(imageCache.lastFetch).toISOString() : null,
                    cachedImages: {
                        base: imageCache.baseImages.length,
                        overlay: imageCache.overlayImages.length
                    }
                }
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }));
        }
        
        // Handle /api/images endpoint
        if (url.pathname === '/api/images' && request.method === 'GET') {
            try {
                console.log('[DEBUG] /api/images called');
                
                // Check if cache needs refresh
                const needsRefresh = !imageCache.lastFetch || 
                                   (Date.now() - imageCache.lastFetch) > imageCache.cacheTimeout ||
                                   imageCache.baseImages.length === 0 || 
                                   imageCache.overlayImages.length === 0;
                
                console.log('[DEBUG] Cache status:', {
                    needsRefresh,
                    lastFetch: imageCache.lastFetch ? new Date(imageCache.lastFetch).toISOString() : null,
                    cacheAge: imageCache.lastFetch ? Math.floor((Date.now() - imageCache.lastFetch) / 1000) + ' seconds' : 'never',
                    baseImages: imageCache.baseImages.length,
                    overlayImages: imageCache.overlayImages.length
                });
                
                if (needsRefresh) {
                    await refreshImageCache(dbx);
                }
                
                // Return 2 random images (1 base + 1 overlay)
                if (imageCache.baseImages.length === 0 || imageCache.overlayImages.length === 0) {
                    console.error('[DEBUG ERROR] No images found after refresh');
                    return handleCors(request, new Response(JSON.stringify({
                        error: 'No images found in Dropbox folders',
                        debug: {
                            baseImagesCount: imageCache.baseImages.length,
                            overlayImagesCount: imageCache.overlayImages.length,
                            lastErrors: debugData.errors.slice(-5),
                            foldersChecked: Object.keys(debugData.folderContents),
                            fileExtensionsFound: Array.from(debugData.fileExtensions)
                        }
                    }), {
                        status: 404,
                        headers: { 'Content-Type': 'application/json' }
                    }));
                }
                
                const randomBaseImage = getRandomItem(imageCache.baseImages);
                const randomOverlayImage = getRandomItem(imageCache.overlayImages);
                
                console.log(`[DEBUG] Serving images:`, {
                    base: randomBaseImage.name,
                    overlay: randomOverlayImage.name
                });
                
                return handleCors(request, new Response(JSON.stringify({
                    baseImage: randomBaseImage,
                    overlayImage: randomOverlayImage,
                    totalCounts: {
                        base: imageCache.baseImages.length,
                        overlay: imageCache.overlayImages.length
                    },
                    debug: {
                        cacheAge: Math.floor((Date.now() - imageCache.lastFetch) / 1000) + ' seconds',
                        lastScan: debugData.lastScan
                    }
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
                
            } catch (error) {
                console.error('[DEBUG ERROR] /api/images error:', error);
                return handleCors(request, new Response(JSON.stringify({
                    error: 'Failed to fetch images',
                    details: error.message,
                    stack: error.stack,
                    debug: {
                        lastErrors: debugData.errors.slice(-5),
                        cacheStatus: {
                            base: imageCache.baseImages.length,
                            overlay: imageCache.overlayImages.length
                        }
                    }
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
        }
        
        // 404 for unmatched routes
        return handleCors(request, new Response(JSON.stringify({
            error: 'Not found',
            availableEndpoints: ['/api/health', '/api/images', '/api/debug']
        }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        }));
    }
};