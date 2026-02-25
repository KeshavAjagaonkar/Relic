/**
 * merge.js — Merge Branches
 * ===========================
 * 
 * `relic merge <branch>`
 * 
 * MERGE STRATEGIES:
 * ──────────────────
 * 
 * 1. FAST-FORWARD MERGE (simple case):
 *    When the current branch is a direct ANCESTOR of the target branch.
 *    
 *    Before:  main → C1 ← C2 ← C3 ← feature
 *    After:   main → C1 ← C2 ← C3 ← feature, main
 *    
 *    No new commit needed — just move the main pointer forward.
 *    This is like saying "main, catch up to where feature is."
 * 
 * 2. THREE-WAY MERGE (complex case):
 *    When both branches have diverged from a common ancestor.
 *    
 *    Before:         ← C4 ← C5 ← feature
 *                   /
 *    C1 ← C2 ← C3 
 *                   \
 *                    ← C6 ← main
 *    
 *    Process:
 *    a. Find the common ancestor (C3 — where branches diverged)
 *    b. Compare ancestor→ours (C3 vs C6) and ancestor→theirs (C3 vs C5)
 *    c. For each file:
 *       - Changed only in ours → keep ours
 *       - Changed only in theirs → keep theirs
 *       - Changed in both → CONFLICT (mark with <<<<<<< ======= >>>>>>>)
 *    d. Create merge commit with TWO parents
 *    
 *    After:  C1 ← C2 ← C3 ← C6 ← MERGE_COMMIT ← main
 *                           ↖ C4 ← C5 ↗
 * 
 * WHY THIS IMPRESSES INTERVIEWERS:
 * ──────────────────────────────────
 * Most student VCS projects skip merge entirely. Implementing even 
 * fast-forward merge shows you understand the DAG structure. 
 * Three-way merge with conflict detection is genuinely advanced.
 */

import fs from 'fs';
import path from 'path';
import { readObject, writeObject } from '../storage/objectStore.js';
import { readIndex, writeIndex } from '../storage/indexStore.js';
import { getHEAD, updateRef, resolveRef } from '../storage/refStore.js';
import { parseCommit, createCommit, createTree, createBlob } from '../core/object.js';
import { hashObject } from '../core/hash.js';
import { flattenTree } from './status.js';
import { findRelicRoot, FILE_MODE, DIR_MODE } from '../config/constants.js';
import { NotARepository, MergeConflict } from '../errors.js';

/**
 * Merge a branch into the current branch.
 * 
 * @param {string} branchName - Branch to merge into current
 */
export function mergeCommand(branchName) {
    const repoRoot = findRelicRoot();
    if (!repoRoot) {
        console.error(new NotARepository().message);
        process.exit(1);
    }

    try {
        // Get current HEAD and target branch
        const head = getHEAD();
        if (!head.hash) {
            console.error('fatal: no commits on current branch');
            process.exit(1);
        }

        const targetHash = resolveRef(`refs/heads/${branchName}`);
        if (!targetHash) {
            console.error(`fatal: branch '${branchName}' not found`);
            process.exit(1);
        }

        // Already up to date?
        if (head.hash === targetHash) {
            console.log('Already up to date.');
            return;
        }

        // Check if fast-forward is possible
        // (is current HEAD an ancestor of the target?)
        if (isAncestor(head.hash, targetHash)) {
            fastForwardMerge(head, targetHash, branchName, repoRoot);
            return;
        }

        // Check if target is ancestor of HEAD (already merged)
        if (isAncestor(targetHash, head.hash)) {
            console.log('Already up to date.');
            return;
        }

        // Three-way merge needed
        threeWayMerge(head, targetHash, branchName, repoRoot);
    } catch (err) {
        if (err instanceof MergeConflict) {
            console.error(err.message);
            console.error('Automatic merge failed; fix conflicts and then commit the result.');
        } else {
            console.error('Error during merge:', err.message);
        }
        process.exit(1);
    }
}

/**
 * Fast-forward merge: just move the current branch pointer forward.
 * 
 * No new commit needed — this is the simplest merge case.
 * It's possible when the current branch hasn't diverged from the target.
 */
