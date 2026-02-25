/**
 * init.js — Initialize a New Relic Repository
 * ==============================================
 * 
 * This is the first command a user runs: `relic init`
 * 
 * It creates the .relic/ directory structure that serves as the "database"
 * for all version control data. Think of it as creating an empty database
 * with the correct schema — no data yet, but the structure is ready.
 * 
 * WHAT GETS CREATED:
 * ──────────────────
 * .relic/
 * ├── objects/         ← Where all blobs, trees, commits live
 * ├── refs/
 * │   └── heads/       ← One file per branch (each containing a commit hash)
 * ├── HEAD             ← "You are here" pointer → refs/heads/main
 * └── index            ← Staging area (empty initially)
 * 
 * COMPARISON WITH YOUR OLD CODE:
 * ──────────────────────────────
 * Old init.js created: .relic/commits/ + config.json (S3 bucket placeholder)
 * New init.js creates: the full Git-like directory structure with:
 *   - objects/ (content-addressable store, not commits folder)
 *   - refs/heads/ (branches as files, not UUIDs)
 *   - HEAD (tracks current branch, not just latest commit)
 *   - index (staging area — your old code put files in a "stagging" folder)
 */

import fs from 'fs';
import path from 'path';
import { RELIC_DIR_NAME, OBJECTS_DIR, HEADS_DIR, HEAD_FILE, INDEX_FILE, DEFAULT_BRANCH } from '../config/constants.js';

/**
 * Initialize a new relic repository in the current directory.
 */
export function initCommand() {
    const repoRoot = process.cwd();
    const relicPath = path.join(repoRoot, RELIC_DIR_NAME);

    // Don't re-initialize an existing repository
    if (fs.existsSync(relicPath)) {
        console.log(`Reinitialized existing relic repository in ${relicPath}`);
        return;
    }

    try {
        // Create directory structure
        fs.mkdirSync(path.join(relicPath, OBJECTS_DIR), { recursive: true });
        fs.mkdirSync(path.join(relicPath, HEADS_DIR), { recursive: true });

        // Create HEAD → points to main branch (but main doesn't exist yet — 
        // it will be created on the first commit)
        // This is a "symbolic reference": HEAD doesn't contain a hash,
        // it contains a POINTER to a branch file.
        fs.writeFileSync(
            path.join(relicPath, HEAD_FILE),
            `ref: refs/heads/${DEFAULT_BRANCH}\n`
        );

        // Create empty index (no files staged yet)
        fs.writeFileSync(
            path.join(relicPath, INDEX_FILE),
            JSON.stringify({ entries: {} }, null, 2)
        );

        console.log(`Initialized empty relic repository in ${relicPath}`);
    } catch (err) {
        console.error('Error initializing repository:', err.message);
        process.exit(1);
    }
}
