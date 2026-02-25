/**
 * commit.js — Record Changes to the Repository
 * ===============================================
 * 
 * `relic commit -m "message"`
 * 
 * This is the MOST COMPLEX command. It ties everything together.
 * 
 * WHAT CHANGED FROM YOUR OLD CODE:
 * ──────────────────────────────────
 * Old commit.js:
 *   1. Generate UUID (random, meaningless)
 *   2. Copy all files from .relic/stagging/ to .relic/commits/<uuid>/
 *   3. Write commit.json with message + date
 *   → Every commit duplicates ALL staged files
 *   → No tree structure, no parent chain, no integrity
 * 
 * New commit.js:
 *   1. Read the index (staged files → blob hashes)
 *   2. Build tree hierarchy from flat index entries  ← THE HARD PART
 *   3. Create commit object (tree + parent + author + message)
 *   4. Write commit to object store
 *   5. Update branch ref to point to new commit
 *   → Only new/changed content is stored (dedup via hashing)
 *   → Tree objects capture exact directory state
 *   → Parent chain creates navigable history
 * 
 * THE TREE-BUILDING ALGORITHM:
 * ─────────────────────────────
 * The index is FLAT:
 *   { "src/core/hash.js": blobA, "src/utils/walk.js": blobB, "README.md": blobC }
 * 
 * But a commit needs a TREE HIERARCHY:
 *   root tree → { "src": treeX, "README.md": blobC }
 *   treeX     → { "core": treeY, "utils": treeZ }
 *   treeY     → { "hash.js": blobA }
 *   treeZ     → { "walk.js": blobB }
 * 
 * Algorithm:
 *   1. Group index entries by their first directory component
 *   2. For leaf files (no more /), create blob references
 *   3. For directories, recursively build subtrees
 *   4. Hash each tree → store → use hash as entry in parent tree
 *   5. The final root tree hash goes into the commit object
 */

import path from 'path';
import { createTree, createCommit } from '../core/object.js';
import { writeObject } from '../storage/objectStore.js';
import { readIndex } from '../storage/indexStore.js';
import { getHEAD, updateRef } from '../storage/refStore.js';
import { findRelicRoot, FILE_MODE, DIR_MODE } from '../config/constants.js';
import { NotARepository } from '../errors.js';

/**
 * Create a commit from the current staging index.
 * 
 * @param {string} message - Commit message
 */
export function commitCommand(message) {
    const repoRoot = findRelicRoot();
    if (!repoRoot) {
        console.error(new NotARepository().message);
        process.exit(1);
    }

    try {
        // Step 1: Read the index — what's staged?
        const index = readIndex();
        const entries = Object.entries(index.entries);

        if (entries.length === 0) {
            console.log('nothing to commit (empty index)');
            return;
        }

        // Step 2: Build the tree hierarchy from flat index entries
        // This is the heart of the commit — converting a flat list into nested trees
        const rootTreeHash = buildTreeFromIndex(index.entries);

        // Step 3: Get the current HEAD (this will be the parent of the new commit)
        const head = getHEAD();
        const parentHash = head.hash; // null for the very first commit

        // Step 4: Create the commit object
        // Author format matches Git: "Name <email>"
        const author = 'KeshavAjagaonkar <keshavvamanajagaonkar@gmail.com>';
        const { hash: commitHash, store: commitStore } = createCommit({
            treeHash: rootTreeHash,
            parentHash,
            message,
            author,
        });

        // Step 5: Write commit object to the store
        writeObject(commitHash, commitStore);

        // Step 6: Update the current branch to point to this new commit
        if (head.type === 'branch') {
            updateRef(head.ref, commitHash);
        }

        // Display the result (abbreviated hash, like Git)
        const shortHash = commitHash.slice(0, 7);
        const isRoot = !parentHash;
        console.log(`[${head.ref?.split('/').pop() || 'detached'} ${isRoot ? '(root-commit) ' : ''}${shortHash}] ${message}`);
        console.log(` ${entries.length} file(s) committed`);
    } catch (err) {
        console.error('Error creating commit:', err.message);
        process.exit(1);
    }
}

/**
 * Build a tree hierarchy from flat index entries.
 * 
 * This is the ALGORITHM you need to understand and be able to explain:
 * 
 * Input (flat):
 *   { "src/core/hash.js": hashA, "src/utils/walk.js": hashB, "README.md": hashC }
 * 
 * Process:
 *   1. Group by first path component:
 *      "src" → { "core/hash.js": hashA, "utils/walk.js": hashB }
 *      "README.md" → hashC (leaf file)
 * 
 *   2. For "src", recurse with the remaining paths:
 *      "core" → { "hash.js": hashA }
 *      "utils" → { "walk.js": hashB }
 * 
 *   3. Bottom-up: hash.js is a leaf → tree entry (100644, "hash.js", hashA)
 *      "core" tree = createTree([entry]) → treeHashX
 *      "utils" tree = createTree([entry]) → treeHashY
 *      "src" tree = createTree([core→treeHashX, utils→treeHashY]) → treeHashZ
 *      root tree = createTree([src→treeHashZ, README.md→hashC]) → rootTreeHash
 * 
 * Output: rootTreeHash (the single hash that represents the ENTIRE directory state)
 * 
 * @param {Object} entries - Flat map of { "path/to/file": { hash, mode } }
 * @returns {string} Hash of the root tree object
 */
function buildTreeFromIndex(entries) {
    return buildTreeRecursive(entries);
}

function buildTreeRecursive(entries) {
    // Group entries by their first path component
    const groups = {};

    for (const [filePath, { hash, mode }] of Object.entries(entries)) {
        const parts = filePath.split('/');

        if (parts.length === 1) {
            // Leaf file: "README.md" → direct tree entry pointing to blob
            if (!groups.__files__) groups.__files__ = [];
            groups.__files__.push({ mode: mode || FILE_MODE, name: parts[0], hash });
        } else {
            // Nested path: "src/core/hash.js" → group under "src"
            const dir = parts[0];
            const rest = parts.slice(1).join('/');

            if (!groups[dir]) groups[dir] = {};
            groups[dir][rest] = { hash, mode };
        }
    }

    // Build tree entries
    const treeEntries = [];

    // Add file entries (blobs)
    if (groups.__files__) {
        treeEntries.push(...groups.__files__);
    }

    // Recursively build subtree entries
    for (const [dirName, subEntries] of Object.entries(groups)) {
        if (dirName === '__files__') continue;

        // Recurse: build the subtree for this directory
        const subTreeHash = buildTreeRecursive(subEntries);

        // Add this subtree as an entry with mode 040000 (directory)
        treeEntries.push({ mode: DIR_MODE, name: dirName, hash: subTreeHash });
    }

    // Create the tree object and write it to the object store
    const { hash, store } = createTree(treeEntries);
    writeObject(hash, store);

    return hash;
}
