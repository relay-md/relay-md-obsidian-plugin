import {
    App,
    Notice,
    Plugin,
    RequestUrlParam,
    RequestUrlResponse,
    requestUrl,
    TFile,
    TAbstractFile,
    TFolder,
    normalizePath
} from 'obsidian';

import { RelayMDSettings, DEFAULT_SETTINGS, RelayMDSettingTab } from "./settings"
import { IEmbed, EmbedRepo } from './embed';
import { IDocument, DocumentRepo } from './document';
import { Utils } from './utils';

export default class RelayMdPLugin extends Plugin {
    settings: RelayMDSettings;
    fetch_recent_document_timer: number;

    document_repo: DocumentRepo

    async onload() {
        await this.loadSettings();
        this.document_repo = new DocumentRepo(this);

        // To make obtaining the access-token easier,
        // we register a protocol handler
        this.registerObsidianProtocolHandler("relay.md:access-token", (params) => {
            if (!params.token) {
                return;
            }
            this.settings.api_key = params.token;
            this.settings.api_username = params.username;
            this.settings.base_uri = params.api_url;
            this.saveSettings();
            new Notice("Access credentials for relay.md have been succesfully installed!");
        });

        this.addCommand({
            id: "send-current-active-file",
            name: "Send current open file",
            callback: async () => {
                new Notice("Sending document to relay.md");
                const activeFile = this.app.workspace.getActiveFile();
                await this.document_repo.send_document(activeFile);
            }
        });

        this.addCommand({
            id: "fetch-documents",
            name: "Retreive recent files",
            callback: async () => {
                new Notice("Retreiving documents from relay.md");
                await this.document_repo.get_recent_documents();
            }
        });

        // We look into all documents that are modified
        // NOTE: We use metadataCache here because the metadata is updated
        // async and independent of the vault's `modify`. But we want to be
        // sure we have the correct properties/frontmatter uploaded.
        this.registerEvent(this.app.metadataCache.on('changed', (file: TAbstractFile) => {
            if (file instanceof TFile) {
                this.document_repo.send_document(file);
            }
        }));
        this.registerEvent(this.app.vault.on('create', (file: TAbstractFile) => {
            if (file instanceof TFile) {
                this.document_repo.send_document(file);
            }
        }));

        this.register_timer();

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

    async load_embeds(embed: IEmbed, document: IDocument) {
        // TODO: think about this for a bit, it allows to update other peoples file by just using the same filename
        // On the other hand, if we were to put the team name into the path, we end up (potentially) having tos
        // duplicate the file into multiple team's attachment folder. Hmm
        document["relay-to"].forEach(async (team_topic: string) => {
            const parts = team_topic.split("@", 2);
            const team = parts[1];
            if (!team) return;
            const folder = normalizePath(this.settings.vault_base_folder + "/" + team + "/_attachments");
            const path = normalizePath(folder + "/" + embed.filename);
            Utils.make_directory_recursively(this.app, path);
            const file = this.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                const local_content = await this.app.vault.readBinary(file);
                const checksum = await Utils.calculateSHA256Checksum(local_content);
                if (checksum != embed.checksum_sha256) {
                    const content = await this.get_embeded_binary(embed);
                    this.app.vault.modifyBinary(file, content);
                    console.log("Binary file " + path + " has been updated!");
                }
            } else {
                const content = await this.get_embeded_binary(embed);
                this.app.vault.createBinary(path, content);
                console.log("Binary file " + path + " has been created!");
            }
        })
    }

    async get_embeded_binary(embed: IEmbed) {
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
            new Notice("API returned an error: " + response.json.error.message);
            return;
        }
        console.log("Successfully uploaded " + file.path + " as " + response.json.result.id);
    }

    register_timer() {
        // Additionally, we register a timer to fetch documents for us
        if (this.fetch_recent_document_timer) {
            window.clearInterval(
                this.fetch_recent_document_timer
            );
        }
        this.fetch_recent_document_timer = window.setInterval(() => {
            this.document_repo.get_recent_documents();
        }, this.settings.fetch_recent_documents_interval * 1000);

        this.registerInterval(this.fetch_recent_document_timer);
    }

}
