---
"obsidian-unhide": minor
---

Fix the hidden-file rename patch's file-explorer hook detection. The patch now
detects the rename method in order `saveRename` (Obsidian ≥1.13.7) → `acceptRename`
(≤1.12.7) → `finishRename` (ancient builds), so leading dots are preserved again
on Obsidian 1.12.7 and older. Previously the `finishRename` fallback never matched
real builds, leaving dot preservation broken and installing a throwing stub on the
prototype.
