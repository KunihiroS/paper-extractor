import {App, MarkdownView, normalizePath, requestUrl} from 'obsidian';
import {extractArxivIdFromUrl, getArxivAbsUrl} from './arxiv';
import {extractUrl01FromNoteBody} from './note';
import {endLogBlock, formatErrorForLog, startLogBlock} from './logger';

export type TitleExtractResult = {
	id: string;
	oldNotePath: string;
	newNotePath: string;
	newTitle: string;
};

function extractCitationTitleFromAbsHtml(html: string): string {
	const metaTagMatch = html.match(/<meta[^>]*name=["']citation_title["'][^>]*>/i);
	if (metaTagMatch) {
		const tag = metaTagMatch[0];
		const contentMatch = tag.match(/content=["']([^"']+)["']/i);
		const content = contentMatch?.[1];
		if (content) return content;
	}

	const metaTagMatch2 = html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']citation_title["'][^>]*>/i);
	if (metaTagMatch2) {
		const content = metaTagMatch2[1];
		if (content) return content;
	}

	throw new Error('citation_title not found');
}

function sanitizeTitleAsNoteBaseName(input: string): string {
	const collapsed = input.replace(/\s+/g, ' ').trim();
	return collapsed.replace(/[\\/:*?"<>|]/g, '_').trim();
}

export async function extractAndRenameActiveNoteTitle(app: App, logDir: string): Promise<TitleExtractResult> {
	const view = app.workspace.getActiveViewOfType(MarkdownView);
	if (!view || !view.file) {
		throw new Error('No active note');
	}

	const noteBody = view.editor.getValue();
	const url01 = extractUrl01FromNoteBody(noteBody);
	const id = extractArxivIdFromUrl(url01);

	const noteFile = view.file;
	const logBlock = await startLogBlock(
		app,
		logDir,
		`component=title_extractor notePath=${noteFile.path} noteBaseName=${noteFile.basename} id=${id}`
	);

	const absUrl = getArxivAbsUrl(id);
	let absStatus: number | 'EXCEPTION' = 'EXCEPTION';
	let newTitle = '';
	let newNotePath = '';
	let oldNotePath = '';
	try {
		const absResp = await requestUrl({url: absUrl, method: 'GET'});
		absStatus = absResp.status;
		if (absResp.status < 200 || absResp.status >= 300) {
			throw new Error(`Failed to fetch arXiv abs (status:${absResp.status})`);
		}

		const rawTitle = extractCitationTitleFromAbsHtml(absResp.text);
		newTitle = sanitizeTitleAsNoteBaseName(rawTitle);
		if (newTitle.length === 0) {
			throw new Error('Invalid title after sanitization');
		}

		const parentPath = noteFile.parent?.path ?? '';
		newNotePath = normalizePath(parentPath ? `${parentPath}/${newTitle}.md` : `${newTitle}.md`);
		const newFolderPath = normalizePath(parentPath ? `${parentPath}/${newTitle}` : newTitle);

		const adapter = app.vault.adapter;
		const folderExists = await adapter.exists(newFolderPath);
		if (folderExists) {
			throw new Error(`Target folder already exists: ${newFolderPath}`);
		}

		const noteConflict = app.vault.getAbstractFileByPath(newNotePath);
		if (noteConflict) {
			throw new Error(`Target note already exists: ${newNotePath}`);
		}

		oldNotePath = noteFile.path;
		await app.fileManager.renameFile(noteFile, newNotePath);

		await endLogBlock(
			app,
			logBlock,
			`result=OK absUrl=${absUrl} absStatus=${absStatus} newTitle=${newTitle} newNotePath=${newNotePath}`
		);

		return {
			id,
			oldNotePath,
			newNotePath,
			newTitle,
		};
	} catch (e) {
		const info = formatErrorForLog(e);
		await endLogBlock(
			app,
			logBlock,
			`result=NG absUrl=${absUrl} absStatus=${absStatus} errorName=${info.errorName} errorCode=${info.errorCode} errorSummary=${info.errorSummary}`
		);
		throw e;
	}
}
