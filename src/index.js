#!/usr/bin/env node

import { runCli } from './cli/run.js';

runCli(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ERROR:\n${message}`);
  process.exitCode = 1;
});
