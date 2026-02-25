# Relic — A Content-Addressable Version Control System  

A Git-inspired VCS built from scratch in Node.js to understand how version control actually works under the hood.

## Why?

Most VCS tools are treated as black boxes. Relic is built to **demystify** how Git works internally — content-addressable storage, tree objects, commit chains, branching, merging, and delta sync to the cloud.

## Architecture

```
Working Directory  ──add──▶  Staging Index  ──commit──▶  Object Store
     (files)                 (.relic/index)            (.relic/objects/)
                                                             │
                                                     ┌───────┴────────┐
                                                     │  refs/heads/*  │
                                                     │  (branches)    │
                                                     └───────┬────────┘
                                                             │
                                                     ┌───────┴────────┐
                                                     │      HEAD      │
                                                     │ (current branch)│
                                                     └────────────────┘
```

### Core Concepts

| Concept | Git | Relic |
|---------|-----|-------|
| Hashing | SHA-1 | **SHA-256** |
| Object types | blob, tree, commit, tag | blob, tree, commit |
| Compression | zlib | zlib |
| Branches | file with commit hash | file with commit hash |
| Index format | Binary | **JSON** (debuggable) |
| Remote | SSH/HTTPS protocols | **AWS S3** (serverless) |

### Object Model

- **Blob** — Raw file content. No filename (enables deduplication).
- **Tree** — Directory snapshot. Maps names → blob/tree hashes. Sorted for deterministic hashing.
- **Commit** — Snapshot metadata: tree hash, parent hash, author, message.

## Commands

```bash
relic init                    # Initialize a new repository
relic add <file|.>            # Stage files for commit
relic commit -m "message"     # Create a commit from staged files
relic log                     # Show commit history
relic status                  # Show working tree status (3-way comparison)
relic diff                    # Show unstaged changes
relic diff --staged           # Show staged changes
relic branch                  # List branches
relic branch <name>           # Create a branch
relic branch -d <name>        # Delete a branch
relic checkout <branch>       # Switch branches
relic checkout -b <branch>    # Create and switch
relic cat-file <hash>         # Inspect any object
relic cat-file -t <hash>      # Show object type
relic merge <branch>          # Merge a branch (fast-forward + 3-way)
relic push                    # Delta sync to S3
relic pull                    # Delta sync from S3
```

## Quick Start

```bash
# Install globally
npm install -g .

# Initialize a repo
relic init

# Create and stage files
echo "hello" > readme.txt
relic add readme.txt

# Commit
relic commit -m "Initial commit"

# Check status and history
relic status
relic log

# Branch and merge
relic branch feature
relic checkout feature
echo "new feature" > feature.txt
relic add feature.txt
relic commit -m "Add feature"
relic checkout main
relic merge feature
```

## Project Structure

```
relic/
├── bin/
│   └── relic.js              # CLI entry point (zero business logic)
├── src/
│   ├── config/
│   │   └── constants.js      # Single source of truth for all paths/names
│   ├── core/
│   │   ├── hash.js           # SHA-256 content-addressable hashing
│   │   ├── compress.js       # zlib compression wrapper
│   │   └── object.js         # Blob, Tree, Commit creation + parsing
│   ├── storage/
│   │   ├── objectStore.js    # Read/write compressed objects to disk
│   │   ├── refStore.js       # Branch and HEAD management
│   │   └── indexStore.js     # Staging index (JSON format)
│   ├── commands/
│   │   ├── init.js           # Initialize repository
│   │   ├── add.js            # Stage files (hash + store + index)
│   │   ├── commit.js         # Build tree hierarchy, create commit object
│   │   ├── log.js            # Walk commit parent chain
│   │   ├── status.js         # 3-way comparison (working/index/commit)
│   │   ├── diff.js           # Line-level diff with colors
│   │   ├── branch.js         # List/create/delete branches
│   │   ├── checkout.js       # Switch branches (rebuild working tree)
│   │   ├── catFile.js        # Inspect objects by hash
│   │   ├── merge.js          # Fast-forward + 3-way merge with conflicts
│   │   └── remote/
│   │       ├── push.js       # Delta sync to S3
│   │       └── pull.js       # Delta sync from S3
│   ├── utils/
│   │   ├── fileWalker.js     # Recursive directory traversal
│   │   ├── ignore.js         # .relicignore pattern matching
│   │   └── pathUtils.js      # Cross-platform path normalization
│   └── errors.js             # Custom error classes
├── tests/
│   ├── core/                 # Unit tests for hashing, compression, objects
│   ├── storage/              # Tests for object store
│   └── integration/          # End-to-end workflow tests
└── package.json
```

## How It Works

### Content-Addressable Storage

Every piece of content is identified by its **SHA-256 hash**. The hash includes a Git-style header:

```
SHA-256("blob 11\0hello world") → a5c3f2e...
```

Same content → same hash → stored once. Two identical files? One blob.

### Branching is O(1)

A branch is a **file containing a 64-character hash**. Creating a branch = writing 64 characters.

```
.relic/refs/heads/main    → "a1b2c3d4..."  (commit hash)
.relic/refs/heads/feature → "a1b2c3d4..."  (same hash initially)
```

### Merge Strategies

- **Fast-forward**: Target is ahead of current → just move the pointer
- **Three-way**: Both diverged → find common ancestor, auto-merge, mark conflicts with `<<<<<<< ======= >>>>>>>`

### S3 Push/Pull (Delta Sync)

Only uploads objects that don't exist remotely. Because objects are content-addressed, if a hash matches, the content is guaranteed identical. No redundant transfers.

## Testing

```bash
npm test                      # Run all 36 tests
npm run test:coverage         # With coverage report
```

## S3 Remote Setup

Create `.relic/config.json`:

```json
{
  "bucket": "your-s3-bucket",
  "region": "ap-south-1",
  "prefix": "relic"
}
```

Ensure AWS credentials are configured (`~/.aws/credentials` or environment variables).

## Tech Stack

- **Node.js** (>=18) with ES Modules
- **SHA-256** for content hashing
- **zlib** for object compression
- **yargs** for CLI argument parsing
- **minimatch** for glob pattern matching
- **AWS SDK v3** for S3 integration
- **Jest** for testing

## License

MIT
