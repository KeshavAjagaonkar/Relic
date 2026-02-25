/**
 * hash.test.js — Tests for Content-Addressable Hashing
 * ======================================================
 * 
 * These tests verify THE most critical property of the entire system:
 * DETERMINISM — same input → same hash → always.
 * 
 * If hash determinism breaks, EVERYTHING breaks:
 *   - Deduplication fails (same content stored multiple times)
 *   - Object lookups fail (can't find stored objects)
 *   - Integrity checks fail (hash ≠ filename)
 *   - History becomes unreliable
 */

import { jest } from '@jest/globals';
import { hashObject } from '../../src/core/hash.js';

describe('hashObject', () => {
    test('same content always produces the same hash (determinism)', () => {
        // THE most important test. Run it 100 times if you want — must be identical.
        const { hash: h1 } = hashObject('hello world', 'blob');
        const { hash: h2 } = hashObject('hello world', 'blob');
        expect(h1).toBe(h2);
    });

    test('different content produces different hashes', () => {
        const { hash: h1 } = hashObject('hello', 'blob');
        const { hash: h2 } = hashObject('world', 'blob');
        expect(h1).not.toBe(h2);
    });

    test('different types produce different hashes for same content', () => {
        // "blob 5\0hello" vs "tree 5\0hello" → different hashes
        // This prevents a blob from colliding with a tree that has the same content
        const { hash: blobHash } = hashObject('hello', 'blob');
        const { hash: treeHash } = hashObject('hello', 'tree');
        expect(blobHash).not.toBe(treeHash);
    });

    test('produces a 64-character hex string (SHA-256)', () => {
        const { hash } = hashObject('test', 'blob');
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    test('store buffer contains correct header format', () => {
        const content = 'hello world';
        const { store } = hashObject(content, 'blob');

        // Store format: "blob 11\0hello world"
        const storeStr = store.toString();
        expect(storeStr).toContain('blob 11\0');
        expect(storeStr).toContain('hello world');
    });

    test('header uses byte length, not character length', () => {
        // "é" is 1 character but 2 bytes in UTF-8
        const content = 'café';  // 5 chars, 6 bytes (é = 2 bytes)
        const { store } = hashObject(content, 'blob');

        const nullIdx = store.indexOf(0x00);
        const header = store.slice(0, nullIdx).toString();
        const [type, sizeStr] = header.split(' ');

        expect(type).toBe('blob');
        // Should be byte length (6), not character length (5)
        expect(parseInt(sizeStr)).toBe(Buffer.from('café').length);
    });

    test('accepts Buffer input', () => {
        const buf = Buffer.from('binary data');
        const { hash } = hashObject(buf, 'blob');
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    test('Buffer and string inputs for same content produce same hash', () => {
        const str = 'hello';
        const buf = Buffer.from(str);
        const { hash: h1 } = hashObject(str, 'blob');
        const { hash: h2 } = hashObject(buf, 'blob');
        expect(h1).toBe(h2);
    });
});
