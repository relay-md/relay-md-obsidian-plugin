import { Notice, TFile, TFolder, normalizePath } from "obsidian"
import RelayMdPLugin from './main'
import { API } from "./api"
import { Utils } from "./utils"
import { IDocument } from './document';

export interface IEmbed {
    checksum_sha256: string;
    filename: string;
    filesize: number;
    id: string;
}


export class EmbedRepo {
    plugin: RelayMdPLugin
    api: API

    constructor(plugin: RelayMdPLugin) {
        this.plugin = plugin
        this.api = new API(this.plugin);
    }

    async load_embeds(embed: IEmbed, document: IDocument) {
        // TODO: think about this for a bit, it allows to update other peoples file by just using the same filename
        // On the other hand, if we were to put the team name into the path, we end up (potentially) having tos
        // duplicate the file into multiple team's attachment folder. Hmm
        document["relay-to"].forEach(async (team_topic: string) => {
            const parts = team_topic.split("@", 2);
            const team = parts[1];
            if (!team) return;
            const folder = normalizePath(this.plugin.settings.vault_base_folder + "/" + team + "/_attachments");
            const path = normalizePath(folder + "/" + embed.filename);
            Utils.make_directory_recursively(this.plugin.app, path);
            const file = this.plugin.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                const local_content = await this.plugin.app.vault.readBinary(file);
                const checksum = await Utils.calculateSHA256Checksum(local_content);
                if (checksum != embed.checksum_sha256) {
                    const content = await this.get_embeded_binary(embed);
                    if (!content) return;
                    this.plugin.app.vault.modifyBinary(file, content);
                    console.log("Binary file " + path + " has been updated!");
                }
            } else {
                const content = await this.get_embeded_binary(embed);
                if (!content) return;
                this.plugin.app.vault.createBinary(path, content);
                console.log("Binary file " + path + " has been created!");
            }
        })
    }

    async get_embeded_binary(embed: IEmbed) {
        const response = await this.api.get('/v1/assets/' + embed.id, 'application/octet-stream')
        if (!response) return;
        return response.arrayBuffer;
    }


    async upload_asset(id: string, link: string, file: TFile) {
        const content = await this.plugin.app.vault.readBinary(file);
        const response = await this.api.postRaw('/v1/assets/' + id + '?filename=' + encodeURIComponent(file.path), content)
        if (!response) return;
        console.log("Successfully uploaded " + file.path + " as " + response.json.result.id);
    }
}
