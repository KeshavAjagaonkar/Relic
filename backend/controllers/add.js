import fs from 'node:fs/promises';
import path from 'node:path';

async function addRepo(filePath) {
    const repoPath = path.resolve(process.cwd(), ".relic");
    const staggingPath = path.join(repoPath, "stagging");
    
    try {
        await fs.mkdir(staggingPath, { recursive: true });// creating a directory staggingpath // the question is what if the directory already exist ? then what to do 
        const fileName = path.basename(filePath);// extacting the basename of the file from the filepath provided
        await fs.copyFile(filePath, path.join(staggingPath, fileName))//making a copy of the file to the staggig folder and giving the same name, right ?
        console.log(`File ${fileName} added to stagging area`);
    } catch (err) {
        console.error("Error in adding a file in stagging area", err);
    }
}

export { addRepo };