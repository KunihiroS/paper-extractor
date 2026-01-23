import {requestUrl} from 'obsidian';
import type {LlmProvider, SummarizeParams} from '../types';

type GeminiGenerateContentResponse = {
	candidates?: Array<{
		content?: {
			parts?: Array<{text?: string}>;
		};
	}>;
};

export class GeminiProvider implements LlmProvider {
	constructor(
		private readonly apiKey: string,
		private readonly model: string
	) {
	}

	async summarize(params: SummarizeParams): Promise<string> {
		const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;

		const resp = await requestUrl({
			url,
			method: 'POST',
			headers: {
				'x-goog-api-key': this.apiKey,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				systemInstruction: {
					parts: [{text: params.systemPrompt}],
				},
				contents: [
					{
						parts: [{text: params.userContent}],
					},
				],
			}),
			throw: false,
		});

		if (resp.status < 200 || resp.status >= 300) {
			let errorDetail = '';
			try {
				const errorJson = resp.json as {error?: {message?: string; status?: string}};
				if (errorJson?.error) {
					const e = errorJson.error;
					errorDetail = ` status=${e.status ?? ''} message=${e.message ?? ''}`;
				}
			} catch {
				// ignore parse errors
			}
			throw new Error(`GEMINI_REQUEST_FAILED httpStatus=${resp.status}${errorDetail}`);
		}

		const json = resp.json as GeminiGenerateContentResponse;
		const parts = json?.candidates?.[0]?.content?.parts;
		if (!Array.isArray(parts) || parts.length === 0) {
			throw new Error('GEMINI_RESPONSE_INVALID');
		}
		const text = parts.map(p => p.text ?? '').join('').trim();
		if (text.length === 0) {
			throw new Error('GEMINI_RESPONSE_INVALID');
		}
		return text;
	}
}
