import {
  notice,
  revealPrivateAsyncFilter,
  revealPrivateFilter,
  type PluginContext,
} from "@polyipseity/obsidian-plugin-library";
import { noop } from "es-toolkit/function";
import { around } from "monkey-around";
import type {
  $App,
  $DataAdapter,
  $Filesystem,
  $InternalPlugins,
  $MobileStat,
  $SyncPlugin,
} from "./@types/obsidian.js";
import type { UnhidePlugin } from "./main.js";
import type { ShowingRules } from "./rules.js";
import { isHiddenPath, isSyncActive, isSyncProtectionActive } from "./utils.js";

// Patches Obsidian internals via monkey-around; the vendor/ library patches are separate and out of scope here.

/**
 * Tracks deleted files that match the hidden-files filter and reveals them so the plugin can keep
 * them visible after Obsidian removes them from the adapter.
 *
 * Target: patches `DataAdapter.reconcileDeletion` and reads the private `adapter._exists` method
 * via `revealPrivateAsyncFilter`.
 *
 * Purpose: when Obsidian deletes a path that the filter considers hidden, the plugin records the
 * path in `hiddenPaths` and, if it still physically exists and passes `filter.test`, shows it
 * again. This keeps user-hidden files visible in the file explorer even though Obsidian has
 * reconciled them out of the adapter. Paths that no longer exist are pruned from `hiddenPaths`.
 *
 * Obsidian-version coupling: depends on the private `DataAdapter._exists` method and the
 * `DataAdapter.reconcileDeletion` method. The public `exists` is intentionally avoided because it
 * triggers an await loop; `_exists` is used instead. Verified in 1.13.7: `reconcileDeletion`
 * takes `(realPath, path)` and defaults its internal `force` to `true` (`void 0===n&&(n=!0)`),
 * which performs the real removal; `force = false` instead defers via `setTimeout` + `reconcileFile`.
 * The plugin forwards only the two received args (`next.apply(this, args)`), so `force` stays `true`
 * and Obsidian performs the actual deletion — the plugin merely observes it and re-shows the file if
 * it still physically exists and passes `filter.test`. No third argument is required at the patch
 * site. If Obsidian renames or changes the signature of `_exists` or `reconcileDeletion`, hidden-path
 * tracking breaks and deleted hidden files may disappear from the explorer. Both private members are
 * reached through `revealPrivateFilter` / `revealPrivateAsyncFilter`, so type changes fail at compile
 * time.
 *
 * Sync / data-loss risk (GH#35 (obsidian-unhide)): `reconcileDeletion(force=true)` removes the entry
 * from the adapter `files` index and triggers `file-removed`/`folder-removed`, which the Vault handler
 * turns into a vault `"delete"` event. Obsidian Sync subscribes to `"delete"` and propagates deletions
 * to other synced devices. The destructive
 * `reconcileDeletion` calls originate from `hideFile`/`hideAll` (plugin unload, toggling hidden files
 * off, or changing rules), not from this observer patch, which only forwards genuine deletions. The
 * `protectSync` setting (enabled by default) defers `hideFile` while Obsidian Sync is detected, so
 * these destructive calls are avoided.
 *
 * Lifecycle: the `around` patch is registered through `context.register` inside the
 * `revealPrivateFilter` callback, so it is unloaded automatically with the plugin context. The
 * `hiddenPaths` set is owned by `patchVault` and cleared via the registered `hideAll` cleanup.
 */
// Paths that `hideFile` deferred because Sync-safe protection was active. They are flushed
// (reconciled out of the adapter) once protection turns off, so the deferral does not leak.
const protectedHiddenPaths = new Set<string>();
// Tracks the last observed protection state so the notice/flush only fire on a transition.
let lastProtectionActive = false;

export function reevaluateProtection(context: UnhidePlugin): void {
  const now = isSyncProtectionActive(context);
  if (now && !lastProtectionActive) {
    // Transition inactive -> active: warn that hiding is now skipped to avoid Sync data-loss.
    notice(
      () => context.language.value.t("notices.protect-sync-active"),
      context.settings.value.errorNoticeTimeout,
      context,
    );
  } else if (!now && lastProtectionActive) {
    // Transition active -> inactive: warn that hiding will now propagate deletions, then flush.
    if (isSyncActive(context)) {
      notice(
        () => context.language.value.t("notices.protect-sync-inactive"),
        context.settings.value.errorNoticeTimeout,
        context,
      );
    }
    void flushProtected(context);
  }
  lastProtectionActive = now;
}

async function flushProtected(context: UnhidePlugin): Promise<void> {
  await revealPrivateAsyncFilter<[$DataAdapter]>()(
    context,
    [context.app.vault.adapter],
    async (adapter0) => {
      await Promise.all(
        [...protectedHiddenPaths].map((path) => {
          // Intentionally non `async`.
          protectedHiddenPaths.delete(path);
          return adapter0.reconcileDeletion(adapter0.getRealPath(path), path);
        }),
      );
    },
    noop,
  );
}

