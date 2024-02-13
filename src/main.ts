import {
    Notice,
    Plugin,
    TFile,
    TAbstractFile,
} from 'obsidian';

import { RelayMDSettings, DEFAULT_SETTINGS, RelayMDSettingTab } from "./settings"
import { DocumentRepo } from './document';

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

    onunload() { }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
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
