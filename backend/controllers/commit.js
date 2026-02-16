import { writeFile } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";

async function commitRepo(message) {
  const repoPath = path.resolve(process.cwd(), ".relic");
  const staggingPath = path.join(repoPath, "stagging");
  const commitsPath = path.join(repoPath, "commits");
  try {
    const commitID = uuidv4();
    const commitDir = path.join(commitsPath, commitID);
    await fs.mkdir(commitDir, { recursive: true });
    const files = await fs.readdir(staggingPath);
    for (const file of files) {
      await fs.copyFile(
        path.join(staggingPath, file),
        path.join(commitDir, file),
      );
    }
    await fs.writeFile(
      path.join(commitDir, "commit.json"),
      JSON.stringify({ message, date: new Date().toISOString() }),
      );
      console.log(`commit is created and commit id is ${commitID}`);
  } catch (err) {
    console.error("Error commiting the file ", err);
  }
}

export { commitRepo };
