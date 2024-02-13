import RelayMdPLugin from './main'

export interface IEmbed {
    checksum_sha256: string;
    filename: string;
    filesize: number;
    id: string;
}


export class EmbedRepo {
    plugin: RelayMdPLugin

    constructor(plugin: RelayMdPLugin) {
        this.plugin = plugin
    }
}
