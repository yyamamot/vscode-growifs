import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  buildMirrorManifestPath,
  buildMirrorPageFilePath,
  type MirrorManifest,
  serializeMirrorManifest,
} from "../../src/vscode/localRoundTrip";
import type { MirrorCompareScmState } from "../../src/vscode/mirror/mirrorCompareScm";
import {
  createMirrorRemoteMetadataChecker,
  MIRROR_REMOTE_METADATA_AUTO_MAX_PAGES,
  MIRROR_REMOTE_METADATA_COOLDOWN_MS,
} from "../../src/vscode/mirror/mirrorRemoteMetadataCheck";

const workspaceRoot = "/workspace";
const baseUrl = "https://growi.example.test";
const rootCanonicalPath = "/team/dev";

function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

function buildManifest(
  pages: readonly {
    canonicalPath: string;
    body: string;
    pageId?: string;
    revisionId?: string;
    relativeFilePath?: string;
  }[],
): MirrorManifest {
  return {
    version: 1,
    baseUrl,
    rootCanonicalPath,
    mode: "prefix",
    exportedAt: "2026-05-01T00:00:00.000Z",
    pages: pages.map((page) => ({
      canonicalPath: page.canonicalPath,
      relativeFilePath:
        page.relativeFilePath ??
        `${page.canonicalPath.slice(rootCanonicalPath.length + 1)}.md`,
      pageId: page.pageId ?? `page:${page.canonicalPath}`,
      baseRevisionId: page.revisionId ?? `revision:${page.canonicalPath}`,
      exportedAt: "2026-05-01T00:00:00.000Z",
      contentHash: hashBody(page.body),
    })),
  };
}

function buildRootPrefixManifest(
  pages: readonly {
    canonicalPath: string;
    body: string;
    pageId?: string;
    revisionId?: string;
    relativeFilePath?: string;
  }[],
): MirrorManifest {
  return {
    version: 1,
    baseUrl,
    rootCanonicalPath: "/",
    mode: "prefix",
    exportedAt: "2026-05-01T00:00:00.000Z",
    pages: pages.map((page) => ({
      canonicalPath: page.canonicalPath,
      relativeFilePath:
        page.relativeFilePath ?? `${page.canonicalPath.slice(1)}.md`,
      pageId: page.pageId ?? `page:${page.canonicalPath}`,
      baseRevisionId: page.revisionId ?? `revision:${page.canonicalPath}`,
      exportedAt: "2026-05-01T00:00:00.000Z",
      contentHash: hashBody(page.body),
    })),
  };
}

