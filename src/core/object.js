/**
 * object.js — The Three Object Types (Blob, Tree, Commit)
 * =========================================================
 * 
 * This is the HEART of the project. An interviewer will look at this file.
 * 
 * Git's genius is that the ENTIRE version control system is built on just
 * three object types. That's it. Three types → complete version history.
 * 
 * THE OBJECT MODEL:
 * 
 *   BLOB → raw file content (no filename, no metadata)
 *   TREE → directory listing (maps filenames → blob/tree hashes)
 *   COMMIT → snapshot pointer + metadata + parent chain
 * 
 * Together they form a DAG (Directed Acyclic Graph):
 * 
 *   commit─C3 → commit─C2 → commit─C1
 *      │            │            │
 *      ▼            ▼            ▼
 *   tree─T3      tree─T2      tree─T1
 *    ├─blob       ├─blob       ├─blob
 *    └─tree       └─tree       └─blob
 *       └─blob       └─blob
 * 
 * Each arrow is a hash reference. The commit POINTS TO a tree by hash.
 * The tree POINTS TO blobs and subtrees by hash. It's hashes all the 
 * way down. Change one file → new blob → new tree → new commit. But 
 * unchanged files still reference the SAME existing blobs. That's dedup.
 */

import { hashObject } from './hash.js';

// ═══════════════════════════════════════════════════════════
//  BLOB — Raw File Content
// ═══════════════════════════════════════════════════════════

/**
 * Create a blob object from raw file content.
 * 
 * A blob is the simplest object: just the file's bytes, nothing else.
 * NO filename, NO permissions, NO timestamps. Just pure content.
 * 
 * WHY no filename?
 * ────────────────
 * Consider: you have `utils.js` and `helpers.js` with identical content.
 * If the filename were part of the blob, you'd get two different hashes
 * for the SAME content → stored twice → deduplication broken.
 * 
 * By excluding the filename, identical files always produce the same blob.
 * The filename is stored in the TREE object (the directory listing).
 * This separation is the key insight that makes content-addressing work.
 * 
 * @param {Buffer} content - Raw file bytes
 * @returns {{ hash: string, store: Buffer }}
 */
export function createBlob(content) {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    return hashObject(buffer, 'blob');
}

// ═══════════════════════════════════════════════════════════
//  TREE — Directory Snapshot
// ═══════════════════════════════════════════════════════════

/**
 * Create a tree object from an array of entries.
 * 
 * A tree represents a DIRECTORY at a point in time. Each entry maps:
 *   (mode, filename) → hash
 * 
 * Modes:
 *   100644 = regular file (this tree entry points to a BLOB)
 *   040000 = subdirectory (this tree entry points to another TREE)
 * 
 * BINARY FORMAT (matching Git):
 * ──────────────────────────────
 * Each entry is stored as:
 *   "<mode> <filename>\0<binary-hash>"
 * 
 * Example for a directory containing index.js and src/:
 *   "100644 index.js\0" + [32 bytes of SHA-256 hash]
 *   "040000 src\0" + [32 bytes of SHA-256 hash]
 * 
 * WHY binary hash (not hex string)?
 * ──────────────────────────────────
 * A SHA-256 hash is 32 bytes as raw binary, but 64 bytes as hex string.
 * Storing binary saves 50% space per entry. Git does the same thing 
 * (20 bytes binary for SHA-1 instead of 40 hex chars).
 * 
 * WHY sort entries by name?
 * ─────────────────────────
 * If entries aren't sorted, the same directory with the same files could
 * produce DIFFERENT tree hashes depending on filesystem ordering.
 * macOS might list files as [a, B, c], Linux might list [B, a, c].
 * Different order → different binary content → different hash → broken.
 * Sorting by name makes the tree hash DETERMINISTIC regardless of OS.
 * 
 * @param {Array<{mode: string, name: string, hash: string}>} entries
 * @returns {{ hash: string, store: Buffer }}
 */
export function createTree(entries) {
    // Sort entries by name — CRITICAL for deterministic hashing
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));

    const buffers = sorted.map(entry => {
        // Mode + space + filename + null byte
        const modeName = Buffer.from(`${entry.mode} ${entry.name}\0`);

        // Convert hex hash to binary (64 hex chars → 32 bytes)
        const hashBytes = Buffer.from(entry.hash, 'hex');

        return Buffer.concat([modeName, hashBytes]);
    });

    const treeContent = Buffer.concat(buffers);
    return hashObject(treeContent, 'tree');
}

/**
 * Parse a tree object's content buffer back into an entries array.
 * 
 * This is the inverse of createTree(). We need this to:
 * - Read a commit's tree to build the file listing
 * - Compare trees for diff/status
 * - Checkout (restore working directory from a tree)
 * 
 * The parsing works byte-by-byte:
 * 1. Read until space → that's the mode
 * 2. Read until null byte → that's the filename  
 * 3. Read next 32 bytes → that's the hash (SHA-256 = 32 bytes binary)
 * 4. Repeat until end of buffer
 * 
 * @param {Buffer} content - Raw tree content (after header is stripped)
 * @returns {Array<{mode: string, name: string, hash: string}>}
 */
