# obsidian-unhide <!-- markdownlint-disable-file MD024 -->

## 3.1.0

### Minor Changes

- fbc3543: Add a `protectSync` setting (default ON) that prevents data loss in synced vaults. When enabled and Obsidian Sync is detected, hiding a file is deferred so the destructive `DataAdapter.reconcileDeletion` calls are skipped, avoiding deletions that Obsidian Sync would propagate to other devices ([GH#35](https://github.com/polyipseity/obsidian-unhide/issues/35)). The deferred paths are flushed when protection turns off, and a notice appears when protection activates. The README documents the sync/data-loss risk and the best-effort nature of this protection: detection-based and not a guarantee.

### Patch Changes

- d0a8742: Document the Nextcloud ↔ Obsidian embedded-image recipe in the README and add a test asserting the default `showingRules` reveal attachment dot-directories (`.assets`, `.attachments*`). ([GH#32](https://github.com/polyipseity/obsidian-unhide/issues/32))
- 07c7efc: Fix `DataAdapter.reconcileDeletion` private typing to document the optional `force` parameter; verify plugin usage is semantically correct against Obsidian 1.13.7.

## 3.0.0

### Major Changes

- 40817f7: Rename the plugin id from `show-hidden-files` to `unhide` (repo renamed to
  obsidian-unhide) to avoid a collision with an existing community plugin. The
  display name is now "Unhide" and the description notes the former name
  "Show Hidden Files". Breaking: existing installs and command hotkeys bound to
  the old id will not carry over and must be re-bound.

### Minor Changes

- b2b2e38: Fix the hidden-file rename patch's file-explorer hook detection. The patch now
  detects the rename method in order `saveRename` (Obsidian ≥1.13.7) → `acceptRename`
  (≤1.12.7) → `finishRename` (ancient builds), so leading dots are preserved again
  on Obsidian 1.12.7 and older. Previously the `finishRename` fallback never matched
  real builds, leaving dot preservation broken and installing a throwing stub on the
  prototype.

## 2.5.0

### Minor Changes

- 7d5f1ee: Add French (fr) translation. ([GH#16](https://github.com/polyipseity/obsidian-show-hidden-files/pull/16) by [@punkyard](https://github.com/punkyard))

## 2.4.1

### Patch Changes

- 634a6fa: Improve documentation for dot folders with many files. Fixes [GH#12](https://github.com/polyipseity/obsidian-show-hidden-files/issues/12).
- 1f8e10d: Improve "Showing Rules" defaults. Fixes [GH#12](https://github.com/polyipseity/obsidian-show-hidden-files/issues/12).

## 2.4.0

### Minor Changes

- f164545: Update template, and Obsidian API to 1.4.11.

## 2.3.3

### Patch Changes

- 11b0175: (63711193053ae1b850d816b84244f9152b53a407) Fix requiring `@capacitor`.

## 2.3.2

### Patch Changes

- 57436d0: (`1e0447fe9e805b7cb966b1286f6db7042fdd5c56`) Fix misdetecting iPadOS as desktop. Fixes [GH#5](https://github.com/polyipseity/obsidian-show-hidden-files/issues/5).
- bd38c29: Add note for `Detect all file extensions`. Fixes [GH#4](https://github.com/polyipseity/obsidian-show-hidden-files/issues/4).
- e77456a: Replace platform detection with feature detection. This is more robust against [GH#5](https://github.com/polyipseity/obsidian-show-hidden-files/issues/5).

## 2.3.1

### Patch Changes

- c932954: Add information about interactions with other plugins to readme. Fixes [GH#3](https://github.com/polyipseity/obsidian-show-hidden-files/issues/3).

## 2.3.0

### Minor Changes

- c18231b: Move settings `recovery` and `lastReadChangelogVersion` to `localStorage`. (6d612c570926387ee6b5991475cb993517a39d45)

### Patch Changes

- 1411e12: Remove debug statements. (f9fc1874e2c0b0b6c486ae6a13e52bf09cef588d)

## 2.2.0

### Minor Changes

- 6ddd1e9: Add setting "Show configuration folder". Fixes [GH#2](https://github.com/polyipseity/obsidian-show-hidden-files/issues/2).
- 9bb810a: Add setting "Showing rules" for filtering hidden files to be shown.

## 2.1.2

### Patch Changes

- 0aa7f2b: Attempt to fix `await` loop on mobile.

## 2.1.1

### Patch Changes

- 8238eb0: Fix "Make a copy", "New file", and "New folder" not highlighting the new file or folder if the new file or folder is supposed to be hidden. The code for `patchVault` is also simplified.

## 2.1.0

### Minor Changes

- d55414a: Dummy change.

### Patch Changes

- 3356733: Change settings order.

### Pre-changesets Changelog

#### Features

- Add support for renaming to dotfiles. (`966e528c6a3309777eb09eb2470fdf63bfe40e1b`)

**Full changelog**: [`2.0.0...2.1.0`](https://github.com/polyipseity/obsidian-show-hidden-files/compare/2.0.0...2.1.0)

## 2.0.0 (2023-07-21)

- Update minimum Obsidian version to v1.2.8. (`85d498d7cecf28b07e0562c4d9c1c793bf0344c0`)
- Use a new safer approach to show hidden dotfiles. (`c8a40e0ecbcd8e3fbca819aee623855fe6b2287b`)
- Rename name "Show Dotfiles" to "Show Hidden Files". (`e7d9d3c459cdb3159a9da00109aaf100321ea742`)

### Features

- Add three commands to toggle visibility of hidden files. (`8ccce72c4d35c6aafbc02cec7770a711d278c4f4`)
- Add setting `Show hidden files`. (`9e7dc20d087895eac06bd356451d77c9d417906a`)

### Fixes

- Fix the command to export settings to clipboard. (`993dff6c94b7e70e53c42afdad3fa8e56324a3aa`)
- Fix lifecycle management. (`46771b52d6db6c1523a959d8204bc921bd7121ca`)
- Fix `updateView` not updating the inner title. (`45603f33109f10be0bc7c040fa1addc42153d92f`)
- Fix failing to load the plugin if settings are malformed. (`45603f33109f10be0bc7c040fa1addc42153d92f`)

**Full changelog**: [`1.0.3...2.0.0`](https://github.com/polyipseity/obsidian-show-hidden-files/compare/1.0.3...2.0.0)

## 1.0.3 (2023-07-01)

### Improvements

- Remove confusing "Malformed data" notice. (`8b2e50ffcd085625dde0d0262e20fc1bfca90a8d`)
- Update npm packages to remove vulnerabilities. (`9f72566d714a238f6ea29aa4783816c2704f93dc`)

**Full changelog**: [`1.0.2...1.0.3`](https://github.com/polyipseity/obsidian-show-hidden-files/compare/1.0.2...1.0.3)

## 1.0.2 (2023-05-18)

### Improvements

- Improve performance. (`742f9abdd559eca0391769a2adf08da27a8f4496`)

**Full changelog**: [`1.0.1...1.0.2`](https://github.com/polyipseity/obsidian-show-hidden-files/compare/1.0.1...1.0.2)

## 1.0.1 (2023-05-17)

### Fixes

- Fix heuristics for detecting other plugin calls to `string#startsWith` not working on iOS. (`f98e1e6151e69c1ea15341956455aa6c59c2f837`)
- Fix `Override config folder` failing on iOS. (`9a70c32a6f0d484f3a15cb0312944db15c4a36ed`..`7d48bad63088b4d6d65c9555373bd2620b193008`)

### Improvements

- Dynamically calculate overhead just in case someone else also patches `string#startsWith`. (`21779a0535de3a7fe9bf628751fd089576ed7001`)

**Full changelog**: [`1.0.0...1.0.1`](https://github.com/polyipseity/obsidian-show-hidden-files/compare/1.0.0...1.0.1)

## 1.0.0 (2023-05-16)

Initial release! 🥳

Please report any bugs you have found!

Inspired by [this forum post](https://forum.obsidian.md/t/enable-use-of-hidden-files-dotfiles-within-obsidian/26908).

**Full changelog**: [`758424a8d4174f67fc20bdd308060db168eeec34...1.0.0`](https://github.com/polyipseity/obsidian-show-hidden-files/compare/758424a8d4174f67fc20bdd308060db168eeec34...1.0.0)
