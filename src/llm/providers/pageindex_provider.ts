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
	 */
	private async processDocument(pdfUrl: string): Promise<string> {
		if (!this.mcpClient) {
			throw new Error('PAGEINDEX_NOT_CONNECTED');
		}

		const result = await this.mcpClient.callTool('process_document', {
			url: pdfUrl,
		});

		// Extract doc_id from result
		// PageIndex returns: { content: [{ type: 'text', text: '{"doc_id": "..."}' }] }
		const content = result.content;
		if (!Array.isArray(content) || content.length === 0) {
			throw new Error('PAGEINDEX_PROCESS_DOCUMENT_FAILED: Empty response');
		}

		const textContent = content.find(c => c.type === 'text');
		if (!textContent || typeof textContent.text !== 'string') {
			throw new Error('PAGEINDEX_PROCESS_DOCUMENT_FAILED: No text content');
		}

		try {
			const parsed = JSON.parse(textContent.text);
			if (!parsed.doc_id) {
				throw new Error('PAGEINDEX_PROCESS_DOCUMENT_FAILED: No doc_id in response');
			}
			return parsed.doc_id;
		} catch {
			// If not JSON, the text itself might contain useful info
			throw new Error(`PAGEINDEX_PROCESS_DOCUMENT_FAILED: ${textContent.text.slice(0, 200)}`);
		}
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
