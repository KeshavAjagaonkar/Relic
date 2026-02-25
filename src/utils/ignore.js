/**
 * ignore.js — .relicignore Parsing
 * ==================================
 * 
 * WHY do we need an ignore system?
 * ---------------------------------
 * Without it, `relic add .` would add:
 *   - node_modules/ (thousands of files you don't own)
 *   - .relic/ itself (storing the VCS inside the VCS = recursion hell)
 *   - .env files (secrets leaked into version control)
 *   - *.log files (noise)
 * 
 * Git uses .gitignore. We use .relicignore with the same glob syntax.
 * 
 * HOW glob patterns work:
 *   "node_modules/"  → ignore any directory named node_modules
 *   "*.log"          → ignore any file ending in .log
 *   ".env"           → ignore exactly .env
 *   "build/"         → ignore the build directory
 * 
 * We use the `minimatch` library (same one npm uses internally) 
 * to match glob patterns against file paths.
 */

import fs from 'fs';
import path from 'path';
import { minimatch } from 'minimatch';

// These are ALWAYS ignored, even without a .relicignore file.
// You should NEVER version-control these.
const BUILTIN_IGNORES = [
    '.relic',        // The VCS itself
    '.relic/**',
    '.git',          // If the project also uses git
    '.git/**',
    'node_modules',  // Dependencies
    'node_modules/**',
];

/**
 * Load ignore patterns from .relicignore file.
 * Returns an array of glob patterns.
 */
export function loadIgnorePatterns(repoRoot) {
    const ignorePath = path.join(repoRoot, '.relicignore');
    let patterns = [...BUILTIN_IGNORES];

    if (fs.existsSync(ignorePath)) {
        const content = fs.readFileSync(ignorePath, 'utf-8');
        const lines = content.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#')); // Skip empty lines and comments

        patterns = patterns.concat(lines);
    }

    return patterns;
}

/**
 * Check if a relative path should be ignored.
 * 
 * @param {string} relativePath - Path relative to repo root (forward slashes)
 * @param {string[]} patterns - Array of glob patterns
 * @returns {boolean} true if the path should be ignored
 */
export function shouldIgnore(relativePath, patterns) {
    for (const pattern of patterns) {
        // Match against both the full path and just the filename/dirname
        if (minimatch(relativePath, pattern, { dot: true })) return true;

        // Also check if any path component matches (for patterns like "node_modules")
        const parts = relativePath.split('/');
        for (const part of parts) {
            if (minimatch(part, pattern, { dot: true })) return true;
        }
    }
    return false;
}
