/**
 * objectStore.test.js — Tests for Object Storage
 * =================================================
 * 
 * Tests the persistence layer: writing objects to disk, reading them back,
 * deduplication, and integrity verification.
 * 
 * Uses temp directories so tests don't pollute the real filesystem
 * and can run in parallel safely.
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { writeObject, readObject, objectExists } from '../../src/storage/objectStore.js';
import { hashObject } from '../../src/core/hash.js';

let tempDir;
let relicDir;

beforeEach(() => {
    // Create a fresh temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relic-test-'));
    relicDir = path.join(tempDir, '.relic');
    fs.mkdirSync(path.join(relicDir, 'objects'), { recursive: true });
});

afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('writeObject + readObject', () => {
    test('write then read produces identical content', () => {
        const content = 'hello world';
        const { hash, store } = hashObject(content, 'blob');

        writeObject(hash, store, relicDir);
        const result = readObject(hash, relicDir);

        expect(result.type).toBe('blob');
        expect(result.content.toString()).toBe(content);
    });

    test('object is stored in correct subdirectory (first 2 chars)', () => {
        const { hash, store } = hashObject('test', 'blob');
        writeObject(hash, store, relicDir);

        const dir = path.join(relicDir, 'objects', hash.slice(0, 2));
        const file = path.join(dir, hash.slice(2));

        expect(fs.existsSync(dir)).toBe(true);
        expect(fs.existsSync(file)).toBe(true);
    });

    test('stored file is compressed (not readable as plain text)', () => {
        const content = 'this should be compressed on disk';
        const { hash, store } = hashObject(content, 'blob');
        writeObject(hash, store, relicDir);

        const filePath = path.join(relicDir, 'objects', hash.slice(0, 2), hash.slice(2));
        const raw = fs.readFileSync(filePath);

        // Raw bytes on disk should NOT contain the original text
        // (because it's zlib compressed)
        expect(raw.toString()).not.toContain(content);
    });

    test('deduplication: writing same content twice creates only one file', () => {
        const { hash, store } = hashObject('duplicate me', 'blob');

        writeObject(hash, store, relicDir);
        writeObject(hash, store, relicDir); // Second write — should be no-op

        // File should exist (just once)
        const filePath = path.join(relicDir, 'objects', hash.slice(0, 2), hash.slice(2));
        expect(fs.existsSync(filePath)).toBe(true);

        // Read it back — should work fine
        const result = readObject(hash, relicDir);
        expect(result.content.toString()).toBe('duplicate me');
    });
});

describe('objectExists', () => {
    test('returns true for existing objects', () => {
        const { hash, store } = hashObject('exists', 'blob');
        writeObject(hash, store, relicDir);

        expect(objectExists(hash, relicDir)).toBe(true);
    });

    test('returns false for non-existing objects', () => {
        expect(objectExists('0'.repeat(64), relicDir)).toBe(false);
    });
});

describe('integrity', () => {
    test('throws on reading non-existent object', () => {
        expect(() => {
            readObject('f'.repeat(64), relicDir);
        }).toThrow();
    });
});
