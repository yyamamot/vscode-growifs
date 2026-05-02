import { createHash } from "node:crypto";
import {
  buildInstanceKey,
  buildMirrorManifestPathWithInstanceKey,
  buildMirrorPageFilePathWithInstanceKey,
  type MirrorManifest,
  type MirrorManifestPage,
  parseMirrorManifest,
} from "../localRoundTrip";

export type MirrorRequestScope = "page" | "subtree";

export type MirrorPageCompareStatus =
  | "Unchanged"
  | "LocalChanged"
  | "RemoteChanged"
  | "Conflict"
  | "MissingRemote"
  | "MissingLocal";

export type MirrorReadFailureReason =
  | "NotFound"
  | "BaseUrlNotConfigured"
  | "ApiTokenNotConfigured"
  | "InvalidApiToken"
  | "PermissionDenied"
  | "ApiNotSupported"
  | "ConnectionFailed";

export interface MirrorCompareStatusDeps {
  getLocalWorkspaceRoot(): string | undefined;
  getBaseUrl(): string | undefined;
  readLocalFile(localPath: string): Promise<string>;
  bootstrapEditSession(canonicalPath: string): Promise<
    | {
        ok: true;
        value: {
          pageId: string;
          baseRevisionId: string;
          baseBody: string;
        };
      }
    | {
        ok: false;
        reason: MirrorReadFailureReason;
      }
  >;
}

export interface LoadedMirrorSelection {
  workspaceRoot: string;
  baseUrl: string;
  manifestPath: string;
  manifest: MirrorManifest;
  instanceKey: string;
  requestedCanonicalPath: string;
  requestedScope: MirrorRequestScope;
  effectiveRootCanonicalPath: string;
  selectedPages: MirrorManifestPage[];
  reusedAncestorPrefix: boolean;
}

export type MirrorManifestLookupFailureReason =
  | "NoWorkspace"
  | "BaseUrlNotConfigured"
  | "ManifestNotFound"
  | "InvalidManifest"
  | "BaseUrlMismatch"
  | "ReusedPrefixSkipped";

type MirrorManifestLookupResult =
  | {
      ok: true;
      value: LoadedMirrorSelection;
    }
  | {
      ok: false;
      reason: MirrorManifestLookupFailureReason;
    };

type MirrorPageEvaluationResult =
  | {
      ok: true;
      value: {
        result: {
          canonicalPath: string;
          status: MirrorPageCompareStatus;
        };
        localFilePath: string;
      };
    }
  | {
      ok: false;
      reason: Exclude<MirrorReadFailureReason, "NotFound">;
    };

function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

function buildMirrorLocalFilePathWithInstanceKey(
  workspaceRoot: string,
  instanceKey: string,
  rootCanonicalPath: string,
  relativeFilePath: string,
): string {
  return buildMirrorPageFilePathWithInstanceKey(
    workspaceRoot,
    instanceKey,
    rootCanonicalPath,
    relativeFilePath,
  );
}

function listMirrorManifestCandidates(
  workspaceRoot: string,
  baseUrl: string,
  rootCanonicalPath: string,
): Array<{ instanceKey: string; manifestPath: string }> {
  const instanceKey = buildInstanceKey(baseUrl);
  return [
    {
      instanceKey,
      manifestPath: buildMirrorManifestPathWithInstanceKey(
        workspaceRoot,
        instanceKey,
        rootCanonicalPath,
      ),
    },
  ];
}

function listAncestorCanonicalPaths(canonicalPath: string): string[] {
  const segments = canonicalPath
    .split("/")
    .filter((segment) => segment.length > 0);
  const ancestors: string[] = [];
  for (let length = segments.length - 1; length >= 1; length -= 1) {
    ancestors.push(`/${segments.slice(0, length).join("/")}`);
  }
  if (segments.length > 0) {
    ancestors.push("/");
  }
  return ancestors;
}

function isWithinCanonicalSubtree(
  candidatePath: string,
  rootCanonicalPath: string,
): boolean {
  return (
    candidatePath === rootCanonicalPath ||
    candidatePath.startsWith(`${rootCanonicalPath}/`)
  );
}

function selectManifestPages(
  manifest: MirrorManifest,
  requestedCanonicalPath: string,
  requestedScope: MirrorRequestScope,
): MirrorManifestPage[] {
  return manifest.pages.filter((page) =>
    requestedScope === "page"
      ? page.canonicalPath === requestedCanonicalPath
      : isWithinCanonicalSubtree(page.canonicalPath, requestedCanonicalPath),
  );
}

