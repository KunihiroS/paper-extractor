import {App, PluginSettingTab, Setting} from "obsidian";
import MyPlugin from "./main";

export interface MyPluginSettings {
	mySetting: string;
	logDir: string;
	systemPromptPath: string;
	envPath: string;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	logDir: '',
	systemPromptPath: '',
	envPath: ''
}

export class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Log directory (Vault path)')
			.setDesc('Required. Example: paper_extractor/logs')
			.addText(text => text
				.setPlaceholder('paper_extractor/logs')
				.setValue(this.plugin.settings.logDir)
				.onChange(async (value) => {
					this.plugin.settings.logDir = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('System prompt path (Vault path)')
			.setDesc('Required for summary_generator. Example: .obsidian/paper_extractor/system_prompt_summary.md')
			.addText(text => text
				.setPlaceholder('.obsidian/paper_extractor/system_prompt_summary.md')
				.setValue(this.plugin.settings.systemPromptPath)
				.onChange(async (value) => {
					this.plugin.settings.systemPromptPath = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('.env path (absolute path)')
			.setDesc('Required for summary_generator. Example: /home/you/.config/paper_extractor/.env')
			.addText(text => text
				.setPlaceholder('/home/you/.config/paper_extractor/.env')
				.setValue(this.plugin.settings.envPath)
				.onChange(async (value) => {
					this.plugin.settings.envPath = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Settings #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
