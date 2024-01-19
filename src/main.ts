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
    TFolder,
    normalizePath
} from 'obsidian';

interface Embed {
    checksum_sha256: string;
    filename: string;
    filesize: number;
    id: string;
}

interface RelayMDSettings {
    base_uri: string;
    api_key: string;
    vault_base_folder: string
}

const DEFAULT_SETTINGS: RelayMDSettings = {
    base_uri: 'https://api.relay.md',
    api_key: '',
    vault_base_folder: "relay.md"
}

export default class RelayMdPLugin extends Plugin {
    settings: RelayMDSettings;

    async onload() {
        await this.loadSettings();

        // To make obtaining the access-token easier,
        // we register a protocol handler
        this.registerObsidianProtocolHandler("relay.md:access-token", (params) => {
            if (!params.token) {
                return;
            }
            this.settings.api_key = params.token;
            this.settings.base_uri = DEFAULT_SETTINGS.base_uri; // also potentially reset the base uri
            this.saveSettings();
            new Notice("Access credentials for relay.md have been succesfully installed!");
        });

        this.addCommand({
            id: "send-current-active-file",
            name: "Send current open file",
            callback: async () => {
                new Notice("Sending document to relay.md");
                const activeFile = this.app.workspace.getActiveFile();
                await this.send_document(activeFile);
            }
        });

        this.addCommand({
            id: "fetch-documents",
            name: "Retreive recent files",
            callback: async () => {
                new Notice("Retreiving documents from relay.md");
                await this.get_recent_documents();
            }
        });

        // We look into all documents that are modified
        // NOTE: We use metadataCache here because the metadata is updated
        // async and independent of the vault's `modify`. But we want to be
        // sure we have the correct properties/frontmatter uploaded.
        this.registerEvent(this.app.metadataCache.on('changed', (file: TAbstractFile) => {
            if (file instanceof TFile) {
                this.send_document(file);
            }
        }));
        this.registerEvent(this.app.vault.on('create', (file: TAbstractFile) => {
            if (file instanceof TFile) {
                this.send_document(file);
            }
        }));

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

    make_directory_recursively(folder: string) {
        folder.split('/').reduce(
            (directories, directory) => {
                directories += `${directory}/`;
                if (!(this.app.vault.getAbstractFileByPath(folder) instanceof TFolder)) {
                    this.app.vault.createFolder(directories);
                }
                return directories;
            },
            '',
        );
    }

    async upsert_document(folder: string, filename: string, body: string) {
        // Does the folder exist? If not, create it "recursively"
        if (!(this.app.vault.getAbstractFileByPath(folder) instanceof TFolder)) {
            this.make_directory_recursively(folder);
        }
        const full_path_to_file = normalizePath(folder + "/" + filename);
        const fileRef = this.app.vault.getAbstractFileByPath(full_path_to_file);
        if (fileRef === undefined || fileRef === null) {
            await this.app.vault.create(full_path_to_file, body);
            new Notice('File ' + full_path_to_file + ' has been created!');
        } else if (fileRef instanceof TFile) {
            // TODO: consider storing multiple versions of a file here!
            await this.app.vault.modify(fileRef, body);
            new Notice('File ' + full_path_to_file + ' has been modified!');
        }
    }

    async load_document(id: string) {
        // We first obtain the metdata of the document using application/json
        const options: RequestUrlParam = {
            url: this.settings.base_uri + '/v1/doc/' + id,
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

        const result = response.json.result;
        const embeds = result.embeds;
        if (embeds) {
            embeds.map((embed: Embed) => {
                this.load_embeds(embed);
            });
        }

        // Load the document body, we are going to use text/markdown here
        //this.load_document_body(id);

        //
    }
    async load_document_body(id: string) {
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
            const body: string = response.text;

            // Loop through team/topics
            for (const to of relay_to) {
                const tos: Array<string> = to.split("@", 2);
                const team: string = tos[1];
                const topic: string = tos[0];
                let full_path_to_file: string = this.settings.vault_base_folder + "/";
                // We ignore the "_" team which is a "global" team
                if (team != "_")
                    full_path_to_file += team;
                full_path_to_file += topic;
                this.upsert_document(normalizePath(full_path_to_file), filename, body);
            }

        } catch (e) {
            console.log(JSON.stringify(e));
            throw e;
        }
    }

    async load_embeds(embed: Embed) {
        // TODO: think about this for a bit, it allows to update other peoples file by just using the same filename
        // On the other hand, if we were to put the team name into the path, we end up (potentially) having tos
        // duplicate the file into multiple team's attachment folder. Hmm
        const folder = this.settings.vault_base_folder + "/" + "_attachments"
        if (!(this.app.vault.getAbstractFileByPath(folder) instanceof TFolder)) {
            this.make_directory_recursively(folder);
        }
        const path = normalizePath(folder + "/" + embed.filename);
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            const content = await this.get_embed_binady(embed);
            this.app.vault.createBinary(path, content);
            console.log("Binary file " + path + " has been created!");
        } else {
            console.log("file exists, checking hash");
            const local_content = await this.app.vault.readBinary(file);
            const checksum = await this.calculateSHA256Checksum(local_content);
            console.log(checksum, embed.checksum_sha256);
            if (checksum != embed.checksum_sha256) {
                const content = await this.get_embed_binady(embed);
                this.app.vault.modifyBinary(file, content);
                console.log("Binary file " + path + " has been updated!");
            }
        }
    }

