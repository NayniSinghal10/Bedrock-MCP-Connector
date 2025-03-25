#!/usr/bin/env node
import * as readline from 'readline';
import { BedrockMCPClient, LogLevel, createDefaultLogger } from '../../dist/index.js';

/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = {};
    const argv = process.argv.slice(2);

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true';
            args[key] = value;
            if (value !== 'true') i++; // Skip the next arg if it's a value
        }
    }

    return args;
}

// Parse command line arguments
const args = parseArgs();

// Display help if requested
if (args.help) {
    console.log(`
Bedrock MCP Interactive Session

Usage:
  node interact.js [options]

Options:
  --model <model-id>       Specify the Bedrock model ID (default: anthropic.claude-3-sonnet-20240229-v1:0)
  --region <region>        Specify the AWS region (default: us-east-1)
  --mcp-url <url>          Specify the MCP server URL
  --system <prompt>        Specify the system prompt
  --max-tokens <number>    Specify the maximum tokens (default: 2000)
  --temperature <number>   Specify the temperature (default: 0.7)
  --debug                  Enable debug logging
  --help                   Show this help message
    `);
    process.exit(0);
}

// Create a logger
const logger = createDefaultLogger('Interactive');
logger.setLevel(args.debug ? LogLevel.DEBUG : LogLevel.INFO);

// Configuration with defaults
const config = {
    modelId: args.model || process.env.MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0',
    region: args.region || process.env.AWS_REGION || 'us-east-1',
    systemPrompt: args.system || process.env.SYSTEM_PROMPT || `You are a helpful assistant with access to external tools.
                                                    - Use available tools **only when necessary** to provide accurate or up-to-date information.
                                                    - If a question can be answered based on your knowledge, respond directly **without using tools**.
                                                    - IMPORTANT: Only use the 'calculate' tool when the user explicitly asks for a calculation or arithmetic operation.
                                                      For example, use it for "What is 5 + 7?" but NOT for "Who is Donald Trump?" or "What is the Burj Khalifa?"
                                                    - If a tool is required:
                                                        1. **Check if all necessary parameters are available.** If they are, use the tool directly.
                                                        2. **If any parameters are missing, do not proceed.** Instead, ask the user for the required information, explaining why it is needed.
                                                        3. **Wait for the user's response before using the tool.**
                                                    - If the user asks multiple questions, **handle them one by one**.
                                                    - If some questions require tools and others don't, **answer what you can immediately**, then use tools as needed.
                                                    - After using a tool, continue answering any remaining questions.
                                                    `,
    mcpServerUrl: args['mcp-url'] || process.env.MCP_SERVER_URL || undefined,
    clientName: 'Bedrock Interactive Client',
    clientVersion: '1.0.0',
    maxTokens: parseInt(args['max-tokens'] || process.env.MAX_TOKENS || '2000'),
    temperature: parseFloat(args.temperature || process.env.TEMPERATURE || '0.7'),
};

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

/**
 * Display welcome message
 */
