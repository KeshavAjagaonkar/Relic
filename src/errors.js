/**
 * errors.js — Custom Error Classes
 * ==================================
 * 
 * WHY custom errors?
 * ------------------
 * Generic errors like `throw new Error("something went wrong")` are useless
 * for callers. With custom error classes, the calling code can do:
 * 
 *   try { ... } 
 *   catch (err) {
 *     if (err instanceof NotARepository) { ... }
 *     if (err instanceof ObjectCorrupted) { ... }
 *   }
 * 
 * This is called "typed error handling" — the error TYPE tells you what
 * went wrong, not just a string message. Git does the same thing with 
 * its `die()` function and specific error exit codes.
 * 
 * Also notice how each error message mirrors Git's actual error messages.
 * This is intentional — it makes Relic feel like a real tool, not a toy.
 */

export class RelicError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RelicError';
    }
}

/**
 * Thrown when you try to run a command outside a relic repository.
 * Git equivalent: "fatal: not a git repository (or any of the parent directories): .git"
 */
export class NotARepository extends RelicError {
    constructor() {
        super('fatal: not a relic repository (or any parent up to mount point /)');
        this.name = 'NotARepository';
    }
}

/**
 * Thrown when an object fails its integrity check.
 * This happens when: hash(decompressed content) !== expected hash.
 * The beauty of content-addressable storage is that corruption 
 * is AUTOMATICALLY DETECTABLE — the filename IS the checksum.
 */
export class ObjectCorrupted extends RelicError {
    constructor(hash) {
        super(`error: object ${hash} is corrupt`);
        this.name = 'ObjectCorrupted';
        this.hash = hash;
    }
}

/**
 * Thrown when a merge finds conflicting changes.
 * Two branches modified the same file differently — 
 * the system can't auto-resolve, so the user must decide.
 */
export class MergeConflict extends RelicError {
    constructor(files) {
        super(`CONFLICT in: ${files.join(', ')}`);
        this.name = 'MergeConflict';
        this.conflictedFiles = files;
    }
}

/**
 * Thrown when a ref (branch name, HEAD) doesn't point to a valid commit.
 */
export class InvalidRef extends RelicError {
    constructor(ref) {
        super(`fatal: invalid reference: ${ref}`);
        this.name = 'InvalidRef';
    }
}

/**
 * Thrown when trying to checkout with uncommitted changes.
 */
export class DirtyWorkingTree extends RelicError {
    constructor() {
        super('error: your local changes would be overwritten by checkout. Please commit or stash them.');
        this.name = 'DirtyWorkingTree';
    }
}
