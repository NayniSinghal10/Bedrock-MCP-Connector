#!/usr/bin/env node
import { runCLI } from './cli/index.js';

// Run the CLI
runCLI().catch(error => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
