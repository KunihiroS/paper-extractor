import {App, Modal, Notice, Plugin, TFile} from 'obsidian';
import {DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab} from "./settings";
import {fetchAndSaveArxiv, notifyFetchResult, notifyFetchStart} from './paper_fetcher';
import {extractAndRenameNoteTitle} from './title_extractor';
import {appendLogLine, endLogBlock, startLogBlock} from './logger';
import {generateSummary} from './summary_generator';
import {extractArxivIdFromUrl} from './arxiv';
import {loadTemplateAndInjectUrl} from './note';

// Remember to rename these classes and interfaces!

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	private isBusy: boolean = false;

	private requireLogDirOrNotice(): string | null {
		const logDir = this.settings.logDir.trim();
		if (logDir.length === 0) {
			new Notice('logDir is required (Settings → Log directory)');
			return null;
		}
		return logDir;
	}

	private async runExclusive(action: () => Promise<void>): Promise<void> {
		if (this.isBusy) {
			new Notice('Already running');
			return;
		}
		this.isBusy = true;
		try {
			await action();
		} finally {
			this.isBusy = false;
		}
	}

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'paper-extractor-create-note-from-url',
			name: 'Create paper note from arXiv URL',
			callback: async () => {
				await this.runExclusive(async () => {
					const logDir = this.requireLogDirOrNotice();
					if (!logDir) return;

					const url = await promptForUrl(this.app);
					if (!url) return;
					try {
						extractArxivIdFromUrl(url);
					} catch (e) {
						new Notice(e instanceof Error ? e.message : 'Invalid arXiv URL');
						return;
					}

					const templatePath = this.settings.templatePath?.trim() ?? '';
					if (templatePath.length === 0) {
						new Notice('templatePath is required (Settings).');
						return;
					}
					if (templatePath.startsWith('/') || templatePath.startsWith('~')) {
						new Notice('templatePath must be a Vault-relative path (not absolute).');
						return;
					}

					let templateText: string;
					try {
						templateText = await this.app.vault.adapter.read(templatePath);
					} catch (e) {
						new Notice('Failed to read template.');
						return;
					}

					let resolvedText: string;
					try {
						resolvedText = loadTemplateAndInjectUrl(templateText, url).resolvedText;
					} catch (e) {
						const msg = e instanceof Error ? e.message : '';
						if (msg === 'TEMPLATE_URL_PLACEHOLDER_MISSING') {
							new Notice('Template missing {{url}} placeholder.');
						} else {
							new Notice('Failed to process template.');
						}
						return;
					}

					try {
						const noteFile = await createTempNote(this.app, resolvedText);
						const renameResult = await extractAndRenameNoteTitle(this.app, logDir, noteFile, url);
						const latestFile = this.app.vault.getAbstractFileByPath(renameResult.newNotePath);
						if (!(latestFile instanceof TFile)) {
							new Notice('Target note was moved or deleted.');
							return;
						}
						notifyFetchStart();
						const result = await fetchAndSaveArxiv(this.app, logDir, latestFile, url);
						notifyFetchResult(result);
						await generateSummary(this.app, this.settings, latestFile, url);
					} catch (e) {
						console.error(e);
						new Notice(e instanceof Error ? e.message : 'Failed to create paper note');
					}
				});
			}
		});

		this.addCommand({
			id: 'paper-extractor-test-redaction',
			name: 'Test log redaction (no API call)',
			callback: async () => {
				await this.runExclusive(async () => {
					const logDir = this.requireLogDirOrNotice();
					if (!logDir) return;
					const block = await startLogBlock(
						this.app,
						logDir,
						'test=redaction payload="OPENAI_API_KEY=sk-1234567890abcdef Authorization: Bearer abc.def.ghi"'
					);
					await appendLogLine(
						this.app,
						logDir,
						'test=redaction payload="OPENAI_API_KEY=sk-1234567890abcdef&token=abcd Authorization: Bearer xyz"'
					);
					await endLogBlock(
						this.app,
						block,
						'test=redaction end payload="sk-1234567890abcdef"'
					);
					new Notice('Redaction test log written. Check today\'s .log file.');
				});
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MyPluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

function promptForUrl(app: App): Promise<string | null> {
	return new Promise((resolve) => {
		const modal = new UrlPromptModal(app, (value) => resolve(value));
		modal.open();
	});
}

async function createTempNote(app: App, content: string): Promise<TFile> {
	let counter = 0;
	while (true) {
		const suffix = counter === 0 ? '' : `_${counter}`;
		const fileName = `untitled_${Date.now()}${suffix}.md`;
		const existing = app.vault.getAbstractFileByPath(fileName);
		if (!existing) {
			return await app.vault.create(fileName, content);
		}
		counter += 1;
	}
}

class UrlPromptModal extends Modal {
	private readonly onSubmit: (value: string | null) => void;

	constructor(app: App, onSubmit: (value: string | null) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl('h2', {text: 'Enter arXiv URL'});
		const input = contentEl.createEl('input', {type: 'text'});
		input.placeholder = 'https://arxiv.org/abs/XXXX.XXXXX';
		input.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				this.onSubmit(input.value.trim() || null);
				this.close();
			}
		});
		const buttonRow = contentEl.createDiv({cls: 'paper-extractor-modal-actions'});
		const okButton = buttonRow.createEl('button', {text: 'OK'});
		okButton.addEventListener('click', () => {
			this.onSubmit(input.value.trim() || null);
			this.close();
		});
		const cancelButton = buttonRow.createEl('button', {text: 'Cancel'});
		cancelButton.addEventListener('click', () => {
			this.onSubmit(null);
			this.close();
		});
		input.focus();
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}
