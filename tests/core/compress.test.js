/**
 * compress.test.js — Tests for zlib Compression
 * ================================================
 * 
 * The critical property: round-trip integrity.
 * decompress(compress(data)) MUST equal data, always.
 */

import { jest } from '@jest/globals';
import { compress, decompress } from '../../src/core/compress.js';

describe('compress/decompress', () => {
    test('round-trip produces identical data', () => {
        const original = Buffer.from('hello world, this is a test of compression');
        const compressed = compress(original);
        const decompressed = decompress(compressed);

        expect(decompressed).toEqual(original);
    });

    test('compressed data is smaller than original for text', () => {
        // Repetitive text compresses very well
        const original = Buffer.from('hello '.repeat(1000));
        const compressed = compress(original);

        expect(compressed.length).toBeLessThan(original.length);
    });

    test('handles empty buffer', () => {
        const original = Buffer.from('');
        const compressed = compress(original);
        const decompressed = decompress(compressed);

        expect(decompressed).toEqual(original);
    });

    test('handles binary data', () => {
        // Random-ish binary data
        const original = Buffer.from([0x00, 0xFF, 0x42, 0x13, 0x37, 0xDE, 0xAD]);
        const compressed = compress(original);
        const decompressed = decompress(compressed);

        expect(decompressed).toEqual(original);
    });

    test('handles large data', () => {
        // 100KB of text
        const original = Buffer.from('A'.repeat(100_000));
        const compressed = compress(original);
        const decompressed = decompress(compressed);

        expect(decompressed).toEqual(original);
        // Repetitive data should compress significantly
        expect(compressed.length).toBeLessThan(original.length / 10);
    });
});
