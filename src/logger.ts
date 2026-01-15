import {App, normalizePath} from 'obsidian';

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

function formatYYYYMMDD(d: Date): string {
	return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

export function getDailyLogFilePath(logDir: string, now: Date = new Date()): string {
	const yyyymmdd = formatYYYYMMDD(now);
	return normalizePath(`${logDir}/paper_extractor_${yyyymmdd}.log`);
}

export function formatLogLine(message: string, now: Date = new Date()): string {
	return `${now.toISOString()} ${message}`;
}

async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	const adapter = app.vault.adapter;
	const exists = await adapter.exists(folderPath);
	if (exists) return;
	await app.vault.createFolder(folderPath);
}

async function appendTextFile(app: App, filePath: string, contentToAppend: string): Promise<void> {
	const adapter = app.vault.adapter;
	let current = '';
	try {
		current = await adapter.read(filePath);
	} catch {
		current = '';
	}
	await adapter.write(filePath, `${current}${contentToAppend}`);
}

export async function appendLogLine(app: App, logDir: string, message: string): Promise<void> {
	await ensureFolderExists(app, logDir);
	const logPath = getDailyLogFilePath(logDir);
	await appendTextFile(app, logPath, `${formatLogLine(message)}\n`);
}

export type LogBlock = {
	logDir: string;
	logPath: string;
	runId: string;
};

export async function startLogBlock(app: App, logDir: string, startMessage: string): Promise<LogBlock> {
	await ensureFolderExists(app, logDir);
	const now = new Date();
	const logPath = getDailyLogFilePath(logDir, now);
	const runId = `${now.toISOString()}_${Math.random().toString(16).slice(2)}`;
	await appendTextFile(app, logPath, `${formatLogLine(`block=START runId=${runId} ${startMessage}`, now)}\n`);
	return {logDir, logPath, runId};
}

export async function endLogBlock(app: App, block: LogBlock, endMessage: string): Promise<void> {
	await appendTextFile(app, block.logPath, `${formatLogLine(`block=END runId=${block.runId} ${endMessage}`)}\n`);
}
