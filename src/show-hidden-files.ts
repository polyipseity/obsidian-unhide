import {
  type PluginContext,
  Rules,
  SettingRules,
  addCommand,
  anyToError,
  deepFreeze,
  notice,
  printError,
  revealPrivateAsyncFilter,
  revealPrivateFilter,
} from "@polyipseity/obsidian-plugin-library";
import { noop } from "es-toolkit/function";
import { escapeRegExp } from "es-toolkit/string";
import { around } from "monkey-around";
import type { Command, FileExplorerView } from "obsidian";
import type { MarkOptional } from "ts-essentials";
import type {
  $App,
  $DataAdapter,
  $Element,
  $FileExplorerView,
  $FileItem,
  $Filesystem,
  $InternalPlugins,
  $SyncPlugin,
  $MobileStat,
  $TFile,
  $Vault,
  $Window,
  $Workspace,
} from "./@types/obsidian.js";
import type { UnhidePlugin } from "./main.js";
import type { Settings } from "./settings-data.js";

// Patches Obsidian internals via monkey-around; the vendor/ library patches are separate and out of scope here.

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
class ShowingRules extends SettingRules<Settings> {
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

export function loadShowHiddenFiles(context: UnhidePlugin): void {
  const filter = new ShowingRules(context);
  patchVault(context, filter);
  patchErrorMessage(context, filter);
  patchFileExplorer(context, filter);
  addCommands(context);
}

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
 * to other synced devices (Sync is not a backup — only version history is kept). The destructive
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

function isProtectionActive(context: UnhidePlugin): boolean {
  return context.settings.value.protectSync && isSyncActive(context);
}

export function reevaluateProtection(context: UnhidePlugin): void {
  const now = isProtectionActive(context);
  if (now && !lastProtectionActive) {
    // Transition inactive -> active: warn that hiding is now skipped to avoid Sync data-loss.
    notice(
      () => context.language.value.t("notices.protect-sync-active"),
      context.settings.value.errorNoticeTimeout,
      context,
    );
  } else if (!now && lastProtectionActive) {
    // Transition active -> inactive: flush the deferred paths so they are actually hidden.
    void flushProtected(context);
  }
  lastProtectionActive = now;
}

async function flushProtected(context: UnhidePlugin): Promise<void> {
  await Promise.all(
    [...protectedHiddenPaths].map(async (path) => {
      protectedHiddenPaths.delete(path);
      await revealPrivateAsyncFilter<[$DataAdapter]>()(
        context,
        [context.app.vault.adapter],
        async (adapter0) =>
          adapter0.reconcileDeletion(adapter0.getRealPath(path), path),
        noop,
      );
    }),
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
      const sync = app0.internalPlugins.plugins.sync;
      const handler = (): void => {
        reevaluateProtection(context);
      };
      sync.on("status-change", handler);
      context.register(() => {
        sync.off("status-change", handler);
      });
    },
    noop,
  );
}

/**
 * Suppress the file-explorer dotfile error string while hidden files are shown.
 *
 * Target: the `t` method on the private global `i18next` instance (reached via `revealPrivateFilter` on `self`).
 *
 * Purpose: when hidden files are visible, Obsidian rejects names starting with a dot and surfaces the `plugins.file-explorer.msg-bad-dotfile` message. This blocks canvas "convert to file" and editor rename of hidden files. Returning an empty string for that key lets those operations proceed.
 *
 * Obsidian-version coupling: depends on the private global `i18next` and on the literal translation key `plugins.file-explorer.msg-bad-dotfile`. If Obsidian renames the global, moves i18n off `i18next`, or changes the key, the suppression silently stops working and the error reappears.
 *
 * Lifecycle: registered through `revealPrivateFilter` plus `context.register(around(...))`, so the patch is installed when the private `i18next` is available and unloaded with the plugin.
 */
