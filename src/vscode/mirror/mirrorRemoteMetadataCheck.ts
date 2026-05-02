import { createHash } from "node:crypto";
import path from "node:path";

import {
  buildInstanceKey,
  buildMirrorManifestPathWithInstanceKey,
  buildMirrorPageFilePathWithInstanceKey,
  MIRROR_MANIFEST_NAME,
  MIRROR_ROOT_DIR,
  type MirrorManifest,
  type MirrorManifestPage,
  parseMirrorManifest,
} from "../localRoundTrip";
import type {
  MirrorCompareScmResource,
  MirrorCompareScmState,
} from "./mirrorCompareScm";

export const MIRROR_REMOTE_METADATA_AUTO_MAX_PAGES = 25;
export const MIRROR_REMOTE_METADATA_CONCURRENCY = 2;
export const MIRROR_REMOTE_METADATA_COOLDOWN_MS = 10 * 60 * 1000;

interface WorkspaceFolderLike {
  uri: { fsPath: string };
}

export interface MirrorRemotePageInfo {
  pageId: string;
  revisionId?: string;
}

export type MirrorRemotePageInfoResult =
  | { ok: true; pageInfo?: MirrorRemotePageInfo }
  | {
      ok: false;
      reason:
        | "NotFound"
        | "InvalidApiToken"
        | "PermissionDenied"
        | "ApiNotSupported"
        | "ConnectionFailed"
        | "BaseUrlNotConfigured"
        | "ApiTokenNotConfigured"
        | "InvalidBaseUrl"
        | "InvalidPath";
    };

export interface MirrorRemoteMetadataCheckDeps {
  getWorkspaceFolders(): readonly WorkspaceFolderLike[] | undefined;
  getBaseUrl(): string | undefined;
  readLocalFile(localPath: string): Promise<string>;
  getPageInfo(canonicalPath: string): Promise<MirrorRemotePageInfoResult>;
  getMirrorCompareSourceControlState(): MirrorCompareScmState | undefined;
  setMirrorCompareSourceControlState(state: MirrorCompareScmState): void;
  setMirrorCompareTreeSnapshotState?(state: MirrorCompareScmState): void;
  now(): number;
}

interface MirrorRootContext {
  workspaceRoot: string;
  mirrorRootPath: string;
  manifest: MirrorManifest;
}

interface PageCheckCandidate {
  context: MirrorRootContext;
  page: MirrorManifestPage;
  existing?: MirrorCompareScmResource;
}

interface PageCheckResult {
  canonicalPath: string;
  resource?: MirrorCompareScmResource;
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
  if (rootCanonicalPath === "/") {
    return candidatePath.startsWith("/");
  }
  return (
    candidatePath === rootCanonicalPath ||
    candidatePath.startsWith(`${rootCanonicalPath}/`)
  );
}

function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

function toFileUri(localPath: string) {
  return {
    scheme: "file",
    path: localPath,
    fsPath: localPath,
  } as const;
}

function toRemoteUri(canonicalPath: string) {
  return {
    scheme: "growi",
    path: `${canonicalPath}.md`,
  } as const;
}

