import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Dropbox } from 'dropbox';
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
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001']
}));

// Initialize Dropbox client
const dbx = new Dropbox({
    accessToken: process.env.DROPBOX_ACCESS_TOKEN
});

// Cache for images
let imageCache = {
    baseImages: [],
    overlayImages: [],
    lastFetch: null,
    cacheTimeout: 4 * 60 * 60 * 1000 // 4 hours (temp links expire)
};

// Cache for collections
let collectionsCache = {
    sketchbooks: { images: [], lastFetch: null },
    paintings: { images: [], lastFetch: null },
    photo: { images: [], lastFetch: null },
    cacheTimeout: 4 * 60 * 60 * 1000
};

// Pairs queue for unique image combinations
let pairsQueue = {
    queue: [],
    currentIndex: 0
};

// Function to get random item from array
function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// Fisher-Yates shuffle
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function generateUniquePairs(baseImages, overlayImages) {
    const shuffledBase = shuffleArray(baseImages);
    const shuffledOverlay = shuffleArray(overlayImages);
    const pairs = [];
    const maxPairs = Math.max(shuffledBase.length, shuffledOverlay.length);
    for (let i = 0; i < maxPairs; i++) {
        pairs.push({
            baseImage: shuffledBase[i % shuffledBase.length],
            overlayImage: shuffledOverlay[i % shuffledOverlay.length]
        });
    }
    return pairs;
}

function refreshPairsQueue() {
    if (imageCache.baseImages.length === 0 || imageCache.overlayImages.length === 0) return false;
    pairsQueue.queue = generateUniquePairs(imageCache.baseImages, imageCache.overlayImages);
    pairsQueue.currentIndex = 0;
    return true;
}

function getNextPairFromQueue() {
    if (pairsQueue.queue.length === 0 || pairsQueue.currentIndex >= pairsQueue.queue.length) {
        if (!refreshPairsQueue()) return null;
    }
    const pair = pairsQueue.queue[pairsQueue.currentIndex];
    pairsQueue.currentIndex++;
    return pair;
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
        const needsRefresh = !imageCache.lastFetch ||
                           (Date.now() - imageCache.lastFetch) > imageCache.cacheTimeout ||
                           imageCache.baseImages.length === 0 ||
                           imageCache.overlayImages.length === 0;

        if (needsRefresh) {
            await refreshImageCache();
        }

        if (imageCache.baseImages.length === 0 || imageCache.overlayImages.length === 0) {
            return res.status(404).json({ error: 'No images found in Dropbox folders' });
        }

        res.json({
            baseImages: imageCache.baseImages,
            overlayImages: imageCache.overlayImages,
            totalCounts: {
                base: imageCache.baseImages.length,
                overlay: imageCache.overlayImages.length
            },
            cached: !needsRefresh
        });

    } catch (error) {
        console.error('Error fetching images:', error.message);
        res.status(500).json({ error: 'Failed to fetch images' });
    }
});

app.get('/api/generateOverlay', async (req, res) => {
    try {
        // Ensure cache is populated
        if (imageCache.baseImages.length === 0 || imageCache.overlayImages.length === 0) {
            await refreshImageCache();
        }

        if (imageCache.baseImages.length === 0 || imageCache.overlayImages.length === 0) {
            return res.status(404).json({ error: 'No images found in cache' });
        }

        const pair = getNextPairFromQueue();
        if (!pair) {
            return res.status(500).json({ error: 'Failed to get image pair from queue' });
        }

        res.json({
            baseImage: pair.baseImage,
            overlayImage: pair.overlayImage,
            queueInfo: {
                currentPosition: pairsQueue.currentIndex,
                totalPairs: pairsQueue.queue.length,
                remainingPairs: pairsQueue.queue.length - pairsQueue.currentIndex
            }
        });
    } catch (error) {
        console.error('Error generating overlay:', error);
        res.status(500).json({ error: 'Failed to generate overlay' });
    }
});

// Generic collection endpoint handler
async function handleCollectionRequest(collectionName, folderPath, req, res) {
    try {
        const cache = collectionsCache[collectionName];
        const needsRefresh = !cache.lastFetch ||
                           (Date.now() - cache.lastFetch) > collectionsCache.cacheTimeout ||
                           cache.images.length === 0;

        if (needsRefresh) {
            console.log(`Fetching fresh ${collectionName} images...`);
            const images = await getAllImagesFromFolder(folderPath);
            cache.images = images;
            cache.lastFetch = Date.now();
            console.log(`Cached ${images.length} ${collectionName} images`);
        }

        res.json({
            images: cache.images,
            totalCount: cache.images.length,
            cached: !needsRefresh
        });
    } catch (error) {
        console.error(`Error fetching ${collectionName}:`, error);
        res.status(500).json({ error: `Failed to fetch ${collectionName}` });
    }
}

app.get('/api/sketchbooks', (req, res) => handleCollectionRequest('sketchbooks', '/Sketchbooks', req, res));
app.get('/api/paintings', (req, res) => handleCollectionRequest('paintings', '/Paintings', req, res));
app.get('/api/photo', (req, res) => handleCollectionRequest('photo', '/Photo', req, res));

// Initialize cache on startup
refreshImageCache().catch(console.error);

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});