function patchVault(context: UnhidePlugin, filter: ShowingRules): void {
  const {
      app: {
        vault: { adapter },
        workspace,
      },
    } = context,
    hiddenPaths = new Set<string>();
  async function hideAll(): Promise<void> {
    // SAFETY: `hideFile` calls `reconcileDeletion(force=true)`, which emits a vault `"delete"` event
    // that Obsidian Sync can propagate (data-loss risk, GH#35 (obsidian-unhide)). The `protectSync`
    // setting defers this call while Sync is detected.
    await Promise.all(
      [...hiddenPaths].map(async (path) => hideFile(context, path)),
    );
  }
  context.register(hideAll);
  context.register(
    filter.onChanged.listen(async () => {
      return Promise.all(
        [...hiddenPaths].map(async (path) =>
          // SAFETY: the `hideFile` branch calls `reconcileDeletion(force=true)`, emitting a vault
          // `"delete"` event that Obsidian Sync can propagate (data-loss risk, GH#35 (obsidian-unhide)).
          // The `protectSync` setting defers this branch while Sync is detected.
          filter.test(path) ? showFile(context, path) : hideFile(context, path),
        ),
      );
    }),
  );
  revealPrivateFilter<[$DataAdapter]>()(
    context,
    [adapter],
    (adapter0) => {
      // Track hidden paths on deletion and reveal them if the filter matches; uses private `_exists` to avoid an await loop.
      context.register(
        around(adapter0, {
          reconcileDeletion(next) {
            // Verified 1.13.7 signature `(realPath, path)`; `force` defaults to `true` internally, so forwarding only the two received args keeps the real deletion.
            return async function fn(
              this: typeof adapter,
              ...args: Parameters<typeof next>
            ): Promise<Awaited<ReturnType<typeof next>>> {
              const [, path] = args;
              if (isHiddenPath(path)) {
                // Cannot use `exists` as it causes an await loop
                if (
                  // Intentionally nested reveal private call because the function might not be invoked right now.
                  await revealPrivateAsyncFilter<[$DataAdapter]>()(
                    context,
                    [adapter],
                    async (adapter2) =>
                      adapter2._exists(adapter0.getFullPath(path), path),
                    () => false,
                  )
                ) {
                  hiddenPaths.add(path);
                  if (filter.test(path)) {
                    return showFile(context, path);
                  }
                } else {
                  hiddenPaths.delete(path);
                }
              }
              return next.apply(this, args);
            };
          },
        }),
      );
    },
    noop,
  );
  workspace.onLayoutReady(async () =>
    revealPrivateAsyncFilter<[$DataAdapter]>()(
      context,
      [adapter],
      async (adapter0) => adapter0.listRecursive(""),
      noop,
    ),
  );
  context.register(
    context.settings.onMutate(
      (setting) => setting.protectSync,
      () => {
        reevaluateProtection(context);
      },
    ),
  );
  // Re-evaluate protection when Obsidian Sync connects or disconnects.
  revealPrivateFilter<[$App, $InternalPlugins, $SyncPlugin]>()(
    context,
    [context.app],
    (app0) => {
      const sync = app0.internalPlugins.getPluginById("sync");
      const handler = (): void => {
        reevaluateProtection(context);
      };
      context.register(() => {
        sync.instance.off("status-change", handler);
      });
      sync.instance.on("status-change", handler);
    },
    noop,
  );
}

export async function showFile(
  context: PluginContext,
  path: string,
): Promise<void> {
  // A path shown again is no longer pending-hidden; drop it so it is not flushed later.
  protectedHiddenPaths.delete(path);
  await revealPrivateAsyncFilter<[$DataAdapter, $Filesystem, $MobileStat]>()(
    context,
    [context.app.vault.adapter],
    async (adapter0) => {
      const realPath = adapter0.getRealPath(path),
        { fs } = adapter0;
      if (adapter0.reconcileFileInternal) {
        await adapter0.reconcileFileInternal(realPath, path);
      } else if (fs.stat && adapter0.reconcileFileChanged) {
        const fsStat = fs.stat.bind(fs),
          adapterRFC = adapter0.reconcileFileChanged.bind(adapter0),
          stat = await (async () => {
            try {
              return await fsStat(adapter0.getFullRealPath(realPath));
            } catch {
              return null;
            }
          })();
        if (!stat) {
          return;
        }
        const { type } = stat;
        switch (type) {
          case "file":
            adapterRFC(realPath, path, stat);
            break;
          case "directory":
            await adapter0.reconcileFolderCreation(realPath, path);
            break;
          default:
            throw new Error(type);
        }
      } else {
        throw new Error();
      }
    },
    noop,
  );
}

/**
 * Hides a path by reconciling it out of Obsidian's adapter/vault index.
 *
 * Mechanism: calls `DataAdapter.reconcileDeletion(realPath, path)` with only the two received args,
 * so its internal `force` defaults to `true` (`void 0===n&&(n=!0)`), which performs the real
 * removal. `reconcileDeletion(force=true)` removes the entry from the adapter `files` index and
 * triggers `file-removed`/`folder-removed`, which the Vault handler turns into a vault `"delete"`
 * event (`a.deleted=!0` + `trigger("delete", a)`).
 *
 * Data-loss risk (GH#35 (obsidian-unhide)): Obsidian Sync subscribes to vault `"delete"` events and
 * propagates deletions to other synced devices. Because hiding emits the same deletion events Obsidian
 * uses for real deletions, hiding a file in a synced vault can cause it to be deleted on other devices.
 * This is the data-loss path
 * reported in GH#35 (triggered by plugin unload, toggling hidden files off, or changing rules).
 *
 * Mitigation: the `protectSync` setting (enabled by default) defers `hideFile`'s `reconcileDeletion`
 * call while Sync is active, so the destructive call is skipped.
 */
export async function hideFile(
  context: UnhidePlugin,
  path: string,
): Promise<void> {
  if (isSyncProtectionActive(context)) {
    // Track the path as pending-hidden; do NOT call reconcileDeletion (avoids Sync data-loss).
    protectedHiddenPaths.add(path);
    return;
  }
  protectedHiddenPaths.delete(path);
  await revealPrivateAsyncFilter<[$DataAdapter]>()(
    context,
    [context.app.vault.adapter],
    async (adapter0) =>
      adapter0.reconcileDeletion(adapter0.getRealPath(path), path),
    noop,
  );
}

export function loadRevealHiddenFiles(
  context: UnhidePlugin,
  filter: ShowingRules,
): void {
  patchVault(context, filter);
}
