import { Notice, TFile, TFolder, normalizePath } from "obsidian"
import RelayMdPLugin from './main'
import { IEmbed, EmbedRepo } from './embed'
import { API } from "./api"
import { Utils } from "./utils"

export interface IDocument {
    "relay-to": Array<string>;
    "relay-document": string;
    "relay-filename": string;
    "relay-title": string;
    checksum_sha256: string;
    embeds: Array<IEmbed>;
    filesize: number;
}

export class DocumentRepo {
    plugin: RelayMdPLugin
    api: API
    embed_repo: EmbedRepo

    constructor(plugin: RelayMdPLugin) {
        this.plugin = plugin;
        this.api = new API(this.plugin);
        this.embed_repo = new EmbedRepo(this.plugin);
    }

    async get_recent_documents() {
        const response = await this.api.get("/v1/docs")
        if (!response) return;
        response.json.result.map(async (item: IDocument) => {
            new Notice("Obtaining " + item["relay-filename"]);
            await this.load_document(item["relay-document"]);
        })
    }

    async load_document(id: string) {
        const response = await this.api.get("/v1/doc/" + id)
        if (!response) return;
        const result = response.json.result;
        const embeds = result.embeds;
        if (embeds) {
            embeds.map((embed: IEmbed) => {
                this.embed_repo.load_embeds(embed, result);
            });
        }
        this.load_document_body(result);
    }

    async load_document_body(result: IDocument) {
        const id = result["relay-document"];
        const filename = result["relay-filename"];
        const relay_to = result["relay-to"];
        const remote_checksum = result["checksum_sha256"];

        const response = await this.api.get("/v1/doc/" + id, "text/markdown");
        if (!response) return;
        const body: string = response.text;

        // Let's first see if we maybe have the document already somewhere in the fault
        const located_documents = await this.locate_document(id);
        if (located_documents?.length) {
            located_documents.forEach(async (located_document: TFile) => {
                // Compare checksum
                const local_content = await this.plugin.app.vault.readBinary(located_document);
                const checksum = await Utils.calculateSHA256Checksum(local_content);
                if (checksum != remote_checksum) {
                    this.upsert_document(located_document.path, body);
                } else {
                    console.log("No change detected on " + located_document.path);
                }
            })
        } else {
            // Loop through team/topics
            for (const to of relay_to) {
                const tos: Array<string> = to.split("@", 2);
                const team: string = tos[1];
                const topic: string = tos[0];
                let folder: string = this.plugin.settings.vault_base_folder + "/";
                // We ignore the "_" team which is a "global" team
                if (team != "_")
                    folder += team + "/";
                folder += topic;
                const path = normalizePath(folder + "/" + filename);
                this.upsert_document(path, body);
            }
        }
    }

    async upsert_document(path: string, body: string) {
        Utils.make_directory_recursively(this.plugin.app, path);
        const fileRef = this.plugin.app.vault.getAbstractFileByPath(path);
        if (fileRef === undefined || fileRef === null) {
            await this.plugin.app.vault.create(path, body);
            new Notice('File ' + path + ' has been created!');
        } else if (fileRef instanceof TFile) {
            await this.plugin.app.vault.modify(fileRef, body);
            new Notice('File ' + path + ' has been modified!');
        }
    }

    async locate_document(document_id: string) {
        const files = this.plugin.app.vault.getMarkdownFiles();
        let located_files = [];
        for (let i = 0; i < files.length; i++) {
            const activeFile = files[i];
            const metadata = this.plugin.app.metadataCache.getCache(activeFile.path);
            if (!metadata || !metadata.frontmatter) {
                return;
            }
            if (metadata.frontmatter["relay-document"] == document_id)
                located_files.push(activeFile);
        }
        return located_files;
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
        const metadata = this.plugin.app.metadataCache.getCache(activeFile.path);

        // There is no metadata so it cannot possibly be shared with anyone
        if (!metadata || !metadata.frontmatter) {
            return;
        }

        // We only share if relay-to is provided, even if its empty
        if (!("relay-to" in metadata.frontmatter)
            || !(metadata.frontmatter["relay-to"])) {
            return
        }

        // Do we already have an id maybe?
        let id = metadata.frontmatter["relay-document"]

        // Get the content of the file
        const body = await this.plugin.app.vault.cachedRead(activeFile);

        // Either we POST a new document or we PUT an existing document
        let response;
        if (id) {
            // TODO: In this case, we also need to check if we maybe have to update the assets we originally had in the document as well
            // this also means that we may have to delete embeds that have been removed from the note since it has been last
            // sent to the API
            response = await this.api.put('/v1/doc/' + id, body);
        } else {
            response = await this.api.post('/v1/doc?filename=' + encodeURIComponent(activeFile.path), body);
        }
        if (!response) return;

        console.log("Successfully sent to " + this.plugin.settings.base_uri);

        try {
            // WARNING: This overwrites an existing relay-document id potentially,
            // depending on how the server responds. It's a feature, and not a bug and
            // allows the backend to decide if a new document should be
            // created, or the old one should be updated, depending on
            // permissions.
            id = response.json.result["relay-document"];
            // update document to contain new document id
            this.plugin.app.fileManager.processFrontMatter(activeFile, (frontmatter: any) => {
                frontmatter["relay-document"] = id;
            });
        } catch (e) {
            console.log(e);
        }

        // Now try upload the embeds
        if (!metadata.embeds) {
            return;
        }
        metadata.embeds.map(async (item) => {
            let file = this.plugin.app.vault.getAbstractFileByPath(item.link);
            if (!(file instanceof TFile)) {
                file = this.plugin.app.metadataCache.getFirstLinkpathDest(item.link, "");
            }
            if (!file || !(file instanceof TFile)) {
                console.log(`Embed ${item.link} was not found!`)
            } else {
                this.embed_repo.upload_asset(id, item.link, file);
            }
        });
    }

}
