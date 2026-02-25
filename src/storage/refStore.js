/**
 * refStore.js — Branch and HEAD Management
 * ==========================================
 * 
 * Refs (references) are the human-readable names for commits.
 * Without refs, you'd have to remember:
 *   "My latest work is at commit a1b2c3d4e5f6..."
 * 
 * With refs, you just say: "I'm on the main branch."
 * 
 * HOW BRANCHING ACTUALLY WORKS:
 * ──────────────────────────────
 * A branch is literally a FILE containing a commit hash. That's it.
 * 
 *   .relic/refs/heads/main     → contains: "a1b2c3d4e5f6...\n"
 *   .relic/refs/heads/feature  → contains: "f6e5d4c3b2a1...\n"
 * 
 * Creating a branch = writing 64 characters to a new file.
 * Switching a branch = changing which file HEAD points to.
 * Deleting a branch = deleting a file.
 * 
 * This is WHY branches are "cheap" in Git (and now in Relic).
 * In old VCS systems like SVN, creating a branch meant COPYING the 
 * entire repository. In Git/Relic, it's just a file write.
 * 
 * HEAD — THE "YOU ARE HERE" POINTER:
 * ────────────────────────────────────
 * HEAD tells Relic which branch (or commit) you're currently on.
 * 
 * When on a branch:
 *   HEAD contains: "ref: refs/heads/main"   (symbolic reference)
 * 
 * When detached (checked out a specific commit, not a branch):
 *   HEAD contains: "a1b2c3d4e5f6..."        (raw commit hash)
 * 
 * Symbolic refs are an INDIRECTION — HEAD → branch → commit.
 * This way, when you make a new commit, only the branch file updates.
 * HEAD still says "ref: refs/heads/main", but main now points to 
 * the new commit.
 */

import fs from 'fs';
import path from 'path';
import { getRelicDir } from '../config/constants.js';
import { NotARepository, InvalidRef, RelicError } from '../errors.js';

/**
 * Read and resolve HEAD.
 * 
 * @param {string} [relicDir] - Override .relic directory path
 * @returns {{ type: 'branch'|'detached', ref?: string, hash: string|null }}
 *   - type: 'branch' if HEAD points to a branch, 'detached' if raw hash
 *   - ref: the ref path (e.g., "refs/heads/main") — only for branch type
 *   - hash: the actual commit hash, or null if the branch has no commits yet
 */
export function getHEAD(relicDir = null) {
    const rDir = relicDir || getRelicDir();
    if (!rDir) throw new NotARepository();

    const headPath = path.join(rDir, 'HEAD');
    const headContent = fs.readFileSync(headPath, 'utf-8').trim();

    if (headContent.startsWith('ref: ')) {
        // Symbolic reference: "ref: refs/heads/main"
        const ref = headContent.slice(5); // "refs/heads/main"
        const refPath = path.join(rDir, ref);

        // The branch might exist in HEAD but have no commits yet
        // (freshly initialized repo — branch "main" exists logically, 
        //  but refs/heads/main file doesn't exist yet because no commits)
        if (!fs.existsSync(refPath)) {
            return { type: 'branch', ref, hash: null };
        }

        const hash = fs.readFileSync(refPath, 'utf-8').trim();
        return { type: 'branch', ref, hash };
    }

    // Detached HEAD: raw commit hash
    return { type: 'detached', hash: headContent };
}

/**
 * Update HEAD to point to a branch.
 * 
 * @param {string} branchName - Just the branch name (e.g., "main", not "refs/heads/main")
 * @param {string} [relicDir] - Override .relic directory path
 */
export function updateHEAD(branchName, relicDir = null) {
    const rDir = relicDir || getRelicDir();
    if (!rDir) throw new NotARepository();

    const headPath = path.join(rDir, 'HEAD');
    fs.writeFileSync(headPath, `ref: refs/heads/${branchName}\n`);
}

/**
 * Set HEAD to a raw commit hash (detached HEAD state).
 * 
 * @param {string} commitHash - The commit hash to point to
 * @param {string} [relicDir] - Override .relic directory path
 */
export function detachHEAD(commitHash, relicDir = null) {
    const rDir = relicDir || getRelicDir();
    if (!rDir) throw new NotARepository();

    const headPath = path.join(rDir, 'HEAD');
    fs.writeFileSync(headPath, commitHash + '\n');
}

/**
 * Update a ref to point to a commit hash.
 * 
 * @param {string} refPath - Ref path like "refs/heads/main"
 * @param {string} commitHash - 64-char commit hash
 * @param {string} [relicDir] - Override .relic directory path
 */
export function updateRef(refPath, commitHash, relicDir = null) {
    const rDir = relicDir || getRelicDir();
    if (!rDir) throw new NotARepository();

    const fullPath = path.join(rDir, refPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, commitHash + '\n');
}

/**
 * Read a ref's commit hash.
 * 
 * @param {string} refPath - Ref path like "refs/heads/main"
 * @param {string} [relicDir] - Override .relic directory path
 * @returns {string|null} Commit hash, or null if ref doesn't exist
 */
export function resolveRef(refPath, relicDir = null) {
    const rDir = relicDir || getRelicDir();
    if (!rDir) throw new NotARepository();

    const fullPath = path.join(rDir, refPath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, 'utf-8').trim();
}

/**
 * List all branches.
 * 
 * @param {string} [relicDir] - Override .relic directory path
 * @returns {string[]} Array of branch names
 */
export function listBranches(relicDir = null) {
    const rDir = relicDir || getRelicDir();
    if (!rDir) throw new NotARepository();

    const headsDir = path.join(rDir, 'refs', 'heads');
    if (!fs.existsSync(headsDir)) return [];
    return fs.readdirSync(headsDir);
}

/**
 * Get the current branch name.
 * 
 * @param {string} [relicDir] - Override .relic directory path
 * @returns {string|null} Branch name (e.g., "main"), or null if detached
 */
export function getCurrentBranch(relicDir = null) {
    const head = getHEAD(relicDir);
    if (head.type === 'branch') {
        // "refs/heads/main" → "main"
        return head.ref.split('/').pop();
    }
    return null; // Detached HEAD — not on any branch
}

/**
 * Delete a branch.
 * 
 * @param {string} branchName - Branch to delete
 * @param {string} [relicDir] - Override .relic directory path
 */
export function deleteBranch(branchName, relicDir = null) {
    const rDir = relicDir || getRelicDir();
    if (!rDir) throw new NotARepository();

    const currentBranch = getCurrentBranch(rDir);
    if (branchName === currentBranch) {
        throw new RelicError(`error: Cannot delete the branch '${branchName}' which you are currently on.`);
    }

    const refPath = path.join(rDir, 'refs', 'heads', branchName);
    if (!fs.existsSync(refPath)) {
        throw new InvalidRef(branchName);
    }
    fs.unlinkSync(refPath);
}