function fastForwardMerge(head, targetHash, branchName, repoRoot) {
    // Update the branch ref to point to the target commit
    if (head.type === 'branch') {
        updateRef(head.ref, targetHash);
    }

    // Update working directory and index to match the target's tree
    const { content } = readObject(targetHash);
    const commit = parseCommit(content);
    const targetFiles = flattenTree(commit.tree, '');

    // Rebuild working directory
    updateWorkingDirectory(repoRoot, targetFiles);

    // Update index
    const newIndex = { entries: {} };
    for (const [filePath, blobHash] of Object.entries(targetFiles)) {
        newIndex.entries[filePath] = { hash: blobHash, mode: FILE_MODE };
    }
    writeIndex(newIndex);

    console.log(`Updating ${head.hash?.slice(0, 7)}..${targetHash.slice(0, 7)}`);
    console.log(`Fast-forward`);
}

/**
 * Three-way merge: find common ancestor, diff both sides, merge changes.
 */
function threeWayMerge(head, targetHash, branchName, repoRoot) {
    // Step 1: Find common ancestor
    const ancestorHash = findCommonAncestor(head.hash, targetHash);

    if (!ancestorHash) {
        console.error('fatal: refusing to merge unrelated histories');
        process.exit(1);
    }

    // Step 2: Get file maps for all three versions
    const { content: ancestorCommitContent } = readObject(ancestorHash);
    const ancestorCommit = parseCommit(ancestorCommitContent);
    const ancestorFiles = flattenTree(ancestorCommit.tree, '');

    const { content: oursCommitContent } = readObject(head.hash);
    const oursCommit = parseCommit(oursCommitContent);
    const oursFiles = flattenTree(oursCommit.tree, '');

    const { content: theirsCommitContent } = readObject(targetHash);
    const theirsCommit = parseCommit(theirsCommitContent);
    const theirsFiles = flattenTree(theirsCommit.tree, '');

    // Step 3: Merge file by file
    const mergedFiles = {};
    const allPaths = new Set([
        ...Object.keys(ancestorFiles),
        ...Object.keys(oursFiles),
        ...Object.keys(theirsFiles),
    ]);

    const conflicts = [];

    for (const filePath of allPaths) {
        const inAncestor = ancestorFiles[filePath] || null;
        const inOurs = oursFiles[filePath] || null;
        const inTheirs = theirsFiles[filePath] || null;

        if (inOurs === inTheirs) {
            // Both sides agree — no conflict
            if (inOurs) mergedFiles[filePath] = inOurs;
            // If both deleted, file stays deleted (not added to mergedFiles)
        } else if (inOurs === inAncestor) {
            // Only theirs changed — take theirs
            if (inTheirs) mergedFiles[filePath] = inTheirs;
            // If theirs deleted, file stays deleted
        } else if (inTheirs === inAncestor) {
            // Only ours changed — keep ours
            if (inOurs) mergedFiles[filePath] = inOurs;
            // If ours deleted, file stays deleted
        } else {
            // BOTH sides modified — CONFLICT
            conflicts.push(filePath);

            // Create conflict markers in the file
            const oursContent = inOurs ? readObject(inOurs).content.toString() : '';
            const theirsContent = inTheirs ? readObject(inTheirs).content.toString() : '';

            const conflictContent =
                `<<<<<<< HEAD\n` +
                `${oursContent}\n` +
                `=======\n` +
                `${theirsContent}\n` +
                `>>>>>>> ${branchName}\n`;

            // Write the conflicted file and create a blob for it
            const { hash, store } = createBlob(Buffer.from(conflictContent));
            writeObject(hash, store);
            mergedFiles[filePath] = hash;
        }
    }

    // Update working directory with merged content
    updateWorkingDirectory(repoRoot, mergedFiles);

    // Update index
    const newIndex = { entries: {} };
    for (const [filePath, blobHash] of Object.entries(mergedFiles)) {
        newIndex.entries[filePath] = { hash: blobHash, mode: FILE_MODE };
    }
    writeIndex(newIndex);

    if (conflicts.length > 0) {
        // Write conflict files to disk so user can resolve them
        for (const filePath of conflicts) {
            const absPath = path.join(repoRoot, filePath);
            const { content } = readObject(mergedFiles[filePath]);
            fs.mkdirSync(path.dirname(absPath), { recursive: true });
            fs.writeFileSync(absPath, content);
        }
        throw new MergeConflict(conflicts);
    }

    // No conflicts — create merge commit with TWO parents
    const mergedTreeHash = buildMergedTree(mergedFiles);
    const author = 'KeshavAjagaonkar <keshavvamanajagaonkar@gmail.com>';

    // Create commit content manually to support multiple parents
    let commitContent = `tree ${mergedTreeHash}\n`;
    commitContent += `parent ${head.hash}\n`;
    commitContent += `parent ${targetHash}\n`;
    const timestamp = Math.floor(Date.now() / 1000);
    const offsetMinutes = new Date().getTimezoneOffset();
    const sign = offsetMinutes <= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMinutes);
    const hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
    const mins = String(absOffset % 60).padStart(2, '0');
    const timezone = `${sign}${hours}${mins}`;
    commitContent += `author ${author} ${timestamp} ${timezone}\n`;
    commitContent += `committer ${author} ${timestamp} ${timezone}\n`;
    commitContent += `\nMerge branch '${branchName}'\n`;

    const { hash: commitHash, store: commitStore } = hashObject(Buffer.from(commitContent), 'commit');
    writeObject(commitHash, commitStore);

    // Update current branch
    if (head.type === 'branch') {
        updateRef(head.ref, commitHash);
    }

    console.log(`Merge made by the 'recursive' strategy.`);
    console.log(`[${head.ref?.split('/').pop() || 'detached'} ${commitHash.slice(0, 7)}] Merge branch '${branchName}'`);
}

