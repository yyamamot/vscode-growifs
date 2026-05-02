import { normalizeCanonicalPath } from "../core/uri";
import type { GrowiCurrentPageInfo, GrowiEditSession } from "./fsProvider";
import type { MirrorCompareScmResource } from "./mirror/mirrorCompareScm";
import {
  evaluateLoadedMirrorPageStatus,
  lookupMirrorManifestSelection,
  type MirrorCompareStatusDeps,
} from "./mirror/mirrorCompareStatus";

export type OpenedPageDecorationStatus =
  | "none"
  | "remoteNewer"
  | "localChanges"
  | "remoteChanges"
  | "conflicts";

export interface PageFreshnessDeps extends MirrorCompareStatusDeps {
  getEditSession(canonicalPath: string): GrowiEditSession | undefined;
  getCurrentPageInfo(canonicalPath: string): GrowiCurrentPageInfo | undefined;
  getCurrentRevision(canonicalPath: string): Promise<
    | {
        ok: true;
        revisionId: string;
      }
    | {
        ok: false;
      }
  >;
}

export interface PageFreshnessService {
  getOpenedPageLiveState(canonicalPath: string): Promise<{
    decorationStatus: OpenedPageDecorationStatus;
    scmResource?: MirrorCompareScmResource;
  }>;
  checkOpenedPageDecorationStatus(
    canonicalPath: string,
  ): Promise<OpenedPageDecorationStatus>;
}

export function createPageFreshnessService(
  deps: PageFreshnessDeps,
): PageFreshnessService {
  const resolveLocalRevisionId = (
    canonicalPath: string,
  ): string | undefined => {
    const editSession = deps.getEditSession(canonicalPath);
    if (editSession) {
      return editSession.baseRevisionId;
    }

    return deps.getCurrentPageInfo(canonicalPath)?.revisionId;
  };

  const getOpenedPageLiveState = async (
    canonicalPath: string,
  ): Promise<{
    decorationStatus: OpenedPageDecorationStatus;
    scmResource?: MirrorCompareScmResource;
  }> => {
    const normalized = normalizeCanonicalPath(canonicalPath);
    if (!normalized.ok) {
      return {
        decorationStatus: "none",
      };
    }

    const normalizedPath = normalized.value;
    const loaded = await lookupMirrorManifestSelection(deps, {
      requestedCanonicalPath: normalizedPath,
      requestedScope: "page",
      allowAncestorReuse: true,
    });
    if (loaded.ok) {
      const page = loaded.value.selectedPages.find(
        (candidate) => candidate.canonicalPath === normalizedPath,
      );
      if (page) {
        const evaluated = await evaluateLoadedMirrorPageStatus(
          deps,
          loaded.value,
          page,
        );
        if (evaluated.ok) {
          const scmResource =
            evaluated.value.result.status === "LocalChanged" ||
            evaluated.value.result.status === "RemoteChanged" ||
            evaluated.value.result.status === "Conflict"
              ? {
                  canonicalPath: normalizedPath,
                  status: evaluated.value.result.status,
                  localFileUri: {
                    scheme: "file",
                    path: evaluated.value.localFilePath,
                    fsPath: evaluated.value.localFilePath,
                  },
                  remoteUri: {
                    scheme: "growi",
                    path: `${normalizedPath}.md`,
                  },
                }
              : undefined;

          return {
            decorationStatus:
              evaluated.value.result.status === "LocalChanged"
                ? "localChanges"
                : evaluated.value.result.status === "RemoteChanged"
                  ? "remoteChanges"
                  : evaluated.value.result.status === "Conflict"
                    ? "conflicts"
                    : "none",
            scmResource,
          };
        }
      }
    }

    const localRevisionId = resolveLocalRevisionId(normalizedPath);
    if (!localRevisionId) {
      return {
        decorationStatus: "none",
      };
    }

    try {
      const currentRevision = await deps.getCurrentRevision(normalizedPath);
      if (!currentRevision.ok) {
        return {
          decorationStatus: "none",
        };
      }

      return {
        decorationStatus:
          currentRevision.revisionId === localRevisionId
            ? "none"
            : "remoteNewer",
      };
    } catch {
      return {
        decorationStatus: "none",
      };
    }
  };

  return {
    getOpenedPageLiveState,
    async checkOpenedPageDecorationStatus(
      canonicalPath: string,
    ): Promise<OpenedPageDecorationStatus> {
      const state = await getOpenedPageLiveState(canonicalPath);
      return state.decorationStatus;
    },
  };
}
