#!/usr/bin/env node

/**
 * Test script to list PageIndex MCP tools.
 * Run from project root: node scripts/test_pageindex_tools.mjs
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function main() {
	console.log('Connecting to PageIndex MCP...');

	const client = new Client(
		{ name: 'pageindex-test', version: '1.0.0' },
		{ capabilities: {} }
	);

	const transport = new StdioClientTransport({
		command: 'npx',
		args: ['-y', 'mcp-remote', 'https://chat.pageindex.ai/mcp'],
	});

	await client.connect(transport);
	console.log('Connected!\n');

	// List tools
	console.log('=== Available Tools ===\n');
	const toolsResult = await client.listTools();
	for (const tool of toolsResult.tools) {
		console.log(`Tool: ${tool.name}`);
		console.log(`  Description: ${tool.description || '(no description)'}`);
		if (tool.inputSchema && tool.inputSchema.properties) {
			console.log('  Parameters:');
			for (const [key, value] of Object.entries(tool.inputSchema.properties)) {
				const v = value;
				console.log(`    - ${key}: ${v.type || 'any'} ${v.description ? `(${v.description})` : ''}`);
			}
		}
		console.log('');
	}

	await transport.close();
	console.log('Done.');
}

main().catch(console.error);
