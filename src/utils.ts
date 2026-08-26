import {
  revealPrivateFilter,
  type PluginContext,
  Rules,
  SettingRules,
} from "@polyipseity/obsidian-plugin-library";
import { noop } from "es-toolkit/function";
import { escapeRegExp } from "es-toolkit/string";
import { around } from "monkey-around";
import type {
  $App,
  $InternalPlugins,
  $SyncPlugin,
  $Vault,
} from "./@types/obsidian.js";
import type { UnhidePlugin } from "./main.js";
import type { Settings } from "./settings-data.js";

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
 * rather than a runtime crash. Because this gates a data-loss protection, it
 * fails **closed**: when the Sync plugin is absent or its private API is
 * unavailable or throws, it falls back to `true` (assume Sync active) so the
 * `protectSync` guard stays on instead of silently disabling protection.
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
        return true;
      }
      const status = sync.getStatus();
      return status !== "uninitialized" && status !== "disconnected";
    },
    () => true,
  );
}

/**
 * Honestly reports whether Obsidian Sync is detectable for the current vault.
 *
 * Unlike {@link isSyncActive}, this never fails closed: it returns `false` when
 * the Sync plugin is absent, when the private API is unavailable or throws, or
 * when the status is `"uninitialized"`/`"disconnected"`. It is used only for the
 * settings status label, where a truthful "Sync not enabled" state matters; the
 * protection gate itself uses the fail-closed {@link isSyncActive}.
 */
export function isSyncDetected(context: PluginContext): boolean {
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

/**
 * Re-evaluates the `.obsidian` configuration-folder visibility rule when Obsidian relocates the
 * config directory.
 *
 * Target: patches `Vault.setConfigDir` and reads the private `vault.configDir` field via
 * `revealPrivateFilter`.
 *
 * Purpose: when the user changes the vault's configuration folder, the plugin re-emits
 * `onChanged` so the `showConfigurationFolder` rule re-tests against the new `configDir` and
 * shows or hides the `.obsidian` folder accordingly. Without this patch, a config-dir change
 * would not refresh visibility until another setting mutated.
 *
 * Obsidian-version coupling: depends on the private `Vault.configDir` property and the
 * `Vault.setConfigDir` method. Verified in 1.13.7: `setConfigDir(dir)` only assigns
 * `this.configDir = dir` (falling back to the default when invalid) and has no other side effect.
 * If Obsidian renames or removes `configDir`, or stops routing config-dir changes through
 * `setConfigDir`, the rule silently stops tracking the folder and the `.obsidian` visibility
 * toggle breaks. The private member is accessed through `revealPrivateFilter`, so a type change
 * surfaces as a compile error rather than a runtime crash.
 *
 * Lifecycle: the `around` patch is registered through `context.register` inside the
 * `revealPrivateFilter` callback, so it is unloaded automatically with the plugin context.
 */
export class ShowingRules extends SettingRules<Settings> {
  public constructor(context: UnhidePlugin) {
    super(context, (setting) => setting.showingRules, Rules.pathInterpreter);
    const {
      context: {
        app: { vault },
        settings,
      },
    } = this;
    context.register(
      settings.onMutate(
        (setting) => setting.showHiddenFiles,
        async () => this.onChanged.emit(),
      ),
    );
    context.register(
      settings.onMutate(
        (setting) => setting.showConfigurationFolder,
        async () => this.onChanged.emit(),
      ),
    );
    revealPrivateFilter<[$Vault]>()(
      context,
      [vault],
      (vault0) => {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- to capture `ShowingRules` properly in the callback
        const this2 = this;
        // Re-emit `onChanged` after `setConfigDir` so the `.obsidian` rule re-evaluates against the new `configDir`.
        context.register(
          around(vault0, {
            setConfigDir(next) {
              // Verified 1.13.7 body: `this.configDir = dir` (no other side effect) — re-emit after it runs.
              return function fn(
                this: typeof vault0,
                ...args: Parameters<typeof next>
              ): ReturnType<typeof next> {
                next.apply(this, args);
                this2.onChanged.emit().catch((error: unknown) => {
                  self.console.error(error);
                });
              };
            },
          }),
        );
      },
      noop,
    );
  }

  public override test(str?: string): boolean {
    const {
      context,
      context: {
        app: { vault },
        settings,
      },
    } = this;
    return (
      settings.value.showHiddenFiles &&
      (str === void 0 ||
        (revealPrivateFilter<[$Vault]>()(
          context,
          [vault],
          (vault0) =>
            new RegExp(`^${escapeRegExp(vault0.configDir)}(?:/|$)`, "u").test(
              str,
            ),
          () => false,
        )
          ? settings.value.showConfigurationFolder
          : super.test(str)))
    );
  }
}
