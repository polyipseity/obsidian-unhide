import {
  revealPrivateAsyncFilter,
  revealPrivateFilter,
} from "@polyipseity/obsidian-plugin-library";
import { noop } from "es-toolkit/function";
import { around } from "monkey-around";
import type { FileExplorerView } from "obsidian";
import type {
  $Element,
  $FileExplorerView,
  $FileItem,
  $TFile,
  $Window,
  $Workspace,
} from "./@types/obsidian.js";
import type { UnhidePlugin } from "./main.js";
import type { ShowingRules } from "./rules.js";
import { isHiddenPathname } from "./utils.js";

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
          // installs a throwing stub for any absent key, so pass exactly one key, the first that
          // exists on the prototype.
          const renamePrototype = Object.getPrototypeOf(view) as typeof view;
          // Verified 1.13.7: `saveRename` is the live method on `FileExplorerView.prototype`; `acceptRename` moved to the property-rename view and `finishRename` was removed. Detect the single present method at runtime.
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
                            // Verified 1.13.7 body: strips control chars, trims, then joins under `parent.path` (or root). We map the UUID placeholder back to the real dotted name.
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

export function loadRenameHiddenFiles(
  context: UnhidePlugin,
  filter: ShowingRules,
): void {
  patchFileExplorer(context, filter);
  patchErrorMessage(context, filter);
}
