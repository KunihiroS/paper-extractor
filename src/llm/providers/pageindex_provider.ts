import {Platform, requestUrl} from 'obsidian';
import type {LlmProvider, SummarizeParams} from '../types';

/**
 * PageIndex provider for document summarization via HTTP API.
 *
 * Uses PageIndex Cloud HTTP API (https://api.pageindex.ai)
 * - POST /doc/ - Upload PDF → doc_id
 * - GET /doc/{doc_id}/ - Wait for processing
 * - POST /chat/completions/ - Generate summary with chat API
 *
 * Requires PAGEINDEX_API_KEY in .env (get from https://dash.pageindex.ai/api-keys)
 */
export class PageIndexProvider implements LlmProvider {
	private apiKey: string;
	private baseUrl = 'https://api.pageindex.ai';
	private log: (message: string) => void = () => {};

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	/**
	 * Check if PageIndex is available on this platform.
	 * HTTP API works on both desktop and mobile.
	 */
	static isAvailable(): boolean {
		// HTTP API works on all platforms
		return Platform.isDesktop || Platform.isMobile;
	}

	/**
	 * Summarize a document using PageIndex Chat API.
	 */
	async summarize(params: SummarizeParams): Promise<string> {
		const {pdfUrl, systemPrompt} = params;
		this.log = params.log || (() => {});

		if (!pdfUrl) {
			throw new Error('PAGEINDEX_PDF_URL_REQUIRED');
		}

		this.log('[PageIndex] Starting summarize');

		// Step 1: Upload document
		this.log(`[PageIndex] Uploading document: ${pdfUrl}`);
		const docId = await this.uploadDocumentFromUrl(pdfUrl);
		this.log(`[PageIndex] Document uploaded, doc_id=${docId}`);

		// Step 2: Wait for processing to complete
		this.log('[PageIndex] Waiting for document processing...');
		await this.waitForDocumentReady(docId);
		this.log('[PageIndex] Document processing complete');

		// Step 3: Generate summary using Chat API
		this.log('[PageIndex] Generating summary via Chat API...');
		const summary = await this.chatWithDocument(docId, systemPrompt);
		this.log(`[PageIndex] Summary generated, length=${summary.length}`);

		return summary;
	}

