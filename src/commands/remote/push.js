/**
 * push.js — Delta Sync to AWS S3
 * ================================
 * 
 * `relic push`
 * 
 * YOUR DIFFERENTIATOR — Git doesn't have built-in cloud sync.
 * Git uses protocols (SSH, HTTPS) to talk to remote Git servers.
 * Relic uses S3 directly, which is:
 *   - Simpler (no need for a Git server)
 *   - Cheaper (S3 storage is cents per GB)
 *   - Serverless (no server to maintain)
 * 
 * HOW DELTA SYNC WORKS:
 * ──────────────────────
 * Instead of uploading EVERYTHING on every push (which is what your 
 * old code would have done), we do a DELTA:
 * 
 *   1. List all LOCAL objects (.relic/objects/)
 *   2. List all REMOTE objects (S3 bucket prefix)
 *   3. Upload ONLY the objects that don't exist remotely
 * 
 * Because objects are content-addressed:
 *   - If an object exists remotely with the same hash, it's GUARANTEED
 *     to have the same content → skip it
 *   - Only new/changed content gets uploaded
 * 
 * This is similar to `rsync --checksum` but using our built-in hashes.
 */

import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { findRelicRoot, getRelicDir } from '../../config/constants.js';
import { NotARepository } from '../../errors.js';

/**
 * Push local objects and refs to S3.
 * 
 * S3 Layout:
 *   s3://bucket/repo-name/objects/<hash-prefix>/<hash-rest>
 *   s3://bucket/repo-name/refs/heads/<branch>
 *   s3://bucket/repo-name/HEAD
 */
export async function pushCommand() {
    const repoRoot = findRelicRoot();
    if (!repoRoot) {
        console.error(new NotARepository().message);
        process.exit(1);
    }

    const relicDir = getRelicDir();

    // Load S3 config from .relic/config.json
    const configPath = path.join(relicDir, 'config.json');
    if (!fs.existsSync(configPath)) {
        console.error('fatal: no remote configured. Run relic config to set up S3 bucket.');
        console.error('Create .relic/config.json with: { "bucket": "your-bucket", "region": "ap-south-1", "prefix": "relic" }');
        process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const { bucket, region = 'ap-south-1', prefix = 'relic' } = config;

    if (!bucket) {
        console.error('fatal: no S3 bucket configured in .relic/config.json');
        process.exit(1);
    }

    const s3 = new S3Client({ region });

    try {
        console.log(`Pushing to s3://${bucket}/${prefix}/...`);

        // Step 1: Upload all objects (delta sync)
        const objectsDir = path.join(relicDir, 'objects');
        let uploadCount = 0;
        let skipCount = 0;

        if (fs.existsSync(objectsDir)) {
            const prefixDirs = fs.readdirSync(objectsDir);

            for (const prefixDir of prefixDirs) {
                const fullPrefixDir = path.join(objectsDir, prefixDir);
                if (!fs.statSync(fullPrefixDir).isDirectory()) continue;

                const objectFiles = fs.readdirSync(fullPrefixDir);
                for (const objFile of objectFiles) {
                    const s3Key = `${prefix}/objects/${prefixDir}/${objFile}`;

                    // Check if object already exists in S3
                    const exists = await objectExistsInS3(s3, bucket, s3Key);
                    if (exists) {
                        skipCount++;
                        continue;
                    }

                    // Upload the object
                    const body = fs.readFileSync(path.join(fullPrefixDir, objFile));
                    await s3.send(new PutObjectCommand({
                        Bucket: bucket,
                        Key: s3Key,
                        Body: body,
                    }));
                    uploadCount++;
                }
            }
        }

        // Step 2: Upload refs
        const refsDir = path.join(relicDir, 'refs', 'heads');
        if (fs.existsSync(refsDir)) {
            const branches = fs.readdirSync(refsDir);
            for (const branch of branches) {
                const refContent = fs.readFileSync(path.join(refsDir, branch), 'utf-8');
                await s3.send(new PutObjectCommand({
                    Bucket: bucket,
                    Key: `${prefix}/refs/heads/${branch}`,
                    Body: refContent,
                }));
            }
        }

        // Step 3: Upload HEAD
        const headContent = fs.readFileSync(path.join(relicDir, 'HEAD'), 'utf-8');
        await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: `${prefix}/HEAD`,
            Body: headContent,
        }));

        console.log(`Done. ${uploadCount} new object(s) uploaded, ${skipCount} already up-to-date.`);
    } catch (err) {
        console.error('Error pushing to S3:', err.message);
        process.exit(1);
    }
}

/**
 * Check if an object already exists in S3 (for delta sync).
 */
async function objectExistsInS3(s3, bucket, key) {
    try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
    } catch {
        return false;
    }
}