function isPathWithin(parentPath: string, targetPath: string): boolean {
  const relativePath = path.relative(
    path.resolve(parentPath),
    path.resolve(targetPath),
  );
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function listManifestCandidatePaths(
  workspaceRoot: string,
  localPath: string,
): string[] {
  const rootDirPath = path.join(workspaceRoot, MIRROR_ROOT_DIR);
  if (!isPathWithin(rootDirPath, localPath)) {
    return [];
  }

  const candidates: string[] = [];
  let currentPath = path.dirname(localPath);
  while (isPathWithin(rootDirPath, currentPath)) {
    candidates.push(path.join(currentPath, MIRROR_MANIFEST_NAME));
    if (path.resolve(currentPath) === path.resolve(rootDirPath)) {
      break;
    }
    currentPath = path.dirname(currentPath);
  }
  return candidates;
}

async function resolveMirrorRootContextFromLocalPath(
  deps: MirrorRemoteMetadataCheckDeps,
  localPath: string,
): Promise<MirrorRootContext | undefined> {
  const baseUrl = deps.getBaseUrl()?.trim();
  if (!baseUrl) {
    return undefined;
  }

  for (const folder of deps.getWorkspaceFolders() ?? []) {
    for (const manifestPath of listManifestCandidatePaths(
      folder.uri.fsPath,
      localPath,
    )) {
      let rawManifest: string;
      try {
        rawManifest = await deps.readLocalFile(manifestPath);
      } catch {
        continue;
      }
      const parsed = parseMirrorManifest(rawManifest);
      if (!parsed.ok || parsed.value.baseUrl !== baseUrl) {
        continue;
      }
      return {
        workspaceRoot: folder.uri.fsPath,
        mirrorRootPath: path.dirname(manifestPath),
        manifest: parsed.value,
      };
    }
  }

  return undefined;
}

async function readManifestContext(
  deps: MirrorRemoteMetadataCheckDeps,
  input: {
    workspaceRoot: string;
    instanceKey: string;
    requestedCanonicalPath: string;
  },
): Promise<MirrorRootContext | undefined> {
  const manifestPath = buildMirrorManifestPathWithInstanceKey(
    input.workspaceRoot,
    input.instanceKey,
    input.requestedCanonicalPath,
  );
  let rawManifest: string;
  try {
    rawManifest = await deps.readLocalFile(manifestPath);
  } catch {
    return undefined;
  }
  const parsed = parseMirrorManifest(rawManifest);
  if (!parsed.ok) {
    return undefined;
  }
  const baseUrl = deps.getBaseUrl()?.trim();
  if (!baseUrl || parsed.value.baseUrl !== baseUrl) {
    return undefined;
  }
  return {
    workspaceRoot: input.workspaceRoot,
    mirrorRootPath: path.dirname(manifestPath),
    manifest: parsed.value,
  };
}

async function resolveMirrorRootContextFromCanonicalPath(
  deps: MirrorRemoteMetadataCheckDeps,
  canonicalPath: string,
): Promise<MirrorRootContext | undefined> {
  const baseUrl = deps.getBaseUrl()?.trim();
  if (!baseUrl) {
    return undefined;
  }
  const instanceKey = buildInstanceKey(baseUrl);
  const rootCandidates = [
    canonicalPath,
    ...listAncestorCanonicalPaths(canonicalPath),
  ];

  for (const folder of deps.getWorkspaceFolders() ?? []) {
    for (const rootCanonicalPath of rootCandidates) {
      const context = await readManifestContext(deps, {
        workspaceRoot: folder.uri.fsPath,
        instanceKey,
        requestedCanonicalPath: rootCanonicalPath,
      });
      if (!context) {
        continue;
      }
      if (
        context.manifest.rootCanonicalPath === canonicalPath ||
        (context.manifest.mode === "prefix" &&
          isWithinCanonicalSubtree(
            canonicalPath,
            context.manifest.rootCanonicalPath,
          ))
      ) {
        return context;
      }
    }
  }

  return undefined;
}

function buildLocalFilePath(
  context: MirrorRootContext,
  page: MirrorManifestPage,
): string {
  return buildMirrorPageFilePathWithInstanceKey(
    context.workspaceRoot,
    buildInstanceKey(context.manifest.baseUrl),
    context.manifest.rootCanonicalPath,
    page.relativeFilePath,
  );
}

function isRemoteMetadataChanged(
  page: MirrorManifestPage,
  result: MirrorRemotePageInfoResult,
): boolean | undefined {
  if (!result.ok) {
    return result.reason === "NotFound" ? true : undefined;
  }
  const pageInfo = result.pageInfo;
  if (!pageInfo) {
    return true;
  }
  return (
    pageInfo.pageId !== page.pageId ||
    pageInfo.revisionId !== page.baseRevisionId
  );
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R | undefined>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const result = await mapper(items[currentIndex]);
        if (result !== undefined) {
          results.push(result);
        }
      }
    }),
  );

  return results;
}

async function evaluateCandidate(
  deps: MirrorRemoteMetadataCheckDeps,
  candidate: PageCheckCandidate,
): Promise<PageCheckResult | undefined> {
  const localFilePath = buildLocalFilePath(candidate.context, candidate.page);
  let localBody: string;
  try {
    localBody = await deps.readLocalFile(localFilePath);
  } catch {
    return undefined;
  }

  const localChanged = hashBody(localBody) !== candidate.page.contentHash;
  const remoteResult = await deps.getPageInfo(candidate.page.canonicalPath);
  const remoteChanged = isRemoteMetadataChanged(candidate.page, remoteResult);
  if (remoteChanged === undefined) {
    return undefined;
  }

  if (!localChanged && !remoteChanged) {
    return { canonicalPath: candidate.page.canonicalPath };
  }

  return {
    canonicalPath: candidate.page.canonicalPath,
    resource: {
      canonicalPath: candidate.page.canonicalPath,
      status: localChanged
        ? remoteChanged
          ? "Conflict"
          : "LocalChanged"
        : "RemoteChanged",
      localFileUri: toFileUri(localFilePath),
      remoteUri: toRemoteUri(candidate.page.canonicalPath),
    },
  };
}

