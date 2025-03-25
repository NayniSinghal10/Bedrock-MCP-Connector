import { ToolConfig, ToolHandler, ToolRequest, ToolResponse, ToolSpec } from "../types.js";
import { Logger, LogLevel, createDefaultLogger } from "../utils/logging.js";

/**
 * Manages tools for the Bedrock MCP Client
 */
export class ToolManager {
    private tools: Record<string, {
        handler: ToolHandler;
        description?: string;
        inputSchema?: Record<string, any>;
    }> = {};
    private logger: Logger;

    /**
     * Create a new ToolManager
     */
    constructor() {
        this.logger = createDefaultLogger('ToolManager');
        this.logger.setLevel(LogLevel.INFO); // Default to INFO, can be changed externally
    }

    /**
     * Register a tool with the manager
     * 
     * @param name - The name of the tool
     * @param handler - The function to execute when the tool is called
     * @param description - Optional description of the tool
     * @param inputSchema - Optional JSON schema for the tool's input
     */
    registerTool(
        name: string,
        handler: ToolHandler,
        description?: string,
        inputSchema?: Record<string, any>
    ): void {
        this.tools[name] = { handler, description, inputSchema };
    }

    /**
     * Get the tool configuration for Bedrock
     * 
     * @returns The tool configuration or null if no tools are registered
     */
    getToolConfig(): ToolConfig | null {
        const toolsList = Object.entries(this.tools).map(([name, tool]) => ({
            toolSpec: {
                name,
                description: tool.description || "Tool description",
                inputSchema: {
                    json: tool.inputSchema || { type: "object", properties: {}, required: [] }
                }
            } as ToolSpec
        }));

        if (toolsList.length === 0) {
            return null;
        }

        return {
            tools: toolsList
        };
    }

    /**
     * Execute a tool with the given request
     * 
     * @param request - The tool request
     * @returns A promise that resolves to the tool response
     * @throws Error if the tool is not registered
     */
    async executeTool(request: ToolRequest): Promise<ToolResponse> {
        const { toolUseId, name, input } = request;

        if (!this.tools[name]) {
            throw new Error(`Unknown tool: ${name}`);
        }

        const toolInput = typeof input === 'string' ? { value: input } : input || {};

        try {
            const result = await this.tools[name].handler(name, toolInput);

            if (result && typeof result === 'object' && result.content) {
                return {
                    toolUseId,
                    content: result.content,
                    status: 'success'
                };
            } else {
                let textResult;
                try {
                    if (typeof result === 'object') {
                        textResult = JSON.stringify(result);
                    } else {
                        textResult = String(result);
                    }
                } catch (e) {
                    textResult = `Error stringifying result: ${(e as Error).message}`;
                }

                return {
                    toolUseId,
                    content: [{ text: textResult }],
                    status: 'success'
                };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error executing tool ${name}:`, error);

            return {
                toolUseId,
                content: [{ text: `Error executing tool ${name}: ${errorMessage}` }],
                status: 'error'
            };
        }
    }

    /**
     * Get all registered tools
     * 
     * @returns An array of tool names and descriptions
     */
    getTools(): Array<{ name: string; description?: string }> {
        return Object.entries(this.tools).map(([name, tool]) => ({
            name,
            description: tool.description
        }));
    }

    /**
     * Check if a tool is registered
     * 
     * @param name - The name of the tool
     * @returns True if the tool is registered, false otherwise
     */
    hasTool(name: string): boolean {
        return !!this.tools[name];
    }
}
