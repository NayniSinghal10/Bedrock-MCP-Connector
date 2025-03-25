#!/usr/bin/env node
import readline from 'readline';
import { BedrockMCPClient } from '../client/BedrockMCPClient.js';
import { LogLevel, createDefaultLogger } from '../utils/logging.js';

const logger = createDefaultLogger('CLI');

/**
 * CLI configuration options
 */
interface CLIOptions {
    modelId: string;
    region?: string;
    systemPrompt?: string;
    mcpServerUrl?: string;
    clientName?: string;
    clientVersion?: string;
}

/**
 * Parse command line arguments
 * 
 * @returns The parsed CLI options
 */
function parseArgs(): CLIOptions {
    const args = process.argv.slice(2);
    const options: CLIOptions = {
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        switch (arg) {
            case '--model':
            case '-m':
                options.modelId = args[++i];
                break;
            case '--region':
            case '-r':
                options.region = args[++i];
                break;
            case '--system-prompt':
            case '-s':
                options.systemPrompt = args[++i];
                break;
            case '--mcp-url':
            case '-u':
                options.mcpServerUrl = args[++i];
                break;
            case '--name':
            case '-n':
                options.clientName = args[++i];
                break;
            case '--version':
            case '-v':
                options.clientVersion = args[++i];
                break;
            case '--help':
            case '-h':
                printHelp();
                process.exit(0);
                break;
        }
    }

    return options;
}

/**
 * Print help message
 */
function printHelp(): void {
    console.log(`
Bedrock MCP Connector CLI

Usage: @juspay/bedrock-mcp-connector [options]

Options:
  -m, --model <id>           AWS Bedrock model ID (default: anthropic.claude-3-sonnet-20240229-v1:0)
  -r, --region <region>      AWS region (default: us-east-1)
  -s, --system-prompt <text> System prompt for the model
  -u, --mcp-url <url>        MCP server URL
  -n, --name <name>          Client name
  -v, --version <version>    Client version
  -h, --help                 Show this help message
`);
}

/**
 * Run the CLI
 */
export async function runCLI(): Promise<void> {
    try {
        const options = parseArgs();

        // Create the client
        const client = new BedrockMCPClient({
            modelId: options.modelId,
            region: options.region,
            systemPrompt: options.systemPrompt,
            mcpServerUrl: options.mcpServerUrl,
            clientName: options.clientName,
            clientVersion: options.clientVersion,
        });

        // Set up event listeners
        const emitter = client.getEmitter();

        emitter.on('message', (message) => {
            logger.info(message);
        });

        emitter.on('error', (error) => {
            logger.error(error.message);
        });

        emitter.on('tool:start', (toolName, input) => {
            logger.info(`Executing tool: ${toolName}`);
        });

        emitter.on('tool:end', (toolName, result) => {
            logger.info(`Tool ${toolName} execution completed`);
        });

        // Connect to MCP server if URL is provided
        if (options.mcpServerUrl) {
            try {
                await client.connect();
                logger.info(`Connected to MCP server at ${options.mcpServerUrl}`);

                const tools = client.getTools();
                if (tools.length > 0) {
                    logger.info(`Available tools: ${tools.map(t => t.name).join(', ')}`);
                } else {
                    logger.info('No tools available');
                }
            } catch (error) {
                logger.warn(`Failed to connect to MCP server: ${error instanceof Error ? error.message : String(error)}`);
                logger.info('Continuing without MCP tools');
            }
        }

        // Create readline interface
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const askQuestion = (query: string): Promise<string> =>
            new Promise((resolve) => rl.question(query, resolve));

        // Print welcome message
        console.log(`
╔════════════════════════════════════════════════════╗
║                                                    ║
║          @juspay/Bedrock MCP Connector CLI         ║
║                                                    ║
╚════════════════════════════════════════════════════╝

Model: ${options.modelId}
Type 'quit', 'exit', or 'q' to exit
Type 'help' for available commands
`);

        // Start the REPL
        while (true) {
            const userPrompt = await askQuestion('> ');
            const command = userPrompt.trim().toLowerCase();

            if (['quit', 'exit', 'q'].includes(command)) {
                break;
            }

            if (command === 'help') {
                console.log(`
Available commands:
  help                 Show this help message
  tools                List available tools
  clear                Clear the conversation history
  quit, exit, q        Exit the CLI
`);
                continue;
            }

            if (command === 'tools') {
                const tools = client.getTools();
                if (tools.length > 0) {
                    console.log('\nAvailable tools:');
                    tools.forEach(tool => {
                        console.log(`  - ${tool.name}${tool.description ? `: ${tool.description}` : ''}`);
                    });
                    console.log('');
                } else {
                    console.log('\nNo tools available\n');
                }
                continue;
            }

            if (command === 'clear') {
                client.clearConversationHistory();
                console.log('\nConversation history cleared\n');
                continue;
            }

            if (userPrompt.trim()) {
                try {
                    console.log('\nThinking...');
                    const response = await client.sendPrompt(userPrompt);
                    console.log(`\n${response}\n`);
                } catch (error) {
                    console.error(`\nError: ${error instanceof Error ? error.message : String(error)}\n`);
                }
            }
        }

        // Clean up
        rl.close();
        if (client.isConnectedToMCP()) {
            await client.disconnect();
        }

        console.log('\nGoodbye!\n');
    } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}

// Run the CLI if this file is executed directly
// In ES modules, we can check if the current module is the main module
// by comparing import.meta.url to process.argv[1]
const isMainModule = import.meta.url.endsWith(process.argv[1].replace('file://', ''));
if (isMainModule) {
    runCLI().catch(console.error);
}
