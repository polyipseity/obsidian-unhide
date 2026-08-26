import {
  addCommand,
  anyToError,
  deepFreeze,
  printError,
} from "@polyipseity/obsidian-plugin-library";
import type { Command } from "obsidian";
import type { MarkOptional } from "ts-essentials";
import type { UnhidePlugin } from "./main.js";

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

export function loadHiddenFilesFeatures(context: UnhidePlugin): void {
  addCommands(context);
}
