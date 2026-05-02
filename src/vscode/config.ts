import * as vscode from "vscode";

export const GROWI_PAGE_LISTING_INITIAL_PAGE_SIZE_DEFAULT = 100;
export const GROWI_PAGE_LISTING_MAX_AUTO_PAGES_PER_PREFIX_DEFAULT = 300;
export const GROWI_LOCAL_MIRROR_MAX_PREFIX_PAGES_DEFAULT = 50;
export const GROWI_LOCAL_MIRROR_MAX_PREFIX_PAGES_HARD_MAX = 200;

function clampPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

export function resolveGrowiPageListingInitialPageSize(value: unknown): number {
  return clampPositiveInteger(
    value,
    GROWI_PAGE_LISTING_INITIAL_PAGE_SIZE_DEFAULT,
  );
}

export function resolveGrowiPageListingMaxAutoPagesPerPrefix(
  value: unknown,
): number {
  return clampPositiveInteger(
    value,
    GROWI_PAGE_LISTING_MAX_AUTO_PAGES_PER_PREFIX_DEFAULT,
  );
}

export function resolveGrowiLocalMirrorMaxPrefixPages(value: unknown): number {
  return Math.min(
    clampPositiveInteger(value, GROWI_LOCAL_MIRROR_MAX_PREFIX_PAGES_DEFAULT),
    GROWI_LOCAL_MIRROR_MAX_PREFIX_PAGES_HARD_MAX,
  );
}

export function getGrowiPageListingInitialPageSize(): number {
  return resolveGrowiPageListingInitialPageSize(
    vscode.workspace
      .getConfiguration("growi")
      .get<number>("pageListing.initialPageSize"),
  );
}

export function getGrowiPageListingMaxAutoPagesPerPrefix(): number {
  return resolveGrowiPageListingMaxAutoPagesPerPrefix(
    vscode.workspace
      .getConfiguration("growi")
      .get<number>("pageListing.maxAutoPagesPerPrefix"),
  );
}

export function getGrowiLocalMirrorMaxPrefixPages(): number {
  return resolveGrowiLocalMirrorMaxPrefixPages(
    vscode.workspace
      .getConfiguration("growi")
      .get<number>("localMirror.maxPrefixPages"),
  );
}
