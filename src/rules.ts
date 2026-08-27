import {
  revealPrivateFilter,
  Rules,
  SettingRules,
} from "@polyipseity/obsidian-plugin-library";
import { noop } from "es-toolkit/function";
import { escapeRegExp } from "es-toolkit/string";
import { around } from "monkey-around";
import type { $Vault } from "./@types/obsidian.js";
import type { UnhidePlugin } from "./main.js";
import type { Settings } from "./settings-data.js";

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
 * would not refresh visibility until another setting changed.
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
              // Verified 1.13.7 body: `this.configDir = dir` (no other side effect). Re-emit after it runs.
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

export function loadRules(context: UnhidePlugin): ShowingRules {
  return new ShowingRules(context);
}
