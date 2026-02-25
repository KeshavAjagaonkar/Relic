/**
 * fileWalker.js — Recursive Directory Traversal
 * ================================================
 * 
 * WHY do we need this?
 * --------------------
 * When you run `relic add .`, we need to find EVERY file in the project,
 * recursively through all subdirectories, while skipping ignored paths.
 * 
 * Also used by `relic status` to compare the working directory against 
 * the index (to find modified/untracked files).
 * 
 * This is the "Iterator Pattern" — instead of loading all files into 
 * memory at once (bad for huge repos), we yield them one at a time.
 * But for simplicity, we'll collect them into an array.
 */

import fs from 'fs';
import path from 'path';
import { normalizePath, relativePath } from './pathUtils.js';
import { loadIgnorePatterns, shouldIgnore } from './ignore.js';

/**
 * Recursively walk a directory and return all file paths (relative to repoRoot).
 * Respects .relicignore patterns.
 * 
 * @param {string} repoRoot - Absolute path to the repository root
 * @param {string} [dir] - Directory to walk (defaults to repoRoot)
 * @returns {string[]} Array of relative file paths (forward slashes)
 * 
 * Example output: ["src/index.js", "src/core/hash.js", "README.md"]
 */
export function walkDirectory(repoRoot, dir = repoRoot) {
    const patterns = loadIgnorePatterns(repoRoot);
    const files = [];

    function walk(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            const relPath = relativePath(repoRoot, fullPath);

            // Check if this path should be ignored
            if (shouldIgnore(relPath, patterns)) continue;

            if (entry.isDirectory()) {
                walk(fullPath); // Recurse into subdirectories
            } else if (entry.isFile()) {
                files.push(relPath); // Collect file (relative, normalized)
            }
            // Symlinks, etc. are intentionally skipped
        }
    }

    walk(dir);
    return files;
}
