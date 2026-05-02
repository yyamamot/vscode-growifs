import { createHash } from "node:crypto";
import path from "node:path";
import * as vscode from "vscode";
import {
  buildInstanceKey,
  buildMirrorPageFilePathWithInstanceKey,
  MIRROR_MANIFEST_NAME,
  MIRROR_ROOT_DIR,
  type MirrorManifest,
  parseMirrorManifest,
} from "../localRoundTrip";
import type {
  MirrorCompareScmResource,
  MirrorCompareScmState,
} from "./mirrorCompareScm";

const MIRROR_LOCAL_CHANGE_DEBOUNCE_MS = 1000;
const MIRROR_LOCAL_CHANGE_MAX_WAIT_MS = 5000;

interface WorkspaceFolderLike {
  uri: { fsPath: string };
}

interface WatcherLike {
  onDidChange(listener: (uri: vscode.Uri) => unknown): vscode.Disposable;
  onDidCreate(listener: (uri: vscode.Uri) => unknown): vscode.Disposable;
  onDidDelete(listener: (uri: vscode.Uri) => unknown): vscode.Disposable;
  dispose(): void;
}

export interface MirrorLocalChangeMonitorDeps {
  getWorkspaceFolders(): readonly WorkspaceFolderLike[] | undefined;
  getBaseUrl(): string | undefined;
  readLocalFile(localPath: string): Promise<string>;
  findMirrorManifestFiles(
    folder: WorkspaceFolderLike,
    pattern: string,
  ): Promise<readonly vscode.Uri[]>;
  createFileSystemWatcher(
    folder: WorkspaceFolderLike,
    pattern: string,
  ): WatcherLike;
  getMirrorCompareSourceControlState(): MirrorCompareScmState | undefined;
  setMirrorCompareSourceControlState(state: MirrorCompareScmState): void;
  setMirrorCompareTreeSnapshotState?(state: MirrorCompareScmState): void;
  onLocalOnlyRefresh?(input: {
    mirrorRootPath: string;
    manifest: MirrorManifest;
    state: MirrorCompareScmState;
    localChangedResources: readonly MirrorCompareScmResource[];
  }): void;
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

interface PendingMirrorRoot {
  debounceTimer?: ReturnType<typeof setTimeout>;
  maxWaitTimer?: ReturnType<typeof setTimeout>;
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
  changedPath: string,
) {
  const rootDirPath = path.join(workspaceRoot, MIRROR_ROOT_DIR);
  if (!isPathWithin(rootDirPath, changedPath)) {
    return [];
  }

  const candidates: string[] = [];
  let currentPath =
    path.basename(changedPath) === MIRROR_MANIFEST_NAME
      ? path.dirname(changedPath)
      : path.dirname(changedPath);
  while (isPathWithin(rootDirPath, currentPath)) {
    candidates.push(path.join(currentPath, MIRROR_MANIFEST_NAME));
    if (path.resolve(currentPath) === path.resolve(rootDirPath)) {
      break;
    }
    currentPath = path.dirname(currentPath);
  }
  return candidates;
}

async function resolveMirrorRootFromChange(
  deps: MirrorLocalChangeMonitorDeps,
  changedPath: string,
): Promise<string | undefined> {
  const baseUrl = deps.getBaseUrl()?.trim();
  if (!baseUrl) {
    return undefined;
  }

  for (const folder of deps.getWorkspaceFolders() ?? []) {
    for (const manifestPath of listManifestCandidatePaths(
      folder.uri.fsPath,
      changedPath,
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

      const mirrorRootPath = path.dirname(manifestPath);
      if (path.basename(changedPath) === MIRROR_MANIFEST_NAME) {
        return mirrorRootPath;
      }

      const instanceKey = buildInstanceKey(parsed.value.baseUrl);
      const pagePaths = new Set(
        parsed.value.pages.map((page) =>
          buildMirrorPageFilePathWithInstanceKey(
            folder.uri.fsPath,
            instanceKey,
            parsed.value.rootCanonicalPath,
            page.relativeFilePath,
          ),
        ),
      );
      if (pagePaths.has(changedPath)) {
        return mirrorRootPath;
      }
    }
  }

  return undefined;
}

function findWorkspaceRootForMirrorRoot(
  deps: MirrorLocalChangeMonitorDeps,
  mirrorRootPath: string,
): string | undefined {
  return (deps.getWorkspaceFolders() ?? []).find((folder) =>
    isPathWithin(folder.uri.fsPath, mirrorRootPath),
  )?.uri.fsPath;
}

function selectBaselineState(
  currentState: MirrorCompareScmState | undefined,
  manifest: MirrorManifest,
): MirrorCompareScmState {
  return (
    currentState ?? {
      currentCanonicalPath: manifest.rootCanonicalPath,
      targetScope: manifest.mode === "prefix" ? "subtree" : "page",
      resources: [],
    }
  );
}

function mergeLocalOnlyResources(input: {
  baselineState: MirrorCompareScmState;
  manifest: MirrorManifest;
  localChangedResources: readonly MirrorCompareScmResource[];
}): MirrorCompareScmState {
  const manifestCanonicalPaths = new Set(
    input.manifest.pages.map((page) => page.canonicalPath),
  );
  const localChangedByPath = new Map(
    input.localChangedResources.map((resource) => [
      resource.canonicalPath,
      resource,
    ]),
  );
  const mergedResources: MirrorCompareScmResource[] = [];
  const consumedLocalChanged = new Set<string>();

  for (const resource of input.baselineState.resources) {
    if (!manifestCanonicalPaths.has(resource.canonicalPath)) {
      mergedResources.push(resource);
      continue;
    }

    if (resource.status === "RemoteChanged" || resource.status === "Conflict") {
      const localChanged = localChangedByPath.get(resource.canonicalPath);
      if (localChanged) {
        mergedResources.push({
          ...localChanged,
          status: "Conflict",
        });
        consumedLocalChanged.add(resource.canonicalPath);
        continue;
      }
      mergedResources.push(resource);
    }
  }

  for (const resource of input.localChangedResources) {
    if (!consumedLocalChanged.has(resource.canonicalPath)) {
      mergedResources.push(resource);
    }
  }

  return {
    currentCanonicalPath: input.baselineState.currentCanonicalPath,
    targetScope: input.baselineState.targetScope,
    resources: mergedResources,
  };
}

async function refreshMirrorRootLocalChanges(
  deps: MirrorLocalChangeMonitorDeps,
  mirrorRootPath: string,
): Promise<void> {
  const workspaceRoot = findWorkspaceRootForMirrorRoot(deps, mirrorRootPath);
  const baseUrl = deps.getBaseUrl()?.trim();
  if (!workspaceRoot || !baseUrl) {
    return;
  }

  let rawManifest: string;
  try {
    rawManifest = await deps.readLocalFile(
      path.join(mirrorRootPath, MIRROR_MANIFEST_NAME),
    );
  } catch {
    return;
  }

  const parsed = parseMirrorManifest(rawManifest);
  if (!parsed.ok || parsed.value.baseUrl !== baseUrl) {
    return;
  }

  const manifest = parsed.value;
  const instanceKey = buildInstanceKey(manifest.baseUrl);
  const localChangedResources: MirrorCompareScmResource[] = [];

  for (const page of manifest.pages) {
    const localFilePath = buildMirrorPageFilePathWithInstanceKey(
      workspaceRoot,
      instanceKey,
      manifest.rootCanonicalPath,
      page.relativeFilePath,
    );
    let localBody: string;
    try {
      localBody = await deps.readLocalFile(localFilePath);
    } catch {
      return;
    }

    if (hashBody(localBody) !== page.contentHash) {
      localChangedResources.push({
        canonicalPath: page.canonicalPath,
        status: "LocalChanged",
        localFileUri: toFileUri(localFilePath),
        remoteUri: toRemoteUri(page.canonicalPath),
      });
    }
  }

  const nextState = mergeLocalOnlyResources({
    baselineState: selectBaselineState(
      deps.getMirrorCompareSourceControlState(),
      manifest,
    ),
    manifest,
    localChangedResources,
  });
  deps.setMirrorCompareSourceControlState(nextState);
  deps.setMirrorCompareTreeSnapshotState?.(nextState);
  deps.onLocalOnlyRefresh?.({
    mirrorRootPath,
    manifest,
    state: nextState,
    localChangedResources,
  });
}

export function createMirrorLocalChangeMonitor(
  deps: MirrorLocalChangeMonitorDeps,
): vscode.Disposable {
  const workspaceFolders = deps.getWorkspaceFolders();
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return { dispose() {} };
  }

  let disposed = false;
  const pendingByMirrorRoot = new Map<string, PendingMirrorRoot>();
  const disposables: vscode.Disposable[] = [];

  const flushMirrorRoot = (mirrorRootPath: string) => {
    if (disposed) {
      return;
    }
    const pending = pendingByMirrorRoot.get(mirrorRootPath);
    if (pending?.debounceTimer) {
      deps.clearTimeout(pending.debounceTimer);
    }
    if (pending?.maxWaitTimer) {
      deps.clearTimeout(pending.maxWaitTimer);
    }
    pendingByMirrorRoot.delete(mirrorRootPath);
    void refreshMirrorRootLocalChanges(deps, mirrorRootPath);
  };

  const scheduleMirrorRoot = (mirrorRootPath: string) => {
    if (disposed) {
      return;
    }
    const pending = pendingByMirrorRoot.get(mirrorRootPath) ?? {};
    if (pending.debounceTimer) {
      deps.clearTimeout(pending.debounceTimer);
    }
    pending.debounceTimer = deps.setTimeout(
      () => flushMirrorRoot(mirrorRootPath),
      MIRROR_LOCAL_CHANGE_DEBOUNCE_MS,
    );
    if (!pending.maxWaitTimer) {
      pending.maxWaitTimer = deps.setTimeout(
        () => flushMirrorRoot(mirrorRootPath),
        MIRROR_LOCAL_CHANGE_MAX_WAIT_MS,
      );
    }
    pendingByMirrorRoot.set(mirrorRootPath, pending);
  };

  const handleChange = (uri: vscode.Uri) => {
    if (uri.scheme !== "file") {
      return;
    }
    void resolveMirrorRootFromChange(deps, uri.fsPath).then(
      (mirrorRootPath) => {
        if (mirrorRootPath && !disposed) {
          scheduleMirrorRoot(mirrorRootPath);
        }
      },
    );
  };

  const scanExistingMirrorRoots = async () => {
    for (const folder of workspaceFolders) {
      if (disposed) {
        return;
      }

      let manifestUris: readonly vscode.Uri[];
      try {
        manifestUris = await deps.findMirrorManifestFiles(
          folder,
          `${MIRROR_ROOT_DIR}/**/${MIRROR_MANIFEST_NAME}`,
        );
      } catch {
        continue;
      }

      for (const manifestUri of manifestUris) {
        if (disposed) {
          return;
        }
        if (manifestUri.scheme !== "file") {
          continue;
        }
        const mirrorRootPath = path.dirname(manifestUri.fsPath);
        const mirrorRootDir = path.join(folder.uri.fsPath, MIRROR_ROOT_DIR);
        if (isPathWithin(mirrorRootDir, mirrorRootPath)) {
          scheduleMirrorRoot(mirrorRootPath);
        }
      }
    }
  };

  for (const folder of workspaceFolders) {
    const watcher = deps.createFileSystemWatcher(
      folder,
      `${MIRROR_ROOT_DIR}/**/{*.md,${MIRROR_MANIFEST_NAME}}`,
    );
    disposables.push(
      watcher,
      watcher.onDidChange(handleChange),
      watcher.onDidCreate(handleChange),
      watcher.onDidDelete(handleChange),
    );
  }

  void scanExistingMirrorRoots();

  return {
    dispose() {
      disposed = true;
      for (const pending of pendingByMirrorRoot.values()) {
        if (pending.debounceTimer) {
          deps.clearTimeout(pending.debounceTimer);
        }
        if (pending.maxWaitTimer) {
          deps.clearTimeout(pending.maxWaitTimer);
        }
      }
      pendingByMirrorRoot.clear();
      for (const disposable of disposables) {
        disposable.dispose();
      }
    },
  };
}

export function createVscodeMirrorLocalChangeMonitor(input: {
  getBaseUrl(): string | undefined;
  getMirrorCompareSourceControlState(): MirrorCompareScmState | undefined;
  setMirrorCompareSourceControlState(state: MirrorCompareScmState): void;
  setMirrorCompareTreeSnapshotState?(state: MirrorCompareScmState): void;
  onLocalOnlyRefresh?(input: {
    mirrorRootPath: string;
    manifest: MirrorManifest;
    state: MirrorCompareScmState;
    localChangedResources: readonly MirrorCompareScmResource[];
  }): void;
}): vscode.Disposable {
  return createMirrorLocalChangeMonitor({
    getWorkspaceFolders: () => vscode.workspace.workspaceFolders,
    getBaseUrl: input.getBaseUrl,
    async readLocalFile(localPath) {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.file(localPath),
      );
      return new TextDecoder().decode(bytes);
    },
    createFileSystemWatcher(folder, pattern) {
      return vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder.uri.fsPath, pattern),
      );
    },
    async findMirrorManifestFiles(folder, pattern) {
      return vscode.workspace.findFiles(
        new vscode.RelativePattern(folder.uri.fsPath, pattern),
      );
    },
    getMirrorCompareSourceControlState:
      input.getMirrorCompareSourceControlState,
    setMirrorCompareSourceControlState:
      input.setMirrorCompareSourceControlState,
    setMirrorCompareTreeSnapshotState: input.setMirrorCompareTreeSnapshotState,
    onLocalOnlyRefresh: input.onLocalOnlyRefresh,
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: (handle) => clearTimeout(handle),
  });
}
