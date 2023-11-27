import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, RequestUrlParam, RequestUrlResponse, requestUrl, TFile } from 'obsidian';
import { path } from 'path';

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

		this.addCommand({
			id: "relay-md-send-current-active-file",
			name: "Relay.md: Send current open file",
			callback: async () => {
				new Notice("Sending document to relay.md");
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					return;
				}
				if (activeFile.extension !== "md") {
					new Notice(
						"The current file is not a markdown file. Please open a markdown file and try again.",
					);
					return;
				}
				await this.send_document(activeFile);
			}
		});

		this.addCommand({
			id: "relay-md-fetch-documents",
			name: "Relay.md: Retreive recent files",
			callback: async () => {
				new Notice("Retreiving documents from relay.md");
				await this.get_recent_documents();
			}
		});

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

	async upsert_document(folder: str, filename: str, body: string) {
		// FIXME: There is no way to check if a folder exists, so we just try create them
		folder.split('/').reduce(
			(directories, directory) => {
				directories += `${directory}/`;
				try {
					this.app.vault.createFolder(directories);
				} catch(e) {}
				return directories;
			},
			'',
		);
		let full_path_to_file = folder + "/" + filename;
		let fileRef : TFile = this.app.vault.getAbstractFileByPath(full_path_to_file);
		if(fileRef === undefined || fileRef === null) {
			await this.app.vault.create(full_path_to_file, body);
			new Notice('File ' + full_path_to_file + ' has been created!');
		} else {
			// TODO: consider storing multiple versions of a file here!
			await this.app.vault.modify(fileRef, body);
			new Notice('File ' + full_path_to_file + ' has been modified!');
		}
	}

	async load_document(id: string) {
		const options: RequestUrlParam = {
			url: this.settings.base_uri + '/v1/doc/' + id,
			method: 'GET',
			headers: {
				'X-API-KEY': this.settings.api_key,
				'Content-Type': 'text/markdown'
			},
		}
		var response: RequestUrlResponse;
		response = await requestUrl(options);
		if (response.status != 200) {
			console.error("API server returned non-200 status code");
			new Notice("Relay.md servers seem to be unavailable. Try again later");
			return;
		}
		try {
			let filename: string = response.headers["x-relay-filename"];
			let relay_to: dict = JSON.parse(response.headers["x-relay-to"]);
			let body : string = response.text;

			// Loop through team/topics
			for (let to of relay_to) {
				let tos: Array<string> = to.split("@", 2);
				let team: string = tos[1];
				let topic: string = tos[0];
				let full_path_to_file: string = this.settings.vault_base_folder + "/";
				// We ignore the "_" team which is a "global" team
				if (team != "_")
					full_path_to_file += team + "/";
				full_path_to_file += topic;
				this.upsert_document(full_path_to_file, filename, body);
			}
		} catch(e) {
			console.log(JSON.stringify(e));
			throw e;
		}
	}

	async get_recent_documents() {
		const options: RequestUrlParam = {
			url: this.settings.base_uri + '/v1/docs',
			method: 'GET',
			headers: {
				'X-API-KEY': this.settings.api_key,
				'Content-Type': 'application/json'
			},
		}
		var response: RequestUrlResponse;
		response = await requestUrl(options);
		if (response.status != 200) {
			console.error("API server returned non-200 status code");
			new Notice("Relay.md servers seem to be unavailable. Try again later");
			return;
		}
		try {
			response.json.result.map((item) => {
				new Notice("Obtaining " + item.filename);
				this.load_document(item.id);
			})
		} catch(e) {
			console.log(JSON.stringify(e));
			throw e;
		}
	}

	async send_document(activeFile) {
		var body = await this.app.vault.cachedRead(activeFile);
		var metadata = this.app.metadataCache.getCache(activeFile.path);
		var id = metadata.frontmatter["relay-id"]

		var method = "POST";
		var url = this.settings.base_uri + '/v1/doc?filename=' + encodeURIComponent(activeFile.path);
		if (id) {
			method = "PATCH"
			url = this.settings.base_uri + '/v1/doc/' + id;
		}
		const options: RequestUrlParam = {
			url: url,
			method: 'POST',
			headers: {
				'X-API-KEY': this.settings.api_key,
				'Content-Type': 'text/markdown'
			},
			body: body,
		}
		var response: RequestUrlResponse = await requestUrl(options);
		if (response.status != 200) {
			console.error("API server returned non-200 status code");
			new Notice("Relay.md servers seem to be unavailable. Try again later");
			return;
		}

		// new document -> store id in frontmatter
		if (!id) {
			// Get document id
			var doc_id = response.json.result.id;  // FIXME: prolly needs change of id key
			// update document to contain new document id
			app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
				frontmatter["relay-id"] = doc_id;
			});
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
