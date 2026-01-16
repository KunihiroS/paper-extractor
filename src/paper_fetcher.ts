import {App, MarkdownView, Notice, normalizePath, requestUrl} from 'obsidian';
import {extractArxivIdFromUrl, getArxivHtmlUrl, getArxivPdfUrl} from './arxiv';
import {extractUrl01FromNoteBody} from './note';
import {endLogBlock, formatErrorForLog, startLogBlock} from './logger';

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
	let htmlReason: string = '';
	let pdfReason: string = '';
	let htmlErrorName: string = '';
	let pdfErrorName: string = '';
	let htmlErrorCode: string = '';
	let pdfErrorCode: string = '';
	let htmlErrorSummary: string = '';
	let pdfErrorSummary: string = '';

	try {
		const htmlResp = await requestUrl({url: htmlUrl, method: 'GET'});
		htmlStatus = htmlResp.status;
		if (htmlResp.status >= 200 && htmlResp.status < 300) {
			if (folderCreateError) {
				htmlReason = 'FOLDER_CREATE_FAILED';
				htmlSaved = false;
			} else {
				await adapter.write(htmlPath, htmlResp.text);
				htmlSaved = true;
			}
		} else {
			htmlReason = 'HTTP_NON_2XX';
			console.error('Failed to fetch HTML', {url: htmlUrl, status: htmlResp.status});
		}
	} catch (e) {
		htmlStatus = 'EXCEPTION';
		htmlReason = 'REQUEST_EXCEPTION';
		const info = formatErrorForLog(e);
		htmlErrorName = info.errorName;
		htmlErrorCode = info.errorCode;
		htmlErrorSummary = info.errorSummary;
		console.error('Failed to fetch HTML (exception)', e);
	}

	try {
		const pdfResp = await requestUrl({url: pdfUrl, method: 'GET'});
		pdfStatus = pdfResp.status;
		if (pdfResp.status >= 200 && pdfResp.status < 300) {
			if (folderCreateError) {
				pdfReason = 'FOLDER_CREATE_FAILED';
				pdfSaved = false;
			} else {
				await adapter.writeBinary(pdfPath, pdfResp.arrayBuffer);
				pdfSaved = true;
			}
		} else {
			pdfReason = 'HTTP_NON_2XX';
			console.error('Failed to fetch PDF', {url: pdfUrl, status: pdfResp.status});
		}
	} catch (e) {
		pdfStatus = 'EXCEPTION';
		pdfReason = 'REQUEST_EXCEPTION';
		const info = formatErrorForLog(e);
		pdfErrorName = info.errorName;
		pdfErrorCode = info.errorCode;
		pdfErrorSummary = info.errorSummary;
		console.error('Failed to fetch PDF (exception)', e);
	}

	await endLogBlock(
		app,
		logBlock,
		`result=${htmlSaved || pdfSaved ? 'OK' : 'NG'} folderCreateError=${folderCreateError ? 'YES' : 'NO'} htmlUrl=${htmlUrl} htmlStatus=${htmlStatus} htmlSaved=${htmlSaved ? 'YES' : 'NO'} htmlReason=${htmlReason} htmlErrorName=${htmlErrorName} htmlErrorCode=${htmlErrorCode} htmlErrorSummary=${htmlErrorSummary} pdfUrl=${pdfUrl} pdfStatus=${pdfStatus} pdfSaved=${pdfSaved ? 'YES' : 'NO'} pdfReason=${pdfReason} pdfErrorName=${pdfErrorName} pdfErrorCode=${pdfErrorCode} pdfErrorSummary=${pdfErrorSummary}`
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