function patchErrorMessage(context: UnhidePlugin, filter: ShowingRules): void {
  // Affects: canvas: convert to file, renaming in editor
  revealPrivateFilter<[$Window]>()(
    context,
    [self],
    (self0) => {
      const { i18next } = self0;
      // Suppress the dotfile error string so canvas "convert to file" and editor rename work on hidden files.
      context.register(
        around(i18next, {
          t(next) {
            // Verified 1.13.7: key `plugins.file-explorer.msg-bad-dotfile` lives in the i18n bundle (`i18n/mapping.txt`), not `app.js`; returning "" lets canvas "convert to file" and editor rename proceed.
            return function fn(
              this: typeof i18next,
              ...args: Parameters<typeof next>
            ): ReturnType<typeof next> {
              if (filter.test()) {
                const [key] = args;
                if (key === "plugins.file-explorer.msg-bad-dotfile") {
                  return "";
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
}

/**
 * Preserve the leading dot when renaming hidden files in the file explorer.
 *
 * Target: the file-explorer rename method on `FileExplorerView.prototype` (patched via `around(Object.getPrototypeOf(view), ...)`). Obsidian ≥1.13.7 exposes `saveRename`; ≤1.12.7 exposes `acceptRename`; ancient builds used `finishRename`. The patch detects the existing method at runtime and wraps only that one, because `monkey-around` installs a throwing stub for any absent key.
 *
 * Purpose: Obsidian's rename strips the leading dot from hidden-file names. When the file being renamed is hidden, this patch swaps the displayed filename for a placeholder UUID during the rename method, then restores the real dotted name via `getNewPathAfterRename`, so the dot is kept.
 *
 * Private typing: the patched rename method and the read private members (`fileBeingRenamed`, `fileItems`, `innerEl`) are declared on the `$FileExplorerView` interface in `src/@types/obsidian.ts` and merged into Obsidian's `FileExplorerView` through the `Private<$FileExplorerView, PrivateKey>` augmentation from `@polyipseity/obsidian-plugin-library`; at runtime they are reached through `revealPrivateAsyncFilter` / `revealPrivateFilter`. The nested patches wrap `getNewPathAfterRename` (declared on `$TFile`) and `innerEl.getText` (declared on `$Element` / `$FileItem.innerEl`).
 *
 * Obsidian-version coupling: depends on the rename method (`saveRename` ≥1.13.7, `acceptRename` ≤1.12.7, `finishRename` ancient) and on the private `fileBeingRenamed`, `fileItems`, and `innerEl` members plus `getNewPathAfterRename` on the renamed file. Any rename of these symbols or a change to how the file explorer computes the new path breaks the dot preservation. Verified working across Obsidian 1.4.11 (minAppVersion, old `acceptRename`) through 1.13.7 (new `saveRename`).
 *
 * Lifecycle: lazily applied after layout is ready. If the `file-explorer` leaf is not present yet, the patch retries on every `workspace` `layout-change` event until it succeeds, then detaches that listener. The installed `around` patch and the retry listener are both registered on the plugin context for unload.
 */
export function patchFileExplorer(
  context: UnhidePlugin,
  filter: ShowingRules,
): void {
  // Affects: renaming in file explorer
  const {
    app: { workspace },
  } = context;
  workspace.onLayoutReady(() => {
    function patch(): boolean {
      return revealPrivateFilter<[$FileExplorerView, $Workspace]>()(
        context,
        [workspace],
        (workspace0) => {
          const [leaf] = workspace0.getLeavesOfType("file-explorer");
          // Patch the file-explorer rename method (saveRename on Obsidian ≥1.13.7, acceptRename on ≤1.12.7, finishRename on ancient builds) so hidden-file renames keep their leading dot; reads private fileBeingRenamed/fileItems/innerEl.
          if (!leaf) {
            return false;
          }
          const { view } = leaf;
          // Detect the file-explorer rename method at runtime. Obsidian ≥1.13.7 renamed
          // `acceptRename` to `saveRename`; ancient builds used `finishRename`. `monkey-around`
          // installs a throwing stub for any absent key, so pass exactly one key — the first that
          // exists on the prototype.
          const renamePrototype = Object.getPrototypeOf(view) as typeof view;
          // Verified 1.13.7: `saveRename` is the live method on `FileExplorerView.prototype`; `acceptRename` moved to the property-rename view and `finishRename` was removed — so detect the single present method at runtime.
          const renameMethod: "saveRename" | "acceptRename" | "finishRename" =
            "saveRename" in renamePrototype
              ? "saveRename"
              : "acceptRename" in renamePrototype
                ? "acceptRename"
                : "finishRename";
          context.register(
            around(renamePrototype, {
              [renameMethod](next: () => PromiseLike<void>) {
                return async function fn(
                  this: FileExplorerView,
                  ...args: Parameters<typeof next>
                ): Promise<Awaited<ReturnType<typeof next>>> {
                  if (!filter.test()) {
                    return next.apply(this, args);
                  }
                  // Intentionally nested reveal private call because the function might not be invoked right now.
                  return revealPrivateAsyncFilter<
                    [$Element, $FileExplorerView, $FileItem, $TFile]
                  >()(
                    context,
                    [this],
                    async (this0) => {
                      const { fileBeingRenamed, fileItems } = this0;
                      if (!fileBeingRenamed) {
                        await next.apply(this, args);
                        return;
                      }
                      const { path } = fileBeingRenamed,
                        { [path]: fi } = fileItems;
                      if (!fi) {
                        throw new Error(path);
                      }
                      const { innerEl } = fi,
                        filename = innerEl.getText();
                      if (!isHiddenPathname(filename)) {
                        await next.apply(this, args);
                        return;
                      }
                      const uuid = self.crypto.randomUUID(),
                        // Swap the rename target to a UUID so the real hidden filename is used; getNewPathAfterRename maps the UUID back to the hidden name.
                        patch2 = around(fileBeingRenamed, {
                          getNewPathAfterRename(proto2) {
                            // Verified 1.13.7 body: strips control chars, trims, then joins under `parent.path` (or root) — we map the UUID placeholder back to the real dotted name.
                            return function fn2(
                              this: typeof fileBeingRenamed,
                              ...args2: Parameters<typeof proto2>
                            ): ReturnType<typeof proto2> {
                              const [filename2] = args2;
                              if (filename2 === uuid) {
                                args2[0] = filename;
                              }
                              return proto2.apply(this, args2);
                            };
                          },
                        });
                      try {
                        // Report the UUID as the displayed filename so the rename method passes it to getNewPathAfterRename, which restores the hidden name.
                        const patch3 = around(innerEl, {
                          getText(_proto2) {
                            return function fn2(
                              this: typeof innerEl,
                              ..._args: Parameters<typeof _proto2>
                            ): ReturnType<typeof _proto2> {
                              return uuid;
                            };
                          },
                        });
                        try {
                          await next.apply(this, args);
                        } finally {
                          patch3();
                        }
                      } finally {
                        patch2();
                      }
                    },
                    () => next.apply(this, args),
                  );
                };
              },
            }),
          );
          return true;
        },
        () => false,
      );
    }
    if (!patch()) {
      const event = workspace.on("layout-change", () => {
        if (patch()) {
          workspace.offref(event);
        }
      });
      context.registerEvent(event);
    }
  });
}

function addCommands(context: UnhidePlugin): void {
  const {
    language: { value: i18n },
    settings,
  } = context;
  function onErr(error: unknown): void {
    printError(
      anyToError(error),
      () => i18n.t("errors.error-mutating-settings"),
      context,
    );
  }
  for (const [type, cmd] of deepFreeze([
    [
      "show",
      {
        checkCallback(checking: boolean): boolean {
          const ret = !settings.value.showHiddenFiles;
          if (ret && !checking) {
            settings
              .mutate((set) => {
                set.showHiddenFiles = true;
              })
              .then(async () => settings.write())
              .catch(onErr);
          }
          return ret;
        },
      } satisfies MarkOptional<Command, keyof Command>,
    ],
    [
      "hide",
      {
        checkCallback(checking: boolean): boolean {
          const ret = settings.value.showHiddenFiles;
          if (ret && !checking) {
            settings
              .mutate((set) => {
                set.showHiddenFiles = false;
              })
              .then(async () => settings.write())
              .catch(onErr);
          }
          return ret;
        },
      } satisfies MarkOptional<Command, keyof Command>,
    ],
    [
      "toggle",
      {
        callback(): void {
          settings
            .mutate((set) => {
              set.showHiddenFiles = !set.showHiddenFiles;
            })
            .then(async () => settings.write())
            .catch(onErr);
        },
      } satisfies MarkOptional<Command, keyof Command>,
    ],
  ])) {
    addCommand(context, () => i18n.t(`commands.show-hidden-files-${type}`), {
      ...cmd,
      icon: i18n.t(`asset:commands.show-hidden-files-${type}-icon`),
      id: `unhide.${type}`,
    });
  }
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
      const status = sync.getStatus();
      return status !== "uninitialized" && status !== "disconnected";
    },
    () => false,
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
 * Sync is not a backup — it only keeps version history for recovery. This is the data-loss path
 * reported in GH#35 (triggered by plugin unload, toggling hidden files off, or changing rules).
 *
 * Mitigation: the `protectSync` setting (enabled by default) defers `hideFile`'s `reconcileDeletion`
 * call while Sync is active, so the destructive call is skipped.
 */
export async function hideFile(
  context: UnhidePlugin,
  path: string,
): Promise<void> {
  if (isProtectionActive(context)) {
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

function isHiddenPath(path: string): boolean {
  return path.split("/").some(isHiddenPathname);
}

function isHiddenPathname(pathname: string): boolean {
  return pathname.startsWith(".");
}
