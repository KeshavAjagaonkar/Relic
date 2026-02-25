/**
 * hash.js — The Foundation of Everything
 * ========================================
 * 
 * This is the SINGLE MOST IMPORTANT file in the entire project.
 * Every other module depends on this one.
 * 
 * THE BIG IDEA: Content-Addressable Storage
 * -------------------------------------------
 * In your old code, you used UUIDs: random strings like "a7b3c9d2-..."
 * The problem? Two identical files get different UUIDs. You can't tell
 * if content was corrupted. You can't deduplicate.
 * 
 * Content-addressable storage flips this: the CONTENT determines the ADDRESS.
 *   address = hash(content)
 * 
 * This gives you THREE superpowers for free:
 * 
 * 1. DEDUPLICATION — If two files have the same content (even with 
 *    different names), hash(content) is identical, so we store it ONCE.
 *    100 commits where only 1 file changed? 99 blobs are reused.
 * 
 * 2. INTEGRITY — The filename IS the checksum. If someone corrupts a file 
 *    on disk, hash(corrupted) ≠ filename → we detect it automatically.
 *    UUIDs can't do this — a corrupted file still has the same UUID.
 * 
 * 3. IMMUTABILITY — You can't change an object without changing its hash,
 *    which changes its address. This means objects are append-only.
 *    History can never be silently altered.
 * 
 * WHY SHA-256 instead of SHA-1?
 * ------------------------------
 * Git uses SHA-1 (20 bytes / 40 hex chars). But SHA-1 has known collision
 * attacks (Google's SHAttered, 2017). Git is actually migrating to SHA-256.
 * We use SHA-256 from the start (32 bytes / 64 hex chars).
 * 
 * WHY the header format?
 * -----------------------
 * We don't just hash the raw content. We prepend: "<type> <byteLength>\0"
 * 
 * Example: blob containing "hello world\n" (12 bytes) becomes:
 *   "blob 12\0hello world\n"
 * 
 * Three reasons for this:
 * 1. TYPE PREFIX — prevents collisions between types. A blob containing
 *    "tree 0" won't collide with an actual empty tree, because the 
 *    full stored content would be "blob 6\0tree 0" vs "tree 0\0".
 * 
 * 2. SIZE — allows validation before reading the full content.
 *    "I expect 12 bytes, but I got 11 → corrupt!"
 * 
 * 3. NULL BYTE (\0) — unambiguous separator. The null byte can't appear 
 *    in the type name or size number, so parsing is deterministic.
 */

import { createHash } from 'crypto';

/**
 * Hash content with a Git-style header, using SHA-256.
 * 
 * @param {Buffer|string} content - The raw content to hash
 * @param {string} type - Object type: 'blob', 'tree', or 'commit'
 * @returns {{ hash: string, store: Buffer }}
 *   - hash: 64-char hex string (the content's address)
 *   - store: the full buffer (header + content) to write to disk
 * 
 * CRITICAL: `store` is what gets written to disk (after compression).
 * You hash `store`, not just `content`. This means the type and size 
 * are part of the hash — changing the type changes the hash.
 */
export function hashObject(content, type = 'blob') {
    // Ensure we're working with a Buffer (raw bytes), not a string.
    // WHY? Because string.length counts characters, but Buffer.length 
    // counts bytes. For UTF-8, "é" is 1 character but 2 bytes.
    // The header must contain the BYTE length, not the character length.
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);

    // Build the header: "blob 12\0"
    const header = `${type} ${buffer.length}\0`;

    // Concatenate header + content into the "store" buffer
    // This is EXACTLY what gets saved to disk (before compression)
    const store = Buffer.concat([Buffer.from(header), buffer]);

    // Hash the entire store buffer
    const hash = createHash('sha256').update(store).digest('hex');

    return { hash, store };
}
