import yargs from "yargs";
import {hideBin } from "yargs/helpers";

import { initRepo } from "./controllers/init.js";

yargs(hideBin(process.argv)).command(
  "init",
  "Initialise a new repository",
  {},
  initRepo,
).demandCommand(1, "at least one command")
    .help()
    .argv;


