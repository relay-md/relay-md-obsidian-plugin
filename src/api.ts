import { RequestUrlParam, RequestUrlResponse, requestUrl, Notice } from 'obsidian';
import RelayMdPLugin from './main'

export interface FileUpload {
    filetype: string
    hash: string
    content?: ArrayBuffer | string
    byteLength: number
    expiration?: number
    url?: string | null
}

export interface FileDownload {
    filetype: string
    hash: string
    content?: ArrayBuffer | string
    byteLength: number
    expiration?: number
    url?: string | null
}

export type PostData = {
    files?: FileUpload[]
    filename?: string
    filetype?: string
    hash?: string
    byteLength?: number
    expiration?: number
}

export interface QueueItem {
    data: FileUpload | FileDownload
    callback: (url: string) => void
}

export class API {
    plugin: RelayMdPLugin
    uploadQueue: QueueItem[]

    constructor(plugin: RelayMdPLugin) {
        this.plugin = plugin
        this.uploadQueue = []
    }

    async post(endpoint: string, body: string, retries = 1) {
        const options: RequestUrlParam = {
            url: this.plugin.settings.base_uri + endpoint,
            method: 'POST',
            headers: {
                'X-API-KEY': this.plugin.settings.api_key,
            },
            body: body
        }
        const response: RequestUrlResponse = await requestUrl(options);
        if (response.json.error) {
            console.error("API server returned an error");
            new Notice("API returned an error: " + response.json.error.message);
            return null;
        }
        return response;
    }
    async postRaw(endpoint: string, data: FileUpload, retries = 4) {
        return null;
    }

    async put(endpoint: string, body: string, retries = 4) {
        const options: RequestUrlParam = {
            url: this.plugin.settings.base_uri + endpoint,
            method: 'PUT',
            headers: {
                'X-API-KEY': this.plugin.settings.api_key,
            },
            body: body
        }
        const response: RequestUrlResponse = await requestUrl(options);
        if (response.json.error) {
            console.error("API server returned an error");
            new Notice("API returned an error: " + response.json.error.message);
            return null;
        }
        return response;
    }
    async putRaw(endpoint: string, data?: PostData, retries = 1) {
        return null;
    }

    async get(endpoint: string, content_type: string = "application/json", retries: number = 1,): Promise<RequestUrlResponse | null> {
        const options: RequestUrlParam = {
            url: this.plugin.settings.base_uri + endpoint,
            method: 'GET',
            headers: {
                'X-API-KEY': this.plugin.settings.api_key,
                'Content-Type': content_type
            },
        }
        const response: RequestUrlResponse = await requestUrl(options);
        if (content_type == "application/json") {
            if (response.json.error) {
                console.error("API server returned an error");
                new Notice("API returned an error: " + response.json.error.message);
                return null;
            }
        }
        return response;
    }
    async getRaw(endpoint: string, data: FileDownload, retries = 4) {
        return null;
    }

    // Queue
    async queueUpload(item: QueueItem) {
        return null;
    }
    async queueDownload(item: QueueItem) {
        return null;
    }
    async processQueue() {
        return null;
    }
}
