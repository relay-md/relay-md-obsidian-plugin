import RelayMdPLugin from './main'
import { IEmbed } from './embed'

export interface IDocument {
    "relay-to": Array<string>;
    "relay-document": string;
    "relay-filename": string;
    "relay-title": string;
    checksum_sha256: string;
    embeds: Array<IEmbed>;
    filesize: number;
}

export default class Document {
    plugin: RelayMdPLugin

    constructor(plugin: RelayMdPLugin) {
        this.plugin = plugin
    }
}

