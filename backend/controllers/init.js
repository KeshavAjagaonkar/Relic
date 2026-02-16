import fs from "node:fs/promises";
import path from "node:path";
async function initRepo() {
    const repoPath=path.resolve(process.cwd(),".relic");
    const commitPath = path.join(repoPath, "commits");

    try {
        await fs.mkdir(repoPath, { recursive: true });
        await fs.mkdir(commitPath, { recursive: true });
        await fs.writeFile(
            path.join(repoPath, "config.json"),
            JSON.stringify({ bucket: "S3 bucket " })
        );
        console.log("Repo initialised");
    }
    catch (err) {
        console.error("Error in initialising the repo", err);
    }
    console.log("init command initialised");
}
    
export {initRepo};