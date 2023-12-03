import { 
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	RequestUrlParam,
	RequestUrlResponse,
	requestUrl,
	TFile,
	TAbstractFile,
	normalizePath
} from 'obsidian';

interface RelayMDSettings {
	base_uri: string;
	api_key: string;
	vault_base_folder: string
}

const DEFAULT_SETTINGS: RelayMDSettings = {
	base_uri: 'https://api.relay.md',
	api_key: '00000000-0000-0000-0000-000000000000',
	vault_base_folder: "relay.md"
}

export default class RelayMdPLugin extends Plugin {
	settings: RelayMDSettings;

	async onload() {
		await this.loadSettings();
		
		// To make obtaining the access-token easier,
		// we register a protocol handler
		this.registerObsidianProtocolHandler("relay.md:access-token", (params) =>{
			if (!params.token) {
				return;
			}
			this.settings.api_key = params.token;
			this.settings.base_uri = DEFAULT_SETTINGS.base_uri; // also potentially reset the base uri
			this.saveSettings();
			new Notice("Access credentials for relay.md have been succesfully installed!");
		});

		this.addCommand({
			id: "relay-md-send-current-active-file",
			name: "Relay.md: Send current open file",
			callback: async () => {
				new Notice("Sending document to relay.md");
				const activeFile = this.app.workspace.getActiveFile();
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

		// We look into all documents that are modified
		this.app.vault.on('modify', (file: TAbstractFile) => {
			if(file instanceof TFile) {
				this.send_document(file);
			}
		});
		this.app.vault.on('create', (file: TAbstractFile) => {
			if(file instanceof TFile) {
				this.send_document(file);
			}
		});


		// Additionally, we register a timer to fetch documents for us
		this.registerInterval(window.setInterval(() => {
				this.get_recent_documents();
			}, 5 * 60 * 1000));  // 5 minutes

		this.addSettingTab(new RelayMDSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async upsert_document(folder: string, filename: string, body: string) {
		// FIXME: There is no way to check if a folder exists, so we just try create them
		folder.split('/').reduce(
			(directories, directory) => {
				directories += `${directory}/`;
				try {
					this.app.vault.createFolder(directories);
				} catch(e) {
					// do nothing
				}
				return directories;
			},
			'',
		);
		const full_path_to_file = normalizePath(folder + "/" + filename);
		const fileRef = this.app.vault.getAbstractFileByPath(full_path_to_file);
		if(fileRef === undefined || fileRef === null) {
			await this.app.vault.create(full_path_to_file, body);
			new Notice('File ' + full_path_to_file + ' has been created!');
		} else if(fileRef instanceof TFile) {
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
		const response: RequestUrlResponse = await requestUrl(options);
		// we do not look for error in json response as we do not get a json
		// response but markdown in the body
		try {
			const filename: string = response.headers["x-relay-filename"];
			const relay_to = JSON.parse(response.headers["x-relay-to"]);
			const body : string = response.text;

			// Loop through team/topics
			for (const to of relay_to) {
				const tos: Array<string> = to.split("@", 2);
				const team: string = tos[1];
				const topic: string = tos[0];
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
		const response: RequestUrlResponse = await requestUrl(options);
		if (response.json.error) {
			console.error("API server returned an error");
			new Notice("Relay.md returned an error: " + response.json.error.message);
			return;
		}
		try {
			// TODO: might want to make the interface clear to get rid of "any" type
			response.json.result.map(async (item: any) => {
				new Notice("Obtaining " + item["relay-filename"]);
				await this.load_document(item["relay-document"]);
			})
		} catch(e) {
			console.log(JSON.stringify(e));
			throw e;
		}
	}

	async send_document(activeFile: TFile | null) {
		try {
			if (!activeFile) {
				return;
			}
			// File not markdown
			if (activeFile.extension !== "md") {
				new Notice(
					"The current file is not a markdown file. Please open a markdown file and try again.",
				);
				return;
			}
			// File is in the shared folder, no re-sharing
			if (activeFile.path.startsWith(this.settings.vault_base_folder)) {
				new Notice(
					"Files from the relay.md base folder cannot be sent."
				);
				return;
			}
			const body = await this.app.vault.cachedRead(activeFile);
			const metadata = this.app.metadataCache.getCache(activeFile.path);

			// There is no metadata so it cannot possibly be shared with anyone
			if (!metadata || !metadata.frontmatter) {
				return;
			}

			const relay_to = metadata.frontmatter["relay-to"];
			// We only share if relay-to is provided!
			if (!relay_to) {
				return
			}

			// Do we already have an id maybe?
			const id = metadata.frontmatter["relay-document"]

			// Either we POST a new document or we PUT an existing document
			let method = "POST";
			let url = this.settings.base_uri + '/v1/doc?filename=' + encodeURIComponent(activeFile.name);
			if (id) {
				method = "PUT"
				url = this.settings.base_uri + '/v1/doc/' + id;
			}
			console.log("Sending API request to api.relay.md (" + method + ")");
			const options: RequestUrlParam = {
				url: url,
				method: method,
				headers: {
					'X-API-KEY': this.settings.api_key,
					'Content-Type': 'text/markdown'
				},
				body: body,
			}
			const response: RequestUrlResponse = await requestUrl(options);
			if (response.json.error) {
				console.error("API server returned an error");
				new Notice("Relay.md returned an error: " + response.json.error.message);
				return;
			}

			// TODO: This overwrites an existing relay-document id potentially,
			// depending on how the server responds
			const doc_id = response.json.result["relay-document"];
			// update document to contain new document id
			app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
				frontmatter["relay-document"] = doc_id;
			});
		} catch (e) {
			console.log(e);
		}
	}
}

class RelayMDSettingTab extends PluginSettingTab {
	plugin: RelayMdPLugin;

	constructor(app: App, plugin: RelayMdPLugin) {
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

		if (this.plugin.settings.api_key == DEFAULT_SETTINGS.api_key) {
			new Setting(containerEl)
				.setName('API Access')
				.setDesc('Authenticate against the relay.md API')
				.addButton((button) =>
					button.setButtonText("Obtain access to relay.md").onClick(async () => {
						window.open("https://relay.md/configure/obsidian");
						//window.open("http://localhost:5000/configure/obsidian");
					})
				);
		} else {
			new Setting(containerEl)
				.setName('API Access')
				.setDesc('Authenticate against the relay.md API')
				.addButton((button) =>
					button.setButtonText("reset").onClick(async () => {
						this.plugin.settings.api_key = DEFAULT_SETTINGS.api_key;
						await this.plugin.saveSettings();
						// refresh settings page
						this.display();
					})
				);
		}

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
