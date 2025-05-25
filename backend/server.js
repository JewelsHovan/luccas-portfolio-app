import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Dropbox } from 'dropbox';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Check for Dropbox access token
if (!process.env.DROPBOX_ACCESS_TOKEN) {
    console.error('ERROR: DROPBOX_ACCESS_TOKEN not found in environment variables');
    console.error('Please create a .env file with your Dropbox access token');
    process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Dropbox client
const dbx = new Dropbox({ 
    accessToken: process.env.DROPBOX_ACCESS_TOKEN,
    fetch: fetch 
});

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

// Initialize cache on startup
refreshImageCache().catch(console.error);

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log('📁 Using Dropbox access token from environment');
});