/**
 * diff.js — Show Changes Between States
 * ========================================
 * 
 * `relic diff`           → working directory vs index (unstaged changes)
 * `relic diff --staged`  → index vs last commit (staged changes)
 * 
 * WHY DIFF IS IMPORTANT:
 * ──────────────────────
 * Before committing, you want to see WHAT changed, not just WHICH files.
 * 
 * We implement a FILE-LEVEL diff (which files changed) plus a basic
 * LINE-LEVEL diff for text files. A production diff would use Myers 
 * algorithm (the standard for Git), but for learning purposes, a 
 * simple line-by-line comparison is more understandable.
 * 
 * OUTPUT FORMAT (mimicking Git's unified diff):
 * ──────────────────────────────────────────────
 *   --- a/src/index.js     (old version)
 *   +++ b/src/index.js     (new version)
 *   - const PORT = 3000;   (removed line, red)
 *   + const PORT = 8080;   (added line, green)
 *     unchanged line        (context line, no prefix)
 */

import fs from 'fs';
import path from 'path';
import { readObject } from '../storage/objectStore.js';
import { readIndex } from '../storage/indexStore.js';
import { getHEAD } from '../storage/refStore.js';
import { parseCommit } from '../core/object.js';
import { hashObject } from '../core/hash.js';
import { flattenTree } from './status.js';
import { findRelicRoot } from '../config/constants.js';
import { NotARepository } from '../errors.js';

/**
 * Show diff between two states.
 * 
 * @param {boolean} staged - If true, show index vs last commit. If false, show working dir vs index.
 */
export function diffCommand(staged) {
    const repoRoot = findRelicRoot();
    if (!repoRoot) {
        console.error(new NotARepository().message);
        process.exit(1);
    }

    try {
        if (staged) {
            diffStagedVsCommit(repoRoot);
        } else {
            diffWorkingVsIndex(repoRoot);
        }
    } catch (err) {
        console.error('Error computing diff:', err.message);
        process.exit(1);
    }
}

/**
 * Compare working directory against the index (unstaged changes).
 */
function diffWorkingVsIndex(repoRoot) {
    const index = readIndex();
    let hasDiff = false;

    for (const [filePath, { hash: indexHash }] of Object.entries(index.entries)) {
        const absPath = path.join(repoRoot, filePath);

        if (!fs.existsSync(absPath)) {
            // File deleted from working directory
            console.log(`\x1b[31mdeleted: ${filePath}\x1b[0m`);
            hasDiff = true;
            continue;
        }

        // Hash current file content and compare
        const currentContent = fs.readFileSync(absPath);
        const { hash: currentHash } = hashObject(currentContent, 'blob');

        if (currentHash !== indexHash) {
            // File was modified — show line-level diff
            console.log(`\n\x1b[1mdiff ${filePath}\x1b[0m`);
            console.log(`--- a/${filePath}`);
            console.log(`+++ b/${filePath}`);

            // Get the old content from the object store
            const { content: oldContent } = readObject(indexHash);
            const oldLines = oldContent.toString('utf-8').split('\n');
            const newLines = currentContent.toString('utf-8').split('\n');

            showLineDiff(oldLines, newLines);
            hasDiff = true;
        }
    }

    if (!hasDiff) {
        console.log('No unstaged changes.');
    }
}

/**
 * Compare the index against the last commit (staged changes).
 */
function diffStagedVsCommit(repoRoot) {
    const index = readIndex();
    const head = getHEAD();

    // Get committed file map
    let committedFiles = {};
    if (head.hash) {
        const { content } = readObject(head.hash);
        const commit = parseCommit(content);
        committedFiles = flattenTree(commit.tree, '');
    }

    let hasDiff = false;

    // Files in index but not in commit (newly staged)
    for (const [filePath, { hash }] of Object.entries(index.entries)) {
        if (!committedFiles[filePath]) {
            console.log(`\x1b[32mnew file: ${filePath}\x1b[0m`);
            hasDiff = true;
        } else if (committedFiles[filePath] !== hash) {
            // File modified between commit and index
            console.log(`\n\x1b[1mdiff ${filePath}\x1b[0m`);
            console.log(`--- a/${filePath} (committed)`);
            console.log(`+++ b/${filePath} (staged)`);

            const { content: oldContent } = readObject(committedFiles[filePath]);
            const { content: newContent } = readObject(hash);
            const oldLines = oldContent.toString('utf-8').split('\n');
            const newLines = newContent.toString('utf-8').split('\n');

            showLineDiff(oldLines, newLines);
            hasDiff = true;
        }
    }

    // Files in commit but not in index (staged for deletion)
    for (const filePath of Object.keys(committedFiles)) {
        if (!index.entries[filePath]) {
            console.log(`\x1b[31mdeleted: ${filePath}\x1b[0m`);
            hasDiff = true;
        }
    }

    if (!hasDiff) {
        console.log('No staged changes.');
    }
}

/**
 * Simple line-by-line diff display.
 * 
 * This is NOT a true diff algorithm (like Myers or patience diff).
 * It's a simple comparison that shows lines that were added or removed.
 * For a learning project, this is sufficient and much easier to understand.
 * 
 * A production implementation would use LCS (Longest Common Subsequence)
 * to compute minimal edit distance, which is what `git diff` uses internally.
 * 
 * @param {string[]} oldLines - Lines from the old version
 * @param {string[]} newLines - Lines from the new version
 */
function showLineDiff(oldLines, newLines) {
    // Build sets for quick lookup
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);

    // Simple approach: show removed lines then added lines
    // A proper LCS diff would interleave them contextually
    const maxLen = Math.max(oldLines.length, newLines.length);

    let i = 0, j = 0;
    while (i < oldLines.length || j < newLines.length) {
        if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
            // Lines match — context line
            console.log(` ${oldLines[i]}`);
            i++; j++;
        } else {
            // Lines differ — show removals then additions until we resync
            // Look ahead to find where the lines match again
            let foundSync = false;

            // Try to find the next matching line
            for (let lookAhead = 1; lookAhead <= 3 && !foundSync; lookAhead++) {
                if (i + lookAhead < oldLines.length && j < newLines.length &&
                    oldLines[i + lookAhead] === newLines[j]) {
                    // Old has extra lines (deleted)
                    for (let k = 0; k < lookAhead; k++) {
                        console.log(`\x1b[31m-${oldLines[i + k]}\x1b[0m`);
                    }
                    i += lookAhead;
                    foundSync = true;
                } else if (j + lookAhead < newLines.length && i < oldLines.length &&
                    newLines[j + lookAhead] === oldLines[i]) {
                    // New has extra lines (added)
                    for (let k = 0; k < lookAhead; k++) {
                        console.log(`\x1b[32m+${newLines[j + k]}\x1b[0m`);
                    }
                    j += lookAhead;
                    foundSync = true;
                }
            }

            if (!foundSync) {
                // Lines at both positions differ — show as replacement
                if (i < oldLines.length) {
                    console.log(`\x1b[31m-${oldLines[i]}\x1b[0m`);
                    i++;
                }
                if (j < newLines.length) {
                    console.log(`\x1b[32m+${newLines[j]}\x1b[0m`);
                    j++;
                }
            }
        }
    }
}
