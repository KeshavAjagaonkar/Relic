/**
 * fullWorkflow.test.js — End-to-End Integration Test
 * =====================================================
 * 
 * Tests the complete workflow: init → add → commit → log → branch → checkout → merge
 * 
 * This test proves the system works as a WHOLE, not just individual functions.
 * It simulates what a real user would do, step by step.
 */

import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const relicCli = path.resolve('bin/relic.js');
let testDir;

beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relic-e2e-'));
});

afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
});

/**
 * Helper: run a relic command in the test directory
 */
function relic(args) {
    return execSync(`node "${relicCli}" ${args}`, {
        cwd: testDir,
        encoding: 'utf-8',
        timeout: 10000,
    }).trim();
}

describe('Full Workflow', () => {
    test('init → add → commit → log', () => {
        // Step 1: Initialize
        const initOutput = relic('init');
        expect(initOutput).toContain('Initialized empty relic repository');

        // Verify directory structure
        expect(fs.existsSync(path.join(testDir, '.relic', 'objects'))).toBe(true);
        expect(fs.existsSync(path.join(testDir, '.relic', 'refs', 'heads'))).toBe(true);
        expect(fs.existsSync(path.join(testDir, '.relic', 'HEAD'))).toBe(true);

        // HEAD should point to main
        const head = fs.readFileSync(path.join(testDir, '.relic', 'HEAD'), 'utf-8');
        expect(head.trim()).toBe('ref: refs/heads/main');

        // Step 2: Create files and add
        fs.writeFileSync(path.join(testDir, 'hello.txt'), 'Hello, Relic!');
        fs.writeFileSync(path.join(testDir, 'world.txt'), 'World!');

        const addOutput = relic('add hello.txt');
        expect(addOutput).toContain("add 'hello.txt'");

        relic('add world.txt');

        // Verify index has entries
        const index = JSON.parse(fs.readFileSync(path.join(testDir, '.relic', 'index'), 'utf-8'));
        expect(Object.keys(index.entries)).toHaveLength(2);
        expect(index.entries['hello.txt']).toBeDefined();
        expect(index.entries['world.txt']).toBeDefined();

        // Step 3: Commit
        const commitOutput = relic('commit -m "Initial commit"');
        expect(commitOutput).toContain('root-commit');
        expect(commitOutput).toContain('Initial commit');

        // refs/heads/main should now exist
        expect(fs.existsSync(path.join(testDir, '.relic', 'refs', 'heads', 'main'))).toBe(true);

        // Step 4: Log
        const logOutput = relic('log');
        expect(logOutput).toContain('Initial commit');
        expect(logOutput).toContain('KeshavAjagaonkar');
    });

    test('branch → checkout → commit → merge (fast-forward)', () => {
        // Setup: init, add, commit
        fs.writeFileSync(path.join(testDir, 'base.txt'), 'base content');
        relic('init');
        relic('add base.txt');
        relic('commit -m "Base commit"');

        // Create and switch to feature branch
        relic('branch feature');

        // List branches
        const branchOutput = relic('branch');
        expect(branchOutput).toContain('feature');
        expect(branchOutput).toContain('main');

        relic('checkout feature');

        // Verify HEAD now points to feature
        const head = fs.readFileSync(path.join(testDir, '.relic', 'HEAD'), 'utf-8');
        expect(head.trim()).toBe('ref: refs/heads/feature');

        // Make a commit on feature
        fs.writeFileSync(path.join(testDir, 'feature.txt'), 'feature work');
        relic('add feature.txt');
        relic('commit -m "Feature work"');

        // Switch back to main
        relic('checkout main');

        // feature.txt should not exist on main
        expect(fs.existsSync(path.join(testDir, 'feature.txt'))).toBe(false);

        // Merge feature into main (fast-forward)
        const mergeOutput = relic('merge feature');
        expect(mergeOutput).toContain('Fast-forward');

        // feature.txt should now exist on main
        expect(fs.existsSync(path.join(testDir, 'feature.txt'))).toBe(true);
        expect(fs.readFileSync(path.join(testDir, 'feature.txt'), 'utf-8')).toBe('feature work');
    });

    test('content deduplication — same file content stored once', () => {
        relic('init');

        // Create two files with IDENTICAL content
        fs.writeFileSync(path.join(testDir, 'file1.txt'), 'same content');
        fs.writeFileSync(path.join(testDir, 'file2.txt'), 'same content');

        relic('add file1.txt');
        relic('add file2.txt');

        // Both should have the same blob hash in the index
        const index = JSON.parse(fs.readFileSync(path.join(testDir, '.relic', 'index'), 'utf-8'));
        expect(index.entries['file1.txt'].hash).toBe(index.entries['file2.txt'].hash);

        // Only ONE blob file should exist (deduplication!)
        const hash = index.entries['file1.txt'].hash;
        const objDir = path.join(testDir, '.relic', 'objects', hash.slice(0, 2));
        const objFile = path.join(objDir, hash.slice(2));
        expect(fs.existsSync(objFile)).toBe(true);
    });

    test('status shows correct categories', () => {
        relic('init');

        // Create and commit a file
        fs.writeFileSync(path.join(testDir, 'tracked.txt'), 'original');
        relic('add tracked.txt');
        relic('commit -m "Add tracked"');

        // Modify the tracked file
        fs.writeFileSync(path.join(testDir, 'tracked.txt'), 'modified');

        // Create an untracked file
        fs.writeFileSync(path.join(testDir, 'untracked.txt'), 'new file');

        const status = relic('status');
        expect(status).toContain('modified');
        expect(status).toContain('untracked.txt');
    });

    test('cat-file can inspect objects', () => {
        relic('init');
        fs.writeFileSync(path.join(testDir, 'test.txt'), 'inspect me');
        relic('add test.txt');
        relic('commit -m "For inspection"');

        // Get the commit hash from the ref
        const commitHash = fs.readFileSync(
            path.join(testDir, '.relic', 'refs', 'heads', 'main'), 'utf-8'
        ).trim();

        // cat-file -t should show "commit"
        const typeOutput = relic(`cat-file -t ${commitHash}`);
        expect(typeOutput).toBe('commit');

        // cat-file should show commit content
        const contentOutput = relic(`cat-file ${commitHash}`);
        expect(contentOutput).toContain('tree');
        expect(contentOutput).toContain('For inspection');
    });
});
