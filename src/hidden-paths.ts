// Pure helpers for detecting dot-prefixed hidden paths.

export function isHiddenPath(path: string): boolean {
  return path.split("/").some(isHiddenPathname);
}

export function isHiddenPathname(pathname: string): boolean {
  return pathname.startsWith(".");
}