function createHarness(input: {
  manifest: MirrorManifest;
  localBodies: Record<string, string>;
  remoteRevisions?: Record<string, string>;
  remoteFailures?: Record<string, string>;
  getPageInfo?: (canonicalPath: string) => Promise<
    | {
        ok: true;
        pageInfo?: { pageId: string; revisionId?: string };
      }
    | {
        ok: false;
        reason: "ConnectionFailed" | "NotFound";
      }
  >;
  cloneStateOnRead?: boolean;
  initialScmState?: "default" | "empty";
  now?: number;
}) {
  let currentState: MirrorCompareScmState = {
    currentCanonicalPath: input.manifest.rootCanonicalPath,
    targetScope: "subtree",
    resources: input.manifest.pages.map((page) => ({
      canonicalPath: page.canonicalPath,
      status: "LocalChanged" as const,
      localFileUri: {
        scheme: "file",
        path: buildMirrorPageFilePath(
          workspaceRoot,
          baseUrl,
          input.manifest.rootCanonicalPath,
          page.relativeFilePath,
        ),
        fsPath: buildMirrorPageFilePath(
          workspaceRoot,
          baseUrl,
          input.manifest.rootCanonicalPath,
          page.relativeFilePath,
        ),
      },
      remoteUri: {
        scheme: "growi",
        path: `${page.canonicalPath}.md`,
      },
    })),
  };
  let now = input.now ?? 1000;
  const manifestPath = buildMirrorManifestPath(
    workspaceRoot,
    baseUrl,
    input.manifest.rootCanonicalPath,
  );
  const files = new Map<string, string>([
    [manifestPath, serializeMirrorManifest(input.manifest)],
  ]);
  for (const page of input.manifest.pages) {
    const localPath = buildMirrorPageFilePath(
      workspaceRoot,
      baseUrl,
      input.manifest.rootCanonicalPath,
      page.relativeFilePath,
    );
    files.set(
      localPath,
      input.localBodies[page.canonicalPath] ?? "local changed",
    );
  }

  const getPageInfo = vi.fn(
    input.getPageInfo ??
      (async (canonicalPath: string) => {
        const failure = input.remoteFailures?.[canonicalPath];
        if (failure) {
          return { ok: false as const, reason: failure as "ConnectionFailed" };
        }
        const manifestPage = input.manifest.pages.find(
          (page) => page.canonicalPath === canonicalPath,
        );
        if (!manifestPage) {
          return { ok: false as const, reason: "NotFound" as const };
        }
        return {
          ok: true as const,
          pageInfo: {
            pageId: manifestPage.pageId,
            revisionId:
              input.remoteRevisions?.[canonicalPath] ??
              manifestPage.baseRevisionId,
          },
        };
      }),
  );
  const setSourceControlState = vi.fn((state: MirrorCompareScmState) => {
    currentState = state;
    input.initialScmState = "default";
  });
  const setTreeSnapshotState = vi.fn();
  const checker = createMirrorRemoteMetadataChecker({
    getWorkspaceFolders: () => [
      {
        uri: {
          fsPath: workspaceRoot,
        },
      },
    ],
    getBaseUrl: () => baseUrl,
    async readLocalFile(localPath) {
      const content = files.get(path.normalize(localPath));
      if (content === undefined) {
        throw new Error(`missing file: ${localPath}`);
      }
      return content;
    },
    getPageInfo,
    getMirrorCompareSourceControlState: () =>
      input.cloneStateOnRead
        ? input.initialScmState === "empty"
          ? undefined
          : JSON.parse(JSON.stringify(currentState))
        : input.initialScmState === "empty"
          ? undefined
          : currentState,
    setMirrorCompareSourceControlState: setSourceControlState,
    setMirrorCompareTreeSnapshotState: setTreeSnapshotState,
    now: () => now,
  });

  return {
    checker,
    getPageInfo,
    get currentState() {
      return currentState;
    },
    set currentState(state: MirrorCompareScmState) {
      currentState = state;
      input.initialScmState = "default";
    },
    setNow(value: number) {
      now = value;
    },
    setSourceControlState,
    setTreeSnapshotState,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 50; index += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("timed out waiting for predicate");
}

describe("mirror remote metadata check", () => {
  it("promotes local changed pages to conflict when remote metadata changed", async () => {
    const manifest = buildManifest([
      { canonicalPath: "/team/dev/spec", body: "# base" },
    ]);
    const harness = createHarness({
      manifest,
      localBodies: { "/team/dev/spec": "# local" },
      remoteRevisions: { "/team/dev/spec": "revision:remote" },
    });

    await harness.checker.checkLocalChangedResources(
      harness.currentState.resources,
    );

    expect(harness.currentState.resources).toMatchObject([
      {
        canonicalPath: "/team/dev/spec",
        status: "Conflict",
      },
    ]);
  });

  it("marks remote-only metadata changes as remote changed", async () => {
    const manifest = buildManifest([
      { canonicalPath: "/team/dev/spec", body: "# base" },
    ]);
    const harness = createHarness({
      manifest,
      localBodies: { "/team/dev/spec": "# base" },
      remoteRevisions: { "/team/dev/spec": "revision:remote" },
    });

    await harness.checker.checkCurrentMirrorMetadata();

    expect(harness.currentState.resources).toMatchObject([
      {
        canonicalPath: "/team/dev/spec",
        status: "RemoteChanged",
      },
    ]);
  });

  it("clears checked resources when local hash and remote metadata both match", async () => {
    const manifest = buildManifest([
      { canonicalPath: "/team/dev/spec", body: "# base" },
    ]);
    const harness = createHarness({
      manifest,
      localBodies: { "/team/dev/spec": "# base" },
    });

    await harness.checker.checkLocalChangedResources(
      harness.currentState.resources,
    );

    expect(harness.currentState.resources).toEqual([]);
  });

  it("suppresses repeated automatic API calls during cooldown", async () => {
    const manifest = buildManifest([
      { canonicalPath: "/team/dev/spec", body: "# base" },
    ]);
    const harness = createHarness({
      manifest,
      localBodies: { "/team/dev/spec": "# local" },
    });

    await harness.checker.checkLocalChangedResources(
      harness.currentState.resources,
    );
    await harness.checker.checkLocalChangedResources(
      harness.currentState.resources,
    );
    harness.setNow(1000 + MIRROR_REMOTE_METADATA_COOLDOWN_MS + 1);
    await harness.checker.checkLocalChangedResources(
      harness.currentState.resources,
    );

    expect(harness.getPageInfo).toHaveBeenCalledTimes(2);
  });

  it("limits automatic remote metadata checks to 25 pages", async () => {
    const pages = Array.from({ length: 30 }, (_, index) => ({
      canonicalPath: `/team/dev/page-${index + 1}`,
      body: `# page ${index + 1}`,
    }));
    const manifest = buildManifest(pages);
    const harness = createHarness({
      manifest,
      localBodies: Object.fromEntries(
        pages.map((page) => [page.canonicalPath, `${page.body}\nlocal`]),
      ),
    });

    await harness.checker.checkLocalChangedResources(
      harness.currentState.resources,
    );

    expect(harness.getPageInfo).toHaveBeenCalledTimes(
      MIRROR_REMOTE_METADATA_AUTO_MAX_PAGES,
    );
  });

  it("does not exceed concurrency 2 during automatic remote metadata checks", async () => {
    const pages = Array.from({ length: 5 }, (_, index) => ({
      canonicalPath: `/team/dev/page-${index + 1}`,
      body: `# page ${index + 1}`,
    }));
    const manifest = buildManifest(pages);
    let active = 0;
    let maxActive = 0;
    const pending: ReturnType<
      typeof createDeferred<{
        ok: true;
        pageInfo: { pageId: string; revisionId: string };
      }>
    >[] = [];
    const harness = createHarness({
      manifest,
      localBodies: Object.fromEntries(
        pages.map((page) => [page.canonicalPath, `${page.body}\nlocal`]),
      ),
      async getPageInfo(canonicalPath) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        const page = manifest.pages.find(
          (entry) => entry.canonicalPath === canonicalPath,
        );
        if (!page) {
          active -= 1;
          return { ok: false as const, reason: "NotFound" as const };
        }
        const deferred = createDeferred<{
          ok: true;
          pageInfo: { pageId: string; revisionId: string };
        }>();
        pending.push(deferred);
        try {
          return await deferred.promise;
        } finally {
          active -= 1;
        }
      },
    });

    const checking = harness.checker.checkLocalChangedResources(
      harness.currentState.resources,
    );
    await waitFor(() => pending.length === 2);
    expect(maxActive).toBe(2);

    while (pending.length > 0) {
      const deferred = pending.shift();
      deferred?.resolve({
        ok: true,
        pageInfo: {
          pageId: "page",
          revisionId: "revision:remote",
        },
      });
      await waitFor(
        () => pending.length > 0 || harness.getPageInfo.mock.calls.length >= 5,
      ).catch(() => undefined);
      expect(maxActive).toBeLessThanOrEqual(2);
    }
    await checking;

    expect(maxActive).toBe(2);
    expect(harness.getPageInfo).toHaveBeenCalledTimes(5);
  });

  it("preserves SCM state silently when metadata API fails", async () => {
    const manifest = buildManifest([
      { canonicalPath: "/team/dev/spec", body: "# base" },
    ]);
    const harness = createHarness({
      manifest,
      localBodies: { "/team/dev/spec": "# local" },
      remoteFailures: { "/team/dev/spec": "ConnectionFailed" },
    });
    const before = harness.currentState;

    await harness.checker.checkLocalChangedResources(
      harness.currentState.resources,
    );

    expect(harness.currentState).toBe(before);
    expect(harness.setSourceControlState).not.toHaveBeenCalled();
    expect(harness.setTreeSnapshotState).not.toHaveBeenCalled();
  });

  it("manual metadata check evaluates selected manifest pages without a full compare dependency", async () => {
    const manifest = buildManifest([
      { canonicalPath: "/team/dev/spec", body: "# spec" },
      { canonicalPath: "/team/dev/remote", body: "# remote" },
    ]);
    const harness = createHarness({
      manifest,
      localBodies: {
        "/team/dev/spec": "# spec",
        "/team/dev/remote": "# remote",
      },
      remoteRevisions: {
        "/team/dev/remote": "revision:remote",
      },
    });
    harness.currentState = {
      ...harness.currentState,
      resources: [harness.currentState.resources[0]],
    };

    await harness.checker.checkCurrentMirrorMetadata();

    expect(harness.getPageInfo).toHaveBeenCalledWith("/team/dev/spec");
    expect(harness.getPageInfo).toHaveBeenCalledWith("/team/dev/remote");
    expect(harness.currentState.resources).toMatchObject([
      {
        canonicalPath: "/team/dev/remote",
        status: "RemoteChanged",
      },
    ]);
  });

  it("manual metadata check can add remote-only resources when getState returns cloned unchanged snapshots", async () => {
    const manifest = buildManifest([
      { canonicalPath: "/team/dev/spec", body: "# spec" },
      { canonicalPath: "/team/dev/remote", body: "# remote" },
    ]);
    const harness = createHarness({
      manifest,
      localBodies: {
        "/team/dev/spec": "# spec",
        "/team/dev/remote": "# remote",
      },
      remoteRevisions: {
        "/team/dev/remote": "revision:remote",
      },
      cloneStateOnRead: true,
    });
    harness.currentState = {
      ...harness.currentState,
      resources: [harness.currentState.resources[0]],
    };

    await harness.checker.checkCurrentMirrorMetadata();

    expect(harness.currentState.resources).toMatchObject([
      {
        canonicalPath: "/team/dev/remote",
        status: "RemoteChanged",
      },
    ]);
  });

  it("merges metadata results into the latest SCM state without resurrecting stale checked resources", async () => {
    const manifest = buildManifest([
      { canonicalPath: "/team/dev/spec", body: "# spec" },
    ]);
    const deferred = createDeferred<{
      ok: true;
      pageInfo: { pageId: string; revisionId: string };
    }>();
    const harness = createHarness({
      manifest,
      localBodies: { "/team/dev/spec": "# spec\nlocal" },
      async getPageInfo() {
        return await deferred.promise;
      },
    });
    const newerState: MirrorCompareScmState = {
      currentCanonicalPath: "/team/dev/other",
      targetScope: "page",
      resources: [
        {
          canonicalPath: "/team/dev/other",
          status: "RemoteChanged",
          localFileUri: {
            scheme: "file",
            path: "/workspace/.growi-mirrors/other.md",
            fsPath: "/workspace/.growi-mirrors/other.md",
          },
          remoteUri: {
            scheme: "growi",
            path: "/team/dev/other.md",
          },
        },
      ],
    };

    const checking = harness.checker.checkLocalChangedResources(
      harness.currentState.resources,
    );
    await waitFor(() => harness.getPageInfo.mock.calls.length === 1);
    harness.currentState = newerState;
    deferred.resolve({
      ok: true,
      pageInfo: {
        pageId: "page:/team/dev/spec",
        revisionId: "revision:remote",
      },
    });
    await checking;

    expect(harness.currentState).toBe(newerState);
    expect(harness.setSourceControlState).not.toHaveBeenCalled();
    expect(harness.setTreeSnapshotState).not.toHaveBeenCalled();
  });

  it("does not overwrite a latest same-path resource that changed while metadata check was in flight", async () => {
    const manifest = buildManifest([
      { canonicalPath: "/team/dev/spec", body: "# spec" },
    ]);
    const deferred = createDeferred<{
      ok: true;
      pageInfo: { pageId: string; revisionId: string };
    }>();
    const harness = createHarness({
      manifest,
      localBodies: { "/team/dev/spec": "# spec\nlocal" },
      async getPageInfo() {
        return await deferred.promise;
      },
    });
    const latestConflictState: MirrorCompareScmState = {
      currentCanonicalPath: "/team/dev",
      targetScope: "subtree",
      resources: [
        {
          ...harness.currentState.resources[0],
          status: "Conflict",
        },
      ],
    };

    const checking = harness.checker.checkLocalChangedResources(
      harness.currentState.resources,
    );
    await waitFor(() => harness.getPageInfo.mock.calls.length === 1);
    harness.currentState = latestConflictState;
    deferred.resolve({
      ok: true,
      pageInfo: {
        pageId: "page:/team/dev/spec",
        revisionId: "revision:/team/dev/spec",
      },
    });
    await checking;

    expect(harness.currentState).toBe(latestConflictState);
    expect(harness.setSourceControlState).not.toHaveBeenCalled();
    expect(harness.setTreeSnapshotState).not.toHaveBeenCalled();
  });

  it("creates remote changed SCM state for a TreeView-triggered page check when SCM is empty", async () => {
    const manifest = buildManifest([
      { canonicalPath: "/team/dev/spec", body: "# spec" },
    ]);
    const harness = createHarness({
      manifest,
      localBodies: { "/team/dev/spec": "# spec" },
      remoteRevisions: { "/team/dev/spec": "revision:remote" },
      initialScmState: "empty",
    });

    await harness.checker.checkPageMetadata("/team/dev/spec", {
      respectCooldown: true,
      allowCreateState: true,
    });

    expect(harness.currentState).toMatchObject({
      currentCanonicalPath: "/team/dev/spec",
      targetScope: "page",
      resources: [
        {
          canonicalPath: "/team/dev/spec",
          status: "RemoteChanged",
        },
      ],
    });
    expect(harness.setTreeSnapshotState).toHaveBeenCalledWith(
      harness.currentState,
    );
  });

  it("does not create SCM state for an unchanged TreeView-triggered page check", async () => {
    const manifest = buildManifest([
      { canonicalPath: "/team/dev/spec", body: "# spec" },
    ]);
    const harness = createHarness({
      manifest,
      localBodies: { "/team/dev/spec": "# spec" },
      initialScmState: "empty",
    });
    const before = harness.currentState;

    await harness.checker.checkPageMetadata("/team/dev/spec", {
      respectCooldown: true,
      allowCreateState: true,
    });

    expect(harness.currentState).toBe(before);
    expect(harness.setSourceControlState).not.toHaveBeenCalled();
    expect(harness.setTreeSnapshotState).not.toHaveBeenCalled();
  });

  it("creates conflict state for a TreeView-triggered page check when local and remote changed", async () => {
    const manifest = buildManifest([
      { canonicalPath: "/team/dev/spec", body: "# spec" },
    ]);
    const harness = createHarness({
      manifest,
      localBodies: { "/team/dev/spec": "# local" },
      remoteRevisions: { "/team/dev/spec": "revision:remote" },
      initialScmState: "empty",
    });

    await harness.checker.checkPageMetadata("/team/dev/spec", {
      respectCooldown: true,
      allowCreateState: true,
    });

    expect(harness.currentState.resources).toMatchObject([
      {
        canonicalPath: "/team/dev/spec",
        status: "Conflict",
      },
    ]);
  });

  it("uses ancestor prefix manifests for TreeView-triggered page checks", async () => {
    const manifest = buildManifest([
      { canonicalPath: "/team/dev/docs/spec", body: "# spec" },
    ]);
    const harness = createHarness({
      manifest,
      localBodies: { "/team/dev/docs/spec": "# spec" },
      remoteRevisions: { "/team/dev/docs/spec": "revision:remote" },
      initialScmState: "empty",
    });

    await harness.checker.checkPageMetadata("/team/dev/docs/spec", {
      respectCooldown: true,
      allowCreateState: true,
    });

    expect(harness.currentState.resources).toMatchObject([
      {
        canonicalPath: "/team/dev/docs/spec",
        status: "RemoteChanged",
      },
    ]);
  });

  it("uses root prefix manifests for TreeView-triggered page checks", async () => {
    const manifest = buildRootPrefixManifest([
      { canonicalPath: "/team/dev/docs/spec", body: "# spec" },
    ]);
    const harness = createHarness({
      manifest,
      localBodies: { "/team/dev/docs/spec": "# spec" },
      remoteRevisions: { "/team/dev/docs/spec": "revision:remote" },
      initialScmState: "empty",
    });

    await harness.checker.checkPageMetadata("/team/dev/docs/spec", {
      respectCooldown: true,
      allowCreateState: true,
    });

    expect(harness.currentState.resources).toMatchObject([
      {
        canonicalPath: "/team/dev/docs/spec",
        status: "RemoteChanged",
      },
    ]);
  });

  it("suppresses repeated TreeView-triggered page checks during cooldown", async () => {
    const manifest = buildManifest([
      { canonicalPath: "/team/dev/spec", body: "# spec" },
    ]);
    const harness = createHarness({
      manifest,
      localBodies: { "/team/dev/spec": "# spec" },
      remoteRevisions: { "/team/dev/spec": "revision:remote" },
      initialScmState: "empty",
    });

    await harness.checker.checkPageMetadata("/team/dev/spec", {
      respectCooldown: true,
      allowCreateState: true,
    });
    await harness.checker.checkPageMetadata("/team/dev/spec", {
      respectCooldown: true,
      allowCreateState: true,
    });
    harness.setNow(1000 + MIRROR_REMOTE_METADATA_COOLDOWN_MS + 1);
    await harness.checker.checkPageMetadata("/team/dev/spec", {
      respectCooldown: true,
      allowCreateState: true,
    });

    expect(harness.getPageInfo).toHaveBeenCalledTimes(2);
  });
});
