import {
  type PluginContext,
  Rules,
  SettingRules,
  addCommand,
  anyToError,
  deepFreeze,
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
  $DataAdapter,
  $Element,
  $FileExplorerView,
  $FileItem,
  $Filesystem,
  $MobileStat,
  $TFile,
  $Vault,
  $Window,
  $Workspace,
} from "./@types/obsidian.js";
import type { UnhidePlugin } from "./main.js";
import type { Settings } from "./settings-data.js";

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
        context.register(
          around(vault0, {
            setConfigDir(next) {
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

function patchVault(context: UnhidePlugin, filter: ShowingRules): void {
  const {
      app: {
        vault: { adapter },
        workspace,
      },
    } = context,
    hiddenPaths = new Set<string>();
  async function hideAll(): Promise<void> {
    await Promise.all(
      [...hiddenPaths].map(async (path) => hideFile(context, path)),
    );
  }
  context.register(hideAll);
  context.register(
    filter.onChanged.listen(async () =>
      Promise.all(
        [...hiddenPaths].map(async (path) =>
          filter.test(path) ? showFile(context, path) : hideFile(context, path),
        ),
      ),
    ),
  );
  revealPrivateFilter<[$DataAdapter]>()(
    context,
    [adapter],
    (adapter0) => {
      context.register(
        around(adapter0, {
          reconcileDeletion(next) {
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
}

function patchErrorMessage(context: UnhidePlugin, filter: ShowingRules): void {
  // Affects: canvas: convert to file, renaming in editor
  revealPrivateFilter<[$Window]>()(
    context,
    [self],
    (self0) => {
      const { i18next } = self0;
      context.register(
        around(i18next, {
          t(next) {
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

function patchFileExplorer(context: UnhidePlugin, filter: ShowingRules): void {
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
          if (!leaf) {
            return false;
          }
          const { view } = leaf;
          context.register(
            around(Object.getPrototypeOf(view) as unknown as typeof view, {
              finishRename(next) {
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
                        patch2 = around(fileBeingRenamed, {
                          getNewPathAfterRename(proto2) {
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
      id: `show-hidden-files.${type}`,
    });
  }
}

async function showFile(context: PluginContext, path: string): Promise<void> {
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

async function hideFile(context: PluginContext, path: string): Promise<void> {
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
