import {Platform} from 'obsidian';
import type {Client} from '@modelcontextprotocol/sdk/client/index.js';
import type {StdioClientTransport as StdioClientTransportType} from '@modelcontextprotocol/sdk/client/stdio.js';
import type {CallToolResult, Tool} from '@modelcontextprotocol/sdk/types.js';

/**
 * MCP Server configuration (compatible with Claude Desktop / obsidian-smart-composer format)
 */
export interface McpServerConfig {
	command: string;
	args?: string[];
	env?: Record<string, string>;
}

/**
 * MCP tool call result structure.
 */
export interface McpToolResult {
	content: Array<{type: string; text?: string; [key: string]: unknown}>;
	isError?: boolean;
}

/**
 * MCP Client for stdio-based MCP servers.
 * 
 * Uses dynamic imports to avoid bundling issues with Node.js built-ins.
 * Desktop only - MCP requires child_process to spawn server processes.
 * 
 * Reference implementation: obsidian-smart-composer mcpManager.ts
 * 
 * Usage:
 *   const client = new McpClient({ command: "npx", args: ["-y", "mcp-remote", "https://..."] });
 *   await client.connect();
 *   const result = await client.callTool("process_document", { url: "..." });
 *   await client.disconnect();
 */
export class McpClient {
	private serverConfig: McpServerConfig;
	private client: Client | null = null;
	private transport: StdioClientTransportType | null = null;
	private initialized = false;
	private defaultEnv: Record<string, string> = {};

	/**
	 * Check if MCP is available on this platform.
	 * MCP requires desktop (child_process for stdio).
	 */
	static isAvailable(): boolean {
		return Platform.isDesktop;
	}

	constructor(serverConfig: McpServerConfig) {
		if (!McpClient.isAvailable()) {
			throw new Error('MCP_DESKTOP_ONLY: MCP is only available on desktop');
		}
		this.serverConfig = serverConfig;
	}

	/**
	 * Connect to the MCP server.
	 * This spawns the server process and performs the MCP handshake.
	 */
	async connect(): Promise<void> {
		if (this.initialized) {
			return;
		}

		// Dynamic imports to avoid bundling issues
		const {Client} = await import('@modelcontextprotocol/sdk/client/index.js');
		const {StdioClientTransport} = await import('@modelcontextprotocol/sdk/client/stdio.js');

		// Load shell environment (for PATH, etc.)
		await this.loadDefaultEnv();

		// Create client
		this.client = new Client(
			{name: 'paper-extractor', version: '1.0.0'},
			{capabilities: {}},
		);

		// Create transport with merged environment
		this.transport = new StdioClientTransport({
			command: this.serverConfig.command,
			args: this.serverConfig.args ?? [],
			env: {
				...this.defaultEnv,
				...(this.serverConfig.env ?? {}),
			},
		});

		// Connect
		await this.client.connect(this.transport);
		this.initialized = true;
	}

	/**
	 * Call a tool on the MCP server.
	 */
	async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
		if (!this.initialized || !this.client) {
			throw new Error('MCP_NOT_CONNECTED: Call connect() first');
		}

		const result = await this.client.callTool({name, arguments: args}) as CallToolResult;

		return {
			content: result.content as Array<{type: string; text?: string; [key: string]: unknown}>,
			isError: result.isError,
		};
	}

	/**
	 * List available tools on the MCP server.
	 */
	async listTools(): Promise<Array<{name: string; description?: string}>> {
		if (!this.initialized || !this.client) {
			throw new Error('MCP_NOT_CONNECTED: Call connect() first');
		}

		const result = await this.client.listTools();
		return (result.tools as Tool[]).map((tool) => ({
			name: tool.name,
			description: tool.description,
		}));
	}

	/**
	 * Disconnect and cleanup.
	 */
	async disconnect(): Promise<void> {
		if (this.transport) {
			await this.transport.close();
			this.transport = null;
		}
		this.client = null;
		this.initialized = false;
	}

	/**
	 * Check if connected and initialized.
	 */
	isConnected(): boolean {
		return this.initialized;
	}

	/**
	 * Load default environment from shell.
	 * This ensures PATH and other important variables are available.
	 */
	private async loadDefaultEnv(): Promise<void> {
		// Use process.env to get current environment
		// Dynamic require to avoid bundling issues
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const processModule = require('process') as typeof import('process');
		this.defaultEnv = {...processModule.env} as Record<string, string>;
	}
}

/**
 * Create an MCP client for PageIndex Cloud via mcp-remote.
 * 
 * mcp-remote handles OAuth authentication automatically.
 * First run will open a browser for user authentication.
 */
export function createPageIndexClient(): McpClient {
	return new McpClient({
		command: 'npx',
		args: ['-y', 'mcp-remote', 'https://chat.pageindex.ai/mcp'],
	});
}
