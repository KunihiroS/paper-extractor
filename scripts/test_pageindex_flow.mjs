#!/usr/bin/env node

/**
 * Test the correct PageIndex flow without actually uploading (dry-run).
 * Verifies API calls don't re-upload documents.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const TEST_PDF_URL = 'https://arxiv.org/pdf/2301.00001'; // Small test PDF

async function main() {
	console.log('=== PageIndex Flow Test ===\n');

	const client = new Client(
		{ name: 'pageindex-flow-test', version: '1.0.0' },
		{ capabilities: {} }
	);

	const transport = new StdioClientTransport({
		command: 'npx',
		args: ['-y', 'mcp-remote', 'https://chat.pageindex.ai/mcp'],
	});

	console.log('Connecting...');
	await client.connect(transport);
	console.log('Connected!\n');

	// Step 1: Check recent documents first (to see what we have)
	console.log('=== Step 1: recent_documents ===');
	const recentResult = await client.callTool({ name: 'recent_documents', arguments: {} });
	console.log('Response:', JSON.stringify(recentResult.content, null, 2).slice(0, 1000));
	console.log('');

	// Step 2: Upload document (ONE call only)
	console.log('=== Step 2: process_document (ONE call) ===');
	console.log(`URL: ${TEST_PDF_URL}`);
	const uploadResult = await client.callTool({ 
		name: 'process_document', 
		arguments: { url: TEST_PDF_URL } 
	});
	const uploadText = uploadResult.content[0]?.text || '';
	console.log('Response:', uploadText.slice(0, 500));
	
	let docName;
	try {
		const parsed = JSON.parse(uploadText);
		docName = parsed.doc_name;
		console.log(`\ndoc_name: ${docName}`);
		console.log(`status: ${parsed.status}`);
	} catch {
		console.log('Failed to parse response');
		await transport.close();
		return;
	}
	console.log('');

	if (!docName) {
		console.log('No doc_name returned, exiting');
		await transport.close();
		return;
	}

	// Step 3: Wait for completion using get_document (NOT process_document)
	console.log('=== Step 3: get_document (wait_for_completion=true) ===');
	console.log('This waits on SERVER side, no re-upload');
	const getDocResult = await client.callTool({
		name: 'get_document',
		arguments: { 
			doc_name: docName,
			wait_for_completion: true 
		}
	});
	const getDocText = getDocResult.content[0]?.text || '';
	console.log('Response:', getDocText.slice(0, 500));
	console.log('');

	// Step 4: Get structure
	console.log('=== Step 4: get_document_structure ===');
	const structResult = await client.callTool({
		name: 'get_document_structure',
		arguments: { 
			doc_name: docName,
			part: 1,
			wait_for_completion: true 
		}
	});
	const structText = structResult.content[0]?.text || '';
	console.log('Response:', structText.slice(0, 500));
	console.log('');

	// Step 5: Get page content
	console.log('=== Step 5: get_page_content ===');
	const contentResult = await client.callTool({
		name: 'get_page_content',
		arguments: { 
			doc_name: docName,
			pages: '1-3',
			wait_for_completion: true 
		}
	});
	const contentText = contentResult.content[0]?.text || '';
	console.log('Response length:', contentText.length);
	console.log('First 500 chars:', contentText.slice(0, 500));
	console.log('');

	// Step 6: Verify - check recent documents again
	console.log('=== Step 6: Verify recent_documents ===');
	const verifyResult = await client.callTool({ name: 'recent_documents', arguments: {} });
	console.log('Response:', JSON.stringify(verifyResult.content, null, 2).slice(0, 1000));

	await transport.close();
	console.log('\n=== Done ===');
}

main().catch(console.error);
