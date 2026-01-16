import {App, MarkdownView, Notice, TFile, normalizePath, requestUrl} from 'obsidian';
import {extractArxivIdFromUrl} from './arxiv';
import {endLogBlock, formatErrorForLog, startLogBlock} from './logger';
import {extractUrl01FromNoteBody} from './note';
import type {MyPluginSettings} from './settings';
import * as fs from 'fs/promises';

const SUMMARY_START_MARKER = '<!-- paper_extractor:summary:start -->';
const SUMMARY_END_MARKER = '<!-- paper_extractor:summary:end -->';

type EnvVars = {
	OPENAI_API_KEY?: string;
	OPENAI_MODEL?: string;
};

function parseDotEnv(content: string): EnvVars {
	const vars: Record<string, string> = {};
	const lines = content.split(/\r?\n/);
	for (const raw of lines) {
		const line = raw.trim();
		if (line.length === 0) continue;
		if (line.startsWith('#')) continue;
		const idx = line.indexOf('=');
		if (idx <= 0) continue;
		const key = line.slice(0, idx).trim();
		let value = line.slice(idx + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		if (key.length === 0) continue;
		vars[key] = value;
	}
	return {
		OPENAI_API_KEY: vars.OPENAI_API_KEY,
		OPENAI_MODEL: vars.OPENAI_MODEL,
	};
}

function buildSummaryBlock(summaryMarkdown: string): string {
	return `${SUMMARY_START_MARKER}\n\n${summaryMarkdown}\n\n${SUMMARY_END_MARKER}`;
}

function upsertSummaryBlock(noteText: string, summaryMarkdown: string): string {
	const block = buildSummaryBlock(summaryMarkdown);
	const startIdx = noteText.indexOf(SUMMARY_START_MARKER);
	const endIdx = noteText.indexOf(SUMMARY_END_MARKER);
	if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
		const endAfter = endIdx + SUMMARY_END_MARKER.length;
		return `${noteText.slice(0, startIdx)}${block}${noteText.slice(endAfter)}`;
	}

	const suffix = noteText.endsWith('\n') ? '\n' : '\n\n';
	return `${noteText}${suffix}${block}`;
}

async function readEnvFileOrThrow(envPath: string): Promise<EnvVars> {
	let content: string;
	try {
		content = await fs.readFile(envPath, 'utf-8');
	} catch (e) {
		const info = formatErrorForLog(e);
		throw new Error(`ENV_READ_FAILED ${info.errorName} ${info.errorSummary}`);
	}
	return parseDotEnv(content);
}

