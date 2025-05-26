import { Dropbox } from 'dropbox';

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

// Function to recursively get all images from a directory
async function getAllImagesFromFolder(dbx, folderPath) {
    const images = [];
    
    async function scanFolder(path) {
        try {
            const response = await dbx.filesListFolder({ path });
            
            for (const entry of response.result.entries) {
                if (entry['.tag'] === 'file') {
                    const name = entry.name.toLowerCase();
                    if (name.endsWith('.jpg') || name.endsWith('.jpeg') || 
                        name.endsWith('.png') || name.endsWith('.gif') || 
                        name.endsWith('.webp')) {
                        
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
                            console.error(`Error getting link for ${entry.name}:`, error.message);
                        }
                    }
                } else if (entry['.tag'] === 'folder') {
                    await scanFolder(entry.path_display);
                }
            }
            
            // Handle pagination
            if (response.result.has_more) {
                let cursor = response.result.cursor;
                while (cursor) {
                    const moreResponse = await dbx.filesListFolderContinue({ cursor });
                    for (const entry of moreResponse.result.entries) {
                        if (entry['.tag'] === 'file') {
                            const name = entry.name.toLowerCase();
                            if (name.endsWith('.jpg') || name.endsWith('.jpeg') || 
                                name.endsWith('.png') || name.endsWith('.gif') || 
                                name.endsWith('.webp')) {
                                
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
                                    console.error(`Error getting link for ${entry.name}:`, error.message);
                                }
                            }
                        } else if (entry['.tag'] === 'folder') {
                            await scanFolder(entry.path_display);
                        }
                    }
                    cursor = moreResponse.result.has_more ? moreResponse.result.cursor : null;
                }
            }
        } catch (error) {
            console.error(`Error scanning folder ${path}:`, error.message);
        }
    }
    
    await scanFolder(folderPath);
    return images;
}

// Function to refresh image cache
async function refreshImageCache(dbx) {
    console.log('Refreshing image cache...');
    
    const [baseImages, overlayImages] = await Promise.all([
        getAllImagesFromFolder(dbx, '/Homepage/large_rectangle_database'),
        getAllImagesFromFolder(dbx, '/Homepage/small_rectangle_database')
    ]);
    
    imageCache.baseImages = baseImages;
    imageCache.overlayImages = overlayImages;
    imageCache.lastFetch = Date.now();
    
    console.log(`Cached ${baseImages.length} base images and ${overlayImages.length} overlay images`);
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
        if (!env.DROPBOX_API_TOKEN) {
            return handleCors(request, new Response(JSON.stringify({
                error: 'DROPBOX_ACCESS_TOKEN not configured'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }));
        }
        
        // Initialize Dropbox client
        const dbx = new Dropbox({ 
            accessToken: env.DROPBOX_API_TOKEN,
            fetch: fetch
        });
        
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
                    await refreshImageCache(dbx);
                }
                
                // Return 2 random images (1 base + 1 overlay)
                if (imageCache.baseImages.length === 0 || imageCache.overlayImages.length === 0) {
                    return handleCors(request, new Response(JSON.stringify({
                        error: 'No images found in Dropbox folders'
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
        
        // 404 for unmatched routes
        return handleCors(request, new Response(JSON.stringify({
            error: 'Not found'
        }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        }));
    }
};

/*
CLOUDFLARE WORKER SETUP INSTRUCTIONS:

1. Install Wrangler CLI:
   npm install -g wrangler

2. Create a wrangler.toml file in the backend directory:
   ```toml
   name = "luccas-portfolio-api"
   main = "worker.js"
   compatibility_date = "2024-01-01"
   
   [vars]
   # Add any non-sensitive variables here
   
   [[env.production]]
   name = "luccas-portfolio-api"
   ```

3. Set up environment variables in Cloudflare:
   - Go to Cloudflare Dashboard > Workers & Pages > Your Worker > Settings > Variables
   - Add the following environment variable:
     - DROPBOX_ACCESS_TOKEN: Your Dropbox access token
   
4. Deploy the worker:
   wrangler deploy

5. Update your frontend to use the new Worker URL:
   - Replace http://localhost:5001 with your Worker URL
   - Example: https://luccas-portfolio-api.your-subdomain.workers.dev

6. Optional: Set up a custom domain:
   - Go to Workers & Pages > Your Worker > Triggers
   - Add a custom domain or route

Note: The worker uses Cloudflare's global scope for caching, which persists across requests
but may be reset during cold starts. This is similar to the in-memory cache in the Express version.
*/