    async get_embed_binady(embed: Embed) {
        const options: RequestUrlParam = {
            url: this.settings.base_uri + '/v1/assets/' + embed.id,
            method: 'GET',
            headers: {
                'X-API-KEY': this.settings.api_key,
                'Content-Type': 'application/octet-stream'
            },
        }
        const response: RequestUrlResponse = await requestUrl(options);
        return response.arrayBuffer;
    }

    async calculateSHA256Checksum(buffer: ArrayBuffer): Promise<string> {
        const data = new Uint8Array(buffer);

        try {
            const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const checksum = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
            return checksum;
        } catch (error) {
            throw new Error(`Error calculating SHA-256 checksum: ${error}`);
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
        } catch (e) {
            console.log(JSON.stringify(e));
            throw e;
        }
    }

    async send_document(activeFile: TFile | null) {
        if (!activeFile) {
            return;
        }
        // File not markdown
        if (activeFile.extension !== "md") {
            //NOTE: This gets called on all files on the vault potentially (e.g. syncing)
            //So, we don't call the Notice here, might want to do if the method is called manually though.
            //new Notice(
            //	"The current file is not a markdown file. Please open a markdown file and try again.",
            //);
            return;
        }
        const metadata = this.app.metadataCache.getCache(activeFile.path);

        // There is no metadata so it cannot possibly be shared with anyone
        if (!metadata || !metadata.frontmatter) {
            return;
        }

        // We only share if relay-to is provided, even if its empty
        if (!("relay-to" in metadata.frontmatter)) {
            return
        }

        // File is in the shared folder, no re-sharing
        if (activeFile.path.startsWith(this.settings.vault_base_folder + "/")) {
            console.warn(
                "Files from the relay.md base folder cannot be sent."
            );
            return;
        }

        // Do we already have an id maybe?
        let id = metadata.frontmatter["relay-document"]

        // Get the content of the file
        const body = await this.app.vault.cachedRead(activeFile);

        // Either we POST a new document or we PUT an existing document
        let method = "POST";
        let url = this.settings.base_uri + '/v1/doc?filename=' + encodeURIComponent(activeFile.name);
        if (id) {
            method = "PUT"
            url = this.settings.base_uri + '/v1/doc/' + id;
        }
        console.log("Sending API request to " + this.settings.base_uri + " (" + method + ")");
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

        console.log("Successfully sent to " + this.settings.base_uri);
        try {
            // WARNING: This overwrites an existing relay-document id potentially,
            // depending on how the server responds. It's a feature, and not a bug and
            // allows the backend to decide if a new document should be
            // created, or the old one should be updated, depending on
            // permissions.
            id = response.json.result["relay-document"];
            // update document to contain new document id
            this.app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
                frontmatter["relay-document"] = id;
            });
        } catch (e) {
            console.log(e);
        }

        // Now try upload the embeds
        if (!metadata.embeds) {
            return;
        }
        metadata.embeds.map(async (item: any) => {
            let file = this.app.vault.getAbstractFileByPath(item.link);
            console.log("Uploading attachment: " + item.link);
            if (file instanceof TFile) {
                this.upload_asset(id, item.link, file);
            }
        });
    }

    async upload_asset(id: string, link: string, file: TFile) {
        const content = await this.app.vault.readBinary(file);
        const options: RequestUrlParam = {
            url: this.settings.base_uri + '/v1/assets/' + id,
            method: "POST",
            headers: {
                'X-API-KEY': this.settings.api_key,
                'Content-Type': 'application/octet-stream',
                'x-relay-filename': link
            },
            body: content,
        }
        const response: RequestUrlResponse = await requestUrl(options);
        if (response.json.error) {
            console.error("API server returned an error");
            new Notice("Relay.md returned an error: " + response.json.error.message);
            return;
        }
        console.log("Successfully uploaded " + file.path);
    }

}

class RelayMDSettingTab extends PluginSettingTab {
    plugin: RelayMdPLugin;

    constructor(app: App, plugin: RelayMdPLugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

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

        if (this.plugin.settings.api_key === DEFAULT_SETTINGS.api_key) {
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
