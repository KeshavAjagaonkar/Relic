/**
 * compress.js — zlib Compression Wrapper
 * ========================================
 * 
 * WHY compress objects?
 * ---------------------
 * Three reasons:
 * 
 * 1. STORAGE SAVINGS — Text files compress ~60-70%. A 10KB source file 
 *    becomes ~3-4KB. Over thousands of objects, this adds up massively.
 * 
 * 2. OPAQUE STORAGE — Compressed objects aren't human-readable on disk.
 *    This is CORRECT behavior. Users should read objects through `relic cat-file`,
 *    not by opening files in .relic/objects/. This prevents accidental edits
 *    to the object database.
 * 
 * 3. GIT COMPATIBILITY — Git uses the exact same zlib format (DEFLATE).
 *    This isn't coincidence — zlib is the standard for transparent compression.
 *    It's built into Node.js, Python, Java, almost everything.
 * 
 * WHY deflateSync instead of deflate (async)?
 * --------------------------------------------
 * For a CLI tool, synchronous is simpler and fast enough. Each object 
 * is typically small (a few KB). The async overhead (callbacks, event loop)
 * isn't worth it for files under 1MB. Git also compresses synchronously.
 * 
 * If we were building a server handling thousands of concurrent requests,
 * we'd use the async version. But a CLI tool runs one operation at a time.
 */

import { deflateSync, inflateSync } from 'zlib';

/**
 * Compress a buffer using zlib DEFLATE.
 * 
 * @param {Buffer} buffer - Raw data to compress
 * @returns {Buffer} Compressed data
 */
export function compress(buffer) {
    return deflateSync(buffer);
}

/**
 * Decompress a zlib-compressed buffer.
 * 
 * @param {Buffer} buffer - Compressed data
 * @returns {Buffer} Original raw data
 * 
 * This is the inverse of compress(). The critical property:
 *   decompress(compress(data)) === data
 * If this ever fails, our object store is broken.
 */
export function decompress(buffer) {
    return inflateSync(buffer);
}
