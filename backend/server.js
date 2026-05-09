import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Dropbox } from 'dropbox';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Check for Dropbox credentials (either access token or refresh token flow)
const hasAccessToken = !!process.env.DROPBOX_ACCESS_TOKEN;
const hasRefreshFlow = !!process.env.DROPBOX_REFRESH_TOKEN && !!process.env.DROPBOX_APP_KEY && !!process.env.DROPBOX_APP_SECRET;

if (!hasAccessToken && !hasRefreshFlow) {
    console.error('ERROR: Dropbox credentials not found in environment variables');
    console.error('Please set either:');
    console.error('  - DROPBOX_ACCESS_TOKEN (legacy short-lived token)');
    console.error('  - DROPBOX_REFRESH_TOKEN + DROPBOX_APP_KEY + DROPBOX_APP_SECRET (recommended)');
    process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());

// Token cache for refresh flow
let tokenCache = {
    accessToken: null,
    expiresAt: null
};

// Function to refresh access token
async function refreshAccessToken() {
    const response = await fetch('https://api.dropbox.com/oauth2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
            client_id: process.env.DROPBOX_APP_KEY,
            client_secret: process.env.DROPBOX_APP_SECRET
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to refresh token: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    tokenCache.accessToken = data.access_token;
    tokenCache.expiresAt = Date.now() + (data.expires_in * 1000) - (5 * 60 * 1000); // 5 min buffer
    console.log('🔑 Access token refreshed, expires in', data.expires_in, 'seconds');
    return data.access_token;
}

// Function to get valid access token
async function getValidAccessToken() {
    if (hasAccessToken && !hasRefreshFlow) {
        return process.env.DROPBOX_ACCESS_TOKEN;
    }
    if (tokenCache.accessToken && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt) {
        return tokenCache.accessToken;
    }
    return refreshAccessToken();
}

// Initialize Dropbox client (will be updated with valid token)
let dbx = null;

async function initDropbox() {
    const token = await getValidAccessToken();
    dbx = new Dropbox({
        accessToken: token,
        fetch: fetch
    });
}

// Cache for images
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
async function getAllImagesFromFolder(folderPath) {
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
async function refreshImageCache() {
    console.log('Refreshing image cache...');
    
    const [baseImages, overlayImages] = await Promise.all([
        getAllImagesFromFolder('/Homepage/large_rectangle_database'),
        getAllImagesFromFolder('/Homepage/small_rectangle_database')
    ]);
    
    imageCache.baseImages = baseImages;
    imageCache.overlayImages = overlayImages;
    imageCache.lastFetch = Date.now();
    
    console.log(`Cached ${baseImages.length} base images and ${overlayImages.length} overlay images`);
}

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Luccas Portfolio API is running' });
});

app.get('/api/images', async (req, res) => {
    try {
        // Check if cache needs refresh
        const needsRefresh = !imageCache.lastFetch || 
                           (Date.now() - imageCache.lastFetch) > imageCache.cacheTimeout ||
                           imageCache.baseImages.length === 0 || 
                           imageCache.overlayImages.length === 0;
        
        if (needsRefresh) {
            await refreshImageCache();
        }
        
        // Return 2 random images (1 base + 1 overlay)
        if (imageCache.baseImages.length === 0 || imageCache.overlayImages.length === 0) {
            return res.status(404).json({ 
                error: 'No images found in Dropbox folders' 
            });
        }
        
        const randomBaseImage = getRandomItem(imageCache.baseImages);
        const randomOverlayImage = getRandomItem(imageCache.overlayImages);
        
        console.log(`Serving random images: ${randomBaseImage.name} + ${randomOverlayImage.name}`);
        
        res.json({
            baseImage: randomBaseImage,
            overlayImage: randomOverlayImage,
            totalCounts: {
                base: imageCache.baseImages.length,
                overlay: imageCache.overlayImages.length
            }
        });
        
    } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).json({ 
            error: 'Failed to fetch images', 
            details: error.message 
        });
    }
});

// Initialize Dropbox and cache on startup
async function startup() {
    await initDropbox();
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📁 Using Dropbox ${hasRefreshFlow ? 'refresh token' : 'access token'} flow`);
    refreshImageCache().catch(console.error);
}

app.listen(PORT, () => {
    startup();
});