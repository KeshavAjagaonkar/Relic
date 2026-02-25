/**
 * objectStore.js — Read/Write Objects to Disk
 * =============================================
 * 
 * This is the persistence layer for the object database.
 * It sits BETWEEN the core objects (hash/blob/tree/commit) and the filesystem.
 * 
 * STORAGE LAYOUT:
 * ───────────────
 * .relic/objects/ab/cdef1234567890...
 *                ^^  ^^^^^^^^^^^^^^
 *         first 2 chars  remaining chars
 * 
 * WHY split by first 2 hex chars?
 * ────────────────────────────────
 * Filesystems slow down when a single directory has thousands of files.
 * With 256 possible first-2-char combinations (00-ff), objects are 
 * distributed across 256 subdirectories. Each subdirectory holds ~1/256th
 * of all objects. Git does exactly this.
 * 
 * The math: 100,000 objects / 256 dirs = ~390 files per dir = fast.
 * Without splitting: 100,000 files in one dir = slow directory listings.
 * 
 * THE DEDUP MAGIC:
 * ─────────────────
 * The `writeObject` function checks if the file already exists BEFORE 
 * writing. If it does → the object was already stored → skip the write.
 * 
 * This is where deduplication happens:
 *   - You commit 100 files, only 1 changed
 *   - `add` creates blobs for all 100 files
 *   - 99 blob files already exist → 99 writes are skipped
 *   - Only 1 new blob is actually written to disk
 * 
 * This is the ENTIRE reason we use content-addressable storage.
 * With UUIDs (the old approach), every commit rewrites every file.
 */

import fs from 'fs';
import path from 'path';
import { compress, decompress } from '../core/compress.js';
import { hashObject } from '../core/hash.js';
import { getRelicDir } from '../config/constants.js';
import { ObjectCorrupted, NotARepository } from '../errors.js';

/**
 * Write an object to the object store.
 * 
 * @param {string} hash - 64-char hex hash (the object's address)
 * @param {Buffer} storeBuffer - The full content to store (header + content)
 * @param {string} [relicDir] - Override .relic directory path (for testing)
 * @returns {string} The hash (for chaining)
 * 
 * DEDUPLICATION: If the object already exists, this is a NO-OP.
 * The hash IS the content's fingerprint — if the file exists, it's 
 * guaranteed to contain the exact same bytes.
 */
export function writeObject(hash, storeBuffer, relicDir = null) {
    const rDir = relicDir || getRelicDir();
    if (!rDir) throw new NotARepository();

    const dir = path.join(rDir, 'objects', hash.slice(0, 2));
    const filePath = path.join(dir, hash.slice(2));

    // DEDUP CHECK: This single line is the heart of content-addressable storage.
    // If a file with this hash already exists, we KNOW it has the same content
    // (because identical content → identical hash), so we skip the write entirely.
    if (fs.existsSync(filePath)) return hash;

    // Create the subdirectory if needed (e.g., .relic/objects/ab/)
    fs.mkdirSync(dir, { recursive: true });

    // Compress before writing (saves ~60-70% for text files)
    fs.writeFileSync(filePath, compress(storeBuffer));

    return hash;
}

/**
 * Read an object from the object store.
 * 
 * @param {string} hash - 64-char hex hash to look up
 * @param {string} [relicDir] - Override .relic directory path (for testing)
 * @returns {{ type: string, content: Buffer }} Parsed object
 * 
 * Process: read file → decompress → parse header → validate → return
 * 
 * INTEGRITY CHECK: We verify that the content length matches the header.
 * If they don't match, the object was corrupted (bit rot, disk failure, 
 * manual tampering). This is one of the "free" benefits of the header format.
 */
export function readObject(hash, relicDir = null) {
    const rDir = relicDir || getRelicDir();
    if (!rDir) throw new NotARepository();

    const filePath = path.join(rDir, 'objects', hash.slice(0, 2), hash.slice(2));

    if (!fs.existsSync(filePath)) {
        throw new Error(`fatal: object ${hash} not found`);
    }

    // Read compressed data, then decompress
    const compressed = fs.readFileSync(filePath);
    const raw = decompress(compressed);

    // Parse the header: "blob 12\0..."
    // Find the null byte that separates header from content
    const nullIndex = raw.indexOf(0x00);
    if (nullIndex === -1) {
        throw new ObjectCorrupted(hash);
    }

    const header = raw.slice(0, nullIndex).toString();
    const [type, sizeStr] = header.split(' ');
    const content = raw.slice(nullIndex + 1);

    // INTEGRITY VALIDATION: content length must match header
    const expectedSize = parseInt(sizeStr, 10);
    if (content.length !== expectedSize) {
        throw new ObjectCorrupted(hash);
    }

    return { type, content };
}

/**
 * Check if an object exists in the store.
 * 
 * @param {string} hash - Hash to check
 * @param {string} [relicDir] - Override .relic directory path
 * @returns {boolean}
 */
export function objectExists(hash, relicDir = null) {
    const rDir = relicDir || getRelicDir();
    if (!rDir) return false;

    const filePath = path.join(rDir, 'objects', hash.slice(0, 2), hash.slice(2));
    return fs.existsSync(filePath);
}
