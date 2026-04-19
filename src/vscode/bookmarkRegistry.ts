import { normalizeCanonicalPath } from "../core/uri";
import type { WorkspaceStateLike } from "./prefixRegistry";

export interface BookmarkEntry {
  canonicalPath: string;
  addedAt: string;
}

export interface BookmarkRegistry {
  getBookmarks(baseUrl: string | undefined): BookmarkEntry[];
  isBookmarked(baseUrl: string | undefined, rawCanonicalPath: string): boolean;
  addBookmark(
    baseUrl: string | undefined,
    rawCanonicalPath: string,
    addedAt?: string,
  ): Promise<
    | { ok: true; value: BookmarkEntry[]; added: boolean }
    | { ok: false; reason: "InvalidBaseUrl" | "InvalidPath" }
  >;
  deleteBookmark(
    baseUrl: string | undefined,
    rawCanonicalPath: string,
  ): Promise<
    | { ok: true; value: BookmarkEntry[]; removed: boolean }
    | { ok: false; reason: "InvalidBaseUrl" | "InvalidPath" }
  >;
}

interface BookmarkRegistryState {
  byBaseUrl: Record<string, BookmarkEntry[]>;
}

const BOOKMARK_REGISTRY_STATE_KEY = "growi.bookmarkRegistry.v1";

function toBaseUrlKey(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) {
    return undefined;
  }

  const trimmed = baseUrl.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeBookmarkEntry(value: unknown): BookmarkEntry | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  if (
    !("canonicalPath" in value) ||
    typeof value.canonicalPath !== "string" ||
    !("addedAt" in value) ||
    typeof value.addedAt !== "string"
  ) {
    return undefined;
  }

  const normalized = normalizeCanonicalPath(value.canonicalPath);
  if (!normalized.ok) {
    return undefined;
  }

  return {
    canonicalPath: normalized.value,
    addedAt: value.addedAt,
  };
}

function readState(workspaceState: WorkspaceStateLike): BookmarkRegistryState {
  const state = workspaceState.get<unknown>(BOOKMARK_REGISTRY_STATE_KEY, {
    byBaseUrl: {},
  });

  if (
    typeof state !== "object" ||
    state === null ||
    !("byBaseUrl" in state) ||
    typeof state.byBaseUrl !== "object" ||
    state.byBaseUrl === null
  ) {
    return { byBaseUrl: {} };
  }

  const byBaseUrl: Record<string, BookmarkEntry[]> = {};
  for (const [baseUrl, entries] of Object.entries(state.byBaseUrl)) {
    if (!Array.isArray(entries)) {
      continue;
    }

    byBaseUrl[baseUrl] = entries.flatMap((entry) => {
      const normalized = normalizeBookmarkEntry(entry);
      return normalized ? [normalized] : [];
    });
  }

  return { byBaseUrl };
}

async function writeState(
  workspaceState: WorkspaceStateLike,
  state: BookmarkRegistryState,
): Promise<void> {
  await workspaceState.update(BOOKMARK_REGISTRY_STATE_KEY, state);
}

export function createBookmarkRegistry(
  workspaceState: WorkspaceStateLike,
): BookmarkRegistry {
  return {
    getBookmarks(baseUrl: string | undefined): BookmarkEntry[] {
      const key = toBaseUrlKey(baseUrl);
      if (!key) {
        return [];
      }

      const state = readState(workspaceState);
      return [...(state.byBaseUrl[key] ?? [])];
    },

    isBookmarked(
      baseUrl: string | undefined,
      rawCanonicalPath: string,
    ): boolean {
      const key = toBaseUrlKey(baseUrl);
      if (!key) {
        return false;
      }

      const normalized = normalizeCanonicalPath(rawCanonicalPath);
      if (!normalized.ok) {
        return false;
      }

      const state = readState(workspaceState);
      return (
        state.byBaseUrl[key]?.some(
          (entry) => entry.canonicalPath === normalized.value,
        ) ?? false
      );
    },

    async addBookmark(
      baseUrl: string | undefined,
      rawCanonicalPath: string,
      addedAt = new Date().toISOString(),
    ) {
      const key = toBaseUrlKey(baseUrl);
      if (!key) {
        return { ok: false, reason: "InvalidBaseUrl" } as const;
      }

      const normalized = normalizeCanonicalPath(rawCanonicalPath);
      if (!normalized.ok) {
        return { ok: false, reason: "InvalidPath" } as const;
      }

      const canonicalPath = normalized.value;
      const state = readState(workspaceState);
      const current = state.byBaseUrl[key] ?? [];
      if (current.some((entry) => entry.canonicalPath === canonicalPath)) {
        return { ok: true, value: current, added: false } as const;
      }

      const next = [{ canonicalPath, addedAt }, ...current];
      state.byBaseUrl[key] = next;
      await writeState(workspaceState, state);
      return { ok: true, value: next, added: true } as const;
    },

    async deleteBookmark(
      baseUrl: string | undefined,
      rawCanonicalPath: string,
    ) {
      const key = toBaseUrlKey(baseUrl);
      if (!key) {
        return { ok: false, reason: "InvalidBaseUrl" } as const;
      }

      const normalized = normalizeCanonicalPath(rawCanonicalPath);
      if (!normalized.ok) {
        return { ok: false, reason: "InvalidPath" } as const;
      }

      const canonicalPath = normalized.value;
      const state = readState(workspaceState);
      const current = state.byBaseUrl[key] ?? [];
      const next = current.filter(
        (entry) => entry.canonicalPath !== canonicalPath,
      );

      if (next.length === current.length) {
        return { ok: true, value: current, removed: false } as const;
      }

      if (next.length === 0) {
        delete state.byBaseUrl[key];
      } else {
        state.byBaseUrl[key] = next;
      }
      await writeState(workspaceState, state);
      return { ok: true, value: next, removed: true } as const;
    },
  };
}

export { BOOKMARK_REGISTRY_STATE_KEY };
