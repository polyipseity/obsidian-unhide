---
"obsidian-unhide": minor
---

Support Obsidian 1.13.7's renamed file-explorer rename method. The hidden-file
rename patch now prefers `saveRename` (Obsidian ≥1.13.7) and falls back to
`finishRename` for older builds, so leading dots are preserved again on newer
Obsidian versions. Verified across Obsidian 1.4.11 (minAppVersion, old
`finishRename`) through 1.13.7 (new `saveRename`).
