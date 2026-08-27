declare global {
  interface Element extends Private<$Element, PrivateKey> {}
  interface Window extends Private<$Window, PrivateKey> {}
}
declare module "obsidian" {
  interface PluginManifest {
    readonly fundingUrl?: string | Record<string, string>;
  }

  interface App extends Private<$App, PrivateKey> {}
  interface DataAdapter extends Private<$DataAdapter, PrivateKey> {}
  interface FileExplorerView extends Private<$FileExplorerView, PrivateKey> {}
  interface FileItem extends Private<$FileItem, PrivateKey> {}
  interface Filesystem extends Private<$Filesystem, PrivateKey> {}
  interface InternalPlugin extends Plugin {}
  interface InternalPlugins extends Private<$InternalPlugins, PrivateKey> {}
  interface SyncPlugin
    extends InternalPlugin, Private<$SyncPlugin, PrivateKey> {}
  interface SyncPluginInstance
    extends Events, Private<$SyncPluginInstance, PrivateKey> {}
  interface MobileStat extends Private<$MobileStat, PrivateKey> {}
  interface TFile extends Private<$TFile, PrivateKey> {}
  interface Vault extends Private<$Vault, PrivateKey> {}
  interface Workspace extends Private<$Workspace, PrivateKey> {}
}
import type { Private } from "@polyipseity/obsidian-plugin-library";
import type { i18n } from "i18next";
import type {
  Events,
  FileExplorerView,
  FileItem,
  Filesystem,
  InternalPlugins,
  MobileStat,
  Stat,
  SyncPlugin,
  SyncPluginInstance,
  TFile,
  View,
  WorkspaceLeaf,
} from "obsidian";

// @ts-expect-error: TypeScript bug
type _TS_6196 = Events;

declare const PRIVATE_KEY: unique symbol;
type PrivateKey = typeof PRIVATE_KEY;
declare module "@polyipseity/obsidian-plugin-library" {
  interface PrivateKeys {
    readonly [PRIVATE_KEY]: never;
  }
}

/**
 * Private typings merged into Obsidian's `App` via `Private<$App, PrivateKey>`.
 * Couples to Obsidian 1.13.7.
 */
export interface $App {
  /**
   * The internal (built-in) plugins registry. Verified present in Obsidian
   * 1.13.7. Used to detect whether Obsidian Sync is active (GH#35 (obsidian-unhide))
   * via `internalPlugins.getPluginById("sync")`.
   */
  readonly internalPlugins: InternalPlugins;
}

/**
 * Private typings for Obsidian's internal plugins registry. Couples to
 * Obsidian 1.13.7.
 */
export interface $InternalPlugins {
  /**
   * Returns the internal plugin registered under `id`. Verified present in
   * Obsidian 1.13.7. The `"sync"` literal resolves to `SyncPlugin`; other ids
   * are not typed here.
   */
  getPluginById(id: "sync"): SyncPlugin;
}

/**
 * Private typings for Obsidian's Sync internal plugin, reached via
 * `internalPlugins.getPluginById("sync")`. Couples to Obsidian 1.13.7. The
 * registry entry is the `InternalPlugin` wrapper; the actual Sync API
 * (`getStatus`, `status-change` events) lives on its `instance` field. `getStatus()`
 * reports the live Sync connection state; a vault only propagates deletions to
 * other devices once it is logged in to a sync vault, which `getStatus()` reports
 * as anything other than `"uninitialized"` or `"disconnected"`.
 */
export interface $SyncPlugin {
  /** The live Sync plugin instance. Reached via `getPluginById("sync")`. Verified in Obsidian 1.13.7. */
  readonly instance: SyncPluginInstance;
}

/**
 * Private typings for the live Obsidian Sync plugin instance, reached via
 * `internalPlugins.getPluginById("sync")?.instance`. Couples to Obsidian 1.13.7.
 * `getStatus()` reports the live Sync connection state; a vault only propagates
 * deletions to other devices once it is logged in to a sync vault, which
 * `getStatus()` reports as anything other than `"uninitialized"` or
 * `"disconnected"`.
 */