export function parseTree(content) {
    const entries = [];
    let i = 0;

    while (i < content.length) {
        // Find the space between mode and filename
        const spaceIdx = content.indexOf(0x20, i); // 0x20 = ASCII space
        const mode = content.slice(i, spaceIdx).toString();

        // Find the null byte after filename
        const nullIdx = content.indexOf(0x00, spaceIdx); // 0x00 = null byte
        const name = content.slice(spaceIdx + 1, nullIdx).toString();

        // Next 32 bytes are the SHA-256 hash in binary
        const hashBytes = content.slice(nullIdx + 1, nullIdx + 1 + 32);
        const hash = hashBytes.toString('hex');

        entries.push({ mode, name, hash });

        // Move past this entry: null byte + 32 hash bytes
        i = nullIdx + 1 + 32;
    }

    return entries;
}

// ═══════════════════════════════════════════════════════════
//  COMMIT — Links Everything Together
// ═══════════════════════════════════════════════════════════

/**
 * Create a commit object.
 * 
 * A commit ties everything together with this format:
 * 
 *   tree <treeHash>
 *   parent <parentCommitHash>     ← (omitted for first commit)
 *   author <name> <timestamp> <timezone>
 *   committer <name> <timestamp> <timezone>
 *   
 *   <commit message>
 * 
 * WHY plain text (not JSON)?
 * ──────────────────────────
 * 1. DEBUGGABLE — You can decompress any commit and read it with your eyes.
 *    `relic cat-file <hash>` shows human-readable content.
 * 2. SIMPLE PARSING — Just split by newlines. No JSON schema to maintain.
 * 3. GIT COMPATIBLE — Same format as Git, making it educational.
 * 
 * WHY separate "author" and "committer"?
 * ──────────────────────────────────────
 * In Git, these CAN differ. Example: Alice writes a patch, Bob applies it.
 * Alice = author, Bob = committer. For Relic, they're usually the same.
 * We include both for correctness.
 * 
 * WHY Unix timestamp (seconds since epoch)?
 * ──────────────────────────────────────────
 * - Unambiguous (no timezone confusion in the number itself)
 * - Compact (10 digits vs. 24-char ISO string)
 * - Standard (every language can parse it)
 * The timezone is stored separately for display purposes.
 * 
 * @param {Object} options
 * @param {string} options.treeHash - Hash of the root tree object
 * @param {string|null} options.parentHash - Hash of parent commit (null for first commit)
 * @param {string} options.message - Commit message
 * @param {string} options.author - Author string like "Name <email>"
 * @returns {{ hash: string, store: Buffer }}
 */
export function createCommit({ treeHash, parentHash, message, author }) {
    let content = `tree ${treeHash}\n`;

    // Parent line is OMITTED for the very first commit (no parent exists)
    // For merge commits, there can be TWO parent lines (we'll handle that later)
    if (parentHash) {
        content += `parent ${parentHash}\n`;
    }

    // Unix timestamp: seconds since Jan 1, 1970
    const timestamp = Math.floor(Date.now() / 1000);

    // Compute timezone offset dynamically
    // getTimezoneOffset() returns minutes BEHIND UTC (negative for ahead)
    // India is +5:30 = -330 minutes → we format as "+0530"
    const offsetMinutes = new Date().getTimezoneOffset();
    const sign = offsetMinutes <= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMinutes);
    const hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
    const mins = String(absOffset % 60).padStart(2, '0');
    const timezone = `${sign}${hours}${mins}`;

    content += `author ${author} ${timestamp} ${timezone}\n`;
    content += `committer ${author} ${timestamp} ${timezone}\n`;

    // Blank line separates headers from message (like HTTP headers)
    content += `\n${message}\n`;

    return hashObject(Buffer.from(content), 'commit');
}

/**
 * Parse a commit object's content back into structured data.
 * 
 * @param {Buffer|string} content - Raw commit content (after header stripped)
 * @returns {Object} Parsed commit with tree, parent, author, committer, message
 */
export function parseCommit(content) {
    const text = Buffer.isBuffer(content) ? content.toString() : content;
    const lines = text.split('\n');

    const commit = {
        tree: null,
        parents: [],     // Array because merge commits can have 2+ parents
        author: null,
        committer: null,
        message: '',
    };

    let i = 0;

    // Parse header lines (key-value pairs until blank line)
    while (i < lines.length && lines[i] !== '') {
        const line = lines[i];

        if (line.startsWith('tree ')) {
            commit.tree = line.slice(5);
        } else if (line.startsWith('parent ')) {
            commit.parents.push(line.slice(7));
        } else if (line.startsWith('author ')) {
            commit.author = line.slice(7);
        } else if (line.startsWith('committer ')) {
            commit.committer = line.slice(10);
        }

        i++;
    }

    // Skip the blank line
    i++;

    // Everything after the blank line is the commit message
    // We trim trailing newline that we added in createCommit
    commit.message = lines.slice(i).join('\n').trim();

    return commit;
}
