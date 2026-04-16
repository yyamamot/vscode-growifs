import { normalizeCanonicalPath } from "../core/uri";
import type {
  GrowiCurrentPageInfo,
  GrowiCurrentRevisionReader,
  GrowiEditSession,
} from "./fsProvider";

export type PageFreshnessStatus = "fresh" | "stale" | "unknown";

export interface PageFreshnessDeps {
  getEditSession(canonicalPath: string): GrowiEditSession | undefined;
  getCurrentPageInfo(canonicalPath: string): GrowiCurrentPageInfo | undefined;
  getCurrentRevision(
    canonicalPath: string,
  ): Promise<
    Awaited<ReturnType<GrowiCurrentRevisionReader["getCurrentRevision"]>>
  >;
}

export interface PageFreshnessService {
  checkPageFreshness(canonicalPath: string): Promise<PageFreshnessStatus>;
}

type CachedPageFreshness = {
  localRevisionId: string | undefined;
  pending?: Promise<PageFreshnessStatus>;
};

export function createPageFreshnessService(
  deps: PageFreshnessDeps,
): PageFreshnessService {
  const cache = new Map<string, CachedPageFreshness>();

  const resolveLocalRevisionId = (
    canonicalPath: string,
  ): string | undefined => {
    const editSession = deps.getEditSession(canonicalPath);
    if (editSession) {
      return editSession.baseRevisionId;
    }

    return deps.getCurrentPageInfo(canonicalPath)?.revisionId;
  };

  return {
    async checkPageFreshness(
      canonicalPath: string,
    ): Promise<PageFreshnessStatus> {
      const normalized = normalizeCanonicalPath(canonicalPath);
      if (!normalized.ok) {
        return "unknown";
      }

      const normalizedPath = normalized.value;
      const localRevisionId = resolveLocalRevisionId(normalizedPath);
      if (!localRevisionId) {
        return "unknown";
      }

      const cached = cache.get(normalizedPath);
      if (cached && cached.localRevisionId === localRevisionId) {
        if (cached.pending) {
          return cached.pending;
        }
      }

      const pending = (async (): Promise<PageFreshnessStatus> => {
        try {
          const currentRevision = await deps.getCurrentRevision(normalizedPath);
          if (!currentRevision.ok) {
            return "unknown";
          }
          return currentRevision.revisionId === localRevisionId
            ? "fresh"
            : "stale";
        } catch {
          return "unknown";
        }
      })();

      cache.set(normalizedPath, {
        localRevisionId,
        pending,
      });

      const status = await pending;
      const latest = cache.get(normalizedPath);
      if (
        latest &&
        latest.localRevisionId === localRevisionId &&
        latest.pending === pending
      ) {
        cache.delete(normalizedPath);
      }
      return status;
    },
  };
}