export async function lookupMirrorManifestSelection(
  deps: MirrorCompareStatusDeps,
  input: {
    requestedCanonicalPath: string;
    requestedScope: MirrorRequestScope;
    allowAncestorReuse?: boolean;
  },
): Promise<MirrorManifestLookupResult> {
  const workspaceRoot = deps.getLocalWorkspaceRoot();
  if (!workspaceRoot) {
    return {
      ok: false,
      reason: "NoWorkspace",
    };
  }

  const baseUrl = deps.getBaseUrl()?.trim();
  if (!baseUrl) {
    return {
      ok: false,
      reason: "BaseUrlNotConfigured",
    };
  }

  for (const {
    instanceKey,
    manifestPath: exactManifestPath,
  } of listMirrorManifestCandidates(
    workspaceRoot,
    baseUrl,
    input.requestedCanonicalPath,
  )) {
    let rawManifest: string | undefined;
    try {
      rawManifest = await deps.readLocalFile(exactManifestPath);
    } catch {
      rawManifest = undefined;
    }

    if (rawManifest === undefined) {
      continue;
    }

    const parsedManifest = parseMirrorManifest(rawManifest);
    if (!parsedManifest.ok) {
      return {
        ok: false,
        reason: "InvalidManifest",
      };
    }
    if (parsedManifest.value.baseUrl !== baseUrl) {
      return {
        ok: false,
        reason: "BaseUrlMismatch",
      };
    }

    return {
      ok: true,
      value: {
        workspaceRoot,
        baseUrl,
        manifestPath: exactManifestPath,
        manifest: parsedManifest.value,
        instanceKey,
        requestedCanonicalPath: input.requestedCanonicalPath,
        requestedScope: input.requestedScope,
        effectiveRootCanonicalPath: parsedManifest.value.rootCanonicalPath,
        selectedPages: selectManifestPages(
          parsedManifest.value,
          input.requestedCanonicalPath,
          input.requestedScope,
        ),
        reusedAncestorPrefix: false,
      },
    };
  }

  if (!input.allowAncestorReuse) {
    return {
      ok: false,
      reason: "ManifestNotFound",
    };
  }

  for (const ancestorPath of listAncestorCanonicalPaths(
    input.requestedCanonicalPath,
  )) {
    for (const { instanceKey, manifestPath } of listMirrorManifestCandidates(
      workspaceRoot,
      baseUrl,
      ancestorPath,
    )) {
      let ancestorRawManifest: string;
      try {
        ancestorRawManifest = await deps.readLocalFile(manifestPath);
      } catch {
        continue;
      }

      const parsedManifest = parseMirrorManifest(ancestorRawManifest);
      if (!parsedManifest.ok) {
        return {
          ok: false,
          reason: "InvalidManifest",
        };
      }
      if (parsedManifest.value.baseUrl !== baseUrl) {
        return {
          ok: false,
          reason: "BaseUrlMismatch",
        };
      }
      if (parsedManifest.value.mode !== "prefix") {
        continue;
      }

      const selectedPages = selectManifestPages(
        parsedManifest.value,
        input.requestedCanonicalPath,
        input.requestedScope,
      );
      if (selectedPages.length > 0) {
        return {
          ok: true,
          value: {
            workspaceRoot,
            baseUrl,
            manifestPath,
            manifest: parsedManifest.value,
            instanceKey,
            requestedCanonicalPath: input.requestedCanonicalPath,
            requestedScope: input.requestedScope,
            effectiveRootCanonicalPath: parsedManifest.value.rootCanonicalPath,
            selectedPages,
            reusedAncestorPrefix: true,
          },
        };
      }

      const skippedPages = (parsedManifest.value.skippedPages ?? []).filter(
        (page) =>
          input.requestedScope === "page"
            ? page.canonicalPath === input.requestedCanonicalPath
            : isWithinCanonicalSubtree(
                page.canonicalPath,
                input.requestedCanonicalPath,
              ),
      );
      if (skippedPages.length > 0) {
        return {
          ok: false,
          reason: "ReusedPrefixSkipped",
        };
      }
    }
  }

  return {
    ok: false,
    reason: "ManifestNotFound",
  };
}

export async function evaluateLoadedMirrorPageStatus(
  deps: MirrorCompareStatusDeps,
  loaded: LoadedMirrorSelection,
  page: MirrorManifestPage,
): Promise<MirrorPageEvaluationResult> {
  const sourceLocalFilePath = buildMirrorLocalFilePathWithInstanceKey(
    loaded.workspaceRoot,
    loaded.instanceKey,
    loaded.manifest.rootCanonicalPath,
    page.relativeFilePath,
  );

  let localBody: string;
  try {
    localBody = await deps.readLocalFile(sourceLocalFilePath);
  } catch {
    return {
      ok: true,
      value: {
        result: {
          canonicalPath: page.canonicalPath,
          status: "MissingLocal",
        },
        localFilePath: sourceLocalFilePath,
      },
    };
  }

  const localChanged = hashBody(localBody) !== page.contentHash;
  const currentSnapshot = await deps.bootstrapEditSession(page.canonicalPath);
  if (!currentSnapshot.ok) {
    if (currentSnapshot.reason === "NotFound") {
      return {
        ok: true,
        value: {
          result: {
            canonicalPath: page.canonicalPath,
            status: "MissingRemote",
          },
          localFilePath: sourceLocalFilePath,
        },
      };
    }

    return {
      ok: false,
      reason: currentSnapshot.reason,
    };
  }

  const remoteChanged =
    currentSnapshot.value.pageId !== page.pageId ||
    currentSnapshot.value.baseRevisionId !== page.baseRevisionId;

  return {
    ok: true,
    value: {
      result: {
        canonicalPath: page.canonicalPath,
        status: localChanged
          ? remoteChanged
            ? "Conflict"
            : "LocalChanged"
          : remoteChanged
            ? "RemoteChanged"
            : "Unchanged",
      },
      localFilePath: sourceLocalFilePath,
    },
  };
}

export async function resolveMirrorPageCompareStatus(
  deps: MirrorCompareStatusDeps,
  canonicalPath: string,
): Promise<MirrorPageCompareStatus | "Unavailable"> {
  const loaded = await lookupMirrorManifestSelection(deps, {
    requestedCanonicalPath: canonicalPath,
    requestedScope: "page",
    allowAncestorReuse: true,
  });
  if (!loaded.ok) {
    return "Unavailable";
  }

  const page = loaded.value.selectedPages.find(
    (candidate) => candidate.canonicalPath === canonicalPath,
  );
  if (!page) {
    return "Unavailable";
  }

  const evaluated = await evaluateLoadedMirrorPageStatus(
    deps,
    loaded.value,
    page,
  );
  if (!evaluated.ok) {
    return "Unavailable";
  }
  return evaluated.value.result.status;
}
