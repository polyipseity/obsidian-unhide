---
"obsidian-unhide": minor
---

Add a `syncSafeHide` setting (default ON) that prevents data loss in synced vaults. When enabled and Obsidian Sync is detected, hiding a file becomes a no-op so the destructive `DataAdapter.reconcileDeletion` calls are skipped, avoiding deletions that Obsidian Sync would propagate to other devices (issue #35). The README now documents the sync/data-loss risk and the best-effort nature of this protection: detection-based and may still have unknown bugs, so it is not a guarantee. ([#0](https://github.com/polyipseity/obsidian-unhide/pull/0) by [@polyipseity](https://github.com/polyipseity))
