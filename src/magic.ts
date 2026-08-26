export const PLUGIN_UNLOAD_DELAY = 10;

export namespace DOMClasses2 {
  export const LUCIDE_HEART = "lucide-heart",
    SETTING_ITEM = "setting-item",
    SETTING_ITEM_NAME = "setting-item-name",
    SVG_ICON = "svg-icon";
  // Three-state Sync-protection status (GH#35): reuse Obsidian core modifier
  // classes so coloring stays theme-aware without custom CSS.
  export const STATUS_PROTECTED = "mod-success",
    STATUS_UNPROTECTED = "mod-error",
    STATUS_UNKNOWN = "mod-warning";
}