export interface $SyncPluginInstance {
  /** Current Sync connection status. Verified in Obsidian 1.13.7. */
  readonly getStatus: () => $SyncPluginInstance.Status;
  /** Subscribe to the Sync `"status-change"` event (Obsidian `Events`). */
  on(
    name: "status-change",
    callback: (status: $SyncPluginInstance.Status) => unknown,
  ): void;
  /** Unsubscribe from the Sync `"status-change"` event (Obsidian `Events`). */
  off(
    name: "status-change",
    callback: (status: $SyncPluginInstance.Status) => unknown,
  ): void;
}

/**
 * Obsidian Sync connection status. Verified in Obsidian 1.13.7: the Sync
 * plugin's `getStatus()` returns one of these strings.
 */
export namespace $SyncPluginInstance {
  export type Status =
    | "uninitialized"
    | "disconnected"
    | "error"
    | "paused"
    | "syncing"
    | "synced";
}

/**
 * Private typings merged into Obsidian's `DataAdapter` via
 * `Private<$DataAdapter, PrivateKey>`. Couples to Obsidian 1.13.7.
 */
export interface $DataAdapter {
  /**
   * Checks existence via `fsPromises.access`; if `path` is truthy and
   * case-insensitive, matches basename in `readdir(dirname)`. Verified in
   * Obsidian 1.13.7.
   */
  readonly _exists: (fullPath: string, path: string) => PromiseLike<boolean>;
  /** The `Filesystem` property. Verified present in Obsidian 1.13.7. */
  readonly fs: Filesystem;
  /** Returns the full path for `path`. Verified in Obsidian 1.13.7. */
  readonly getFullPath: (path: string) => string;
  /** Returns the full real path for `realPath`. Verified in Obsidian 1.13.7. */
  readonly getFullRealPath: (realPath: string) => string;
  /** Returns the real path for `path`. Verified in Obsidian 1.13.7. */
  readonly getRealPath: (path: string) => string;
  /** Lists files recursively under `path`. Verified in Obsidian 1.13.7. */
  readonly listRecursive: (path: string) => PromiseLike<void>;
  /**
   * Reconciles a deletion at `realPath`/`path`. In Obsidian 1.13.7 `force`
   * defaults to `true` (removes from `this.files`); `force=false` defers via
   * `setTimeout` + `reconcileFile`.
   */
  readonly reconcileDeletion: (
    realPath: string,
    path: string,
    force?: boolean,
  ) => PromiseLike<void>;
  /**
   * Optional. Reconciles a changed file with `stat`. Part of the `showFile`
   * fallback chain in Obsidian 1.13.7.
   */
  readonly reconcileFileChanged?: (
    realPath: string,
    path: string,
    stat: MobileStat,
  ) => void;
  /**
   * Optional. Reconciles a file internally. Preferred entry of the `showFile`
   * fallback chain in Obsidian 1.13.7.
   */
  readonly reconcileFileInternal?: (
    realPath: string,
    path: string,
  ) => PromiseLike<void>;
  /** Reconciles folder creation at `realPath`/`path`. Verified in Obsidian 1.13.7. */
  readonly reconcileFolderCreation: (
    realPath: string,
    path: string,
  ) => PromiseLike<void>;
}

/**
 * Private typings merged into the global `Element` via
 * `Private<$Element, PrivateKey>`. Couples to Obsidian 1.13.7.
 */
export interface $Element {
  /**
   * Returns the displayed text of the element. Used to read/swap the rename
   * target. Verified in Obsidian 1.13.7.
   */
  readonly getText: () => string;
}

/**
 * Private typings merged into Obsidian's `FileExplorerView` via
 * `Private<$FileExplorerView, PrivateKey>`. Couples to Obsidian 1.13.7.
 */
