import { App, TFolder } from "obsidian";
export class Utils {
    static async calculateSHA256Checksum(buffer: ArrayBuffer): Promise<string> {
        const data = new Uint8Array(buffer);
        try {
            const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const checksum = hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
            return checksum;
        } catch (error) {
            throw new Error(`Error calculating SHA-256 checksum: ${error}`);
        }
    }

    static make_directory_recursively(app: App, path: string) {
        // path contains the filename as well which could contain a folder. That's why we slice away the last part
        path.split('/').slice(0, -1).reduce(
            (directories = "", directory) => {
                directories += `${directory}/`;
                if (!(app.vault.getAbstractFileByPath(directories) instanceof TFolder)) {
                    app.vault.createFolder(directories);
                }
                return directories
            },
            '',
        );
    }
}