function displayWelcome() {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║  🤖 Bedrock MCP Interactive Session                        ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝

This interactive session allows you to chat with AWS Bedrock models
and use tools to enhance the conversation.

Configuration:
  • Model: ${config.modelId}
  • Region: ${config.region}
  • MCP Server: ${config.mcpServerUrl || 'Not connected'}

Commands:
  • Type 'help' or '?' to see available commands
  • Type 'tools' to see available tools
  • Type 'exit' or 'quit' to end the session

Let's get started!
`);
}

/**
 * Main interactive session handler
 */
async function startInteractiveSession() {
    // Display welcome message
    displayWelcome();

    // Create the client
    const client = new BedrockMCPClient(config);

    // Set up event listeners
    const emitter = client.getEmitter();

    emitter.on('message', (message) => {
        logger.debug(`Message: ${message}`);
    });

    emitter.on('error', (error) => {
        console.error(`\n❌ Error: ${error.message}`);
    });

    emitter.on('tool:start', (toolName, input) => {
        console.log(`\n🔧 Using tool: ${toolName}...`);
    });

    emitter.on('tool:end', (toolName, result) => {
        logger.debug(`Tool completed: ${toolName}`);
    });

    emitter.on('response:start', () => {
        process.stdout.write('\n🤖 ');
    });

    emitter.on('response:chunk', (chunk) => {
        // Print chunks as they arrive for a streaming experience
        process.stdout.write(chunk);
    });

    emitter.on('response:end', () => {
        console.log('\n');
    });

    // Try to connect to MCP server if URL is provided
    if (config.mcpServerUrl) {
        try {
            await client.connect();
            console.log(`✅ Connected to MCP server at ${config.mcpServerUrl}`);

            const tools = client.getTools();
            if (tools.length > 0) {
                console.log(`Available tools: ${tools.map(t => t.name).join(', ')}`);
            }
        } catch (error) {
            console.warn(`⚠️  Failed to connect to MCP server: ${error instanceof Error ? error.message : String(error)}`);
            console.log('Continuing without MCP tools');
        }
    }

    // Register custom tools for demonstration

    // 1. Current time tool
    client.registerTool(
        'getCurrentTime',
        async (name, input) => {
            const timezone = input.timezone || 'UTC';
            const date = new Date().toLocaleString('en-US', { timeZone: timezone });
            return { content: [{ text: `The current time is ${date} in ${timezone}` }] };
        },
        'Get the current time in the specified timezone',
        {
            type: 'object',
            properties: {
                timezone: {
                    type: 'string',
                    description: 'The timezone to get the time for (e.g., UTC, America/New_York)',
                },
            },
            required: [],
        }
    );

    // 2. Calculator tool
    client.registerTool(
        'calculate',
        async (name, input) => {
            try {
                // IMPORTANT: In a production environment, you would need to implement
                // proper security measures to prevent code injection
                const expression = input.expression;
                if (!expression) {
                    return {
                        content: [{ text: "Error: No expression provided" }],
                        status: 'error'
                    };
                }

                // Simple evaluation with basic security check
                if (/[a-zA-Z]/.test(expression)) {
                    return {
                        content: [{ text: "Error: Only numeric expressions are allowed" }],
                        status: 'error'
                    };
                }

                // eslint-disable-next-line no-eval
                const result = eval(expression);
                return {
                    content: [{ text: `${expression} = ${result}` }]
                };
            } catch (error) {
                return {
                    content: [{ text: `Error calculating result: ${error instanceof Error ? error.message : String(error)}` }],
                    status: 'error'
                };
            }
        },
        'Calculate the result of a mathematical expression. Only use this tool when the user explicitly asks for a calculation or arithmetic operation.',
        {
            type: 'object',
            properties: {
                expression: {
                    type: 'string',
                    description: 'The mathematical expression to evaluate (e.g., "2 + 2 * 3")',
                },
            },
            required: ['expression'],
        }
    );

    // 3. Memory storage tool
    const memoryStore = {};

    client.registerTool(
        'storeMemory',
        async (name, input) => {
            const { key, value } = input;
            if (!key || !value) {
                return {
                    content: [{ text: "Error: Both key and value must be provided" }],
                    status: 'error'
                };
            }

            memoryStore[key] = value;
            return {
                content: [{ text: `Stored "${value}" with key "${key}"` }]
            };
        },
        'Store a value in memory for later retrieval',
        {
            type: 'object',
            properties: {
                key: {
                    type: 'string',
                    description: 'The key to store the value under',
                },
                value: {
                    type: 'string',
                    description: 'The value to store',
                },
            },
            required: ['key', 'value'],
        }
    );

    client.registerTool(
        'retrieveMemory',
        async (name, input) => {
            const { key } = input;
            if (!key) {
                return {
                    content: [{ text: "Error: Key must be provided" }],
                    status: 'error'
                };
            }

            const value = memoryStore[key];
            if (value === undefined) {
                return {
                    content: [{ text: `No value found for key "${key}"` }]
                };
            }

            return {
                content: [{ text: `Retrieved value for key "${key}": "${value}"` }]
            };
        },
        'Retrieve a value from memory by key',
        {
            type: 'object',
            properties: {
                key: {
                    type: 'string',
                    description: 'The key to retrieve the value for',
                },
            },
            required: ['key'],
        }
    );

    // Start the interactive loop
    await promptUser(client);
}

// Store command history
const commandHistory = [];
let historyIndex = -1;

/**
 * Display available tools
 */
function displayAvailableTools(client) {
    const tools = client.getTools();
    if (tools.length === 0) {
        console.log('\nNo tools available');
        return;
    }

    console.log('\n📚 Available Tools:');
    tools.forEach(tool => {
        console.log(`  • ${tool.name}${tool.description ? `: ${tool.description}` : ''}`);
    });
    console.log('');
}

/**
 * Prompt the user for input and handle the response
 */
async function promptUser(client) {
    rl.question('\n👤 You: ', async (input) => {
        // Skip empty inputs
        if (!input.trim()) {
            await promptUser(client);
            return;
        }

        // Add to command history if not empty
        if (input.trim()) {
            commandHistory.push(input);
            historyIndex = commandHistory.length;
        }

        // Check for special commands
        const lowerInput = input.toLowerCase().trim();

        // Handle exit commands
        if (['exit', 'quit'].includes(lowerInput)) {
            await cleanupAndExit(client);
            return;
        }

        // Handle help command
        if (lowerInput === 'help' || lowerInput === '?') {
            console.log('\n🔍 Available Commands:');
            console.log('  help, ?           - Show this help message');
            console.log('  tools             - List available tools');
            console.log('  clear             - Clear the conversation history');
            console.log('  exit, quit        - End the session');
            await promptUser(client);
            return;
        }

        // Handle tools command
        if (lowerInput === 'tools') {
            displayAvailableTools(client);
            await promptUser(client);
            return;
        }

        // Handle clear command
        if (lowerInput === 'clear') {
            client.clearConversationHistory();
            console.log('\n🧹 Conversation history cleared');
            await promptUser(client);
            return;
        }

        try {
            // Send the user's input to the model
            await client.sendPrompt(input);

            // Continue the conversation
            await promptUser(client);
        } catch (error) {
            console.error(`\n❌ Error processing your request: ${error instanceof Error ? error.message : String(error)}`);
            await promptUser(client);
        }
    });
}

/**
 * Clean up resources and exit
 */
async function cleanupAndExit(client) {
    console.log('\n👋 Ending session...');

    // Disconnect from MCP server if connected
    if (client.isConnectedToMCP()) {
        await client.disconnect();
        console.log('Disconnected from MCP server');
    }

    rl.close();
    console.log('Goodbye!\n');
    process.exit(0);
}

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', async () => {
    console.log('\n\n⚠️  Received SIGINT. Shutting down...');
    rl.close();
    process.exit(0);
});

// Start the interactive session
startInteractiveSession().catch(error => {
    console.error(`\n❌ Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
