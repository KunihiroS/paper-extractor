import {requestUrl} from 'obsidian';
import type {LlmProvider, SummarizeParams} from '../types';

export class OpenAiChatProvider implements LlmProvider {
	constructor(
		private readonly apiKey: string,
		private readonly model: string
	) {
	}

	async summarize(params: SummarizeParams): Promise<string> {
		const resp = await requestUrl({
			url: 'https://api.openai.com/v1/chat/completions',
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: this.model,
				messages: [
					{role: 'system', content: params.systemPrompt},
					{role: 'user', content: params.userContent},
				],
			}),
			throw: false,
		});

		if (resp.status < 200 || resp.status >= 300) {
			let errorDetail = '';
			try {
				const errorJson = resp.json as {error?: {message?: string; type?: string; code?: string}};
				if (errorJson?.error) {
					const e = errorJson.error;
					errorDetail = ` type=${e.type ?? ''} code=${e.code ?? ''} message=${e.message ?? ''}`;
				}
			} catch {
				// ignore parse errors
			}
			throw new Error(`OPENAI_REQUEST_FAILED status=${resp.status}${errorDetail}`);
		}

		const json = resp.json as any;
		const text = json?.choices?.[0]?.message?.content;
		if (typeof text !== 'string' || text.trim().length === 0) {
			throw new Error('OPENAI_RESPONSE_INVALID');
		}
		return text.trim();
	}
}
