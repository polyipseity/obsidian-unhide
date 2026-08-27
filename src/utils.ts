import {
  revealPrivateFilter,
  type PluginContext,
} from "@polyipseity/obsidian-plugin-library";
import type {
  $App,
  $InternalPlugins,
  $SyncPlugin,
  $SyncPluginInstance,
} from "./@types/obsidian.js";
import { DOMClasses2 } from "./magic.js";
import type { UnhidePlugin } from "./main.js";

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
 * Reads the Sync plugin's live connection status via `instance.getStatus()`,
 * reached through the private `internalPlugins.getPluginById("sync")` accessor
 * (typed in `src/@types/obsidian.ts`; `internalPlugins` is not in `obsidian.d.ts`
 * for the pinned Obsidian version). The single `revealPrivateFilter` call
 * auto-traverses the `$App` -> `$InternalPlugins` -> `$SyncPlugin` ->
 * `$SyncPluginInstance` private augmentation chain, so a type change surfaces as
 * a compile error rather than a runtime crash. The plugin being *enabled* does
 * not mean Sync is active: a vault
 * only propagates deletions to other devices once it is logged in to a sync
 * vault, which `instance.getStatus()` reports as anything other than
 * `"uninitialized"` or `"disconnected"`.
 *
 * `fallback` controls the behavior when the Sync plugin is absent or its private
 * API is unavailable or throws. Because this gates a data-loss protection, the
 * default is `true` (fail **closed**: assume Sync active) so the `protectSync`
 * guard stays on instead of silently disabling protection. Pass `false` for a
 * truthful "Sync not enabled" status label.
 *
 * Data-loss risk (GH#35 (obsidian-unhide)): when Sync is active, `hideFile`'s
 * destructive `reconcileDeletion` would propagate deletions to other synced
 * devices. This helper lets the `protectSync` setting gate that call. When
 * protection is active, `hideFile` defers the call and `reevaluateProtection`
 * shows the `notices.protect-sync-active` notice on activation and flushes the
 * deferred paths on deactivation.
 */
export function isSyncActive(
  context: PluginContext,
  fallback: boolean = true,
): boolean {
  return revealPrivateFilter<
    [$App, $InternalPlugins, $SyncPlugin, $SyncPluginInstance]
  >()(
    context,
    [context.app],
    (app0) => {
      const status = app0.internalPlugins
        .getPluginById("sync")
        .instance.getStatus();
      return status !== "uninitialized" && status !== "disconnected";
    },
    () => fallback,
  );
}

/**
 * Reports whether Sync-safe protection is currently active for the vault.
 *
 * Protection is active only when the `protectSync` setting is ON and Sync is
 * actually active (fail-closed via {@link isSyncActive}). Both the settings
 * status label and the runtime `reevaluateProtection` gate read this.
 *
 * This is the **runtime guard** (fail-closed via `isSyncActive`'s default
 * `fallback = true`); keeping it fail-closed prevents Sync data-loss. The
 * user-facing status label uses {@link syncProtectionStatus}, which detects
 * Sync truthfully (`fallback = false`) and never claims Sync is active when it
 * is not.
 */
export function isSyncProtectionActive(context: UnhidePlugin): boolean {
  return context.settings.value.protectSync && isSyncActive(context);
}

/**
 * Computes the user-facing Sync-protection status label for the settings UI.
 *
 * Unlike {@link isSyncProtectionActive} (the fail-closed runtime guard), this
 * reports Sync truthfully: it first checks whether Sync is actually active with
 * `fallback = false`, then only considers the `protectSync` setting when Sync is
 * active. This avoids the misleading "Sync active, protection OFF, deletions will
 * sync" message when Sync is not enabled or active. With protection off, the
 * vault shows the idle "Sync not detected or enabled" state.
 */
export function syncProtectionStatus(
  context: UnhidePlugin,
): Readonly<{ key: string; cls: string }> {
  if (!isSyncActive(context, false)) {
    return {
      key: "settings.protect-sync-status-idle",
      cls: DOMClasses2.STATUS_IDLE,
    };
  }
  return context.settings.value.protectSync
    ? {
        key: "settings.protect-sync-status-protected",
        cls: DOMClasses2.STATUS_PROTECTED,
      }
    : {
        key: "settings.protect-sync-status-unprotected",
        cls: DOMClasses2.STATUS_UNPROTECTED,
      };
}
