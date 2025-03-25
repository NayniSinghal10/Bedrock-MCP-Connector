import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { Message, TextContent, ToolRequest, ToolResponse } from "../types.js";
import { ToolManager } from "./ToolManager.js";
import { Logger, LogLevel, createDefaultLogger } from "../utils/logging.js";

/**
 * Agent for interacting with AWS Bedrock's Converse API
 */
export class ConverseAgent {
    private modelId: string;
    private region: string;
    private bedrockClient: BedrockRuntimeClient;
    private systemPrompt: string;
    private messages: Message[];
    private toolManager: ToolManager | null;
    private responseOutputTags: [string, string] | [];
    private maxTokens: number;
    private temperature: number;
    private logger: Logger;

    /**
     * Create a new ConverseAgent
     * 
     * @param modelId - The AWS Bedrock model ID to use
     * @param options - Configuration options
     */
    constructor(
        modelId: string,
        options: {
            region?: string;
            systemPrompt?: string;
            toolManager?: ToolManager;
            responseOutputTags?: [string, string];
            maxTokens?: number;
            temperature?: number;
        } = {}
    ) {
        this.modelId = modelId;
        this.region = options.region || 'us-east-1';
        this.bedrockClient = new BedrockRuntimeClient({ region: this.region });
        this.systemPrompt = options.systemPrompt || `You are a helpful assistant with access to external tools.
                                                    - Use available tools **only when necessary** to provide accurate or up-to-date information.
                                                    - If a question can be answered based on your knowledge, respond directly **without using tools**.
                                                    - If a tool is required:
                                                        1. **Check if all necessary parameters are available.** If they are, use the tool directly.
                                                        2. **If any parameters are missing, do not proceed.** Instead, ask the user for the required information, explaining why it is needed.
                                                        3. **Wait for the user's response before using the tool.**
                                                    - If the user asks multiple questions, **handle them one by one**.
                                                    - If some questions require tools and others don't, **answer what you can immediately**, then use tools as needed.
                                                    - After using a tool, continue answering any remaining questions.
                                                    `;
        this.messages = [];
        this.toolManager = options.toolManager || null;
        this.responseOutputTags = options.responseOutputTags || [];
        this.maxTokens = options.maxTokens || 2000;
        this.temperature = options.temperature || 0.7;
        this.logger = createDefaultLogger('ConverseAgent');
        this.logger.setLevel(LogLevel.INFO); // Set to DEBUG to see all logs
    }

    /**
     * Invoke the agent with a text prompt
     * 
     * @param prompt - The text prompt to send
     * @returns A promise that resolves to the agent's response
     */
    async invokeWithPrompt(prompt: string): Promise<string> {
        const content: TextContent[] = [{ text: prompt }];
        return await this.invoke(content);
    }

    /**
     * Invoke the agent with content
     * 
     * @param content - The content to send
     * @returns A promise that resolves to the agent's response
     */
    async invoke(content: any[]): Promise<string> {
        // Check if the content is a tool result
        const isToolResult = content.length > 0 && content[0].toolResult !== undefined;

        if (!isToolResult) {
            // This is a new user query, clear accumulated tool results
            this.clearAccumulatedToolResults();
        }

        if (isToolResult) {
            this.logger.debug("Detected tool result in invoke:", JSON.stringify(content, null, 2));

            // For tool results, we need to add them to the last assistant message
            // First, check if we have an assistant message
            let assistantMessageIndex = -1;
            for (let i = this.messages.length - 1; i >= 0; i--) {
                if (this.messages[i].role === "assistant") {
                    assistantMessageIndex = i;
                    break;
                }
            }

            if (assistantMessageIndex >= 0) {
                // Replace the assistant message with a new one containing the tool results
                this.messages[assistantMessageIndex] = {
                    role: "assistant",
                    content: content
                };
                this.logger.debug("Updated assistant message with tool results");
            } else {
                // If no assistant message found, add a new one
                this.messages.push({
                    role: "assistant",
                    content: content
                });
                this.logger.debug("Added new assistant message with tool results");
            }
        } else {
            // Regular user message
            this.messages.push({
                role: "user",
                content: content,
            });
            this.logger.debug("Added user message");
        }

        this.logger.debug("Sending message to model:", JSON.stringify(this.messages[this.messages.length - 1], null, 2));
        const response = await this._getConverseResponse();
        return await this._handleResponse(response);
    }

    /**
     * Get the conversation history
     * 
     * @returns The conversation history
     */
    getConversationHistory(): Message[] {
        return [...this.messages];
    }

    /**
     * Clear the conversation history
     */
    clearConversationHistory(): void {
        this.messages = [];
    }

    /**
     * Set the tool manager
     * 
     * @param toolManager - The tool manager to use
     */
    setToolManager(toolManager: ToolManager): void {
        this.toolManager = toolManager;
    }

    /**
     * Get the Bedrock client
     * 
     * @returns The Bedrock client
     */
    getBedrockClient(): BedrockRuntimeClient {
        return this.bedrockClient;
    }

