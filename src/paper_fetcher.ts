import {App, MarkdownView, Notice, normalizePath, requestUrl} from 'obsidian';
import {extractArxivIdFromUrl, getArxivHtmlUrl, getArxivPdfUrl} from './arxiv';
import {extractUrl01FromNoteBody} from './note';

export type FetchResult = {
	id: string;
	notePath: string;
	folderPath: string;
	htmlPath: string;
	pdfPath: string;
	htmlSaved: boolean;
	pdfSaved: boolean;
};

export async function fetchAndSaveArxivFromActiveNote(app: App): Promise<FetchResult> {
	const view = app.workspace.getActiveViewOfType(MarkdownView);
	if (!view || !view.file) {
		throw new Error('No active note');
	}

	const noteBody = view.editor.getValue();
	const url01 = extractUrl01FromNoteBody(noteBody);
	const id = extractArxivIdFromUrl(url01);

	const noteFile = view.file;
	const parentPath = noteFile.parent?.path ?? '';
	const folderPath = normalizePath(parentPath ? `${parentPath}/${noteFile.basename}` : noteFile.basename);

	const htmlPath = normalizePath(`${folderPath}/${id}.html`);
	const pdfPath = normalizePath(`${folderPath}/${id}.pdf`);

	const adapter = app.vault.adapter;
	const folderExists = await adapter.exists(folderPath);
	if (!folderExists) {
		await app.vault.createFolder(folderPath);
	}

	const htmlUrl = getArxivHtmlUrl(id);
	const pdfUrl = getArxivPdfUrl(id);

	let htmlSaved = false;
	let pdfSaved = false;

	const htmlResp = await requestUrl({url: htmlUrl, method: 'GET'});
	if (htmlResp.status >= 200 && htmlResp.status < 300) {
		await adapter.write(htmlPath, htmlResp.text);
		htmlSaved = true;
	} else {
		console.error('Failed to fetch HTML', {url: htmlUrl, status: htmlResp.status});
	}

	const pdfResp = await requestUrl({url: pdfUrl, method: 'GET'});
	if (pdfResp.status >= 200 && pdfResp.status < 300) {
		await adapter.writeBinary(pdfPath, pdfResp.arrayBuffer);
		pdfSaved = true;
	} else {
		console.error('Failed to fetch PDF', {url: pdfUrl, status: pdfResp.status});
	}

	if (!htmlSaved && !pdfSaved) {
		throw new Error(`Failed to fetch arXiv content (html:${htmlResp.status}, pdf:${pdfResp.status})`);
	}

	return {
		id,
		notePath: noteFile.path,
		folderPath,
		htmlPath,
		pdfPath,
		htmlSaved,
		pdfSaved,
	};
}

export function notifyFetchResult(result: FetchResult): void {
	const lines: string[] = [];
	lines.push(`Saved to: ${result.folderPath}`);
	lines.push(`HTML: ${result.htmlSaved ? 'OK' : 'NG'}`);
	lines.push(`PDF: ${result.pdfSaved ? 'OK' : 'NG'}`);
	new Notice(lines.join('\n'));
}

export function notifyFetchStart(): void {
	new Notice('Fetching arXiv...');
}
