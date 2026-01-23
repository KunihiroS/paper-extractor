import { App, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";

export interface MyPluginSettings {
	logDir: string;
	systemPromptPath: string;
	envPath: string;
	templatePath: string;
	summaryEnabled: boolean;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	logDir: '',
	systemPromptPath: '',
	envPath: '',
	templatePath: '',
	summaryEnabled: true,
}

export class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Summary enabled')
			.setDesc('If disabled, summary_generator will not run.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.summaryEnabled)
				.onChange(async (value) => {
					this.plugin.settings.summaryEnabled = value;
					await this.plugin.saveSettings();
				}));

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
			.setName('Template path (Vault path)')
			.setDesc('Required. Example: templates/paper_extractor.md')
			.addText(text => text
				.setPlaceholder('templates/paper_extractor.md')
				.setValue(this.plugin.settings.templatePath)
				.onChange(async (value) => {
					this.plugin.settings.templatePath = value.trim();
					await this.plugin.saveSettings();
				}));


	}
}
