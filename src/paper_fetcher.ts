import {App, MarkdownView, Notice, normalizePath, requestUrl} from 'obsidian';
import {extractArxivIdFromUrl, getArxivHtmlUrl, getArxivPdfUrl} from './arxiv';
import {extractUrl01FromNoteBody} from './note';
import {endLogBlock, startLogBlock} from './logger';

export type FetchResult = {
	id: string;
	notePath: string;
	folderPath: string;
	htmlPath: string;
	pdfPath: string;
	htmlSaved: boolean;
	pdfSaved: boolean;
};

export async function fetchAndSaveArxivFromActiveNote(app: App, logDir: string): Promise<FetchResult> {
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

	const logBlock = await startLogBlock(
		app,
		logDir,
		`component=paper_fetcher notePath=${noteFile.path} noteBaseName=${noteFile.basename} folderPath=${folderPath} id=${id}`
	);

	const adapter = app.vault.adapter;
	let folderCreateError: unknown = null;
	try {
		const folderExists = await adapter.exists(folderPath);
		if (!folderExists) {
			await app.vault.createFolder(folderPath);
		}
	} catch (e) {
		folderCreateError = e;
	}

	const htmlUrl = getArxivHtmlUrl(id);
	const pdfUrl = getArxivPdfUrl(id);

	let htmlSaved = false;
	let pdfSaved = false;
	let htmlStatus: number | 'EXCEPTION' = 'EXCEPTION';
	let pdfStatus: number | 'EXCEPTION' = 'EXCEPTION';
	let htmlError: string = '';
	let pdfError: string = '';

	try {
		const htmlResp = await requestUrl({url: htmlUrl, method: 'GET'});
		htmlStatus = htmlResp.status;
		if (htmlResp.status >= 200 && htmlResp.status < 300) {
			if (folderCreateError) {
				htmlSaved = false;
			} else {
				await adapter.write(htmlPath, htmlResp.text);
				htmlSaved = true;
			}
		} else {
			console.error('Failed to fetch HTML', {url: htmlUrl, status: htmlResp.status});
		}
	} catch (e) {
		htmlStatus = 'EXCEPTION';
		htmlError = e instanceof Error ? e.message : 'UNKNOWN';
		console.error('Failed to fetch HTML (exception)', e);
	}

	try {
		const pdfResp = await requestUrl({url: pdfUrl, method: 'GET'});
		pdfStatus = pdfResp.status;
		if (pdfResp.status >= 200 && pdfResp.status < 300) {
			if (folderCreateError) {
				pdfSaved = false;
			} else {
				await adapter.writeBinary(pdfPath, pdfResp.arrayBuffer);
				pdfSaved = true;
			}
		} else {
			console.error('Failed to fetch PDF', {url: pdfUrl, status: pdfResp.status});
		}
	} catch (e) {
		pdfStatus = 'EXCEPTION';
		pdfError = e instanceof Error ? e.message : 'UNKNOWN';
		console.error('Failed to fetch PDF (exception)', e);
	}

	await endLogBlock(
		app,
		logBlock,
		`result=${htmlSaved || pdfSaved ? 'OK' : 'NG'} folderCreateError=${folderCreateError ? 'YES' : 'NO'} htmlUrl=${htmlUrl} htmlStatus=${htmlStatus} htmlSaved=${htmlSaved ? 'YES' : 'NO'} htmlError=${htmlError} pdfUrl=${pdfUrl} pdfStatus=${pdfStatus} pdfSaved=${pdfSaved ? 'YES' : 'NO'} pdfError=${pdfError}`
	);

	if (!htmlSaved && !pdfSaved) {
		throw new Error(`Failed to fetch arXiv content (html:${htmlStatus}, pdf:${pdfStatus})`);
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