/**
 * Check if `potentialAncestor` is an ancestor of `commitHash`.
 * Walks the parent chain from commitHash looking for potentialAncestor.
 */
function isAncestor(potentialAncestor, commitHash) {
    let current = commitHash;
    const visited = new Set();

    while (current) {
        if (current === potentialAncestor) return true;
        if (visited.has(current)) return false;
        visited.add(current);

        try {
            const { content } = readObject(current);
            const commit = parseCommit(content);
            current = commit.parents.length > 0 ? commit.parents[0] : null;
        } catch {
            return false;
        }
    }

    return false;
}

/**
 * Find the common ancestor of two commits (merge base).
 * 
 * Algorithm: Walk both parent chains, find the first commit that 
 * appears in both chains. This is a simplified BFS approach.
 */
function findCommonAncestor(hash1, hash2) {
    // Collect all ancestors of hash1
    const ancestors1 = new Set();
    let current = hash1;

    while (current) {
        ancestors1.add(current);
        try {
            const { content } = readObject(current);
            const commit = parseCommit(content);
            current = commit.parents.length > 0 ? commit.parents[0] : null;
        } catch {
            break;
        }
    }

    // Walk hash2's chain and find first common ancestor
    current = hash2;
    while (current) {
        if (ancestors1.has(current)) return current;
        try {
            const { content } = readObject(current);
            const commit = parseCommit(content);
            current = commit.parents.length > 0 ? commit.parents[0] : null;
        } catch {
            break;
        }
    }

    return null;
}

/**
 * Update the working directory to match a set of files.
 */
function updateWorkingDirectory(repoRoot, targetFiles) {
    for (const [filePath, blobHash] of Object.entries(targetFiles)) {
        const absPath = path.join(repoRoot, filePath);
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        const { content } = readObject(blobHash);
        fs.writeFileSync(absPath, content);
    }
}

/**
 * Build a tree hierarchy from a flat file map (similar to commit's buildTreeFromIndex).
 */
function buildMergedTree(files) {
    const entries = {};
    for (const [filePath, hash] of Object.entries(files)) {
        entries[filePath] = { hash, mode: FILE_MODE };
    }
    return buildTreeRecursive(entries);
}

function buildTreeRecursive(entries) {
    const groups = {};

    for (const [filePath, { hash, mode }] of Object.entries(entries)) {
        const parts = filePath.split('/');

        if (parts.length === 1) {
            if (!groups.__files__) groups.__files__ = [];
            groups.__files__.push({ mode: mode || FILE_MODE, name: parts[0], hash });
        } else {
            const dir = parts[0];
            const rest = parts.slice(1).join('/');
            if (!groups[dir]) groups[dir] = {};
            groups[dir][rest] = { hash, mode };
        }
    }

    const treeEntries = [];

    if (groups.__files__) {
        treeEntries.push(...groups.__files__);
    }

    for (const [dirName, subEntries] of Object.entries(groups)) {
        if (dirName === '__files__') continue;
        const subTreeHash = buildTreeRecursive(subEntries);
        treeEntries.push({ mode: DIR_MODE, name: dirName, hash: subTreeHash });
    }

    const { hash, store } = createTree(treeEntries);
    writeObject(hash, store);
    return hash;
}
