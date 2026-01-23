import type {MyPluginSettings} from '../settings';
import {readEnvFileOrThrow} from './env';
import type {LlmProvider} from './types';
import {OpenAiChatProvider} from './providers/openai_chat_provider';

export type ProviderCreateResult =
	| {status: 'disabled'; reason: string}
	| {status: 'enabled'; provider: LlmProvider; providerName: string; model: string};

export async function createProvider(settings: MyPluginSettings): Promise<ProviderCreateResult> {
	const envPath = settings.envPath?.trim() ?? '';
	if (envPath.length === 0) {
		return {status: 'disabled', reason: 'ENV_PATH_MISSING'};
	}

	const env = await readEnvFileOrThrow(envPath);

	if (!env.LLM_PROVIDER) {
		return {status: 'disabled', reason: 'LLM_PROVIDER_MISSING'};
	}

	if (env.LLM_PROVIDER === 'openai') {
		const model = env.OPENAI_MODEL?.trim() ?? '';
		if (model.length === 0) {
			return {status: 'disabled', reason: 'OPENAI_MODEL_EMPTY_SKIP'};
		}
		const apiKey = env.OPENAI_API_KEY?.trim() ?? '';
		if (apiKey.length === 0) {
			throw new Error('OPENAI_API_KEY_MISSING');
		}
		return {
			status: 'enabled',
			provider: new OpenAiChatProvider(apiKey, model),
			providerName: 'openai',
			model,
		};
	}

	if (env.LLM_PROVIDER === 'gemini') {
		const apiKey = env.GEMINI_API_KEY?.trim() ?? '';
		if (apiKey.length === 0) {
			throw new Error('GEMINI_API_KEY_MISSING');
		}
		const model = env.GEMINI_MODEL?.trim() ?? '';
		if (model.length === 0) {
			throw new Error('GEMINI_MODEL_MISSING');
		}
		throw new Error('GEMINI_PROVIDER_NOT_IMPLEMENTED');
	}

	return {status: 'disabled', reason: 'LLM_PROVIDER_INVALID'};
}
