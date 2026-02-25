#!/usr/bin/env node

/**
 * bin/relic.js — CLI Entry Point
 * ================================
 * 
 * WHY is this separate from the source code?
 * -------------------------------------------
 * This file does ONE thing: parse command-line arguments and call the 
 * appropriate handler. It contains ZERO business logic.
 * 
 * This is the "Separation of Concerns" principle:
 * - bin/relic.js    → "What did the user type?"
 * - src/commands/*  → "What should happen?"
 * - src/core/*      → "How does it work internally?"
 * 
 * The #!/usr/bin/env node line (called a "shebang") tells Unix/Mac:
 * "Run this file with Node.js". Without it, `relic init` wouldn't work 
 * as a global command. On Windows, npm handles this differently (creates 
 * a .cmd wrapper), but the shebang is still needed for cross-platform.
 * 
 * The "bin" field in package.json points here, so when someone does 
 * `npm install -g relic-vcs`, their system creates a `relic` command 
 * that executes this file.
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Import command handlers
import { initCommand } from '../src/commands/init.js';
import { addCommand } from '../src/commands/add.js';
import { commitCommand } from '../src/commands/commit.js';
import { logCommand } from '../src/commands/log.js';
import { statusCommand } from '../src/commands/status.js';
import { diffCommand } from '../src/commands/diff.js';
import { branchCommand } from '../src/commands/branch.js';
import { checkoutCommand } from '../src/commands/checkout.js';
import { catFileCommand } from '../src/commands/catFile.js';
import { mergeCommand } from '../src/commands/merge.js';
import { pushCommand } from '../src/commands/remote/push.js';
import { pullCommand } from '../src/commands/remote/pull.js';

/**
 * Yargs configuration
 * 
 * Each .command() call registers a subcommand. The pattern is:
 *   .command('name <required> [optional]', 'description', builder, handler)
 * 
 * - builder: configures the arguments (types, defaults, validation)
 * - handler: the function to run (imported from src/commands/)
 * 
 * Notice how each handler is a thin wrapper — it just extracts args and 
 * calls the real implementation. This makes testing easy: you can test 
 * the command logic without simulating CLI input.
 */
yargs(hideBin(process.argv))
    .command('init', 'Initialize a new relic repository', {}, initCommand)

    .command(
        'add <file>',
        'Add file(s) to the staging area',
        (yargs) => {
            yargs.positional('file', {
                describe: 'File or directory to add (use "." for all files)',
                type: 'string',
            });
        },
        (argv) => addCommand(argv.file)
    )

    .command(
        'commit',
        'Record changes to the repository',
        (yargs) => {
            yargs.option('m', {
                alias: 'message',
                describe: 'Commit message',
                type: 'string',
                demandOption: true,
            });
        },
        (argv) => commitCommand(argv.message)
    )

    .command('log', 'Show commit history', {}, logCommand)

    .command('status', 'Show working tree status', {}, statusCommand)

    .command(
        'diff',
        'Show changes between working tree and index',
        (yargs) => {
            yargs.option('staged', {
                describe: 'Show changes between index and last commit',
                type: 'boolean',
                default: false,
            });
        },
        (argv) => diffCommand(argv.staged)
    )

    .command(
        'branch [name]',
        'List, create, or delete branches',
        (yargs) => {
            yargs.positional('name', {
                describe: 'Branch name to create',
                type: 'string',
            });
            yargs.option('d', {
                alias: 'delete',
                describe: 'Delete a branch',
                type: 'string',
            });
        },
        (argv) => branchCommand(argv.name, argv.delete)
    )

    .command(
        'checkout <target>',
        'Switch branches or restore working tree files',
        (yargs) => {
            yargs.positional('target', {
                describe: 'Branch name or commit hash to checkout',
                type: 'string',
            });
            yargs.option('b', {
                describe: 'Create and checkout a new branch',
                type: 'boolean',
                default: false,
            });
        },
        (argv) => checkoutCommand(argv.target, argv.b)
    )

    .command(
        'cat-file <hash>',
        'Display contents of a repository object',
        (yargs) => {
            yargs.positional('hash', {
                describe: 'Object hash to inspect',
                type: 'string',
            });
            yargs.option('t', {
                describe: 'Show object type instead of content',
                type: 'boolean',
                default: false,
            });
            yargs.option('p', {
                describe: 'Pretty-print object content',
                type: 'boolean',
                default: true,
            });
        },
        (argv) => catFileCommand(argv.hash, { type: argv.t, prettyPrint: argv.p })
    )

    .command(
        'merge <branch>',
        'Merge a branch into the current branch',
        (yargs) => {
            yargs.positional('branch', {
                describe: 'Branch to merge into current branch',
                type: 'string',
            });
        },
        (argv) => mergeCommand(argv.branch)
    )

    .command('push', 'Push objects and refs to S3 remote', {},
        () => pushCommand().catch(err => { console.error(err.message); process.exit(1); })
    )

    .command('pull', 'Pull objects and refs from S3 remote', {},
        () => pullCommand().catch(err => { console.error(err.message); process.exit(1); })
    )

    .demandCommand(1, 'You need at least one command. Run `relic --help` for usage.')
    .strict()
    .help()
    .alias('h', 'help')
    .alias('v', 'version')
    .argv;
