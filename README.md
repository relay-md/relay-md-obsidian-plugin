# Relay.md Obsidian plugin

This repo contains an [Obsidian](https://obsidian.md) plugin for
[relay.md](https://relay.md).

## Releasing new releases
Releases are entirely managed in github actions and only require a pull-request
against `master` to be merged. Semantic versioning in connection with
conventional commits will take care of versioning

## How to build

- Clone this repo.
- Make sure your NodeJS is at least v16 (`node --version`).
- `npm i` or `yarn` to install dependencies.
- `npm run dev` to start compilation in watch mode.
- (optionally) `npm run lint` to check coding style

## Manually installing the plugin

Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/relay-md/`.
