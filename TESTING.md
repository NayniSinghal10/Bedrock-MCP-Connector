# Testing the Bedrock MCP Connector Package

This document provides instructions on how to test the `@juspay/bedrock-mcp-connector` package to ensure it's working correctly.

## Prerequisites

Before testing, make sure you have:

1. AWS credentials configured with access to AWS Bedrock
2. AWS Bedrock model access (e.g., Claude models)
3. Node.js v18 or higher installed

## Testing Methods

There are several ways to test the package:

### 1. Using the Test Script

We've provided a test script (`test-package.js`) that demonstrates basic functionality:

```bash
# First build the package
npm run build

# Then run the test script
node test-package.js
```

The test script will:

- Create a BedrockMCPClient instance
- Register custom tools (getCurrentTime, weatherForecast, calculator)
- Send a test prompt to AWS Bedrock
- Display the response

If successful, you'll see:

- Log messages showing the progress
- The response from the model
- A success message: "✅ Package is working correctly!"

### Testing Conversational Tool Usage

The test script also includes a special mode for testing conversational tool usage with missing parameters:

```bash
# Run the conversational tool usage test
node test-package.js conversation
```

This test demonstrates:

1. How the model handles general knowledge questions
2. How the model uses tools when all parameters are provided
3. How the model should handle missing parameters by asking for them
4. How the model uses tools once all parameters are provided

The conversational test includes several test cases:

- **Test 1**: General knowledge question (no tool use)
- **Test 2 & 3**: Weather forecast with complete parameters
- **Test 4**: Calculator with complete parameters
- **Test 5**: Calculator with partial parameters - demonstrates how the model should ask for missing parameters
- **Test 5 Follow-up**: Providing the missing parameter and seeing the model use the tool

This test is particularly useful for verifying that:

1. The system prompt correctly guides the model's behavior
2. The model correctly identifies missing parameters
3. The model asks for missing parameters in a clear way
4. The model uses tools correctly once all parameters are provided
5. Tool results are properly handled and displayed

### 2. Using the CLI

You can test the CLI functionality:

```bash
# Build the package
npm run build

# Run the CLI
node dist/bin.js --model anthropic.claude-3-sonnet-20240229-v1:0
```

You can also use the package name directly if installed globally:

```bash
@juspay/bedrock-mcp-connector --model anthropic.claude-3-sonnet-20240229-v1:0
```

This will start an interactive CLI session where you can:

- Type prompts and get responses
- Use the `tools` command to see available tools
- Use the `help` command to see available commands

### 3. Using the Example

You can run the provided example:

```bash
# Build the package
npm run build

# Run the example
npm run example
```

## Troubleshooting

If you encounter issues:

### AWS Credentials

Make sure your AWS credentials are properly configured:

```bash
# Check if AWS credentials are configured
aws configure list
```

You should have:

- AWS Access Key ID
- AWS Secret Access Key
- Default region (matching the region in your config)

### AWS Bedrock Access

Ensure you have access to the model you're trying to use:

```bash
# List available models
aws bedrock list-foundation-models
```

Check that the model ID you're using (e.g., `anthropic.claude-3-sonnet-20240229-v1:0`) is in the list and that you have access to it.

### Common Errors

1. **Authentication Error**: Check your AWS credentials
2. **Model Access Error**: Verify you have access to the model
3. **Region Error**: Make sure the region in your config matches your AWS credentials
4. **MCP Connection Error**: If using an MCP server, check that it's running and accessible

## Verifying Functionality

To verify the package is working correctly:

1. **Basic Functionality**: The model should respond to simple prompts
2. **Tool Usage**: If you ask about the time, the model should use the `getCurrentTime` tool
3. **MCP Integration**: If connected to an MCP server, the model should be able to use tools from that server

## Next Steps

Once you've verified the package is working, you can:

1. Integrate it into your own applications
2. Customize the system prompt for your specific use case
3. Add more custom tools
4. Connect to your own MCP servers
