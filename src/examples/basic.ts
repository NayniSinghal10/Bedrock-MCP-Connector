import { BedrockMCPClient, LogLevel, createDefaultLogger } from '../index.js';

// Create a logger
const logger = createDefaultLogger('Example');
logger.setLevel(LogLevel.DEBUG);

// Configuration
const config = {
    modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
    region: 'us-east-1',
    systemPrompt: 'You are a helpful assistant that provides concise and accurate information.',
    mcpServerUrl: 'http://localhost:5713/sse', // Optional: MCP server URL
    clientName: 'Example Client',
    clientVersion: '1.0.0',
};

/**
 * Run the example
 */
async function runExample() {
    logger.info('Starting example...');

    // Create the client
    const client = new BedrockMCPClient(config);

    // Set up event listeners
    const emitter = client.getEmitter();

    emitter.on('message', (message) => {
        logger.info(`Message: ${message}`);
    });

    emitter.on('error', (error) => {
        logger.error(`Error: ${error.message}`);
    });

    emitter.on('tool:start', (toolName, input) => {
        logger.info(`Tool started: ${toolName} with input: ${JSON.stringify(input)}`);
    });

    emitter.on('tool:end', (toolName, result) => {
        logger.info(`Tool completed: ${toolName}`);
    });

    emitter.on('response:start', () => {
        logger.info('Response started');
    });

    emitter.on('response:chunk', (chunk) => {
        logger.debug(`Response chunk: ${chunk.substring(0, 50)}...`);
    });

    emitter.on('response:end', (fullResponse) => {
        logger.info('Response completed');
    });

    try {
        // Connect to MCP server if URL is provided
        if (config.mcpServerUrl) {
            try {
                await client.connect();
                logger.info(`Connected to MCP server at ${config.mcpServerUrl}`);

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

        // Register a custom tool
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

        // Send a prompt
        logger.info('Sending prompt...');
        const response = await client.sendPrompt('What is the capital of France? Also, what time is it now?');

        logger.info('Response:');
        console.log('\n' + response + '\n');

        // Clean up
        if (client.isConnectedToMCP()) {
            await client.disconnect();
            logger.info('Disconnected from MCP server');
        }
    } catch (error) {
        logger.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Run the example
runExample().catch(error => {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
