declare global {
  interface Element extends Private<$Element, PrivateKey> {}
  interface Window extends Private<$Window, PrivateKey> {}
}
declare module "obsidian" {
  interface PluginManifest {
    readonly fundingUrl?: string | Record<string, string>;
  }

  interface DataAdapter extends Private<$DataAdapter, PrivateKey> {}
  interface FileExplorerView extends Private<$FileExplorerView, PrivateKey> {}
  interface FileItem extends Private<$FileItem, PrivateKey> {}
  interface Filesystem extends Private<$Filesystem, PrivateKey> {}
  interface MobileStat extends Private<$MobileStat, PrivateKey> {}
  interface TFile extends Private<$TFile, PrivateKey> {}
  interface Vault extends Private<$Vault, PrivateKey> {}
  interface Workspace extends Private<$Workspace, PrivateKey> {}
}
import type { Private } from "@polyipseity/obsidian-plugin-library";
import type { i18n } from "i18next";
import type {
  FileExplorerView,
  FileItem,
  Filesystem,
  MobileStat,
  Stat,
  TFile,
  View,
  WorkspaceLeaf,
} from "obsidian";

declare const PRIVATE_KEY: unique symbol;
type PrivateKey = typeof PRIVATE_KEY;
declare module "@polyipseity/obsidian-plugin-library" {
  interface PrivateKeys {
    readonly [PRIVATE_KEY]: never;
  }
}

export interface $DataAdapter {
  readonly _exists: (fullPath: string, path: string) => PromiseLike<boolean>;
  readonly fs: Filesystem;
  readonly getFullPath: (path: string) => string;
  readonly getFullRealPath: (realPath: string) => string;
  readonly getRealPath: (path: string) => string;
  readonly listRecursive: (path: string) => PromiseLike<void>;
  readonly reconcileDeletion: (
    realPath: string,
    path: string,
    force?: boolean,
  ) => PromiseLike<void>;
  readonly reconcileFileChanged?: (
    realPath: string,
    path: string,
    stat: MobileStat,
  ) => void;
  readonly reconcileFileInternal?: (
    realPath: string,
    path: string,
  ) => PromiseLike<void>;
  readonly reconcileFolderCreation: (
    realPath: string,
    path: string,
  ) => PromiseLike<void>;
}

export interface $Element {
  readonly getText: () => string;
}

export interface $FileExplorerView extends View {
  readonly fileBeingRenamed: TFile | null;
  readonly fileItems: Readonly<Record<string, FileItem>>;
  /** @deprecated Renamed to `acceptRename` in Obsidian ≤1.12.7. Kept for ancient builds. */
  readonly finishRename?: () => PromiseLike<void>;
  /** @deprecated Renamed to `saveRename` in Obsidian ≥1.13.7. Kept for older builds. */
  readonly acceptRename?: () => PromiseLike<void>;
  readonly saveRename?: () => PromiseLike<void>;
}

export interface $FileItem {
  readonly innerEl: HTMLElement;
}

export interface $Filesystem {
  readonly stat?: (fullRealPath: string) => PromiseLike<MobileStat>;
}

export interface $MobileStat extends Omit<Stat, "type"> {
  readonly type: "directory" | "file";
}

export interface $TFile {
  readonly getNewPathAfterRename: (filename: string) => string;
}

export interface $Vault {
  readonly configDir: string;
  readonly setConfigDir: (dirname: string) => void;
}

export interface $Window {
  readonly i18next: i18n;
}

export interface $Workspace {
  readonly getLeavesOfType: (
    viewType: "file-explorer",
  ) => readonly (WorkspaceLeaf & {
    readonly view: FileExplorerView;
  })[];
}