function mergeCheckedResources(input: {
  currentState: MirrorCompareScmState;
  checkedResults: readonly PageCheckResult[];
  baselineResourceSignatures: ReadonlyMap<string, string>;
  allowNewResources: boolean;
}): MirrorCompareScmState {
  const checkedByPath = new Map(
    input.checkedResults.map((result) => [result.canonicalPath, result]),
  );
  const resources: MirrorCompareScmResource[] = [];

  for (const resource of input.currentState.resources) {
    const checked = checkedByPath.get(resource.canonicalPath);
    if (!checked) {
      resources.push(resource);
      continue;
    }
    if (
      input.baselineResourceSignatures.get(resource.canonicalPath) !==
      buildResourceSignature(resource)
    ) {
      resources.push(resource);
      checkedByPath.delete(resource.canonicalPath);
      continue;
    }
    if (checked.resource) {
      resources.push(checked.resource);
    }
    checkedByPath.delete(resource.canonicalPath);
  }

  for (const checked of checkedByPath.values()) {
    if (input.allowNewResources && checked.resource) {
      resources.push(checked.resource);
    }
  }

  return {
    ...input.currentState,
    resources,
  };
}

function buildResourceSignature(resource: MirrorCompareScmResource): string {
  return JSON.stringify({
    canonicalPath: resource.canonicalPath,
    status: resource.status,
    localFilePath: resource.localFileUri.path,
    remotePath: resource.remoteUri.path,
  });
}

function buildStateSignature(state: MirrorCompareScmState): string {
  return JSON.stringify({
    currentCanonicalPath: state.currentCanonicalPath,
    targetScope: state.targetScope,
    resources: state.resources.map((resource) =>
      buildResourceSignature(resource),
    ),
  });
}

