# Relay.md Obsidian plugin

This repo contains an [Obsidian](https://obsidian.md) plugin for [relay.md](https://relay.md).

The purpose of relay.md is to make sharing markdown files fun again. In
particular, we want to establish "Markdown workflows for teams".

Relay.md makes it easy to send documents to groups or people or individuals and
allows to subscribe to entire teams and their documents. This will allow
individual team members to share their knowledge with the entire team from
within Obsidian. No more copy&pasting and editing into some strange wiki-syntax.

Further, those that deal with different projects, teams or clients, can keep
their information aggregated within Obsidian and send out their documents to
corresponding people from within Obsidian. Got your specs for
*new-start-up-feature-A* ready, send them out to the tech team of the startup.
Finished writing a consultancy contract for *business B*, have them notified
from within Obsidian by sendind the docs via relay.md.

Most importantly, you get to keep your stuff together!

# Howto:

Using relay.md couldn't be easier with Obsidian. All you need to do is specify
the recipient(s) in the frontmatter using:

```
relay-to:
 - label@team
 - @funnyfriend49
```

Upon updating the document, the file will be sent to relay.md using your
personal access token. As soon as your friends open up their Obsidian, the
relay.md plugin will automatically retrieve all documents that have been created
or updated.

# Developer Section

What comes below is meant for developers and maintainers.

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
