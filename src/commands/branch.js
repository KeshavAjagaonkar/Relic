/**
 * branch.js — List, Create, or Delete Branches
 * ===============================================
 * 
 * `relic branch`             → list all branches
 * `relic branch <name>`      → create a new branch
 * `relic branch -d <name>`   → delete a branch
 * 
 * WHY BRANCHES ARE "CHEAP":
 * ──────────────────────────
 * In old VCS systems (SVN, Perforce), creating a branch meant COPYING
 * the entire repository. 100MB repo = 100MB for each branch. Expensive.
 * 
 * In Git (and Relic), a branch is a FILE containing a 64-char hash.
 * Creating a branch = writing 64 characters. It takes microseconds.
 * 
 *   .relic/refs/heads/main       → "a1b2c3d4e5f6..."  (64 chars)
 *   .relic/refs/heads/feature    → "a1b2c3d4e5f6..."  (same hash initially)
 *   .relic/refs/heads/bugfix     → "f6e5d4c3b2a1..."  (different commit)
 * 
 * When you create a branch, it starts pointing at the SAME commit 
 * as the current branch. It's just a new pointer, not a new copy.
 * When you make commits on the new branch, only IT moves forward.
 * The old branch stays where it was.
 */

import { getHEAD, listBranches, getCurrentBranch, updateRef, resolveRef } from '../storage/refStore.js';
import { findRelicRoot } from '../config/constants.js';
import { NotARepository, InvalidRef } from '../errors.js';
import fs from 'fs';
import path from 'path';

/**
 * Handle branch operations.
 * 
 * @param {string|undefined} name - Branch name to create (undefined = list branches)
 * @param {string|undefined} deleteBranch - Branch name to delete
 */
export function branchCommand(name, deleteBranch) {
    const repoRoot = findRelicRoot();
    if (!repoRoot) {
        console.error(new NotARepository().message);
        process.exit(1);
    }

    try {
        if (deleteBranch) {
            // Delete branch
            handleDeleteBranch(deleteBranch);
        } else if (name) {
            // Create branch
            handleCreateBranch(name);
        } else {
            // List branches
            handleListBranches();
        }
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}

/**
 * List all branches, highlighting the current one with *.
 */
function handleListBranches() {
    const branches = listBranches();
    const current = getCurrentBranch();

    if (branches.length === 0) {
        console.log('No branches yet. Make a commit to create the default branch.');
        return;
    }

    for (const branch of branches) {
        if (branch === current) {
            console.log(`\x1b[32m* ${branch}\x1b[0m`);  // Green for current
        } else {
            console.log(`  ${branch}`);
        }
    }
}

/**
 * Create a new branch pointing to the current commit.
 * 
 * This is literally writing the current commit hash to a new file.
 * That's all branching is — a new pointer.
 */
function handleCreateBranch(name) {
    const head = getHEAD();

    if (!head.hash) {
        console.error('fatal: not a valid object name: no commits yet');
        process.exit(1);
    }

    // Check if branch already exists
    const existing = resolveRef(`refs/heads/${name}`);
    if (existing) {
        console.error(`fatal: a branch named '${name}' already exists`);
        process.exit(1);
    }

    // Create the branch — just writes the commit hash to a file
    updateRef(`refs/heads/${name}`, head.hash);
    console.log(`Created branch '${name}' at ${head.hash.slice(0, 7)}`);
}

/**
 * Delete a branch.
 */
function handleDeleteBranch(name) {
    const current = getCurrentBranch();

    if (name === current) {
        console.error(`error: Cannot delete branch '${name}' checked out at '${findRelicRoot()}'`);
        process.exit(1);
    }

    const relicDir = path.join(findRelicRoot(), '.relic');
    const refPath = path.join(relicDir, 'refs', 'heads', name);

    if (!fs.existsSync(refPath)) {
        console.error(`error: branch '${name}' not found`);
        process.exit(1);
    }

    const hash = fs.readFileSync(refPath, 'utf-8').trim();
    fs.unlinkSync(refPath);
    console.log(`Deleted branch ${name} (was ${hash.slice(0, 7)})`);
}