export function createMirrorRemoteMetadataChecker(
  deps: MirrorRemoteMetadataCheckDeps,
) {
  const checkedAtByCanonicalPath = new Map<string, number>();

  const runCandidates = async (
    candidates: readonly PageCheckCandidate[],
    options: {
      maxPages?: number;
      respectCooldown: boolean;
      allowNewResources: boolean;
      fallbackState?: MirrorCompareScmState;
    },
  ): Promise<boolean> => {
    const baselineExistingState = deps.getMirrorCompareSourceControlState();
    const baselineState = baselineExistingState ?? options.fallbackState;
    if (!baselineState) {
      return false;
    }
    const baselineHadExistingState = baselineExistingState !== undefined;
    const baselineSignature = buildStateSignature(baselineState);

    const now = deps.now();
    const selectedCandidates: PageCheckCandidate[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (seen.has(candidate.page.canonicalPath)) {
        continue;
      }
      seen.add(candidate.page.canonicalPath);
      if (options.respectCooldown) {
        const checkedAt = checkedAtByCanonicalPath.get(
          candidate.page.canonicalPath,
        );
        if (
          checkedAt !== undefined &&
          now - checkedAt < MIRROR_REMOTE_METADATA_COOLDOWN_MS
        ) {
          continue;
        }
      }
      selectedCandidates.push(candidate);
      checkedAtByCanonicalPath.set(candidate.page.canonicalPath, now);
      if (
        options.maxPages !== undefined &&
        selectedCandidates.length >= options.maxPages
      ) {
        break;
      }
    }

    if (selectedCandidates.length === 0) {
      return false;
    }
    const baselineResourceSignatures = new Map(
      selectedCandidates
        .filter((candidate) => candidate.existing !== undefined)
        .map((candidate) => [
          candidate.page.canonicalPath,
          buildResourceSignature(
            candidate.existing as MirrorCompareScmResource,
          ),
        ]),
    );

    const checkedResults = await mapWithConcurrency(
      selectedCandidates,
      MIRROR_REMOTE_METADATA_CONCURRENCY,
      (candidate) => evaluateCandidate(deps, candidate),
    );
    if (checkedResults.length === 0) {
      return false;
    }

    const latestExistingState = deps.getMirrorCompareSourceControlState();
    const latestState = latestExistingState ?? options.fallbackState;
    if (!latestState) {
      return false;
    }
    const allowNewResources =
      options.allowNewResources &&
      buildStateSignature(latestState) === baselineSignature &&
      (baselineHadExistingState || latestExistingState === undefined);
    const nextState = mergeCheckedResources({
      currentState: latestState,
      checkedResults,
      baselineResourceSignatures,
      allowNewResources,
    });
    if (
      nextState.resources.length === latestState.resources.length &&
      nextState.resources.every((resource, index) => {
        const current = latestState.resources[index];
        return (
          current !== undefined &&
          resource.canonicalPath === current.canonicalPath &&
          resource.status === current.status &&
          resource.localFileUri.path === current.localFileUri.path &&
          resource.remoteUri.path === current.remoteUri.path
        );
      })
    ) {
      return false;
    }
    deps.setMirrorCompareSourceControlState(nextState);
    deps.setMirrorCompareTreeSnapshotState?.(nextState);
    return true;
  };

  const buildCandidatesFromResources = async (
    resources: readonly MirrorCompareScmResource[],
    options: { wholeManifest: boolean },
  ): Promise<PageCheckCandidate[]> => {
    const contextsByRoot = new Map<string, MirrorRootContext>();
    const resourcesByPath = new Map(
      resources.map((resource) => [resource.canonicalPath, resource]),
    );

    for (const resource of resources) {
      const localPath =
        resource.localFileUri.fsPath ?? resource.localFileUri.path;
      const context = await resolveMirrorRootContextFromLocalPath(
        deps,
        localPath,
      );
      if (context) {
        contextsByRoot.set(context.mirrorRootPath, context);
      }
    }

    const candidates: PageCheckCandidate[] = [];
    for (const context of contextsByRoot.values()) {
      const pages = options.wholeManifest
        ? context.manifest.pages
        : context.manifest.pages.filter((page) =>
            resourcesByPath.has(page.canonicalPath),
          );
      for (const page of pages) {
        const existing = resourcesByPath.get(page.canonicalPath);
        candidates.push({
          context,
          page,
          existing,
        });
      }
    }

    return candidates;
  };

  const checkLocalChangedResources = async (
    resources: readonly MirrorCompareScmResource[],
  ): Promise<boolean> => {
    const localChanged = resources.filter(
      (resource) => resource.status === "LocalChanged",
    );
    if (localChanged.length === 0) {
      return false;
    }
    const candidates = await buildCandidatesFromResources(localChanged, {
      wholeManifest: false,
    });
    return runCandidates(candidates, {
      maxPages: MIRROR_REMOTE_METADATA_AUTO_MAX_PAGES,
      respectCooldown: true,
      allowNewResources: false,
    });
  };

  const buildCandidateFromCanonicalPath = async (
    canonicalPath: string,
  ): Promise<PageCheckCandidate | undefined> => {
    const context = await resolveMirrorRootContextFromCanonicalPath(
      deps,
      canonicalPath,
    );
    if (!context) {
      return undefined;
    }
    const page = context.manifest.pages.find(
      (candidate) => candidate.canonicalPath === canonicalPath,
    );
    if (!page) {
      return undefined;
    }
    const existing = deps
      .getMirrorCompareSourceControlState()
      ?.resources.find((resource) => resource.canonicalPath === canonicalPath);
    return { context, page, existing };
  };

  return {
    checkLocalChangedResources,
    async checkCurrentLocalChangedResources(): Promise<boolean> {
      const currentState = deps.getMirrorCompareSourceControlState();
      if (!currentState) {
        return false;
      }
      return checkLocalChangedResources(currentState.resources);
    },

    async checkCurrentMirrorMetadata(): Promise<boolean> {
      const currentState = deps.getMirrorCompareSourceControlState();
      if (!currentState || currentState.resources.length === 0) {
        return false;
      }
      const candidates = await buildCandidatesFromResources(
        currentState.resources,
        { wholeManifest: true },
      );
      return runCandidates(candidates, {
        respectCooldown: false,
        allowNewResources: true,
      });
    },

    async checkPageMetadata(
      canonicalPath: string,
      options?: {
        respectCooldown?: boolean;
        allowCreateState?: boolean;
      },
    ): Promise<boolean> {
      const candidate = await buildCandidateFromCanonicalPath(canonicalPath);
      if (!candidate) {
        return false;
      }
      return runCandidates([candidate], {
        maxPages: 1,
        respectCooldown: options?.respectCooldown ?? true,
        allowNewResources: options?.allowCreateState ?? true,
        fallbackState:
          options?.allowCreateState === false
            ? undefined
            : {
                currentCanonicalPath: canonicalPath,
                targetScope: "page",
                resources: [],
              },
      });
    },
  };
}