    /**
     * Get a response from the Converse API
     * 
     * @returns A promise that resolves to the Converse API response
     * @private
     */
    private async _getConverseResponse() {
        // Build the command input with system prompt, inference config, and (optionally) tool config
        const commandInput: any = {
            modelId: this.modelId,
            messages: this.messages,
            system: [{ text: this.systemPrompt }],
            inferenceConfig: {
                maxTokens: this.maxTokens,
                temperature: this.temperature,
            },
        };

        if (this.toolManager) {
            const toolConfig = this.toolManager.getToolConfig();
            if (toolConfig) {
                commandInput.toolConfig = toolConfig;
            }
        }

        // Log the full conversation history for debugging
        this.logger.debug("Full conversation history:", JSON.stringify(this.messages, null, 2));

        // Log the complete API payload for debugging
        this.logger.debug("CONVERSE API PAYLOAD:", JSON.stringify(commandInput, null, 2));

        // Log the exact structure of each message for debugging
        this.logger.debug("Message structure breakdown:");
        this.messages.forEach((msg, index) => {
            this.logger.debug(`Message ${index} (${msg.role}):`);
            if (Array.isArray(msg.content)) {
                msg.content.forEach((contentItem, contentIndex) => {
                    this.logger.debug(`  Content item ${contentIndex} type: ${Object.keys(contentItem).join(', ')}`);
                });
            } else {
                this.logger.debug(`  Content is not an array: ${typeof msg.content}`);
            }
        });

        const command = new ConverseCommand(commandInput);
        return await this.bedrockClient.send(command);
    }

    /**
     * Handle the response from the Converse API
     * 
     * @param response - The response from the Converse API
     * @returns A promise that resolves to the agent's response
     * @private
     */
    // Store accumulated tool results across API calls
    private accumulatedToolResults: { name: string, text: string }[] = [];

    private async _handleResponse(response: any): Promise<string> {
        this.logger.debug("Received response from Bedrock:", JSON.stringify(response, null, 2));

        // Check for valid response
        if (!response.output || !response.output.message) {
            this.logger.error("Invalid response structure, missing output.message");
            this.logger.error("Response:", response);
            throw new Error("Invalid response structure from Bedrock API");
        }

        // Log the message content for debugging
        this.logger.debug("Message content before pushing to history:",
            JSON.stringify(response.output.message.content, null, 2));

        const stopReason = response.stopReason;
        this.logger.debug("Stop reason:", stopReason);

        if (stopReason === 'end_turn' || stopReason === 'stop_sequence') {
            // Add the response message to the conversation history
            this.messages.push(response.output.message);

            try {
                const message = response.output.message;
                const content = message.content;

                if (!content || content.length === 0) {
                    this.logger.error("No content in message");
                    return '';
                }

                this.logger.debug("Content:", JSON.stringify(content, null, 2));
                let text = (content[0] && content[0].text) || '';
                this.logger.debug("Extracted text:", text ? text.substring(0, 100) + "..." : "(empty)");

                if (this.responseOutputTags.length === 2) {
                    const [startTag, endTag] = this.responseOutputTags;
                    // The 's' flag allows dot to match newlines
                    const pattern = new RegExp(`${startTag}(.*?)${endTag}`, 's');
                    const match = text.match(pattern);
                    if (match) {
                        text = match[1];
                    }
                }

                return text;
            } catch (err) {
                this.logger.error("Error extracting text from response:", err);
                return '';
            }
        } else if (stopReason === 'tool_use') {
            if (!this.toolManager) {
                throw new Error("Tool use requested but no tool manager is set");
            }

            try {
                // First, add the assistant message with toolUse to the conversation history
                this.messages.push(response.output.message);

                // Process each tool use and collect results
                const toolResults = [];
                let combinedText = "";

                this.logger.debug("Processing tool use blocks...");
                for (const contentItem of response.output.message.content) {
                    if (contentItem.toolUse) {
                        const toolRequest: ToolRequest = {
                            toolUseId: contentItem.toolUse.toolUseId,
                            name: contentItem.toolUse.name,
                            input: contentItem.toolUse.input || {},
                        };

                        this.logger.info(`Gathering data using tool: ${toolRequest.name} ...`);
                        this.logger.debug(`Tool request: ${JSON.stringify(toolRequest, null, 2)}`);

                        const toolResult = await this.toolManager.executeTool(toolRequest);
                        this.logger.info("Analyzing data ...");
                        this.logger.debug(`Tool result: ${JSON.stringify(toolResult, null, 2)}`);

                        // Add the tool result to the collection
                        toolResults.push({
                            toolResult: {
                                toolUseId: toolRequest.toolUseId,
                                content: toolResult.content || [],
                                status: toolResult.status || 'success'
                            }
                        });

                        // Extract text from tool result for the combined response
                        if (toolResult && toolResult.content) {
                            for (const item of toolResult.content) {
                                if (item.text) {
                                    combinedText += item.text + " ";
                                }
                            }
                        }
                    }
                }

                // Add a user message with the tool results
                if (toolResults.length > 0) {
                    const userMessageWithToolResults: {
                        role: "user";
                        content: any[];
                    } = {
                        role: "user",
                        content: toolResults
                    };
                    this.messages.push(userMessageWithToolResults);

                    // Now get the next response from the model
                    const nextResponse = await this._getConverseResponse();
                    return await this._handleResponse(nextResponse);
                }

                return combinedText.trim();
            } catch (e) {
                this.logger.error("Error executing tool:", e);
                throw new Error(`Missing required tool use field: ${e instanceof Error ? e.message : String(e)}`);
            }
        } else if (stopReason === 'max_tokens') {
            // Add the response message to the conversation history
            this.messages.push(response.output.message);

            // Continue the conversation if the token limit is reached
            return await this.invokeWithPrompt('Please continue.');
        } else {
            throw new Error(`Unknown stop reason: ${stopReason}`);
        }
    }

    /**
     * Clear accumulated tool results
     */
    clearAccumulatedToolResults(): void {
        this.accumulatedToolResults = [];
    }

    /**
     * Format the combined response to make it more natural
     * 
     * @param initialText - The initial text from the model
     * @param toolResultText - The text from the tool result
     * @param toolName - The name of the tool (not used in generic implementation)
     * @returns A formatted combined response
     * @private
     */
    private formatCombinedResponse(initialText: string, toolResultText: string, toolName: string): string {
        // Generic formatting for all tools
        return `${initialText}\n\n${toolResultText}`;
    }
}
