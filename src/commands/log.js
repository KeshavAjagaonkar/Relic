/**
 * log.js — Show Commit History
 * ==============================
 * 
 * `relic log`
 * 
 * HOW COMMIT HISTORY WORKS:
 * ──────────────────────────
 * Commits form a LINKED LIST via parent hashes:
 * 
 *   commit C3 → parent: C2 → parent: C1 → parent: null (first commit)
 * 
 * To show history, we just "walk the chain":
 *   1. Read HEAD → get current commit hash
 *   2. Read that commit → display it → get its parent hash
 *   3. Read parent commit → display → get ITS parent
 *   4. Repeat until parent is null (we've reached the first commit)
 * 
 * This is a singly-linked list traversal — O(n) where n = number of commits.
 * 
 * WHY THIS IS ELEGANT:
 * ─────────────────────
 * There's no "commit database" or "commit log file". The history IS the 
 * chain of commit objects. Each commit is self-contained and points to 
 * its parent. You can verify the ENTIRE history by following parent links
 * and checking each commit's hash against its content.
 * 
 * This is why Git history is tamper-proof: changing any old commit 
 * changes its hash → breaks the parent reference in the next commit
 * → breaks THAT commit's hash → cascade failure all the way up.
 */

import { readObject } from '../storage/objectStore.js';
import { getHEAD, getCurrentBranch } from '../storage/refStore.js';
import { parseCommit } from '../core/object.js';
import { findRelicRoot } from '../config/constants.js';
import { NotARepository } from '../errors.js';

/**
 * Display commit history by walking the parent chain from HEAD.
 */
export function logCommand() {
    const repoRoot = findRelicRoot();
    if (!repoRoot) {
        console.error(new NotARepository().message);
        process.exit(1);
    }

    const head = getHEAD();

    if (!head.hash) {
        console.log('No commits yet.');
        return;
    }

    const currentBranch = getCurrentBranch();
    let commitHash = head.hash;

    // Walk the commit chain from HEAD to the root commit
    while (commitHash) {
        // Read the commit object from the store
        const { content } = readObject(commitHash);
        const commit = parseCommit(content);

        // Format output to look like `git log`
        const isHead = commitHash === head.hash;
        const refInfo = isHead
            ? ` (HEAD -> ${currentBranch || commitHash.slice(0, 7)})`
            : '';

        // Yellow for commit hash (ANSI escape codes for terminal colors)
        console.log(`\x1b[33mcommit ${commitHash}\x1b[0m${refInfo}`);
        console.log(`Author: ${commit.author}`);

        // Parse timestamp from author line: "Name <email> 1234567890 +0530"
        const authorParts = commit.author.split(' ');
        const timestamp = parseInt(authorParts[authorParts.length - 2]);
        const date = new Date(timestamp * 1000);
        console.log(`Date:   ${date.toString()}`);

        console.log(`\n    ${commit.message}\n`);

        // Move to parent commit (null if this was the first commit)
        commitHash = commit.parents.length > 0 ? commit.parents[0] : null;
    }
}
