/**
 * constants.js — Central Configuration
 * =====================================
 * 
 * WHY a constants file?
 * ---------------------
 * Instead of hardcoding ".relic" or "objects" throughout the codebase,
 * we define them ONCE here. This is called the "Single Source of Truth" 
 * principle. If you ever want to rename ".relic" to ".rvcs" or change 
 * the directory layout, you change ONE file — not 20.
 * 
 * Every real project does this. Git has equivalent compile-time constants
 * like GIT_DIR = ".git".
 */

import path from 'path';
import fs from 'fs';

/**
 * Find the .relic directory by walking up from the current directory.
 * This is how Git finds .git/ — it checks the current directory, 
 * then parent, then grandparent, etc. This lets you run `relic status`
 * from any subdirectory of your repo.
 */
export function findRelicRoot(startDir = process.cwd()) {
    let dir = path.resolve(startDir);

    while (true) {
        const relicPath = path.join(dir, '.relic');
        if (fs.existsSync(relicPath)) {
            return dir; // Found it — return the repo root, not the .relic dir
        }

        const parent = path.dirname(dir);
        if (parent === dir) {
            // We've reached the filesystem root (e.g., C:\ or /) — no repo found
            return null;
        }
        dir = parent;
    }
}

/**
 * Get the .relic directory path for the current repo.
 * Returns null if not inside a relic repository.
 */
export function getRelicDir(startDir = process.cwd()) {
    const root = findRelicRoot(startDir);
    if (!root) return null;
    return path.join(root, '.relic');
}

// Directory and file names within .relic/
export const RELIC_DIR_NAME = '.relic';
export const OBJECTS_DIR = 'objects';
export const REFS_DIR = 'refs';
export const HEADS_DIR = path.join('refs', 'heads');
export const HEAD_FILE = 'HEAD';
export const INDEX_FILE = 'index';

// Default branch name (Git recently changed from "master" to "main")
export const DEFAULT_BRANCH = 'main';

// File modes (matching Git's conventions)
// 100644 = regular file (read/write for owner, read for group/others)
// 100755 = executable file
// 040000 = directory (tree object)
export const FILE_MODE = '100644';
export const EXEC_MODE = '100755';
export const DIR_MODE = '040000';
