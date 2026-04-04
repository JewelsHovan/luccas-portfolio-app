import { describe, it, expect } from 'vitest';
import {
    isImageFile,
    shuffleArray,
    generateUniquePairs,
    isOriginAllowed,
} from './utils.js';

// ── isImageFile ──────────────────────────────────────────────

describe('isImageFile', () => {
    it('accepts common image extensions', () => {
        expect(isImageFile('photo.jpg')).toBe(true);
        expect(isImageFile('photo.jpeg')).toBe(true);
        expect(isImageFile('photo.png')).toBe(true);
        expect(isImageFile('photo.gif')).toBe(true);
        expect(isImageFile('photo.webp')).toBe(true);
    });

    it('is case-insensitive', () => {
        expect(isImageFile('PHOTO.JPG')).toBe(true);
        expect(isImageFile('Photo.PNG')).toBe(true);
        expect(isImageFile('image.WebP')).toBe(true);
    });

    it('rejects non-image files', () => {
        expect(isImageFile('doc.pdf')).toBe(false);
        expect(isImageFile('script.js')).toBe(false);
        expect(isImageFile('data.json')).toBe(false);
        expect(isImageFile('.DS_Store')).toBe(false);
        expect(isImageFile('README')).toBe(false);
    });

    it('rejects files with image extension in the middle', () => {
        expect(isImageFile('photo.jpg.bak')).toBe(false);
        expect(isImageFile('image.png.tmp')).toBe(false);
    });
});

// ── shuffleArray ─────────────────────────────────────────────

describe('shuffleArray', () => {
    it('returns a new array (does not mutate original)', () => {
        const original = [1, 2, 3, 4, 5];
        const copy = [...original];
        shuffleArray(original);
        expect(original).toEqual(copy);
    });

    it('preserves all elements', () => {
        const input = [1, 2, 3, 4, 5];
        const result = shuffleArray(input);
        expect(result.sort()).toEqual(input.sort());
    });

    it('returns same length', () => {
        expect(shuffleArray([1, 2, 3]).length).toBe(3);
    });

    it('handles empty array', () => {
        expect(shuffleArray([])).toEqual([]);
    });

    it('handles single element', () => {
        expect(shuffleArray([42])).toEqual([42]);
    });
});

// ── generateUniquePairs ──────────────────────────────────────

describe('generateUniquePairs', () => {
    const base = [{ name: 'b1' }, { name: 'b2' }, { name: 'b3' }];
    const overlay = [{ name: 'o1' }, { name: 'o2' }, { name: 'o3' }];

    it('generates Math.max(base, overlay) pairs for equal-length arrays', () => {
        const pairs = generateUniquePairs(base, overlay);
        expect(pairs.length).toBe(3);
    });

    it('each pair has baseImage and overlayImage', () => {
        const pairs = generateUniquePairs(base, overlay);
        for (const pair of pairs) {
            expect(pair).toHaveProperty('baseImage');
            expect(pair).toHaveProperty('overlayImage');
        }
    });

    it('generates max-length pairs when arrays are unequal', () => {
        const smallBase = [{ name: 'b1' }];
        const bigOverlay = [{ name: 'o1' }, { name: 'o2' }, { name: 'o3' }, { name: 'o4' }];
        const pairs = generateUniquePairs(smallBase, bigOverlay);
        expect(pairs.length).toBe(4);
    });

    it('cycles shorter array to fill pairs', () => {
        const smallBase = [{ name: 'b1' }, { name: 'b2' }];
        const bigOverlay = [{ name: 'o1' }, { name: 'o2' }, { name: 'o3' }, { name: 'o4' }];
        const pairs = generateUniquePairs(smallBase, bigOverlay);

        // All base images should appear (shuffled, but all present)
        const baseNames = pairs.map(p => p.baseImage.name);
        expect(baseNames.length).toBe(4);
        // Each base image should appear at least once
        for (const b of smallBase) {
            expect(baseNames).toContain(b.name);
        }
    });

    it('handles single-element arrays', () => {
        const pairs = generateUniquePairs([{ name: 'b1' }], [{ name: 'o1' }]);
        expect(pairs.length).toBe(1);
        expect(pairs[0].baseImage.name).toBe('b1');
        expect(pairs[0].overlayImage.name).toBe('o1');
    });

    it('does not mutate input arrays', () => {
        const baseCopy = [...base];
        const overlayCopy = [...overlay];
        generateUniquePairs(base, overlay);
        expect(base).toEqual(baseCopy);
        expect(overlay).toEqual(overlayCopy);
    });
});

// ── isOriginAllowed ──────────────────────────────────────────

describe('isOriginAllowed', () => {
    // Exact allowlist
    it('allows exact allowlisted origins', () => {
        expect(isOriginAllowed('https://luccas-portfolio.com')).toBe(true);
        expect(isOriginAllowed('http://localhost:5173')).toBe(true);
        expect(isOriginAllowed('http://localhost:3000')).toBe(true);
        expect(isOriginAllowed('http://localhost:3001')).toBe(true);
    });

    // Subdomain matching
    it('allows luccas-portfolio.com subdomains', () => {
        expect(isOriginAllowed('https://www.luccas-portfolio.com')).toBe(true);
        expect(isOriginAllowed('https://staging.luccas-portfolio.com')).toBe(true);
    });

    it('allows pages.dev subdomains', () => {
        expect(isOriginAllowed('https://luccas-portfolio.pages.dev')).toBe(true);
        expect(isOriginAllowed('https://abc123.pages.dev')).toBe(true);
    });

    // Rejections — these are the important security cases
    it('rejects arbitrary origins', () => {
        expect(isOriginAllowed('https://evil.com')).toBe(false);
        expect(isOriginAllowed('https://example.com')).toBe(false);
    });

    it('rejects origins containing allowlisted strings as substrings', () => {
        // These would pass the old substring check but should fail now
        expect(isOriginAllowed('https://evil-luccas-portfolio.com')).toBe(false);
        expect(isOriginAllowed('https://luccas-portfolio.evil.com')).toBe(false);
        expect(isOriginAllowed('https://pages.dev.evil.com')).toBe(false);
        expect(isOriginAllowed('https://notpages.dev')).toBe(false);
    });

    it('rejects null/undefined/empty', () => {
        expect(isOriginAllowed(null)).toBe(false);
        expect(isOriginAllowed(undefined)).toBe(false);
        expect(isOriginAllowed('')).toBe(false);
    });

    it('rejects malformed URLs', () => {
        expect(isOriginAllowed('not-a-url')).toBe(false);
        expect(isOriginAllowed('://missing-scheme')).toBe(false);
    });

    it('rejects wildcard', () => {
        expect(isOriginAllowed('*')).toBe(false);
    });
});
