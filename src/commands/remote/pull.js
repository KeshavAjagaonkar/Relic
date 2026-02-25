/**
 * pull.js — Delta Sync from AWS S3
 * ==================================
 * 
 * `relic pull`
 * 
 * The inverse of push: download missing objects from S3 to local.
 * 
 * WORKFLOW:
 * ─────────
 * 1. Download remote refs (to see what commits exist remotely)
 * 2. Compare remote refs with local refs
 * 3. Walk the remote commit chain to find ALL objects we need
 * 4. Download only the objects we don't have locally
 * 5. Fast-forward local refs if possible
 * 
 * SIMPLIFIED VERSION:
 * ───────────────────
 * For this implementation, we do a simpler approach:
 * - List ALL objects in the remote S3 prefix
 * - Download any that don't exist locally
 * - Update local refs to match remote
 * 
 * This is less efficient than Git's pack protocol but much simpler
 * to implement and sufficient for the project's scale.
 */

import fs from 'fs';
import path from 'path';
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { findRelicRoot, getRelicDir } from '../../config/constants.js';
import { objectExists } from '../../storage/objectStore.js';
import { NotARepository } from '../../errors.js';

/**
 * Pull remote objects and refs from S3.
 */
export async function pullCommand() {
    const repoRoot = findRelicRoot();
    if (!repoRoot) {
        console.error(new NotARepository().message);
        process.exit(1);
    }

    const relicDir = getRelicDir();

    // Load S3 config
    const configPath = path.join(relicDir, 'config.json');
    if (!fs.existsSync(configPath)) {
        console.error('fatal: no remote configured. Create .relic/config.json');
        process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const { bucket, region = 'ap-south-1', prefix = 'relic' } = config;

    const s3 = new S3Client({ region });

    try {
        console.log(`Pulling from s3://${bucket}/${prefix}/...`);

        // Step 1: List all remote objects
        let downloadCount = 0;
        let continuationToken = undefined;

        do {
            const listResponse = await s3.send(new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: `${prefix}/objects/`,
                ContinuationToken: continuationToken,
            }));

            const objects = listResponse.Contents || [];

            for (const obj of objects) {
                // Extract hash from key: "relic/objects/ab/cdef..." → "ab" + "cdef..."
                const keyParts = obj.Key.replace(`${prefix}/objects/`, '').split('/');
                if (keyParts.length !== 2) continue;

                const hash = keyParts[0] + keyParts[1];

                // Skip if we already have this object
                if (objectExists(hash, relicDir)) continue;

                // Download the object
                const getResponse = await s3.send(new GetObjectCommand({
                    Bucket: bucket,
                    Key: obj.Key,
                }));

                const body = await streamToBuffer(getResponse.Body);

                // Write directly to objects directory (already compressed)
                const objDir = path.join(relicDir, 'objects', keyParts[0]);
                fs.mkdirSync(objDir, { recursive: true });
                fs.writeFileSync(path.join(objDir, keyParts[1]), body);
                downloadCount++;
            }

            continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
        } while (continuationToken);

        // Step 2: Download and update refs
        try {
            const refsResponse = await s3.send(new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: `${prefix}/refs/heads/`,
            }));

            for (const obj of (refsResponse.Contents || [])) {
                const branchName = obj.Key.replace(`${prefix}/refs/heads/`, '');
                const response = await s3.send(new GetObjectCommand({
                    Bucket: bucket,
                    Key: obj.Key,
                }));
                const refContent = await streamToString(response.Body);

                const refDir = path.join(relicDir, 'refs', 'heads');
                fs.mkdirSync(refDir, { recursive: true });
                fs.writeFileSync(path.join(refDir, branchName), refContent);
            }
        } catch {
            // No remote refs yet — that's okay
        }

        // Step 3: Download HEAD
        try {
            const headResponse = await s3.send(new GetObjectCommand({
                Bucket: bucket,
                Key: `${prefix}/HEAD`,
            }));
            const headContent = await streamToString(headResponse.Body);
            fs.writeFileSync(path.join(relicDir, 'HEAD'), headContent);
        } catch {
            // No remote HEAD — that's okay
        }

        console.log(`Done. ${downloadCount} new object(s) downloaded.`);
    } catch (err) {
        console.error('Error pulling from S3:', err.message);
        process.exit(1);
    }
}

/**
 * Convert a readable stream to a Buffer.
 */
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

/**
 * Convert a readable stream to a string.
 */
async function streamToString(stream) {
    const buffer = await streamToBuffer(stream);
    return buffer.toString('utf-8');
}