	/**
	 * Upload a PDF from URL by downloading it first, then uploading to PageIndex.
	 */
	private async uploadDocumentFromUrl(pdfUrl: string): Promise<string> {
		// Download PDF
		this.log(`[PageIndex] Downloading PDF from: ${pdfUrl}`);
		const pdfResponse = await requestUrl({
			url: pdfUrl,
			method: 'GET',
		});

		if (pdfResponse.status !== 200) {
			throw new Error(`PAGEINDEX_PDF_DOWNLOAD_FAILED: status=${pdfResponse.status}`);
		}

		// Extract filename from URL
		const urlParts = pdfUrl.split('/');
		const filename = urlParts[urlParts.length - 1] || 'document.pdf';

		// Create multipart form data boundary
		const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substr(2);

		// Build multipart body
		const pdfData = pdfResponse.arrayBuffer;
		const pdfBytes = new Uint8Array(pdfData);

		// Construct multipart body manually
		const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`;
		const footer = `\r\n--${boundary}--\r\n`;

		const headerBytes = new TextEncoder().encode(header);
		const footerBytes = new TextEncoder().encode(footer);

		// Combine all parts
		const body = new Uint8Array(headerBytes.length + pdfBytes.length + footerBytes.length);
		body.set(headerBytes, 0);
		body.set(pdfBytes, headerBytes.length);
		body.set(footerBytes, headerBytes.length + pdfBytes.length);

		// Upload to PageIndex
		this.log('[PageIndex] Uploading to PageIndex API...');
		const uploadResponse = await requestUrl({
			url: `${this.baseUrl}/doc/`,
			method: 'POST',
			headers: {
				'api_key': this.apiKey,
				'Content-Type': `multipart/form-data; boundary=${boundary}`,
			},
			body: body.buffer,
		});

		if (uploadResponse.status !== 200 && uploadResponse.status !== 201) {
			throw new Error(`PAGEINDEX_UPLOAD_FAILED: status=${uploadResponse.status} body=${JSON.stringify(uploadResponse.json).slice(0, 200)}`);
		}

		const result = uploadResponse.json as {doc_id?: string; error?: string};
		if (result.error) {
			throw new Error(`PAGEINDEX_UPLOAD_FAILED: ${result.error}`);
		}
		if (!result.doc_id) {
			throw new Error(`PAGEINDEX_UPLOAD_FAILED: No doc_id in response: ${JSON.stringify(result).slice(0, 200)}`);
		}

		return result.doc_id;
	}

	/**
	 * Wait for document processing to complete.
	 * Polls every 5 seconds for up to 5 minutes.
	 */
	private async waitForDocumentReady(docId: string): Promise<void> {
		const maxWaitMs = 5 * 60 * 1000; // 5 minutes
		const pollIntervalMs = 5000; // 5 seconds
		const startTime = Date.now();

		while (Date.now() - startTime < maxWaitMs) {
			const response = await requestUrl({
				url: `${this.baseUrl}/doc/${docId}/?type=tree`,
				method: 'GET',
				headers: {
					'api_key': this.apiKey,
				},
			});

			if (response.status !== 200) {
				throw new Error(`PAGEINDEX_STATUS_CHECK_FAILED: status=${response.status}`);
			}

			const result = response.json as {status?: string; retrieval_ready?: boolean; error?: string};
			this.log(`[PageIndex] Status check: status=${result.status} retrieval_ready=${result.retrieval_ready}`);

			if (result.error) {
				throw new Error(`PAGEINDEX_PROCESSING_FAILED: ${result.error}`);
			}

			if (result.status === 'failed') {
				throw new Error('PAGEINDEX_PROCESSING_FAILED: Document processing failed');
			}

			if (result.status === 'completed' || result.retrieval_ready === true) {
				return; // Ready!
			}

			// Wait before next poll
			await this.sleep(pollIntervalMs);
		}

		throw new Error('PAGEINDEX_PROCESSING_TIMEOUT: Document processing did not complete within 5 minutes');
	}

	/**
	 * Chat with a document using PageIndex Chat API.
	 * Uses the systemPrompt to request a structured summary.
	 */
	private async chatWithDocument(docId: string, systemPrompt?: string): Promise<string> {
		// Build the summary request prompt
		const userPrompt = systemPrompt
			? `以下の指示に従って、このドキュメントを要約してください:\n\n${systemPrompt}`
			: `このドキュメントの内容を日本語でMarkdown形式で詳細に要約してください。以下の構成で作成してください:
1. Summary (概要)
2. Briefing (要点をQ&A形式で)
3. FAQ (想定される質問と回答)
4. 重要な図表や数式があれば説明
5. Mermaid図でアーキテクチャや処理フローを可視化`;

		const messages = [
			{role: 'user', content: userPrompt},
		];

		const response = await requestUrl({
			url: `${this.baseUrl}/chat/completions/`,
			method: 'POST',
			headers: {
				'api_key': this.apiKey,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				messages,
				doc_id: docId,
				stream: false,
			}),
		});

		if (response.status !== 200) {
			throw new Error(`PAGEINDEX_CHAT_FAILED: status=${response.status} body=${JSON.stringify(response.json).slice(0, 200)}`);
		}

		const result = response.json as {
			choices?: Array<{message?: {content?: string}}>;
			error?: string;
		};

		if (result.error) {
			throw new Error(`PAGEINDEX_CHAT_FAILED: ${result.error}`);
		}

		const content = result.choices?.[0]?.message?.content;
		if (!content) {
			throw new Error(`PAGEINDEX_CHAT_FAILED: No content in response: ${JSON.stringify(result).slice(0, 300)}`);
		}

		return content;
	}

	/**
	 * Sleep for specified milliseconds.
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}
