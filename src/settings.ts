import {
  AdvancedSettingTab,
  cloneAsWritable,
  closeSetting,
  createChildElement,
  createDocumentFragment,
  linkSetting,
  registerSettingsCommands,
  resetButton,
  rulesList,
  setSanitizedInnerHTML,
} from "@polyipseity/obsidian-plugin-library";
import semverLt from "semver/functions/lt.js";
import type { loadDocumentations } from "./documentations.js";
import type { UnhidePlugin } from "./main.js";
import { Settings } from "./settings-data.js";
import { isSyncActive } from "./show-hidden-files.js";
import { DOMClasses2 } from "./magic.js";

export class SettingTab extends AdvancedSettingTab<Settings> {
  public constructor(
    protected override readonly context: UnhidePlugin,
    protected readonly docs: loadDocumentations.Loaded,
  ) {
    super(context);
  }

  protected override onLoad(): void {
    super.onLoad();
    const {
      containerEl,
      context,
      context: {
        language: { value: i18n },
        localSettings,
        settings,
        version,
      },
      docs,
      ui,
    } = this;
    this.newDescriptionWidget();
    this.newLanguageWidget(
      Settings.DEFAULTABLE_LANGUAGES,
      (language) =>
        language
          ? i18n.t(`language:${language}`)
          : i18n.t("settings.language-default"),
      Settings.DEFAULT,
    );
    ui.newSetting(containerEl, (setting) => {
      setting
        .setName(i18n.t("settings.documentation"))
        .addButton((button) =>
          button
            .setIcon(i18n.t("asset:settings.documentations.donate-icon"))
            .setTooltip(i18n.t("settings.documentations.donate"))
            .setCta()
            .onClick((event) => {
              docs.open("donate", { event });
            }),
        )
        .addButton((button) =>
          button
            .setIcon(i18n.t("asset:settings.documentations.readme-icon"))
            .setTooltip(i18n.t("settings.documentations.readme"))
            .setCta()
            .onClick((event) => {
              docs.open("readme", { event });
              closeSetting(containerEl);
            }),
        )
        .addButton((button) => {
          button
            .setIcon(i18n.t("asset:settings.documentations.changelog-icon"))
            .setTooltip(i18n.t("settings.documentations.changelog"))
            .onClick((event) => {
              docs.open("changelog", { event });
              closeSetting(containerEl);
            });
          if (
            version === null ||
            semverLt(localSettings.value.lastReadChangelogVersion, version)
          ) {
            button.setCta();
          }
        });
    });
    this.newAllSettingsWidget(Settings.DEFAULT, Settings.fix);
    ui.newSetting(containerEl, (setting) => {
      const { settingEl } = setting;
      const syncEnabled = isSyncActive(context);
      const statusKey = syncEnabled
        ? settings.value.protectSync
          ? "settings.protect-sync-status-protected"
          : "settings.protect-sync-status-unprotected"
        : "settings.protect-sync-status-unknown";
      const statusClass = syncEnabled
        ? settings.value.protectSync
          ? DOMClasses2.STATUS_PROTECTED
          : DOMClasses2.STATUS_UNPROTECTED
        : DOMClasses2.STATUS_UNKNOWN;
      setting
        .setName(i18n.t("settings.protect-sync"))
        .setDesc(
          createDocumentFragment(settingEl.ownerDocument, (frag) => {
            createChildElement(frag, "span", (ele) => {
              setSanitizedInnerHTML(
                ele,
                i18n.t("settings.protect-sync-description"),
              );
            });
            createChildElement(frag, "br", () => {});
            createChildElement(frag, "span", (ele) => {
              ele.textContent = i18n.t(statusKey);
              ele.classList.add(statusClass);
            });
          }),
        )
        .addToggle(
          linkSetting(
            () => settings.value.protectSync,
            async (value) =>
              settings.mutate((settingsM) => {
                settingsM.protectSync = value;
              }),
            () => {
              this.postMutate();
            },
          ),
        )
        .addExtraButton(
          resetButton(
            i18n.t("asset:settings.protect-sync-icon"),
            i18n.t("settings.reset"),
            async () =>
              settings.mutate((settingsM) => {
                settingsM.protectSync = Settings.DEFAULT.protectSync;
              }),
            () => {
              this.postMutate();
            },
          ),
        );
    })
      .newSetting(containerEl, (setting) => {
        const { settingEl } = setting;
        setting
          .setName(i18n.t("settings.show-hidden-files"))
          .setDesc(
            createDocumentFragment(settingEl.ownerDocument, (frag) => {
              createChildElement(frag, "span", (ele) => {
                setSanitizedInnerHTML(
                  ele,
                  i18n.t("settings.show-hidden-files-description-HTML"),
                );
              });
            }),
          )
          .addToggle(
            linkSetting(
              () => settings.value.showHiddenFiles,
              async (value) =>
                settings.mutate((settingsM) => {
                  settingsM.showHiddenFiles = value;
                }),
              () => {
                this.postMutate();
              },
            ),
          )
          .addExtraButton(
            resetButton(
              i18n.t("asset:settings.show-hidden-files-icon"),
              i18n.t("settings.reset"),
              async () =>
                settings.mutate((settingsM) => {
                  settingsM.showHiddenFiles = Settings.DEFAULT.showHiddenFiles;
                }),
              () => {
                this.postMutate();
              },
            ),
          );
      })
      .newSetting(containerEl, (setting) => {
        setting
          .setName(i18n.t("settings.show-configuration-folder"))
          .setDesc(i18n.t("settings.show-configuration-folder-description"))
          .addToggle(
            linkSetting(
              () => settings.value.showConfigurationFolder,
              async (value) =>
                settings.mutate((settingsM) => {
                  settingsM.showConfigurationFolder = value;
                }),
              () => {
                this.postMutate();
              },
            ),
          )
          .addExtraButton(
            resetButton(
              i18n.t("asset:settings.show-configuration-folder-icon"),
              i18n.t("settings.reset"),
              async () =>
                settings.mutate((settingsM) => {
                  settingsM.showConfigurationFolder =
                    Settings.DEFAULT.showConfigurationFolder;
                }),
              () => {
                this.postMutate();
              },
            ),
          );
      })
      .newSetting(containerEl, (setting) => {
        setting
          .setName(i18n.t("settings.showing-rules"))
          .setDesc(
            i18n.t("settings.showing-rules-description", {
              count: settings.value.showingRules.length,
              interpolation: { escapeValue: false },
            }),
          )
          .addButton((button) => {
            button
              .setIcon(i18n.t("asset:settings.showing-rules-edit-icon"))
              .setTooltip(i18n.t("settings.showing-rules-edit"))
              .onClick(() => {
                rulesList(context, settings.value.showingRules, {
                  callback: async (value): Promise<void> => {
                    await settings.mutate((settingsM) => {
                      settingsM.showingRules = [...value];
                    });
                    this.postMutate();
                  },
                  title: () => i18n.t("settings.showing-rules"),
                }).open();
              });
          })
          .addExtraButton(
            resetButton(
              i18n.t("asset:settings.showing-rules-icon"),
              i18n.t("settings.reset"),
              async () =>
                settings.mutate((settingsM) => {
                  settingsM.showingRules = cloneAsWritable(
                    Settings.DEFAULT.showingRules,
                  );
                }),
              () => {
                this.postMutate();
              },
            ),
          );
      });
    this.newSectionWidget(() => i18n.t("settings.interface"));
    ui.newSetting(containerEl, (setting) => {
      setting
        .setName(i18n.t("settings.open-changelog-on-update"))
        .addToggle(
          linkSetting(
            () => settings.value.openChangelogOnUpdate,
            async (value) =>
              settings.mutate((settingsM) => {
                settingsM.openChangelogOnUpdate = value;
              }),
            () => {
              this.postMutate();
            },
          ),
        )
        .addExtraButton(
          resetButton(
            i18n.t("asset:settings.open-changelog-on-update-icon"),
            i18n.t("settings.reset"),
            async () =>
              settings.mutate((settingsM) => {
                settingsM.openChangelogOnUpdate =
                  Settings.DEFAULT.openChangelogOnUpdate;
              }),
            () => {
              this.postMutate();
            },
          ),
        );
    });
    this.newNoticeTimeoutWidget(Settings.DEFAULT);
  }

  protected override snapshot0(): Partial<Settings> {
    return Settings.persistent(this.context.settings.value);
  }
}

export function loadSettings(
  context: UnhidePlugin,
  docs: loadDocumentations.Loaded,
): void {
  context.addSettingTab(new SettingTab(context, docs));
  registerSettingsCommands(context);
}
