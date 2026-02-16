import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { initRepo } from "./controllers/init.js";
import { addRepo } from "./controllers/add.js";
import { commitRepo } from "./controllers/commit.js";
import { pushRepo } from "./controllers/push.js";
import { pullRepo } from "./controllers/pull.js";
import { revertRepo } from "./controllers/revert.js";

yargs(hideBin(process.argv))
  .command("init", "Initialise a new repository", {}, initRepo)
  .command(
    "add <file>",
    "Add a file to the repository",
    (yargs) => {
      yargs.positional("file", {
        describe: "File to add the stagging area",
        type: "string",
      });
    },
    addRepo,
  )
  .command(
    "commit <message>",
    "commit the stagged file",
    (yargs) => {
      yargs.positional("message", {
        describe: "Commit message",
        type: "string",
      });
    },
    commitRepo,
  )
  .command("push", "push commits to s3", {}, pushRepo)
  .command("pull", "Pull commits from s3", {}, pullRepo)
  .command(
    "revert <commitID>",
    "Revert a commit to specific commit",
    (yargs) => {
      yargs.positional("commitID", {
        describe: "commitID to revert to",
        type: "string",
      });
    },
    revertRepo
  )
  .demandCommand(1, "at least one command")
  .help().argv;
