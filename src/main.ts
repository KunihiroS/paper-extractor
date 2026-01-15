import {App, Editor, MarkdownView, Modal, Notice, Plugin} from 'obsidian';
import {DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab} from "./settings";
import {fetchAndSaveArxivFromActiveNote, notifyFetchResult, notifyFetchStart} from './paper_fetcher';
import {extractAndRenameActiveNoteTitle} from './title_extractor';

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
			id: 'paper-extractor-fetch-arxiv',
			name: 'Fetch arXiv (HTML/PDF) from active note',
			callback: async () => {
				await this.runExclusive(async () => {
					const logDir = this.requireLogDirOrNotice();
					if (!logDir) return;
					try {
						await extractAndRenameActiveNoteTitle(this.app, logDir);
						notifyFetchStart();
						const result = await fetchAndSaveArxivFromActiveNote(this.app, logDir);
						notifyFetchResult(result);
					} catch (e) {
						console.error(e);
						new Notice(e instanceof Error ? e.message : 'Failed to fetch arXiv');
					}
				});
			}
		});

		this.addRibbonIcon('download', 'Fetch arXiv (HTML/PDF)', async () => {
			await this.runExclusive(async () => {
				const logDir = this.requireLogDirOrNotice();
				if (!logDir) return;
				try {
					await extractAndRenameActiveNoteTitle(this.app, logDir);
					notifyFetchStart();
					const result = await fetchAndSaveArxivFromActiveNote(this.app, logDir);
					notifyFetchResult(result);
				} catch (e) {
					console.error(e);
					new Notice(e instanceof Error ? e.message : 'Failed to fetch arXiv');
				}
			});
		});

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status bar text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-modal-simple',
			name: 'Open modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'replace-selected',
			name: 'Replace selected content',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				editor.replaceSelection('Sample editor command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-modal-complex',
			name: 'Open modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
				return false;
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

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

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		let {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}
