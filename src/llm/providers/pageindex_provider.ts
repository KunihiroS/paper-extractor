import type {LlmProvider, SummarizeParams} from '../types';
import {McpClient, createPageIndexClient} from '../mcp/mcp_client';

/**
 * PageIndex provider for document summarization via MCP.
 *
 * - Uses PageIndex Cloud (https://chat.pageindex.ai/mcp) via stdio (mcp-remote)
 * - Processes PDF documents using vectorless RAG (tree-structured reasoning)
 * - OAuth authentication is handled automatically by mcp-remote (browser popup on first use)
 *
 * Flow:
 * 1. Connect to PageIndex MCP server via mcp-remote
 * 2. Call process_document with PDF URL
 * 3. Call query_document with doc_id to get summary
 *
 * Desktop only - requires child_process for stdio transport.
 */
export class PageIndexProvider implements LlmProvider {
	private mcpClient: McpClient | null = null;

	/**
	 * Check if PageIndex is available on this platform.
	 * PageIndex requires MCP which is desktop only.
	 */
	static isAvailable(): boolean {
		return McpClient.isAvailable();
	}

	/**
	 * Summarize a document using PageIndex.
	 *
	 * @param params.pdfUrl - Required: URL of the PDF to summarize (e.g., https://arxiv.org/pdf/2601.05175)
	 * @param params.systemPrompt - Ignored (PageIndex uses its own prompting)
	 * @param params.userContent - Ignored (PageIndex processes the PDF directly)
	 */
	async summarize(params: SummarizeParams): Promise<string> {
		const {pdfUrl} = params;

		if (!pdfUrl) {
			throw new Error('PAGEINDEX_PDF_URL_REQUIRED');
		}

		if (!PageIndexProvider.isAvailable()) {
			throw new Error('PAGEINDEX_DESKTOP_ONLY: PageIndex is only available on desktop');
		}

		// Ensure MCP connection
		await this.ensureConnected();

		// Step 1: Process document (upload PDF to PageIndex)
		const docId = await this.processDocument(pdfUrl);

		// Step 2: Query for summary
		const summary = await this.queryDocument(
			docId,
			'この論文の内容を日本語で要約してください。主要な貢献、手法、結果を含めてください。'
		);

		return summary;
	}

	/**
	 * Ensure MCP client is connected.
	 */
	private async ensureConnected(): Promise<void> {
		if (!this.mcpClient) {
			this.mcpClient = createPageIndexClient();
		}

		if (!this.mcpClient.isConnected()) {
			await this.mcpClient.connect();
		}
	}

	/**
	 * Process a document (PDF) and get its doc_id.
	 * Handles async processing with polling if document is still being processed.
	 */
	private async processDocument(pdfUrl: string): Promise<string> {
		if (!this.mcpClient) {
			throw new Error('PAGEINDEX_NOT_CONNECTED');
		}

		const result = await this.mcpClient.callTool('process_document', {
			url: pdfUrl,
		});

		// Extract response from result
		const content = result.content;
		if (!Array.isArray(content) || content.length === 0) {
			throw new Error('PAGEINDEX_PROCESS_DOCUMENT_FAILED: Empty response');
		}

		const textContent = content.find(c => c.type === 'text');
		if (!textContent || typeof textContent.text !== 'string') {
			throw new Error('PAGEINDEX_PROCESS_DOCUMENT_FAILED: No text content');
		}

		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(textContent.text);
		} catch {
			throw new Error(`PAGEINDEX_PROCESS_DOCUMENT_FAILED: ${textContent.text.slice(0, 200)}`);
		}

		// If doc_id is present, return immediately
		if (parsed.doc_id && typeof parsed.doc_id === 'string') {
			return parsed.doc_id;
		}

		// If status is "processing", poll until complete
		if (parsed.status === 'processing' || parsed.status === 'pending') {
			const docName = parsed.doc_name as string | undefined;
			if (!docName) {
				throw new Error('PAGEINDEX_PROCESS_DOCUMENT_FAILED: No doc_name for polling');
			}
			return await this.pollDocumentStatus(pdfUrl, docName);
		}

		throw new Error(`PAGEINDEX_PROCESS_DOCUMENT_FAILED: Unexpected response: ${textContent.text.slice(0, 200)}`);
	}

	/**
	 * Poll for document processing completion.
	 * Re-calls process_document until we get a doc_id.
	 */
	private async pollDocumentStatus(pdfUrl: string, docName: string): Promise<string> {
		const maxAttempts = 150; // 150 attempts * 2 seconds = 300 seconds max
		const pollInterval = 2000; // 2 seconds

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			// Wait before polling
			await this.sleep(pollInterval);

			if (!this.mcpClient) {
				throw new Error('PAGEINDEX_NOT_CONNECTED');
			}

			const result = await this.mcpClient.callTool('process_document', {
				url: pdfUrl,
			});

			const content = result.content;
			if (!Array.isArray(content) || content.length === 0) {
				continue; // Retry
			}

			const textContent = content.find(c => c.type === 'text');
			if (!textContent || typeof textContent.text !== 'string') {
				continue; // Retry
			}

			let parsed: Record<string, unknown>;
			try {
				parsed = JSON.parse(textContent.text);
			} catch {
				continue; // Retry
			}

			// Check if we got a doc_id
			if (parsed.doc_id && typeof parsed.doc_id === 'string') {
				return parsed.doc_id;
			}

			// If still processing, continue polling
			if (parsed.status === 'processing' || parsed.status === 'pending') {
				continue;
			}

			// If completed but no doc_id, might be an error
			if (parsed.status === 'completed' || parsed.status === 'ready') {
				// Try to find doc_id in different fields
				const possibleDocId = parsed.doc_id || parsed.document_id || parsed.id;
				if (possibleDocId && typeof possibleDocId === 'string') {
					return possibleDocId;
				}
			}

			// If status is error/failed
			if (parsed.status === 'error' || parsed.status === 'failed') {
				const errorMsg = parsed.error || parsed.message || 'Unknown error';
				throw new Error(`PAGEINDEX_PROCESS_DOCUMENT_FAILED: ${errorMsg}`);
			}
		}

		throw new Error(`PAGEINDEX_PROCESS_DOCUMENT_TIMEOUT: Document "${docName}" did not complete in time`);
	}

	/**
	 * Sleep helper.
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Query a document for information.
	 */
	private async queryDocument(docId: string, query: string): Promise<string> {
		if (!this.mcpClient) {
			throw new Error('PAGEINDEX_NOT_CONNECTED');
		}

		const result = await this.mcpClient.callTool('query_document', {
			doc_id: docId,
			query,
		});

		// Extract response text
		const content = result.content;
		if (!Array.isArray(content) || content.length === 0) {
			throw new Error('PAGEINDEX_QUERY_FAILED: Empty response');
		}

		const textContent = content.find(c => c.type === 'text');
		if (!textContent || typeof textContent.text !== 'string') {
			throw new Error('PAGEINDEX_QUERY_FAILED: No text content');
		}

		return textContent.text;
	}

	/**
	 * Disconnect from PageIndex MCP server.
	 */
	async disconnect(): Promise<void> {
		if (this.mcpClient) {
			await this.mcpClient.disconnect();
			this.mcpClient = null;
		}
	}
}
