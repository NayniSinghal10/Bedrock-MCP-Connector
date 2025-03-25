#!/usr/bin/env node
import { BedrockMCPClient, LogLevel, createDefaultLogger } from './dist/index.js';

// Create a logger
const logger = createDefaultLogger('Test');
logger.setLevel(LogLevel.INFO);  // Set to LogLevel.DEBUG to see debug messages

// Configuration - Replace with your own values
const config = {
    modelId: 'anthropic.claude-3-sonnet-20240229-v1:0', // Replace with your preferred model
    region: 'us-east-1', // Replace with your AWS region
    systemPrompt: `You are a helpful assistant with access to external tools.
                    - Use available tools **only when necessary** to provide accurate or up-to-date information.
                    - If a question can be answered based on your knowledge, respond directly **without using tools**.
                    - If a tool is required:
                        1. **Check if all necessary parameters are available.** If they are, use the tool directly.
                        2. **If any parameters are missing, do not proceed.** Instead, ask the user for the required information, explaining why it is needed.
                        3. **Wait for the user's response before using the tool.**
                    - If the user asks multiple questions, **handle them one by one**.
                    - If some questions require tools and others don't, **answer what you can immediately**, then use tools as needed.
                    - After using a tool, continue answering any remaining questions.
                    `
    // mcpServerUrl: 'http://localhost:5713/sse', // Uncomment and set if you have an MCP server
};

/**
 * Test the package
 */
