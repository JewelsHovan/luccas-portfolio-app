import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Dropbox } from 'dropbox';
import { isImageFile, shuffleArray, generateUniquePairs } from './lib/utils.js';
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

// Recursively list all image paths from a Dropbox folder
async function listImagePaths(folderPath) {
    const imagePaths = [];

    async function scanFolder(path) {
        try {
            let response = await dbx.filesListFolder({ path });

            const processEntries = (entries) => {
                for (const entry of entries) {
                    if (entry['.tag'] === 'file' && isImageFile(entry.name)) {
                        imagePaths.push({ name: entry.name, size: entry.size, path: entry.path_display });
                    } else if (entry['.tag'] === 'folder') {
                        // Queue subfolder for scanning (collected below)
                    }
                }
                return entries.filter(e => e['.tag'] === 'folder').map(e => e.path_display);
            };

            let subfolders = processEntries(response.result.entries);

            while (response.result.has_more) {
                response = await dbx.filesListFolderContinue({ cursor: response.result.cursor });
                subfolders.push(...processEntries(response.result.entries));
            }

            for (const sub of subfolders) {
                await scanFolder(sub);
            }
        } catch (error) {
            console.error(`Error scanning folder ${path}:`, error.message);
        }
    }

    await scanFolder(folderPath);
    return imagePaths;
}

// Get temp links in parallel batches of 25
async function getAllImagesFromFolder(folderPath) {
    const imagePaths = await listImagePaths(folderPath);
    console.log(`Found ${imagePaths.length} images in ${folderPath}`);

    const images = [];
    const batchSize = 25;

    for (let i = 0; i < imagePaths.length; i += batchSize) {
        const batch = imagePaths.slice(i, i + batchSize);
        const results = await Promise.allSettled(
            batch.map(async (item) => {
                const resp = await dbx.filesGetTemporaryLink({ path: item.path });
                return { name: item.name, url: resp.result.link, size: item.size, path: item.path };
            })
        );
        for (const result of results) {
            if (result.status === 'fulfilled') {
                images.push(result.value);
            } else {
                console.error('Error getting temp link:', result.reason?.message);
            }
        }
    }

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