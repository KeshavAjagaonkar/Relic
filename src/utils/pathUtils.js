/**
 * pathUtils.js — Path Normalization Helpers
 * ==========================================
 * 
 * WHY do we need path normalization?
 * -----------------------------------
 * Windows uses backslashes (\) in paths: C:\Users\file.js
 * Linux/Mac uses forward slashes (/): /home/user/file.js
 * 
 * If we store paths as-is, the SAME repository on Windows and Linux 
 * would produce DIFFERENT tree hashes (because the tree entries contain 
 * filenames). That would mean:
 *   - A commit on Windows ≠ the same commit on Linux
 *   - Push/pull between OS would break
 *   - Hash verification would fail
 * 
 * Solution: ALWAYS store paths with forward slashes internally.
 * Git does the exact same thing.
 */

import path from 'path';

/**
 * Convert any path to use forward slashes.
 * "src\\core\\hash.js" → "src/core/hash.js"
 */
export function normalizePath(filePath) {
    return filePath.split(path.sep).join('/');
}

/**
 * Get the relative path from the repo root, normalized with forward slashes.
 * This is what gets stored in the index and tree objects.
 * 
 * Example:
 *   repoRoot = "C:\\Users\\kesha\\project"
 *   filePath = "C:\\Users\\kesha\\project\\src\\index.js"
 *   result   = "src/index.js"
 */
export function relativePath(repoRoot, filePath) {
    const rel = path.relative(repoRoot, filePath);
    return normalizePath(rel);
}