async function testPackage() {
    logger.info('Starting test...');

    try {
        // Create the client
        logger.info(`Creating client with model: ${config.modelId}`);
        const client = new BedrockMCPClient(config);

        // Set the log level for the client and its components
        // Use LogLevel.INFO for normal operation (default)
        // Use LogLevel.DEBUG to see detailed debugging information
        client.setLogLevel(LogLevel.INFO);  // Change to LogLevel.DEBUG to see detailed debugging

        // Set up event listeners
        const emitter = client.getEmitter();

        emitter.on('message', (message) => {
            logger.info(`Message: ${message}`);
        });

        emitter.on('error', (error) => {
            logger.error(`Error: ${error.message}`);
        });

        emitter.on('response:start', () => {
            logger.info('Response started');
        });

        emitter.on('response:end', (fullResponse) => {
            logger.info('Response completed', fullResponse);
        });

        // Add event listeners for tool events
        emitter.on('tool:start', (name, input) => {
            // Log when a tool is requested
            logger.info(`Tool requested: ${name} with input: ${JSON.stringify(input)}`);
        });

        emitter.on('tool:end', (name, result) => {
            // Log when a tool execution completes
            logger.info(`Tool execution completed: ${name}`);
            logger.debug(`Tool result: ${JSON.stringify(result)}`);
        });

        // Connect to MCP server if URL is provided
        if (config.mcpServerUrl) {
            try {
                logger.info(`Connecting to MCP server at ${config.mcpServerUrl}`);
                await client.connect();
                logger.info('Connected to MCP server');

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

        // Register custom tools
        logger.info('Registering custom tool: getCurrentTime');
        client.registerTool(
            'getCurrentTime',
            async (name, input) => {
                // Log when tool is requested
                logger.info(`Tool execution: ${name} with input: ${JSON.stringify(input)}`);

                const timezone = input.timezone || 'UTC';
                const date = new Date().toLocaleString('en-US', { timeZone: timezone });

                // Debug logging (only shown when log level is DEBUG)
                logger.debug(`Tool result for ${name}:`, { timezone, date });

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

        logger.info('Registering custom tool: weatherForecast');
        client.registerTool(
            'weatherForecast',
            async (name, input) => {
                // Log when tool is requested
                logger.info(`Tool execution: ${name} with input: ${JSON.stringify(input)}`);

                // This parameter is required
                if (!input.city) {
                    return {
                        content: [{ text: `Error: City parameter is required for weather forecast` }],
                        isError: true
                    };
                }

                const city = input.city;
                const days = input.days || 3;

                // Simulate weather forecast data
                const weatherData = {
                    city,
                    forecast: []
                };

                const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Rainy', 'Thunderstorms', 'Snowy'];
                const today = new Date();

                for (let i = 0; i < days; i++) {
                    const date = new Date(today);
                    date.setDate(today.getDate() + i);

                    const tempHigh = Math.round(15 + Math.random() * 15); // 15-30°C
                    const tempLow = Math.round(5 + Math.random() * 10);   // 5-15°C
                    const condition = conditions[Math.floor(Math.random() * conditions.length)];

                    weatherData.forecast.push({
                        date: date.toLocaleDateString(),
                        condition,
                        tempHigh,
                        tempLow
                    });
                }

                // Debug logging (only shown when log level is DEBUG)
                logger.debug(`Tool result for ${name}:`, weatherData);

                // Format the response
                let forecastText = `Weather forecast for ${city} for the next ${days} days:\n\n`;
                weatherData.forecast.forEach(day => {
                    forecastText += `${day.date}: ${day.condition}, High: ${day.tempHigh}°C, Low: ${day.tempLow}°C\n`;
                });

                return { content: [{ text: forecastText }] };
            },
            'Get weather forecast for a city',
            {
                type: 'object',
                properties: {
                    city: {
                        type: 'string',
                        description: 'The city to get the weather forecast for (e.g., London, New York)',
                    },
                    days: {
                        type: 'number',
                        description: 'Number of days to forecast (default: 3)',
                    }
                },
                required: ['city'],
            }
        );

        logger.info('Registering custom tool: calculator');
        client.registerTool(
            'calculator',
            async (name, input) => {
                // Log when tool is requested
                logger.info(`Tool execution: ${name} with input: ${JSON.stringify(input)}`);

                const { operation, a, b } = input;
                let result;

                try {
                    switch (operation) {
                        case 'add':
                            result = a + b;
                            break;
                        case 'subtract':
                            result = a - b;
                            break;
                        case 'multiply':
                            result = a * b;
                            break;
                        case 'divide':
                            if (b === 0) {
                                throw new Error('Division by zero');
                            }
                            result = a / b;
                            break;
                        default:
                            throw new Error(`Unknown operation: ${operation}`);
                    }

                    // Debug logging (only shown when log level is DEBUG)
                    logger.debug(`Tool result for ${name}:`, { operation, a, b, result });

                    return { content: [{ text: `The result of ${a} ${operation} ${b} is ${result}` }] };
                } catch (error) {
                    return { content: [{ text: `Error: ${error.message}` }] };
                }
            },
            'Perform basic arithmetic operations',
            {
                type: 'object',
                properties: {
                    operation: {
                        type: 'string',
                        description: 'The operation to perform (add, subtract, multiply, divide)',
                        enum: ['add', 'subtract', 'multiply', 'divide']
                    },
                    a: {
                        type: 'number',
                        description: 'The first operand'
                    },
                    b: {
                        type: 'number',
                        description: 'The second operand'
                    }
                },
                required: ['operation', 'a', 'b'],
            }
        );

        // Send a test prompt - explicitly ask for all three answers
        const testPrompt = 'What is the capital of France? What is 1234 * 5678? and also What is the time in Paris?';
        logger.info(`Sending test prompt: "${testPrompt}"`);

        console.log('\nSending prompt to Bedrock...');
        try {
            const response = await client.sendPrompt(testPrompt);

            console.log('\n=== RESPONSE ===');
            console.log(response || '(No response content)');
            console.log('===============\n');

            if (!response) {
                logger.warn('Response was empty or undefined');
            }
        } catch (error) {
            console.error('\n=== ERROR SENDING PROMPT ===');
            console.error(`Error type: ${error.constructor.name}`);
            console.error(`Error message: ${error.message}`);
            if (error.stack) {
                console.error(`Stack trace: ${error.stack}`);
            }
            if (error.code) {
                console.error(`Error code: ${error.code}`);
            }
            console.error('===========================\n');
            throw error;
        }

        // Clean up
        if (client.isConnectedToMCP()) {
            await client.disconnect();
            logger.info('Disconnected from MCP server');
        }

        logger.info('Test completed successfully!');
        return true;
    } catch (error) {
        logger.error(`Test failed: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

/**
 * Test conversational tool usage with missing parameters
 */
async function testConversationalToolUsage() {
    logger.info('Starting conversational tool usage test...');

    try {
        // Create the client
        logger.info(`Creating client with model: ${config.modelId}`);
        const client = new BedrockMCPClient({
            ...config
        });
        client.setLogLevel(LogLevel.INFO);

        // Set up event listeners
        const emitter = client.getEmitter();

        emitter.on('message', (message) => {
            logger.info(`Message: ${message}`);
        });

        emitter.on('error', (error) => {
            logger.error(`Error: ${error.message}`);
        });

        emitter.on('tool:start', (name, input) => {
            logger.info(`Tool requested: ${name} with input: ${JSON.stringify(input)}`);
        });

        emitter.on('tool:end', (name, result) => {
            logger.info(`Tool execution completed: ${name}`);
            logger.debug(`Tool result: ${JSON.stringify(result)}`);
        });

        // Register the weatherForecast tool
        logger.info('Registering custom tool: weatherForecast');
        client.registerTool(
            'weatherForecast',
            async (name, input) => {
                logger.info(`Tool execution: ${name} with input: ${JSON.stringify(input)}`);

                // This parameter is required
                if (!input.city) {
                    return {
                        content: [{ text: `Error: City parameter is required for weather forecast` }],
                        isError: true
                    };
                }

                const city = input.city;
                const days = input.days || 3;

                // Simulate weather forecast data
                const weatherData = {
                    city,
                    forecast: []
                };

                const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Rainy', 'Thunderstorms', 'Snowy'];
                const today = new Date();

                for (let i = 0; i < days; i++) {
                    const date = new Date(today);
                    date.setDate(today.getDate() + i);

                    const tempHigh = Math.round(15 + Math.random() * 15); // 15-30°C
                    const tempLow = Math.round(5 + Math.random() * 10);   // 5-15°C
                    const condition = conditions[Math.floor(Math.random() * conditions.length)];

                    weatherData.forecast.push({
                        date: date.toLocaleDateString(),
                        condition,
                        tempHigh,
                        tempLow
                    });
                }

                logger.debug(`Tool result for ${name}:`, weatherData);

                // Format the response
                let forecastText = `Weather forecast for ${city} for the next ${days} days:\n\n`;
                weatherData.forecast.forEach(day => {
                    forecastText += `${day.date}: ${day.condition}, High: ${day.tempHigh}°C, Low: ${day.tempLow}°C\n`;
                });

                return { content: [{ text: forecastText }] };
            },
            'Get weather forecast for a city',
            {
                type: 'object',
                properties: {
                    city: {
                        type: 'string',
                        description: 'The city to get the weather forecast for (e.g., London, New York)',
                    },
                    days: {
                        type: 'number',
                        description: 'Number of days to forecast (default: 3)',
                    }
                },
                required: ['city'],
            }
        );

        // Register the calculator tool
        logger.info('Registering custom tool: calculator');
        client.registerTool(
            'calculator',
            async (name, input) => {
                logger.info(`Tool execution: ${name} with input: ${JSON.stringify(input)}`);

                const { operation, a, b } = input;

                // Validate required parameters
                if (!operation) {
                    return {
                        content: [{ text: `Error: Operation parameter is required for calculator` }],
                        isError: true
                    };
                }

                if (a === undefined || a === null) {
                    return {
                        content: [{ text: `Error: First operand (a) is required for calculator` }],
                        isError: true
                    };
                }

                if (b === undefined || b === null) {
                    return {
                        content: [{ text: `Error: Second operand (b) is required for calculator` }],
                        isError: true
                    };
                }

                let result;

                try {
                    switch (operation) {
                        case 'add':
                            result = a + b;
                            break;
                        case 'subtract':
                            result = a - b;
                            break;
                        case 'multiply':
                            result = a * b;
                            break;
                        case 'divide':
                            if (b === 0) {
                                throw new Error('Division by zero');
                            }
                            result = a / b;
                            break;
                        default:
                            throw new Error(`Unknown operation: ${operation}`);
                    }

                    logger.debug(`Tool result for ${name}:`, { operation, a, b, result });

                    return { content: [{ text: `The result of ${a} ${operation} ${b} is ${result}` }] };
                } catch (error) {
                    return {
                        content: [{ text: `Error: ${error.message}` }],
                        isError: true
                    };
                }
            },
            'Perform basic arithmetic operations',
            {
                type: 'object',
                properties: {
                    operation: {
                        type: 'string',
                        description: 'The operation to perform (add, subtract, multiply, divide)',
                        enum: ['add', 'subtract', 'multiply', 'divide']
                    },
                    a: {
                        type: 'number',
                        description: 'The first operand'
                    },
                    b: {
                        type: 'number',
                        description: 'The second operand'
                    }
                },
                required: ['operation', 'a', 'b'],
            }
        );

        // Test 1: General knowledge question
        console.log('\n=== TEST 1: General Knowledge Question ===');
        console.log('Sending prompt: "What is the tallest mountain in the world?"');

        let response = await client.sendPrompt("What is the tallest mountain in the world?");

        console.log('\n=== RESPONSE ===');
        console.log(response || '(No response content)');
        console.log('===============\n');

        // Clear conversation history and accumulated tool results before next test
        client.clearConversationHistory();
        client.getAgent().clearAccumulatedToolResults();
        logger.info('Cleared conversation history and accumulated tool results');

        // Test 2: Weather in Tokyo
        console.log('\n=== TEST 2: Weather in Tokyo ===');
        console.log('Sending prompt: "What\'s the weather forecast for Tokyo?"');

        response = await client.sendPrompt("What's the weather forecast for Tokyo?");

        console.log('\n=== RESPONSE ===');
        console.log(response || '(No response content)');
        console.log('===============\n');

        // Clear conversation history and accumulated tool results before next test
        client.clearConversationHistory();
        client.getAgent().clearAccumulatedToolResults();
        logger.info('Cleared conversation history and accumulated tool results');

        // Test 3: Weather in New York
        console.log('\n=== TEST 3: Weather in New York ===');
        console.log('Sending prompt: "What\'s the weather forecast for New York?"');

        response = await client.sendPrompt("What's the weather forecast for New York?");

        console.log('\n=== RESPONSE ===');
        console.log(response || '(No response content)');
        console.log('===============\n');

        // Clear conversation history and accumulated tool results before next test
        client.clearConversationHistory();
        client.getAgent().clearAccumulatedToolResults();
        logger.info('Cleared conversation history and accumulated tool results');

        // Test 4: Calculator with missing parameters - Initial prompt
        console.log('\n=== TEST 4: Calculator with Missing Parameters ===');
        console.log('Sending initial prompt: "Can you help me multiply 42 and 7?"');

        response = await client.sendPrompt("Can you help me multiply 42 and 7?");

        console.log('\n=== RESPONSE (LLM should use calculator tool) ===');
        console.log(response || '(No response content)');
        console.log('===============\n');

        // Clear conversation history and accumulated tool results before next test
        client.clearConversationHistory();
        client.getAgent().clearAccumulatedToolResults();
        logger.info('Cleared conversation history and accumulated tool results');

        // Test 5: Calculator with partial parameters - demonstrate how LLM should handle missing parameters
        console.log('\n=== TEST 5: Calculator with Partial Parameters ===');
        console.log('Sending prompt: "What is the result of multiplying 42 by something? I want you to use the calculator tool but I\'ll only give you one number."');

        response = await client.sendPrompt("What is the result of multiplying 42 by something? I want you to use the calculator tool but I'll only give you one number.");

        console.log('\n=== RESPONSE (LLM should explain it needs both numbers) ===');
        console.log(response || '(No response content)');
        console.log('===============\n');

        // Test 5 Follow-up: Provide the missing parameter
        console.log('\n=== TEST 5 FOLLOW-UP: Providing Missing Parameter ===');
        console.log('Sending follow-up: "The second number is 6. Please use the calculator tool to multiply 42 by 6."');

        response = await client.sendPrompt("The second number is 6.");

        console.log('\n=== RESPONSE (LLM should use calculator tool with complete parameters) ===');
        console.log(response || '(No response content)');
        console.log('===============\n');

        logger.info('Conversational tool usage test completed successfully!');
        return true;
    } catch (error) {
        logger.error(`Conversational tool usage test failed: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

/**
 * Test LLM's ability to convert tool response to specific JSON format
 */
async function testJsonToolResponse() {
    logger.info('Starting JSON tool response test...');

    try {
        // Create the client
        logger.info(`Creating client with model: ${config.modelId}`);
        const client = new BedrockMCPClient({
            ...config
        });
        client.setLogLevel(LogLevel.DEBUG);

        // Set up event listeners
        const emitter = client.getEmitter();

        emitter.on('message', (message) => {
            logger.info(`Message: ${message}`);
        });

        emitter.on('error', (error) => {
            logger.error(`Error: ${error.message}`);
        });

        emitter.on('tool:start', (name, input) => {
            logger.info(`Tool requested: ${name} with input: ${JSON.stringify(input)}`);
        });

        emitter.on('tool:end', (name, result) => {
            logger.info(`Tool execution completed: ${name}`);
            logger.debug(`Tool result: ${JSON.stringify(result)}`);
        });

        // Register a tool that returns text data (not JSON)
        logger.info('Registering custom tool: getBookInfo');
        client.registerTool(
            'getBookInfo',
            async (name, input) => {
                logger.info(`Tool execution: ${name} with input: ${JSON.stringify(input)}`);

                // Validate required parameters
                if (!input.bookId) {
                    return {
                        content: [{ text: `Error: bookId parameter is required` }],
                        isError: true
                    };
                }

                // Return book information in plain text format (not JSON)
                const bookInfo =
                    `Book ID: ${input.bookId}\n` +
                    `Title: The Great Adventure\n` +
                    `Author: Jane Smith\n` +
                    `Published: 2023\n` +
                    `Publisher: Book House Publishing\n` +
                    `Pages: 328\n` +
                    `Genre: Fiction, Adventure\n` +
                    `Rating: 4.5/5\n` +
                    `ISBN: 978-1234567890\n` +
                    `Available formats: Hardcover, Paperback, E-book, Audiobook\n` +
                    `Price: $24.99\n` +
                    `Description: A thrilling journey through uncharted territories, where the protagonist discovers not just a new world, but themselves.`;

                logger.debug(`Tool result for ${name}:`, bookInfo);

                // Return the text response
                return {
                    content: [{ text: bookInfo }]
                };
            },
            'Get information about a book',
            {
                type: 'object',
                properties: {
                    bookId: {
                        type: 'string',
                        description: 'The ID of the book to retrieve information for',
                    }
                },
                required: ['bookId'],
            }
        );

        // Test: Ask LLM to convert tool response to specific JSON format
        console.log('\n=== TEST: LLM JSON Conversion ===');
        console.log('Sending prompt to get book info and convert to JSON format...');

        // Define the expected JSON structure
        const expectedJsonStructure = {
            book: {
                id: 'string',
                title: 'string',
                author: 'string',
                publication: {
                    year: 'number',
                    publisher: 'string'
                },
                details: {
                    pages: 'number',
                    genres: 'array',
                    rating: 'number',
                    isbn: 'string'
                },
                formats: 'array',
                price: 'number'
            }
        };

        // Create a client with a specific system prompt for JSON conversion
        const jsonClientConfig = {
            ...config,
            systemPrompt: `You are a helpful assistant with access to external tools.
                When asked to convert tool responses to JSON:
                1. Call the specified tool to get the data
                2. Convert the response to the requested JSON format
                3. Return ONLY the JSON object with NO explanations, introductions, or raw tool output
                4. Ensure your response is valid JSON that can be parsed directly
                5. Follow the exact JSON structure specified in the request
                
                IMPORTANT: When asked to return JSON, your entire response must be ONLY the JSON object.
                Do not include any text before or after the JSON.`
        };

        const jsonClient = new BedrockMCPClient(jsonClientConfig);
        jsonClient.setLogLevel(LogLevel.DEBUG);

        // Register the same tool on the new client
        logger.info('Registering getBookInfo tool on JSON client');
        jsonClient.registerTool(
            'getBookInfo',
            async (name, input) => {
                logger.info(`Tool execution: ${name} with input: ${JSON.stringify(input)}`);

                // Validate required parameters
                if (!input.bookId) {
                    return {
                        content: [{ text: `Error: bookId parameter is required` }],
                        isError: true
                    };
                }

                // Return book information in plain text format (not JSON)
                const bookInfo =
                    `Book ID: ${input.bookId}\n` +
                    `Title: The Great Adventure\n` +
                    `Author: Jane Smith\n` +
                    `Published: 2023\n` +
                    `Publisher: Book House Publishing\n` +
                    `Pages: 328\n` +
                    `Genre: Fiction, Adventure\n` +
                    `Rating: 4.5/5\n` +
                    `ISBN: 978-1234567890\n` +
                    `Available formats: Hardcover, Paperback, E-book, Audiobook\n` +
                    `Price: $24.99\n` +
                    `Description: A thrilling journey through uncharted territories, where the protagonist discovers not just a new world, but themselves.`;

                logger.debug(`Tool result for ${name}:`, bookInfo);

                // Return the text response
                return {
                    content: [{ text: bookInfo }]
                };
            },
            'Get information about a book',
            {
                type: 'object',
                properties: {
                    bookId: {
                        type: 'string',
                        description: 'The ID of the book to retrieve information for',
                    }
                },
                required: ['bookId'],
            }
        );

        // Send prompt to get book info and convert to JSON with very explicit instructions
        const response = await jsonClient.sendPrompt(
            `TASK: Use the getBookInfo tool to get information about book with ID "B12345" and convert the response to JSON.

REQUIRED JSON FORMAT:
{
  "book": {
    "id": "string",
    "title": "string",
    "author": "string",
    "publication": {
      "year": number,
      "publisher": "string"
    },
    "details": {
      "pages": number,
      "genres": ["string", "string"],
      "rating": number,
      "isbn": "string"
    },
    "formats": ["string", "string"],
    "price": number
  }
}

CRITICAL INSTRUCTIONS:
1. Extract all relevant information from the tool response
2. For "genres", split the Genre field into an array
3. For "rating", convert "4.5/5" to the number 4.5
4. For "formats", split the "Available formats" into an array
5. For "price", convert "$24.99" to the number 24.99
6. For "year", extract the year as a number

YOUR RESPONSE MUST BE ONLY THE JSON OBJECT WITH NO OTHER TEXT.
DO NOT include any explanations, introductions, or the raw tool output.
DO NOT wrap the JSON in code blocks or quotes.
ENSURE your response is valid JSON that can be directly parsed.`
        );

        console.log('\n=== LLM RESPONSE ===');
        console.log(response || '(No response content)');
        console.log('===============\n');

        // Validate the LLM's response
        console.log('\n=== VALIDATING LLM RESPONSE ===');

        // Extract JSON from the response
        // The response might include both the JSON and the raw tool output
        // We need to extract just the JSON part
        console.log('Extracting JSON from response...');

        // Try to find a complete JSON object in the response
        let jsonString = '';
        try {
            // Look for the first opening brace
            const firstBraceIndex = response.indexOf('{');
            if (firstBraceIndex === -1) {
                throw new Error('No JSON object found in response');
            }

            // Start from the first opening brace
            let openBraces = 0;
            let inString = false;
            let escapeNext = false;

            // Parse character by character to find the matching closing brace
            for (let i = firstBraceIndex; i < response.length; i++) {
                const char = response[i];
                jsonString += char;

                if (escapeNext) {
                    escapeNext = false;
                    continue;
                }

                if (char === '\\') {
                    escapeNext = true;
                    continue;
                }

                if (char === '"' && !escapeNext) {
                    inString = !inString;
                    continue;
                }

                if (!inString) {
                    if (char === '{') {
                        openBraces++;
                    } else if (char === '}') {
                        openBraces--;
                        if (openBraces === 0) {
                            // We've found the complete JSON object
                            break;
                        }
                    }
                }
            }

            if (openBraces !== 0) {
                throw new Error('Incomplete JSON object found in response');
            }
        } catch (error) {
            console.log(`❌ Error extracting JSON: ${error.message}`);
            throw new Error(`Failed to extract JSON: ${error.message}`);
        }

        console.log('\n=== EXTRACTED JSON ===');
        console.log(jsonString);
        console.log('===============\n');

        // Try to parse the extracted JSON
        let parsedJson;
        try {
            parsedJson = JSON.parse(jsonString);
            console.log('✅ Extracted JSON is valid');
        } catch (error) {
            console.log('❌ Extracted JSON is not valid');
            console.error(`Parse error: ${error.message}`);
            throw new Error('Extracted JSON is not valid');
        }

        // Validate the JSON structure
        const validateJsonStructure = (obj, schema, path = '') => {
            const issues = [];

            // Check if book object exists
            if (!obj.book) {
                issues.push('Missing root "book" object');
                return issues;
            }

            // Check required fields in book object
            const requiredFields = ['id', 'title', 'author', 'publication', 'details', 'formats', 'price'];
            for (const field of requiredFields) {
                if (!(field in obj.book)) {
                    issues.push(`Missing required field: book.${field}`);
                }
            }

            // Check nested objects
            if (obj.book.publication) {
                if (!('year' in obj.book.publication)) {
                    issues.push('Missing field: book.publication.year');
                } else if (typeof obj.book.publication.year !== 'number') {
                    issues.push(`Field book.publication.year should be number but got ${typeof obj.book.publication.year}`);
                }

                if (!('publisher' in obj.book.publication)) {
                    issues.push('Missing field: book.publication.publisher');
                } else if (typeof obj.book.publication.publisher !== 'string') {
                    issues.push(`Field book.publication.publisher should be string but got ${typeof obj.book.publication.publisher}`);
                }
            }

            if (obj.book.details) {
                const detailFields = {
                    'pages': 'number',
                    'genres': 'object', // Array
                    'rating': 'number',
                    'isbn': 'string'
                };

                for (const [field, expectedType] of Object.entries(detailFields)) {
                    if (!(field in obj.book.details)) {
                        issues.push(`Missing field: book.details.${field}`);
                    } else {
                        const actualType = typeof obj.book.details[field];
                        if (expectedType === 'object' && !Array.isArray(obj.book.details[field])) {
                            issues.push(`Field book.details.${field} should be an array but got ${actualType}`);
                        } else if (expectedType !== 'object' && actualType !== expectedType) {
                            issues.push(`Field book.details.${field} should be ${expectedType} but got ${actualType}`);
                        }
                    }
                }
            }

            // Check formats array
            if (obj.book.formats && !Array.isArray(obj.book.formats)) {
                issues.push(`Field book.formats should be an array but got ${typeof obj.book.formats}`);
            }

            // Check price
            if ('price' in obj.book && typeof obj.book.price !== 'number') {
                issues.push(`Field book.price should be number but got ${typeof obj.book.price}`);
            }

            return issues;
        };

        const validationIssues = validateJsonStructure(parsedJson, expectedJsonStructure);

        if (validationIssues.length === 0) {
            console.log('✅ JSON structure validation passed! All expected fields are present with correct types.');
            console.log('\nParsed JSON:');
            console.log(JSON.stringify(parsedJson, null, 2));
        } else {
            console.log('❌ JSON structure validation failed with the following issues:');
            validationIssues.forEach(issue => console.log(`  - ${issue}`));
            throw new Error('JSON structure validation failed');
        }

        logger.info('JSON tool response test completed successfully!');
        return true;
    } catch (error) {
        logger.error(`JSON tool response test failed: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}

// Choose which test to run
const testType = process.argv[2] || 'basic';

if (testType === 'json') {
    console.log('=== TESTING JSON TOOL RESPONSE ===\n');
    testJsonToolResponse()
        .then(success => {
            if (success) {
                console.log('\n✅ JSON tool response test completed successfully!');
            } else {
                console.log('\n❌ JSON tool response test failed. See errors above.');
            }
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error(`\n❌ Fatal error: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        });
} else if (testType === 'conversation') {
    console.log('=== TESTING CONVERSATIONAL TOOL USAGE ===\n');
    testConversationalToolUsage()
        .then(success => {
            if (success) {
                console.log('\n✅ Conversational tool usage test completed successfully!');
            } else {
                console.log('\n❌ Conversational tool usage test failed. See errors above.');
            }
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error(`\n❌ Fatal error: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        });
} else {
    console.log('=== TESTING BEDROCK MCP CONNECTER PACKAGE ===\n');
    testPackage()
        .then(success => {
            if (success) {
                console.log('\n✅ Package is working correctly!');
            } else {
                console.log('\n❌ Package test failed. See errors above.');
            }
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error(`\n❌ Fatal error: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        });
}
