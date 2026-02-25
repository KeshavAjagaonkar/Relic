/**
 * status.js — Show Working Tree Status
 * =======================================
 * 
 * `relic status`
 * 
 * This command performs a THREE-WAY COMPARISON:
 * 
 *   ┌──────────────────┐    ┌─────────┐    ┌──────────────────┐
 *   │  Working Directory │    │  Index   │    │  Last Commit Tree │
 *   │  (actual files)    │ vs │ (staged) │ vs │  (committed)       │
 *   └──────────────────┘    └─────────┘    └──────────────────┘
 *         ↕                       ↕
 *   "Changes not staged"    "Changes to be committed"
 *         +
 *   "Untracked files"
 * 
 * Comparison 1: Index vs Last Commit
 *   → Files that are STAGED and ready to commit
 *   → Shows: new files added, modified files, deleted files
 * 
 * Comparison 2: Working Directory vs Index
 *   → Files that have been MODIFIED since staging
 *   → Shows: modified since add, deleted since add
 * 
 * Untracked: Files in the working directory but NOT in the index
 *   → New files that haven't been `relic add`ed yet
 * 
 * WHY THREE-WAY?
 * ──────────────
 * Consider this scenario:
 *   1. You edit file.js
 *   2. You run `relic add file.js` (stages it)
 *   3. You edit file.js AGAIN (more changes after staging)
 * 
 * Now: working dir ≠ index ≠ last commit
 *   - Index vs commit → "file.js: staged for commit" (change from step 2)
 *   - Working vs index → "file.js: modified" (change from step 3)
 * 
 * Without three-way, you'd lose visibility into this state.
 */

import fs from 'fs';
import path from 'path';
import { readObject } from '../storage/objectStore.js';
import { readIndex } from '../storage/indexStore.js';
import { getHEAD, getCurrentBranch } from '../storage/refStore.js';
import { parseTree, parseCommit } from '../core/object.js';
import { hashObject } from '../core/hash.js';
import { findRelicRoot } from '../config/constants.js';
import { walkDirectory } from '../utils/fileWalker.js';
import { NotARepository } from '../errors.js';

/**
 * Show working tree status.
 */
export function statusCommand() {
    const repoRoot = findRelicRoot();
    if (!repoRoot) {
        console.error(new NotARepository().message);
        process.exit(1);
    }

    const currentBranch = getCurrentBranch();
    console.log(`On branch ${currentBranch || '(detached HEAD)'}`);

    // Get the committed tree (flat file → hash map from last commit)
    const committedFiles = getCommittedFiles(repoRoot);

    // Get the staged files (from the index)
    const index = readIndex();
    const stagedFiles = index.entries;

    // Get working directory files
    const workingFiles = walkDirectory(repoRoot);

    // === Comparison 1: Index vs Last Commit ===
    // These are "Changes to be committed"
    const staged = { added: [], modified: [], deleted: [] };

    for (const [filePath, { hash }] of Object.entries(stagedFiles)) {
        if (!committedFiles[filePath]) {
            staged.added.push(filePath);      // In index but not in last commit
        } else if (committedFiles[filePath] !== hash) {
            staged.modified.push(filePath);   // In both but hash differs
        }
    }
    for (const filePath of Object.keys(committedFiles)) {
        if (!stagedFiles[filePath]) {
            staged.deleted.push(filePath);    // In last commit but not in index
        }
    }

    // === Comparison 2: Working Directory vs Index ===
    // These are "Changes not staged for commit"
    const unstaged = { modified: [], deleted: [] };

    for (const [filePath, { hash }] of Object.entries(stagedFiles)) {
        const absPath = path.join(repoRoot, filePath);
        if (!fs.existsSync(absPath)) {
            unstaged.deleted.push(filePath);  // In index but file is gone
        } else {
            // Hash the current file content and compare with index
            const content = fs.readFileSync(absPath);
            const { hash: currentHash } = hashObject(content, 'blob');
            if (currentHash !== hash) {
                unstaged.modified.push(filePath); // File changed since `add`
            }
        }
    }

    // === Untracked files ===
    // Files in working directory but not in the index
    const untracked = workingFiles.filter(f => !stagedFiles[f]);

    // === Display results ===
    const hasStaged = staged.added.length + staged.modified.length + staged.deleted.length > 0;
    const hasUnstaged = unstaged.modified.length + unstaged.deleted.length > 0;
    const hasUntracked = untracked.length > 0;

    if (hasStaged) {
        console.log('\nChanges to be committed:');
        console.log('  (use "relic commit" to commit)\n');
        for (const f of staged.added) console.log(`\x1b[32m\tnew file:   ${f}\x1b[0m`);
        for (const f of staged.modified) console.log(`\x1b[32m\tmodified:   ${f}\x1b[0m`);
        for (const f of staged.deleted) console.log(`\x1b[32m\tdeleted:    ${f}\x1b[0m`);
    }

    if (hasUnstaged) {
        console.log('\nChanges not staged for commit:');
        console.log('  (use "relic add <file>" to update what will be committed)\n');
        for (const f of unstaged.modified) console.log(`\x1b[31m\tmodified:   ${f}\x1b[0m`);
        for (const f of unstaged.deleted) console.log(`\x1b[31m\tdeleted:    ${f}\x1b[0m`);
    }

    if (hasUntracked) {
        console.log('\nUntracked files:');
        console.log('  (use "relic add <file>" to include in what will be committed)\n');
        for (const f of untracked) console.log(`\x1b[31m\t${f}\x1b[0m`);
    }

    if (!hasStaged && !hasUnstaged && !hasUntracked) {
        console.log('\nnothing to commit, working tree clean');
    }
}

/**
 * Get a flat map of all files in the last commit's tree.
 * 
 * Walks the tree hierarchy recursively:
 *   root tree → subtrees → blobs → collect all { path: hash } pairs
 * 
 * @param {string} repoRoot - Repository root path
 * @returns {Object} Map of { "filepath": "blobHash" }
 */
function getCommittedFiles(repoRoot) {
    const head = getHEAD();
    if (!head.hash) return {}; // No commits yet

    // Read the commit → get tree hash
    const { content: commitContent } = readObject(head.hash);
    const commit = parseCommit(commitContent);

    // Recursively walk the tree to get all file paths
    return flattenTree(commit.tree, '');
}

/**
 * Recursively flatten a tree object into a map of { path: blobHash }.
 * 
 * @param {string} treeHash - Hash of the tree to flatten
 * @param {string} prefix - Current path prefix (for building full paths)
 * @returns {Object} Map of { "path/to/file": "blobHash" }
 */
export function flattenTree(treeHash, prefix) {
    const { content } = readObject(treeHash);
    const entries = parseTree(content);
    const files = {};

    for (const entry of entries) {
        const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.mode === '040000') {
            // Subtree → recurse
            const subFiles = flattenTree(entry.hash, fullPath);
            Object.assign(files, subFiles);
        } else {
            // Blob → leaf file
            files[fullPath] = entry.hash;
        }
    }

    return files;
}