export interface $FileExplorerView extends View {
  /** The `TFile` currently being renamed, or `null`. Verified in Obsidian 1.13.7. */
  readonly fileBeingRenamed: TFile | null;
  /** Map from path to `FileItem`. Verified in Obsidian 1.13.7. */
  readonly fileItems: Readonly<Record<string, FileItem>>;
  /**
   * @deprecated Renamed to `acceptRename` in Obsidian ≤1.12.7. Kept for ancient builds.
   * Removed in Obsidian 1.13.7.
   */
  readonly finishRename?: () => PromiseLike<void>;
  /**
   * @deprecated Renamed to `saveRename` in Obsidian ≥1.13.7. Kept for older builds.
   * Moved to the property-rename view in Obsidian 1.13.7.
   */
  readonly acceptRename?: () => PromiseLike<void>;
  /** The live rename method in Obsidian 1.13.7. */
  readonly saveRename?: () => PromiseLike<void>;
}

/**
 * Private typings merged into Obsidian's `FileItem` via
 * `Private<$FileItem, PrivateKey>`. Couples to Obsidian 1.13.7.
 */
export interface $FileItem {
  /**
   * The `HTMLElement` whose `getText()` yields the displayed filename. Verified
   * in Obsidian 1.13.7.
   */
  readonly innerEl: HTMLElement;
}

/**
 * Private typings merged into Obsidian's `Filesystem` via
 * `Private<$Filesystem, PrivateKey>`. Couples to Obsidian 1.13.7.
 */
export interface $Filesystem {
  /**
   * Optional. Stats `fullRealPath`. Used by the `showFile` fallback path in
   * Obsidian 1.13.7.
   */
  readonly stat?: (fullRealPath: string) => PromiseLike<MobileStat>;
}

/**
 * Private typings merged into Obsidian's `MobileStat` via
 * `Private<$MobileStat, PrivateKey>`. Mirrors `Stat` with `type` narrowed to
 * `"directory" | "file"`. Verified in Obsidian 1.13.7.
 */
export interface $MobileStat extends Omit<Stat, "type"> {
  readonly type: "directory" | "file";
}

/**
 * Private typings merged into Obsidian's `TFile` via
 * `Private<$TFile, PrivateKey>`. Couples to Obsidian 1.13.7.
 */
export interface $TFile {
  /**
   * Strips control chars, trims, and joins under the parent path. The plugin
   * swaps this via `around` to restore the leading dot on hidden-file renames.
   * Verified in Obsidian 1.13.7.
   */
  readonly getNewPathAfterRename: (filename: string) => string;
}

/**
 * Private typings merged into Obsidian's `Vault` via
 * `Private<$Vault, PrivateKey>`. Couples to Obsidian 1.13.7.
 */
export interface $Vault {
  /** The config folder name (e.g. `.obsidian`). Verified in Obsidian 1.13.7. */
  readonly configDir: string;
  /**
   * Sets `configDir`, validates, and falls back to the default if invalid.
   * Verified in Obsidian 1.13.7.
   */
  readonly setConfigDir: (dirname: string) => void;
}

/**
 * Private typings merged into the global `Window` via
 * `Private<$Window, PrivateKey>`. Couples to Obsidian 1.13.7.
 */
export interface $Window {
  /**
   * The global i18next instance (on `self`). Its `t` method is patched to
   * suppress the `plugins.file-explorer.msg-bad-dotfile` error string. Verified
   * in Obsidian 1.13.7.
   */
  readonly i18next: i18n;
}

/**
 * Private typings merged into Obsidian's `Workspace` via
 * `Private<$Workspace, PrivateKey>`. Couples to Obsidian 1.13.7.
 */
export interface $Workspace {
  /**
   * Returns the file-explorer leaves (each with `view: FileExplorerView`) for
   * `viewType`. Verified in Obsidian 1.13.7.
   */
  readonly getLeavesOfType: (
    viewType: "file-explorer",
  ) => readonly (WorkspaceLeaf & {
    readonly view: FileExplorerView;
  })[];
}
