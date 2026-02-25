/**
 * checkout.js — Switch Branches or Restore Working Tree
 * =======================================================
 * 
 * `relic checkout <branch>`      → switch to existing branch
 * `relic checkout -b <branch>`   → create + switch to new branch
 * 
 * WHAT CHECKOUT ACTUALLY DOES:
 * ─────────────────────────────
 * 1. Resolve target branch → get its commit hash
 * 2. Read that commit → get its root tree hash
 * 3. Flatten the tree → get all { filepath: blobHash } mappings
 * 4. Update the working directory to match the tree:
 *    - Delete files that shouldn't be there
 *    - Write files that should be there (from blob content)
 * 5. Update the index to match the new tree
 * 6. Update HEAD to point to the new branch
 * 
 * WHY CHECKOUT IS POWERFUL:
 * ──────────────────────────
 * When you `checkout feature`, Relic reads the commit that `feature` 
 * points to, resolves its tree to get every file, and REPLACES your 
 * working directory with those files. It's like time travel — your 
 * filesystem instantly reflects the state at that commit.
 * 
 * The old files aren't lost — they're still safely stored as blobs 
 * in the object store. You can always switch back.
 * 
 * SAFETY: We check for uncommitted changes before checkout to prevent
 * accidentally losing work. Git does the same thing.
 */

import fs from 'fs';
import path from 'path';
import { readObject } from '../storage/objectStore.js';
import { readIndex, writeIndex } from '../storage/indexStore.js';
import { getHEAD, updateHEAD, updateRef, resolveRef } from '../storage/refStore.js';
import { parseCommit } from '../core/object.js';
import { hashObject } from '../core/hash.js';
import { flattenTree } from './status.js';
import { findRelicRoot, FILE_MODE } from '../config/constants.js';
import { NotARepository } from '../errors.js';

/**
 * Checkout a branch or create and checkout a new branch.
 * 
 * @param {string} target - Branch name or commit hash
 * @param {boolean} createBranch - If true, create the branch first
 */
export function checkoutCommand(target, createBranch = false) {
    const repoRoot = findRelicRoot();
    if (!repoRoot) {
        console.error(new NotARepository().message);
        process.exit(1);
    }

    try {
        if (createBranch) {
            // Create the branch first, then switch to it
            const head = getHEAD();
            if (!head.hash) {
                console.error('fatal: cannot create branch before first commit');
                process.exit(1);
            }
            updateRef(`refs/heads/${target}`, head.hash);
            console.log(`Created branch '${target}'`);
        }

        // Resolve the target to a commit hash
        const targetHash = resolveRef(`refs/heads/${target}`);
        if (!targetHash) {
            console.error(`error: pathspec '${target}' did not match any branch known to relic`);
            process.exit(1);
        }

        // Safety check: are there uncommitted changes?
        checkForUncommittedChanges(repoRoot);

        // Read the target commit's tree
        const { content: commitContent } = readObject(targetHash);
        const commit = parseCommit(commitContent);
        const targetFiles = flattenTree(commit.tree, '');

        // Get current files in working directory that are tracked
        const currentIndex = readIndex();
        const currentTracked = Object.keys(currentIndex.entries);

        // Step 1: Remove files that are tracked but shouldn't exist in the target
        for (const filePath of currentTracked) {
            if (!targetFiles[filePath]) {
                const absPath = path.join(repoRoot, filePath);
                if (fs.existsSync(absPath)) {
                    fs.unlinkSync(absPath);
                    // Clean up empty parent directories
                    cleanEmptyDirs(path.dirname(absPath), repoRoot);
                }
            }
        }

        // Step 2: Write/overwrite files from the target tree
        for (const [filePath, blobHash] of Object.entries(targetFiles)) {
            const absPath = path.join(repoRoot, filePath);

            // Create parent directories if needed
            fs.mkdirSync(path.dirname(absPath), { recursive: true });

            // Read the blob content and write to working directory
            const { content } = readObject(blobHash);
            fs.writeFileSync(absPath, content);
        }

        // Step 3: Update the index to match the target tree
        const newIndex = { entries: {} };
        for (const [filePath, blobHash] of Object.entries(targetFiles)) {
            newIndex.entries[filePath] = { hash: blobHash, mode: FILE_MODE };
        }
        writeIndex(newIndex);

        // Step 4: Update HEAD to point to the new branch
        updateHEAD(target);

        console.log(`Switched to branch '${target}'`);
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}

/**
 * Check if there are uncommitted changes that would be lost.
 * Compares working directory against the index for tracked files.
 */
function checkForUncommittedChanges(repoRoot) {
    const index = readIndex();

    for (const [filePath, { hash }] of Object.entries(index.entries)) {
        const absPath = path.join(repoRoot, filePath);

        if (!fs.existsSync(absPath)) continue; // Deleted files are fine

        const content = fs.readFileSync(absPath);
        const { hash: currentHash } = hashObject(content, 'blob');

        if (currentHash !== hash) {
            console.error('error: Your local changes to the following files would be overwritten by checkout:');
            console.error(`\t${filePath}`);
            console.error('Please commit your changes or stash them before you switch branches.');
            process.exit(1);
        }
    }
}

/**
 * Remove empty directories after deleting files.
 * Walks up from the given directory, removing empty dirs until repoRoot.
 */
function cleanEmptyDirs(dirPath, repoRoot) {
    if (dirPath === repoRoot || dirPath === path.dirname(dirPath)) return;

    try {
        const entries = fs.readdirSync(dirPath);
        if (entries.length === 0) {
            fs.rmdirSync(dirPath);
            cleanEmptyDirs(path.dirname(dirPath), repoRoot);
        }
    } catch {
        // Directory doesn't exist or can't be read — that's fine
    }
}