async function callOpenAiChatCompletion(params: {
	apiKey: string;
	model: string;
	systemPrompt: string;
	userContent: string;
}): Promise<string> {
	const resp = await requestUrl({
		url: 'https://api.openai.com/v1/chat/completions',
		method: 'POST',
		headers: {
			Authorization: `Bearer ${params.apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: params.model,
			messages: [
				{role: 'system', content: params.systemPrompt},
				{role: 'user', content: params.userContent},
			],
		}),
	});

	if (resp.status < 200 || resp.status >= 300) {
		throw new Error(`OPENAI_REQUEST_FAILED status=${resp.status}`);
	}

	const json = resp.json as any;
	const text = json?.choices?.[0]?.message?.content;
	if (typeof text !== 'string' || text.trim().length === 0) {
		throw new Error('OPENAI_RESPONSE_INVALID');
	}
	return text.trim();
}

function requireActiveNoteOrThrow(app: App): {file: TFile; noteBody: string} {
	const view = app.workspace.getActiveViewOfType(MarkdownView);
	if (!view || !view.file) {
		throw new Error('NO_ACTIVE_NOTE');
	}
	return {file: view.file, noteBody: view.editor.getValue()};
}

export async function generateSummaryForActiveNote(app: App, settings: MyPluginSettings): Promise<void> {
	const {file: noteFile, noteBody} = requireActiveNoteOrThrow(app);
	const url01 = extractUrl01FromNoteBody(noteBody);
	const id = extractArxivIdFromUrl(url01);

	const logDir = settings.logDir.trim();
	if (logDir.length === 0) {
		new Notice('logDir is required (Settings → Log directory)');
		return;
	}

	const logBlock = await startLogBlock(
		app,
		logDir,
		`component=summary_generator notePath=${noteFile.path} noteBaseName=${noteFile.basename} id=${id}`
	);

	let reason: string = '';
	let result: 'OK' | 'NG' = 'NG';
	let htmlPath: string = '';
	let promptPath: string = '';
	let model: string = '';
	let summaryChars: number = 0;
	let errorName: string = '';
	let errorCode: string = '';
	let errorSummary: string = '';

	try {
		new Notice('(1/4) reading html');
		const parentPath = noteFile.parent?.path ?? '';
		const folderPath = normalizePath(parentPath ? `${parentPath}/${noteFile.basename}` : noteFile.basename);
		htmlPath = normalizePath(`${folderPath}/${id}.html`);

		const adapter = app.vault.adapter;
		const htmlExists = await adapter.exists(htmlPath);
		if (!htmlExists) {
			reason = 'HTML_MISSING';
			new Notice('HTML file not found. Cannot generate summary.');
			return;
		}

		let htmlText: string;
		try {
			htmlText = await adapter.read(htmlPath);
		} catch (e) {
			reason = 'HTML_READ_FAILED';
			const info = formatErrorForLog(e);
			errorName = info.errorName;
			errorCode = info.errorCode;
			errorSummary = info.errorSummary;
			new Notice('Failed to read HTML.');
			return;
		}

		new Notice('(2/4) loading prompt');
		promptPath = settings.systemPromptPath?.trim() ?? '';
		if (promptPath.length === 0) {
			reason = 'PROMPT_READ_FAILED';
			new Notice('systemPromptPath is required (Settings).');
			return;
		}
		if (promptPath.startsWith('/') || promptPath.startsWith('~')) {
			reason = 'PROMPT_PATH_INVALID';
			new Notice('systemPromptPath must be a Vault-relative path (not absolute).');
			return;
		}

		let systemPrompt: string;
		try {
			systemPrompt = await adapter.read(promptPath);
		} catch (e) {
			reason = 'PROMPT_READ_FAILED';
			const info = formatErrorForLog(e);
			errorName = info.errorName;
			errorCode = info.errorCode;
			errorSummary = info.errorSummary;
			new Notice('Failed to read system prompt.');
			return;
		}

		const envPath = settings.envPath?.trim() ?? '';
		if (envPath.length === 0) {
			reason = 'ENV_READ_FAILED';
			new Notice('envPath is required (Settings).');
			return;
		}

		let env: EnvVars;
		try {
			env = await readEnvFileOrThrow(envPath);
		} catch (e) {
			reason = 'ENV_READ_FAILED';
			const info = formatErrorForLog(e);
			errorName = info.errorName;
			errorCode = info.errorCode;
			errorSummary = info.errorSummary;
			new Notice('Failed to read .env file.');
			return;
		}

		const apiKey = env.OPENAI_API_KEY?.trim() ?? '';
		if (apiKey.length === 0) {
			reason = 'OPENAI_API_KEY_MISSING';
			new Notice('OPENAI_API_KEY is missing in .env.');
			return;
		}

		model = (env.OPENAI_MODEL?.trim() || 'gpt-4o-mini');

		new Notice('(3/4) requesting AI');
		new Notice('AI response waiting... (Do not delete/move the note until completion)');
		let summary: string;
		let waitNoticeInterval: number | null = null;
		try {
			waitNoticeInterval = window.setInterval(() => {
				new Notice('AI response waiting...');
			}, 3000);

			const userContent = `You will be given HTML extracted from an arXiv paper. Summarize it in Japanese as Markdown.\n\n[HTML]\n${htmlText}`;
			summary = await callOpenAiChatCompletion({
				apiKey,
				model,
				systemPrompt,
				userContent,
			});
		} catch (e) {
			reason = 'OPENAI_REQUEST_FAILED';
			const info = formatErrorForLog(e);
			errorName = info.errorName;
			errorCode = info.errorCode;
			errorSummary = info.errorSummary;
			new Notice('AI request failed.');
			return;
		} finally {
			if (waitNoticeInterval !== null) {
				window.clearInterval(waitNoticeInterval);
			}
		}
		summaryChars = summary.length;

		new Notice('(4/4) writing note');
		const latestFile = app.vault.getAbstractFileByPath(noteFile.path);
		if (!(latestFile instanceof TFile)) {
			reason = 'NOTE_MOVED_OR_DELETED';
			new Notice('Target note was moved or deleted.');
			return;
		}

		const currentNoteText = await app.vault.read(latestFile);
		const updated = upsertSummaryBlock(currentNoteText, summary);
		try {
			await app.vault.modify(latestFile, updated);
		} catch (e) {
			reason = 'NOTE_WRITE_FAILED';
			const info = formatErrorForLog(e);
			errorName = info.errorName;
			errorCode = info.errorCode;
			errorSummary = info.errorSummary;
			new Notice('Failed to write note.');
			return;
		}

		result = 'OK';
		new Notice('Summary generated.');
	} catch (e) {
		reason = reason || 'UNKNOWN';
		const info = formatErrorForLog(e);
		errorName = info.errorName;
		errorCode = info.errorCode;
		errorSummary = info.errorSummary;
		new Notice('Summary generation failed.');
	} finally {
		if (result === 'OK') {
			await endLogBlock(
				app,
				logBlock,
				`result=OK htmlPath=${htmlPath} model=${model} summaryChars=${summaryChars}`
			);
		} else {
			const errorPart = errorName.length > 0 || errorCode.length > 0 || errorSummary.length > 0
				? ` errorName=${errorName} errorCode=${errorCode} errorSummary=${errorSummary}`
				: '';
			await endLogBlock(app, logBlock, `result=NG reason=${reason || 'UNKNOWN'} htmlPath=${htmlPath} promptPath=${promptPath} model=${model}${errorPart}`);
		}
	}
}
