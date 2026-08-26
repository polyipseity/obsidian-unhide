import {
  revealPrivateFilter,
  type PluginContext,
} from "@polyipseity/obsidian-plugin-library";
import type { $App, $InternalPlugins, $SyncPlugin } from "./@types/obsidian.js";

// Pure helpers for detecting dot-prefixed hidden paths.

export function isHiddenPath(path: string): boolean {
  return path.split("/").some(isHiddenPathname);
}

export function isHiddenPathname(pathname: string): boolean {
  return pathname.startsWith(".");
}

/**
 * Reports whether Obsidian Sync is actually active for the current vault.
 *
 * Reads the Sync plugin's live connection status via `getStatus()` (reached
 * through the `$App` -> `$InternalPlugins` -> `$SyncPlugin` private-augmentation
 * chain in `src/@types/obsidian.ts`; `internalPlugins` is not in `obsidian.d.ts`
 * for the pinned Obsidian version). The plugin being *enabled* does not mean
 * Sync is active: a vault only propagates deletions to other devices once it is
 * logged in to a sync vault, which `getStatus()` reports as anything other than
 * `"uninitialized"` or `"disconnected"`. The single `revealPrivateFilter` call
 * auto-traverses the access path, so a type change surfaces as a compile error
 * rather than a runtime crash. Every level falls back to `false` when its
 * private API is unavailable or throws, degrading to "not active" instead of
 * propagating an error.
 *
 * Data-loss risk (GH#35 (obsidian-unhide)): when Sync is active, `hideFile`'s
 * destructive `reconcileDeletion` would propagate deletions to other synced
 * devices. This helper lets the `protectSync` setting gate that call. When
 * protection is active, `hideFile` defers the call and `reevaluateProtection`
 * shows the `notices.protect-sync-active` notice on activation and flushes the
 * deferred paths on deactivation.
 */
export function isSyncActive(context: PluginContext): boolean {
  return revealPrivateFilter<[$App, $InternalPlugins, $SyncPlugin]>()(
    context,
    [context.app],
    (app0) => {
      const sync = app0.internalPlugins.plugins.sync;
      if (!sync) {
        return false;
      }
      const status = sync.getStatus();
      return status !== "uninitialized" && status !== "disconnected";
    },
    () => false,
  );
}
