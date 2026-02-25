/**
 * add.js — Stage Files for Commit
 * ==================================
 * 
 * `relic add <file>` or `relic add .`
 * 
 * WHAT CHANGED FROM YOUR OLD CODE:
 * ──────────────────────────────────
 * Old add.js:  fs.copyFile(source, ".relic/stagging/filename")
 *   → Copies the ENTIRE file into a staging folder
 *   → No hashing, no dedup, just raw file duplication
 *   → Two identical files = stored twice
 * 
 * New add.js:  hash(content) → writeObject() → updateIndex()
 *   → Reads file content, computes SHA-256 hash
 *   → Stores as a compressed blob in .relic/objects/
 *   → Index records: { "src/file.js": { "hash": "abc123...", "mode": "100644" } }
 *   → Two identical files = same hash = stored ONCE (deduplication!)
 * 
 * THE ADD WORKFLOW:
 * ──────────────────
 * 1. Read the file bytes
 * 2. Create a blob: hash("blob <size>\0<content>") → get hash
 * 3. Write blob to object store (compressed, deduped)
 * 4. Update the index to record: filepath → blobHash
 * 
 * After `add`, the file's content is safely stored in the object database
 * and the index knows about it. But NO commit exists yet — the index  
 * is the "staging area" waiting for `relic commit`.
 */

import fs from 'fs';
import path from 'path';
import { createBlob } from '../core/object.js';
import { writeObject } from '../storage/objectStore.js';
import { addToIndex, readIndex, writeIndex } from '../storage/indexStore.js';
import { findRelicRoot } from '../config/constants.js';
import { walkDirectory } from '../utils/fileWalker.js';
import { relativePath } from '../utils/pathUtils.js';
import { NotARepository } from '../errors.js';

/**
 * Add a file (or all files) to the staging area.
 * 
 * @param {string} filePath - File path or "." for all files
 */
export function addCommand(filePath) {
    const repoRoot = findRelicRoot();
    if (!repoRoot) throw new NotARepository();

    try {
        if (filePath === '.') {
            // Add ALL files (respecting .relicignore)
            addAllFiles(repoRoot);
        } else {
            // Add a single file
            addSingleFile(repoRoot, filePath);
        }
    } catch (err) {
        if (err instanceof NotARepository) {
            console.error(err.message);
        } else {
            console.error('Error adding file:', err.message);
        }
        process.exit(1);
    }
}

/**
 * Add a single file to the staging area.
 * 
 * This is the core operation — understand this and you understand 
 * how content-addressable storage works at the most basic level:
 * 
 *   file bytes → SHA-256 hash → store as blob → record in index
 */
function addSingleFile(repoRoot, filePath) {
    const absPath = path.resolve(filePath);

    if (!fs.existsSync(absPath)) {
        console.error(`fatal: pathspec '${filePath}' did not match any files`);
        process.exit(1);
    }

    // Step 1: Read raw file bytes
    const content = fs.readFileSync(absPath);

    // Step 2: Create a blob → hash the content with "blob <size>\0" header
    // This returns { hash, store } where:
    //   hash = 64-char hex string (the content's unique address)
    //   store = the full buffer (header + content) to be compressed
    const { hash, store } = createBlob(content);

    // Step 3: Write to object store → compressed, deduped
    // If this exact content was already added, this is a NO-OP (dedup!)
    writeObject(hash, store);

    // Step 4: Update the index → record "this filepath → this blob hash"
    const relPath = relativePath(repoRoot, absPath);
    addToIndex(relPath, hash);

    console.log(`add '${relPath}'`);
}

/**
 * Add all files in the repository to the staging area.
 * Uses the fileWalker to recursively find files while respecting .relicignore.
 */
function addAllFiles(repoRoot) {
    const files = walkDirectory(repoRoot);

    if (files.length === 0) {
        console.log('No files to add.');
        return;
    }

    // Read index once, then batch all additions
    // This is more efficient than calling addToIndex() for each file
    // (avoids reading + writing the index file N times)
    const index = readIndex();
    let addedCount = 0;

    for (const relPath of files) {
        const absPath = path.join(repoRoot, relPath);
        const content = fs.readFileSync(absPath);
        const { hash, store } = createBlob(content);

        writeObject(hash, store);

        // Normalize the path for the index (forward slashes)
        const normalized = relPath.split(path.sep).join('/');

        // Only count as "added" if the hash actually changed
        // (skip files that are already staged with the same hash)
        if (!index.entries[normalized] || index.entries[normalized].hash !== hash) {
            index.entries[normalized] = { hash, mode: '100644' };
            addedCount++;
        }
    }

    writeIndex(index);
    console.log(`Added ${addedCount} file(s) to staging area (${files.length} total scanned)`);
}
