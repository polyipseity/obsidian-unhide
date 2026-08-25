---
"obsidian-unhide": minor
---

Add a `protectSync` setting (default ON) that prevents data loss in synced vaults. When enabled and Obsidian Sync is detected, hiding a file is deferred so the destructive `DataAdapter.reconcileDeletion` calls are skipped, avoiding deletions that Obsidian Sync would propagate to other devices ([GH#35](https://github.com/polyipseity/obsidian-unhide/issues/35)). The deferred paths are flushed when protection turns off, and a notice appears when protection activates. The README documents the sync/data-loss risk and the best-effort nature of this protection: detection-based and not a guarantee.
