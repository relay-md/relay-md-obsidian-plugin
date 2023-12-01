/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => RelayMdPLugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  base_uri: "https://api.relay.md",
  api_key: "00000000-0000-0000-0000-000000000000",
  vault_base_folder: "relay.md"
};
var RelayMdPLugin = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "relay-md-send-current-active-file",
      name: "Relay.md: Send current open file",
      callback: async () => {
        new import_obsidian.Notice("Sending document to relay.md");
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
          return;
        }
        if (activeFile.extension !== "md") {
          new import_obsidian.Notice(
            "The current file is not a markdown file. Please open a markdown file and try again."
          );
          return;
        }
        if (activeFile.path.startsWith(this.settings.vault_base_folder)) {
          new import_obsidian.Notice(
            "Files from the relay.md base folder cannot be sent."
          );
        } else {
          await this.send_document(activeFile);
        }
      }
    });
    this.addCommand({
      id: "relay-md-fetch-documents",
      name: "Relay.md: Retreive recent files",
      callback: async () => {
        new import_obsidian.Notice("Retreiving documents from relay.md");
        await this.get_recent_documents();
      }
    });
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
  async upsert_document(folder, filename, body) {
    folder.split("/").reduce(
      (directories, directory) => {
        directories += `${directory}/`;
        try {
          this.app.vault.createFolder(directories);
        } catch (e) {
        }
        return directories;
      },
      ""
    );
    const full_path_to_file = (0, import_obsidian.normalizePath)(folder + "/" + filename);
    const fileRef = this.app.vault.getAbstractFileByPath(full_path_to_file);
    if (fileRef === void 0 || fileRef === null) {
      await this.app.vault.create(full_path_to_file, body);
      new import_obsidian.Notice("File " + full_path_to_file + " has been created!");
    } else if (fileRef instanceof import_obsidian.TFile) {
      await this.app.vault.modify(fileRef, body);
      new import_obsidian.Notice("File " + full_path_to_file + " has been modified!");
    }
  }
  async load_document(id) {
    const options = {
      url: this.settings.base_uri + "/v1/doc/" + id,
      method: "GET",
      headers: {
        "X-API-KEY": this.settings.api_key,
        "Content-Type": "text/markdown"
      }
    };
    const response = await (0, import_obsidian.requestUrl)(options);
    if (response.status != 200) {
      console.error("API server returned non-200 status code");
      new import_obsidian.Notice("Relay.md servers seem to be unavailable. Try again later");
      return;
    }
    try {
      const filename = response.headers["x-relay-filename"];
      const relay_to = JSON.parse(response.headers["x-relay-to"]);
      const body = response.text;
      for (const to of relay_to) {
        const tos = to.split("@", 2);
        const team = tos[1];
        const topic = tos[0];
        let full_path_to_file = this.settings.vault_base_folder + "/";
        if (team != "_")
          full_path_to_file += team + "/";
        full_path_to_file += topic;
        this.upsert_document(full_path_to_file, filename, body);
      }
    } catch (e) {
      console.log(JSON.stringify(e));
      throw e;
    }
  }
  async get_recent_documents() {
    const options = {
      url: this.settings.base_uri + "/v1/docs",
      method: "GET",
      headers: {
        "X-API-KEY": this.settings.api_key,
        "Content-Type": "application/json"
      }
    };
    const response = await (0, import_obsidian.requestUrl)(options);
    if (response.status != 200) {
      console.error("API server returned non-200 status code");
      new import_obsidian.Notice("Relay.md servers seem to be unavailable. Try again later");
      return;
    }
    try {
      response.json.result.map(async (item) => {
        new import_obsidian.Notice("Obtaining " + item.filename);
        await this.load_document(item.id);
      });
    } catch (e) {
      console.log(JSON.stringify(e));
      throw e;
    }
  }
  // TODO: might want to make the interface clear to get rid of "any" type
  async send_document(activeFile) {
    const body = await this.app.vault.cachedRead(activeFile);
    const metadata = this.app.metadataCache.getCache(activeFile.path);
    if (metadata === null || metadata === void 0) {
      return;
    }
    if (metadata.frontmatter === null || metadata.frontmatter === void 0) {
      return;
    }
    const id = metadata.frontmatter["relay-id"];
    let method = "POST";
    let url = this.settings.base_uri + "/v1/doc?filename=" + encodeURIComponent(activeFile.name);
    if (id) {
      method = "PATCH";
      url = this.settings.base_uri + "/v1/doc/" + id;
    }
    const options = {
      url,
      method,
      headers: {
        "X-API-KEY": this.settings.api_key,
        "Content-Type": "text/markdown"
      },
      body
    };
    const response = await (0, import_obsidian.requestUrl)(options);
    if (response.status != 200) {
      console.error("API server returned non-200 status code");
      new import_obsidian.Notice("Relay.md servers seem to be unavailable. Try again later");
      return;
    }
    if (!id) {
      const doc_id = response.json.result.id;
      app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
        frontmatter["relay-id"] = doc_id;
      });
    }
  }
};
var RelayMDSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app2, plugin) {
    super(app2, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Base API URI").setDesc("Base URL for API access").addText((text) => text.setPlaceholder("Enter your API url").setValue(this.plugin.settings.base_uri).onChange(async (value) => {
      this.plugin.settings.base_uri = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Setting #1").setDesc("It's a secret").addText((text) => text.setPlaceholder("Enter your API-Key").setValue(this.plugin.settings.api_key).onChange(async (value) => {
      this.plugin.settings.api_key = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Vault relay.md inbox").setDesc("Base folder to synchronize into").addText((text) => text.setPlaceholder("relay.md").setValue(this.plugin.settings.vault_base_folder).onChange(async (value) => {
      this.plugin.settings.vault_base_folder = value;
      await this.plugin.saveSettings();
    }));
  }
};
