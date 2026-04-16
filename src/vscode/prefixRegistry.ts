import { normalizeCanonicalPath } from "../core/uri";

export interface WorkspaceStateLike {
  get<T>(key: string, defaultValue?: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
}

export interface PrefixRegistry {
  getPrefixes(baseUrl: string | undefined): string[];
  addPrefix(
    baseUrl: string | undefined,
    rawPrefix: string,
  ): Promise<
    | { ok: true; value: string[]; added: boolean }
    | {
        ok: false;
        reason:
          | "InvalidBaseUrl"
          | "InvalidPath"
          | "AncestorConflict"
          | "DescendantConflict";
      }
  >;
  clearPrefixes(
    baseUrl: string | undefined,
  ): Promise<
    | { ok: true; value: string[]; cleared: boolean; removed: string[] }
    | { ok: false; reason: "InvalidBaseUrl" }
  >;
  deletePrefix(
    baseUrl: string | undefined,
    rawPrefix: string,
  ): Promise<
    | { ok: true; value: string[]; removed: boolean }
    | { ok: false; reason: "InvalidBaseUrl" | "InvalidPath" }
  >;
}

interface PrefixRegistryState {
  byBaseUrl: Record<string, string[]>;
}

const PREFIX_REGISTRY_STATE_KEY = "growi.prefixRegistry.v1";

function toBaseUrlKey(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) {
    return undefined;
  }

  const trimmed = baseUrl.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isAncestorPath(ancestor: string, descendant: string): boolean {
  if (ancestor === descendant) {
    return false;
  }

  if (ancestor === "/") {
    return true;
  }

  return descendant.startsWith(`${ancestor}/`);
}

function readState(workspaceState: WorkspaceStateLike): PrefixRegistryState {
  const state = workspaceState.get<unknown>(PREFIX_REGISTRY_STATE_KEY, {
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

  const byBaseUrl: Record<string, string[]> = {};
  for (const [baseUrl, prefixes] of Object.entries(state.byBaseUrl)) {
    if (!Array.isArray(prefixes)) {
      continue;
    }

    byBaseUrl[baseUrl] = prefixes.filter(
      (prefix): prefix is string => typeof prefix === "string",
    );
  }

  return { byBaseUrl };
}

async function writeState(
  workspaceState: WorkspaceStateLike,
  state: PrefixRegistryState,
): Promise<void> {
  await workspaceState.update(PREFIX_REGISTRY_STATE_KEY, state);
}

export function createPrefixRegistry(
  workspaceState: WorkspaceStateLike,
): PrefixRegistry {
  return {
    getPrefixes(baseUrl: string | undefined): string[] {
      const key = toBaseUrlKey(baseUrl);
      if (!key) {
        return [];
      }

      const state = readState(workspaceState);
      const prefixes = state.byBaseUrl[key] ?? [];
      return [...prefixes];
    },

    async addPrefix(baseUrl: string | undefined, rawPrefix: string) {
      const key = toBaseUrlKey(baseUrl);
      if (!key) {
        return { ok: false, reason: "InvalidBaseUrl" } as const;
      }

      const normalized = normalizeCanonicalPath(rawPrefix);
      if (!normalized.ok) {
        return { ok: false, reason: "InvalidPath" } as const;
      }

      const prefix = normalized.value;
      const state = readState(workspaceState);
      const current = state.byBaseUrl[key] ?? [];

      for (const existing of current) {
        if (existing === prefix) {
          return { ok: true, value: current, added: false } as const;
        }
        if (isAncestorPath(prefix, existing)) {
          return { ok: false, reason: "AncestorConflict" } as const;
        }
        if (isAncestorPath(existing, prefix)) {
          return { ok: false, reason: "DescendantConflict" } as const;
        }
      }

      const next = [...current, prefix];
      state.byBaseUrl[key] = next;
      await writeState(workspaceState, state);

      return { ok: true, value: next, added: true } as const;
    },

    async clearPrefixes(baseUrl: string | undefined) {
      const key = toBaseUrlKey(baseUrl);
      if (!key) {
        return { ok: false, reason: "InvalidBaseUrl" } as const;
      }

      const state = readState(workspaceState);
      const current = state.byBaseUrl[key] ?? [];
      if (current.length === 0) {
        return { ok: true, value: [], cleared: false, removed: [] } as const;
      }

      delete state.byBaseUrl[key];
      await writeState(workspaceState, state);
      return {
        ok: true,
        value: [],
        cleared: true,
        removed: [...current],
      } as const;
    },

    async deletePrefix(baseUrl: string | undefined, rawPrefix: string) {
      const key = toBaseUrlKey(baseUrl);
      if (!key) {
        return { ok: false, reason: "InvalidBaseUrl" } as const;
      }

      const normalized = normalizeCanonicalPath(rawPrefix);
      if (!normalized.ok) {
        return { ok: false, reason: "InvalidPath" } as const;
      }

      const prefix = normalized.value;
      const state = readState(workspaceState);
      const current = state.byBaseUrl[key] ?? [];
      const index = current.indexOf(prefix);
      if (index === -1) {
        return { ok: true, value: current, removed: false } as const;
      }

      const next = [...current.slice(0, index), ...current.slice(index + 1)];
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

export { PREFIX_REGISTRY_STATE_KEY };
