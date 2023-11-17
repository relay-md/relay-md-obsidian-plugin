import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, RequestUrlParam, RequestUrlResponse, requestUrl, TFile } from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	base_uri: string;
	api_key: string;
	vault_base_folder: string
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	base_uri: 'https://api.relay.md',
	api_key: '00000000-0000-0000-0000-000000000000',
	vault_base_folder: "relay.md"
}

class Document {
	id: string;
	constructor(id: string) {
		this.id = id;
	}
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// Let's create a relay.md folder already
		// TODO: maybe make this one configurable!
		try {await vault.createFolder(this.settings.vault_base_folder);} catch(e) {}

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', async (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			await this.load_document("2b7ce5ca-dedd-40ae-abb4-ad58539a892c");
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async load_document(id: string) {
		const vault = this.app.vault;
		const options: RequestUrlParam = {
			url: this.settings.base_uri + '/v1/doc/' + id,
			method: 'GET',
			headers: {
				'X-API-KEY': this.settings.api_key,
				'Content-Type': 'text/markdown'
			},
		}
		var response: RequestUrlResponse;
		try {
			response = await requestUrl(options);
			let filename: string = response.headers["x-relay-filename"];
			let relay_to: dict = JSON.parse(response.headers["x-relay-to"]);
			let body : string = response.text;

			// Loop through team/topics
			for (let to of relay_to) {
				let tos: Array<string> = to.split("@", 2);
				let team: string = tos[1];
				let topic: string = tos[0];
				let full_path_to_file: string;
				// We ignore the "_" team which is a "global" team
				if (team == "_") {
					try {await vault.createFolder(this.settings.vault_base_folder + "/" + topic);} catch(e) {}
					full_path_to_file = this.settings.vault_base_folder + "/" + topic + '/' + filename;
				} else {
					try {await vault.createFolder(this.settings.vault_base_folder + "/" + team);} catch(e) {}
					try {await vault.createFolder(this.settings.vault_base_folder + "/" + team + "/" + topic);} catch(e) {}
					full_path_to_file = this.settings.vault_base_folder + "/" + team + '/' + topic + '/' + filename;
				}
				let fileRef : TFile = vault.getAbstractFileByPath(full_path_to_file);
				if(fileRef === undefined || fileRef === null) {
					await vault.create(full_path_to_file, body);
					new Notice('File ' + full_path_to_file + ' has been created!');
				} else {
					// TODO: consider storing multiple versions of a file here!
					await vault.modify(fileRef, body);
					new Notice('File ' + full_path_to_file + ' has been modified!');
				}
			}
		} catch(e) {
			console.log(JSON.stringify(e));
			throw e;
		}
	}

}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Base API URI')
			.setDesc('Base URL for API access')
			.addText(text => text
				.setPlaceholder('Enter your API url')
				.setValue(this.plugin.settings.base_uri)
				.onChange(async (value) => {
					this.plugin.settings.base_uri = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your API-Key')
				.setValue(this.plugin.settings.api_key)
				.onChange(async (value) => {
					this.plugin.settings.api_key = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Vault relay.md inbox')
			.setDesc('Base folder to synchronize into')
			.addText(text => text
				.setPlaceholder('relay.md')
				.setValue(this.plugin.settings.vault_base_folder)
				.onChange(async (value) => {
					this.plugin.settings.vault_base_folder = value;
					await this.plugin.saveSettings();
				}));
	}
}
