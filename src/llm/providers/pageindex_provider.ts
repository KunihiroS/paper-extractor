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

		// Step 2.5: Additional wait for retrieval to become available
		// PageIndex may report status=completed before chat API can access the doc
		this.log('[PageIndex] Waiting additional time for retrieval availability...');
		await this.sleep(5000);

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

		// Extract filename from URL - ensure it has .pdf extension
		// Add timestamp to make filename unique (PageIndex may deduplicate by filename)
		const urlParts = pdfUrl.split('/');
		let baseFilename = urlParts[urlParts.length - 1] || 'document';
		if (baseFilename.toLowerCase().endsWith('.pdf')) {
			baseFilename = baseFilename.slice(0, -4);
		}
		const timestamp = Date.now();
		const filename = `${baseFilename}_${timestamp}.pdf`;
		this.log(`[PageIndex] Filename: ${filename}, pdfSize=${pdfResponse.arrayBuffer.byteLength}`);

		// Build multipart/form-data manually for Obsidian's requestUrl
		// RFC 2046: boundary must not appear in data, CRLF used as line endings
		const boundary = `----ObsidianFormBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
		const CRLF = '\r\n';
		
		// Multipart format: --boundary CRLF headers CRLF CRLF data CRLF --boundary-- CRLF
		const headerPart = 
			`--${boundary}${CRLF}` +
			`Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}` +
			`Content-Type: application/pdf${CRLF}` +
			`${CRLF}`;
		const footerPart = `${CRLF}--${boundary}--${CRLF}`;

		const headerBytes = new TextEncoder().encode(headerPart);
		const footerBytes = new TextEncoder().encode(footerPart);
		const pdfBytes = new Uint8Array(pdfResponse.arrayBuffer);

		// Combine all parts into single ArrayBuffer
		const totalLength = headerBytes.length + pdfBytes.length + footerBytes.length;
		const bodyArray = new Uint8Array(totalLength);
		bodyArray.set(headerBytes, 0);
		bodyArray.set(pdfBytes, headerBytes.length);
		bodyArray.set(footerBytes, headerBytes.length + pdfBytes.length);

		this.log(`[PageIndex] Multipart body size: ${totalLength} (header=${headerBytes.length}, pdf=${pdfBytes.length}, footer=${footerBytes.length})`);

		// Upload to PageIndex with retry
		this.log('[PageIndex] Uploading to PageIndex API...');
		let uploadResponse;
		const maxRetries = 3;
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				uploadResponse = await requestUrl({
					url: `${this.baseUrl}/doc/`,
					method: 'POST',
					headers: {
						'api_key': this.apiKey,
						'Content-Type': `multipart/form-data; boundary=${boundary}`,
					},
					body: bodyArray.buffer,
					throw: false,
				});
				
				// Success or non-retryable error
				if (uploadResponse.status === 200 || uploadResponse.status === 201) {
					break;
				}
				
				// Retryable errors: 502, 503, 504
				if (attempt < maxRetries && [502, 503, 504].includes(uploadResponse.status)) {
					this.log(`[PageIndex] Upload failed (attempt ${attempt}/${maxRetries}), status=${uploadResponse.status}, retrying in 3s...`);
					await this.sleep(3000);
					continue;
				}
			} catch (e) {
				const errMsg = e instanceof Error ? e.message : String(e);
				if (attempt < maxRetries) {
					this.log(`[PageIndex] Upload threw (attempt ${attempt}/${maxRetries}): ${errMsg}, retrying...`);
					await this.sleep(3000);
					continue;
				}
				this.log(`[PageIndex] Upload request threw: ${errMsg}`);
				throw new Error(`PAGEINDEX_UPLOAD_FAILED: ${errMsg}`);
			}
		}

		if (!uploadResponse) {
			throw new Error('PAGEINDEX_UPLOAD_FAILED: No response after retries');
		}

		this.log(`[PageIndex] Upload response: status=${uploadResponse.status} text=${uploadResponse.text?.slice(0, 300)}`);

		if (uploadResponse.status !== 200 && uploadResponse.status !== 201) {
			throw new Error(`PAGEINDEX_UPLOAD_FAILED: status=${uploadResponse.status} body=${uploadResponse.text?.slice(0, 300)}`);
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
			this.log(`[PageIndex] Status check: status=${result.status} retrieval_ready=${result.retrieval_ready} raw=${JSON.stringify(result).slice(0, 200)}`);

			if (result.error) {
				throw new Error(`PAGEINDEX_PROCESSING_FAILED: ${result.error}`);
			}

			if (result.status === 'failed') {
				throw new Error('PAGEINDEX_PROCESSING_FAILED: Document processing failed');
			}

			// Wait for status=completed (retrieval_ready is not reliable)
			if (result.status === 'completed') {
				this.log(`[PageIndex] Document ready! status=${result.status}`);
				return; // Ready!
			}

			// Wait before next poll
			await this.sleep(pollIntervalMs);
		}

		throw new Error('PAGEINDEX_PROCESSING_TIMEOUT: Document processing did not complete within 5 minutes');
	}

	/**
	 * Chat with a document using PageIndex Chat API.
	 * Note: PageIndex requires the first message to be 'user' role.
	 */
	private async chatWithDocument(docId: string, systemPrompt?: string): Promise<string> {
		// PageIndex requires the first message to be 'user' role (no 'system' role allowed first)
		// Embed system prompt in the user message
		let userMessage: string;
		if (systemPrompt && systemPrompt.trim().length > 0) {
			userMessage = `以下の指示に従って、このドキュメントを要約してください:\n\n${systemPrompt}`;
		} else {
			userMessage = 'このドキュメントを日本語でMarkdown形式で詳細に要約してください。';
		}

		const messages = [
			{role: 'user', content: userMessage},
		];

		this.log(`[PageIndex] Chat request: doc_id=${docId} messages=${messages.length}`);

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
			throw: false,
			// PageIndex Chat API can take a while for long documents
			// Obsidian's default timeout might be too short
		});

		this.log(`[PageIndex] Chat response: status=${response.status} text=${response.text?.slice(0, 500)}`);

		if (response.status !== 200) {
			throw new Error(`PAGEINDEX_CHAT_FAILED: status=${response.status} body=${response.text?.slice(0, 300)}`);
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
