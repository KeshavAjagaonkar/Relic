/**
 * catFile.js — Inspect Any Object by Hash
 * ==========================================
 * 
 * `relic cat-file <hash>`       → display object content
 * `relic cat-file -t <hash>`    → display object type only
 * 
 * WHY THIS COMMAND EXISTS:
 * ─────────────────────────
 * This is your DEBUGGING TOOL and DEMO TOOL.
 * 
 * In an interview, you can say:
 *   "Let me show you how objects are stored internally..."
 *   > relic cat-file abc123
 *   blob: "hello world\n"
 * 
 *   "And here's the tree structure..."
 *   > relic cat-file def456
 *   tree:
 *     100644 blob abc123  README.md
 *     040000 tree 789abc  src
 * 
 *   "And the commit..."
 *   > relic cat-file 111222
 *   tree def456
 *   parent 000111
 *   author Keshav <...> 1234567890 +0530
 *   committer Keshav <...> 1234567890 +0530
 *   
 *   Initial commit
 * 
 * This proves you actually understand what's stored and how.
 * Git has `git cat-file -p <hash>` for exactly this purpose.
 */

import { readObject } from '../storage/objectStore.js';
import { parseTree, parseCommit } from '../core/object.js';
import { findRelicRoot } from '../config/constants.js';
import { NotARepository } from '../errors.js';

/**
 * Display the content of a repository object.
 * 
 * @param {string} hash - Object hash (full or abbreviated)
 * @param {Object} options - { type: boolean, prettyPrint: boolean }
 */
export function catFileCommand(hash, options = {}) {
    const repoRoot = findRelicRoot();
    if (!repoRoot) {
        console.error(new NotARepository().message);
        process.exit(1);
    }

    try {
        const { type, content } = readObject(hash);

        if (options.type) {
            // Just show the type
            console.log(type);
            return;
        }

        // Pretty-print based on object type
        switch (type) {
            case 'blob':
                prettyPrintBlob(content);
                break;
            case 'tree':
                prettyPrintTree(content);
                break;
            case 'commit':
                prettyPrintCommit(content);
                break;
            default:
                console.log(`Unknown object type: ${type}`);
                console.log(content.toString());
        }
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}

/**
 * Display blob content.
 * Blobs are just raw file content — print as-is.
 */
function prettyPrintBlob(content) {
    process.stdout.write(content);
    // Add newline if content doesn't end with one
    if (content.length > 0 && content[content.length - 1] !== 0x0A) {
        console.log();
    }
}

/**
 * Display tree entries in a readable format.
 * Shows: mode  type  hash  name
 */
function prettyPrintTree(content) {
    const entries = parseTree(content);

    for (const entry of entries) {
        const type = entry.mode === '040000' ? 'tree' : 'blob';
        console.log(`${entry.mode} ${type} ${entry.hash}    ${entry.name}`);
    }
}

/**
 * Display commit content.
 * Commits are plain text — just print them.
 */
function prettyPrintCommit(content) {
    console.log(content.toString());
}
