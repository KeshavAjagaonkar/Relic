/**
 * indexStore.js — Staging Area (The "Shopping Cart" of VCS)
 * ==========================================================
 * 
 * WHY do we need a staging area?
 * ──────────────────────────────
 * Without staging, `commit` would take EVERYTHING in the working directory.
 * But sometimes you want to commit only SOME files:
 * 
 *   "I fixed a bug in auth.js AND started a new feature in dashboard.js.
 *    I want to commit JUST the bug fix, not the half-done feature."
 * 
 * The staging area (index) is the "shopping cart" between your working 
 * directory and the commit:
 * 
 *   Working Directory → [relic add] → Index → [relic commit] → Commit
 * 
 * You selectively `add` files to the cart, then `commit` the cart.
 * 
 * WHAT'S IN THE INDEX?
 * ─────────────────────
 * A flat map of (filepath → blob hash):
 * 
 *   {
 *     "src/index.js":      { "hash": "a1b2c3...", "mode": "100644" },
 *     "src/core/hash.js":  { "hash": "d4e5f6...", "mode": "100644" },
 *     "README.md":         { "hash": "789abc...", "mode": "100644" }
 *   }
 * 
 * DESIGN DECISION: JSON vs Binary Format
 * ────────────────────────────────────────
 * Git uses a binary format for the index (for performance with 100K+ files).
 * We use JSON because:
 *   1. DEBUGGABLE — You can open .relic/index and read it with your eyes
 *   2. SIMPLE — JSON.parse/JSON.stringify vs. manual byte manipulation
 *   3. ADEQUATE — For repos under ~10K files, JSON is fast enough
 * 
 * In an interview, you'd say: "I chose JSON for the index format because 
 * debuggability was more important than raw performance for this project's 
 * scale. Git uses binary because it needs to handle repos with millions 
 * of files — a tradeoff I'm aware of."
 */

import fs from 'fs';
import path from 'path';
import { getRelicDir } from '../config/constants.js';
import { NotARepository } from '../errors.js';

/**
 * Read the staging index.
 * 
 * @param {string} [relicDir] - Override .relic directory path
 * @returns {{ entries: Object }} The index object
 * 
 * The index is lazily created — if it doesn't exist, we return an empty one.
 * This is safe because an empty index just means "nothing is staged."
 */
export function readIndex(relicDir = null) {
    const rDir = relicDir || getRelicDir();
    if (!rDir) throw new NotARepository();

    const indexPath = path.join(rDir, 'index');
    if (!fs.existsSync(indexPath)) {
        return { entries: {} };
    }
    return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
}

/**
 * Write the staging index to disk.
 * 
 * @param {Object} index - The index object with entries
 * @param {string} [relicDir] - Override .relic directory path
 */
export function writeIndex(index, relicDir = null) {
    const rDir = relicDir || getRelicDir();
    if (!rDir) throw new NotARepository();

    const indexPath = path.join(rDir, 'index');
    // Pretty-print with 2-space indent for debuggability
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

/**
 * Add a file entry to the staging index.
 * 
 * WHY normalize path separators?
 * ──────────────────────────────
 * On Windows: "src\\core\\hash.js" (backslashes)
 * On Linux:   "src/core/hash.js"   (forward slashes)
 * 
 * If we stored backslashes, the same repo would produce DIFFERENT 
 * index contents (and therefore different tree hashes) on different OSes.
 * We always use forward slashes internally — same as Git.
 * 
 * @param {string} filePath - Relative path (will be normalized to forward slashes)
 * @param {string} blobHash - SHA-256 hash of the file's blob
 * @param {string} [mode='100644'] - File mode
 * @param {string} [relicDir] - Override .relic directory path
 */
export function addToIndex(filePath, blobHash, mode = '100644', relicDir = null) {
    const index = readIndex(relicDir);

    // Normalize path: always use forward slashes
    const normalized = filePath.split(path.sep).join('/');

    index.entries[normalized] = { hash: blobHash, mode };
    writeIndex(index, relicDir);
}

/**
 * Remove a file entry from the staging index.
 * 
 * @param {string} filePath - Relative path to remove
 * @param {string} [relicDir] - Override .relic directory path
 */
export function removeFromIndex(filePath, relicDir = null) {
    const index = readIndex(relicDir);
    const normalized = filePath.split(path.sep).join('/');

    delete index.entries[normalized];
    writeIndex(index, relicDir);
}
