# Unhide for Obsidian [![release](https://img.shields.io/github/v/release/polyipseity/obsidian-unhide)][latest release] [![Obsidian downloads](https://img.shields.io/badge/dynamic/json?logo=Obsidian&color=%238b6cef&label=downloads&query=$["unhide"].downloads&url=https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugin-stats.json)][community plugin]

(formerly Show Hidden Files) Unhide hidden files, like dotfiles.

[![Buy Me a Coffee/embed][Buy Me a Coffee/embed]][Buy Me a Coffee]

__[Repository][repository] · [Changelog][changelog] · [Community plugin][community plugin] · [Related][related] · [Features](#features) · [Installation](#installation) · [Usage](#usage) · [Contributing](#contributing) · [Security](#security)__

> __For Obsidian Sync users__
>
> Using this plugin in a vault with Obsidian Sync can permanently delete hidden files on all your synced devices. The "Protect Obsidian Sync" setting (on by default) prevents this by skipping hiding while Sync is active, but it may not catch every case. Do not disable it in synced vaults, and keep independent backups.

![Trailer][trailer]

For first time users, read the [installation](#installation) section first!

This file is automatically opened on first install. You can reopen it in settings or command palette.

## Features

- Show files that are forcefully hidden in vanilla Obsidian.
- Toggle visibility of hidden files.
- Interact with hidden files normally like normal files.

## Installation

1. Install plugin.
    - Community plugins
        1. Install the [plugin][community plugin] from community plugins directly.
    - Manual
        1. Create directory `unhide` under `.obsidian/plugins` of your vault.
        2. Place `manifest.json`, `main.js`, and `styles.css` from the [latest release] into the directory.
    - Building (rolling)
        1. Clone this repository, including its submodules.
        2. Install `bun`. See <https://bun.sh> for installation.
        3. Run `bun install` in the root directory.
        4. Run `bun run obsidian:install <vault directory>` in the root directory.
    - [Obsidian42 - BRAT](https://obsidian.md/plugins?id=obsidian42-brat) (rolling)
        - See [their readme](https://github.com/TfTHacker/obsidian42-brat#readme).
2. Enable plugin. _Before you enable, please check [§ Usage](#usage)._
3. (optional) Configure plugin settings.

## Usage

- Before enabling the plugin, check if your vault contains dot folders with a lot of files \(e.g. 100+ files\). If yes, Obsidian will likely freeze \(for a long time\) when you enable the plugin, as Obsidian scans all files in the dot folders.

    By default, the plugin excludes folders and files named `.git` or `.venv` at any level of the vault file tree. If your dot folders are excluded by the defaults, you can simply enable the plugin without freezing Obsidian. The defaults can be edited in plugin settings.

    If not, you should manually create `.obsidian/plugins/unhide/data.json`, with the following contents as an example \(excluding the comments\):

    ```JSON5
    {
        "showingRules": [
            "+/", // Needed to include all hidden files and folders.
            // Add dot folders with a lot of files, e.g.:
            "-/\\.git(?:\\/|$)/u",
            "-/\\.venv(?:\\/|$)/u",
            "-/\\.aDotFolderWithManyFiles(?:\\/|$)/u",
        ]
    }
    ```

    The example excludes folders and files named `.git`, `.venv`, or `.aDotFolderWithManyFiles` at any level of the vault file tree. You can instead use `"-.aDotFolderWithManyFiles/"` to exclude a folder or file named `.aDotFolderWithManyFiles` at the vault root only.

- Enable the plugin.
- Please also enable `Files & links > Detect all file extensions` for the plugin to work properly.
- Other plugins will treat visible hidden files as normal files. This may cause issues such as treating plugin JavaScript files as user scripts. To resolve such issues, exclude those hidden files in the other plugins' settings or hide those hidden files in this plugin's settings.

## Contributing

Contributions are welcome!

### Changesets

This project uses [`changesets`](https://github.com/changesets/changesets) to manage the changelog. When creating a pull request, please [add a changeset](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md#adding-changesets) describing the changes. Add multiple changesets if your pull request changes several things. End each changeset with `([PR number](PR link) by [author username](author link))`. For example, the newly created file under the directory `.changeset` should look like:

```Markdown
---
"example": patch
---

This is an example change. ([GH#1](https://github.com/ghost/example/pull/1) by [@ghost](https://github.com/ghost))
```

### Linting, Commit, and Hooks

This project uses the following tools to ensure code and commit quality:

- __ESLint__: Linting for TypeScript/JavaScript. Run with `bun run check` (lint only) or `bun run fix` (auto-fix lint issues).
- __Prettier__: Code formatting. Run with `bun run format` (format all files) or `bun run format:check` (check formatting only).
- __markdownlint__: Lints Markdown files. Run with `bun run markdownlint` or auto-fix with `bun run markdownlint:fix`.
- __commitlint__: Enforces conventional commit messages. Used automatically on commit via Husky.
- __husky__: Manages Git hooks. Pre-commit runs `lint-staged` and pre-push runs commitlint.
- __lint-staged__: Runs linters on staged files. Markdown files are auto-fixed before commit.

> __Lint-staged note:__ The lint-staged configuration (`.lintstagedrc.mjs`) invokes formatter/linter binaries directly (for example `prettier --write`, `eslint --cache --fix`, `markdownlint-cli2 --fix`) so that the list of staged files is passed through to the tool. Invoking these via `bun run` would prevent lint-staged from forwarding filenames and cause the tool to operate on its default glob (or the entire repo). Use `bun run format` to format the entire repository when needed.

To set up locally:

1. Run `bun install` to install dependencies and set up hooks.
2. On commit, staged Markdown files will be linted and auto-fixed.
3. Commit messages are checked for conventional format.

You can manually run:

- `bun run check` — lint all code (no formatting)
- `bun run fix` — auto-fix lint issues (no formatting)
- `bun run format` — format all code with Prettier
- `bun run format:check` — check formatting with Prettier
- `bun run markdownlint` — check all Markdown files
- `bun run markdownlint:fix` — auto-fix Markdown files
- `bun run commitlint` — check commit messages in range

Configuration files:

- `.eslintrc.*` or `eslint.config.mjs` — ESLint rules
- `.prettierrc` — Prettier rules
- `.prettierignore` — Prettier ignore patterns
- `.markdownlint.jsonc` — markdownlint rules
- `.commitlintrc.js` — commitlint config
- `.husky/` — Git hooks

### Testing

This repository uses __Vitest__ for fast unit tests. Tests live under `tests/` and should be named `*.spec.ts` or `*.spec.js`.

- Run locally (non-interactive, coverage): `bun run test` (runs `vitest run --coverage`).
- Run locally (interactive / watch): `bun run test:watch`.
- Git hooks: The pre-push hook runs `bun run test` (see `.husky/pre-push`) and will block pushes if tests fail.

See `vitest.config.mts` for minimal config and further instructions.

### Todos

The todos here, ordered alphabetically, are things planned for the plugin. There are no guarantees that they will be completed. However, we are likely to accept contributions for them.

- (none)

### Translating

See [`assets/locales/README.md`](assets/locales/README.md).

## Security

We hope that there will never be any security vulnerabilities, but unfortunately it does happen. Please [report](#reporting-a-vulnerability) them!

### Supported versions

| Version  | Supported |
| -------- | --------- |
| rolling  | ✅        |
| latest   | ✅        |
| outdated | ❌        |

### Reporting a vulnerability

Please report a vulnerability by opening a [private vulnerability report][new security advisory]. We will get back to you as soon as possible.

[Buy Me a Coffee]: https://buymeacoffee.com/polyipseity
[Buy Me a Coffee/embed]: https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=polyipseity&button_colour=40DCA5&font_colour=ffffff&font_family=Lato&outline_colour=000000&coffee_colour=FFDD00
[changelog]: https://github.com/polyipseity/obsidian-unhide/blob/main/CHANGELOG.md
[community plugin]: https://obsidian.md/plugins?id=unhide
[latest release]: https://github.com/polyipseity/obsidian-unhide/releases/latest
[new security advisory]: https://github.com/polyipseity/obsidian-unhide/security/advisories/new
[related]: https://github.com/polyipseity/obsidian-monorepo
[repository]: https://github.com/polyipseity/obsidian-unhide
[trailer]: https://raw.githubusercontent.com/polyipseity/obsidian-unhide/main/assets/trailer.png
