export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

export function isImageFile(name) {
    const lower = name.toLowerCase();
    return IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

export function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

export function generateUniquePairs(baseImages, overlayImages) {
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

/**
 * Check if an origin is allowed by the CORS policy.
 * Returns true for exact allowlist matches, luccas-portfolio subdomains, and pages.dev subdomains.
 */
export function isOriginAllowed(origin) {
    const allowedOrigins = [
        'https://luccas-portfolio.com',
        'https://luccasbooth.com',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5173'
    ];

    if (allowedOrigins.includes(origin)) return true;

    if (!origin) return false;

    try {
        const hostname = new URL(origin).hostname;
        return hostname === 'luccas-portfolio.com' ||
               hostname.endsWith('.luccas-portfolio.com') ||
               hostname === 'luccasbooth.com' ||
               hostname.endsWith('.luccasbooth.com') ||
               hostname.endsWith('.pages.dev');
    } catch (e) {
        return false;
    }
}
