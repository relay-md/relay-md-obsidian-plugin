import {
    App,
    Notice,
    PluginSettingTab,
    Setting,
} from 'obsidian';
import RelayMdPLugin from './main'

export interface RelayMDSettings {
    // Webseite
    auth_url: string;
    // API Site
    base_uri: string;
    // API Access key
    api_key: string;
    // username that corresponds to the api_key
    api_username: string;
    // vault folder to store new files in
    vault_base_folder: string
    // Interval to check for new documents
    fetch_recent_documents_interval: number
}

export const DEFAULT_SETTINGS: RelayMDSettings = {
    auth_url: 'https://relay.md',
    base_uri: 'https://api.relay.md',
    api_key: '',
    api_username: '',
    vault_base_folder: "relay.md",
    fetch_recent_documents_interval: 5 * 60,
}


export class RelayMDSettingTab extends PluginSettingTab {
    plugin: RelayMdPLugin;

    constructor(app: App, plugin: RelayMdPLugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('Authenticate against')
            .setDesc('Main Website to manage accounts')
            .addText(text => text
                .setPlaceholder('Enter your URL')
                .setValue(this.plugin.settings.auth_url)
                .onChange(async (value) => {
                    this.plugin.settings.auth_url = value;
                    await this.plugin.saveSettings();
                }));

        if (!(this.plugin.settings.api_key) || this.plugin.settings.api_key === DEFAULT_SETTINGS.api_key) {
            new Setting(containerEl)
                .setName('API Access')
                .setDesc('Link with your account')
                .addButton((button) =>
                    button.setButtonText("Obtain access to relay.md").onClick(async () => {
                        window.open(this.plugin.settings.auth_url + "/configure/obsidian");
                    })
                );
        } else {
            new Setting(containerEl)
                .setName('API Access')
                .setDesc(`Logged in as @${this.plugin.settings.api_username}`)
                .addButton((button) =>
                    button.setButtonText(`Logout!`).onClick(async () => {
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

        new Setting(containerEl)
            .setName('Fetch recent documents interval')
            .setDesc('How often to look for document updates in seconds')
            .addText(text => text
                .setPlaceholder('300')
                .setValue(this.plugin.settings.fetch_recent_documents_interval.toString())
                .onChange(async (value) => {
                    const as_float = parseFloat(value);
                    if (isNaN(as_float) || !isFinite(+as_float)) {
                        new Notice("Interval must be an number!")
                    } else {
                        this.plugin.settings.fetch_recent_documents_interval = as_float;
                        await this.plugin.saveSettings();
                        this.plugin.register_timer();
                    }
                }));
    }
}
