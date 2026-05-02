import { createHash } from "node:crypto";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  RelativePattern: class {
    base: string;
    pattern: string;

    constructor(base: string, pattern: string) {
      this.base = base;
      this.pattern = pattern;
    }
  },
  Uri: {
    file: vi.fn((value: string) => ({
      fsPath: value,
      path: value,
      scheme: "file",
      toString: () => `file:${value}`,
    })),
  },
  workspace: {
    createFileSystemWatcher: vi.fn(),
    fs: {
      readFile: vi.fn(),
    },
    workspaceFolders: [],
  },
}));

import {
  buildInstanceKey,
  buildMirrorManifestPathWithInstanceKey,
  buildMirrorPageFilePathWithInstanceKey,
  serializeMirrorManifest,
} from "../../src/vscode/localRoundTrip";
import type { MirrorCompareScmState } from "../../src/vscode/mirror/mirrorCompareScm";
import { createMirrorLocalChangeMonitor } from "../../src/vscode/mirror/mirrorLocalChangeMonitor";

function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

function createUri(fsPath: string) {
  return {
    scheme: "file",
    fsPath,
  } as never;
}

function createHarness(options?: {
  workspaceRoot?: string;
  workspaceFolders?: readonly { uri: { fsPath: string } }[];
  baseUrl?: string;
  currentState?: MirrorCompareScmState;
  startupManifestPaths?: readonly string[];
}) {
  const workspaceRoot = options?.workspaceRoot ?? "/workspace";
  const baseUrl = options?.baseUrl ?? "https://growi.example.com/";
  const listeners = {
    change: [] as Array<(uri: never) => unknown>,
    create: [] as Array<(uri: never) => unknown>,
    delete: [] as Array<(uri: never) => unknown>,
  };
  const files = new Map<string, string>();
  let currentState = options?.currentState;
  const setSourceControlState = vi.fn((state: MirrorCompareScmState) => {
    currentState = state;
  });
  const setTreeSnapshotState = vi.fn();
  const watcher = {
    onDidChange: vi.fn((listener: (uri: never) => unknown) => {
      listeners.change.push(listener);
      return { dispose: vi.fn() };
    }),
    onDidCreate: vi.fn((listener: (uri: never) => unknown) => {
      listeners.create.push(listener);
      return { dispose: vi.fn() };
    }),
    onDidDelete: vi.fn((listener: (uri: never) => unknown) => {
      listeners.delete.push(listener);
      return { dispose: vi.fn() };
    }),
    dispose: vi.fn(),
  };
  const deps = {
    getWorkspaceFolders: vi.fn(
      () => options?.workspaceFolders ?? [{ uri: { fsPath: workspaceRoot } }],
    ),
    getBaseUrl: vi.fn(() => baseUrl),
    readLocalFile: vi.fn(async (localPath: string) => {
      const value = files.get(localPath);
      if (value === undefined) {
        throw new Error(`missing file: ${localPath}`);
      }
      return value;
    }),
    findMirrorManifestFiles: vi.fn(async () =>
      (options?.startupManifestPaths ?? []).map(createUri),
    ),
    createFileSystemWatcher: vi.fn(() => watcher),
    getMirrorCompareSourceControlState: vi.fn(() => currentState),
    setMirrorCompareSourceControlState: setSourceControlState,
    setMirrorCompareTreeSnapshotState: setTreeSnapshotState,
    setTimeout: vi.fn((callback: () => void, ms: number) =>
      setTimeout(callback, ms),
    ),
    clearTimeout: vi.fn((handle: ReturnType<typeof setTimeout>) =>
      clearTimeout(handle),
    ),
  };

  return {
    workspaceRoot,
    baseUrl,
    files,
    deps,
    watcher,
    listeners,
    setSourceControlState,
    setTreeSnapshotState,
    get currentState() {
      return currentState;
    },
  };
}

function seedManifest(input: {
  files: Map<string, string>;
  workspaceRoot: string;
  baseUrl: string;
  rootCanonicalPath: string;
  pages: Array<{
    canonicalPath: string;
    relativeFilePath: string;
    body: string;
  }>;
}) {
  const instanceKey = buildInstanceKey(input.baseUrl);
  const manifestPath = buildMirrorManifestPathWithInstanceKey(
    input.workspaceRoot,
    instanceKey,
    input.rootCanonicalPath,
  );
  input.files.set(
    manifestPath,
    serializeMirrorManifest({
      version: 1,
      baseUrl: input.baseUrl,
      rootCanonicalPath: input.rootCanonicalPath,
      mode: "prefix",
      exportedAt: "2026-05-01T00:00:00.000Z",
      pages: input.pages.map((page) => ({
        canonicalPath: page.canonicalPath,
        relativeFilePath: page.relativeFilePath,
        pageId: `page:${page.canonicalPath}`,
        baseRevisionId: `revision:${page.canonicalPath}`,
        exportedAt: "2026-05-01T00:00:00.000Z",
        contentHash: hashBody(page.body),
      })),
    }),
  );

  for (const page of input.pages) {
    input.files.set(
      buildMirrorPageFilePathWithInstanceKey(
        input.workspaceRoot,
        instanceKey,
        input.rootCanonicalPath,
        page.relativeFilePath,
      ),
      page.body,
    );
  }

  return { instanceKey, manifestPath };
}

describe("mirror local change monitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("reflects local markdown changes after debounce without remote fetch", async () => {
    const harness = createHarness();
    const { instanceKey } = seedManifest({
      files: harness.files,
      workspaceRoot: harness.workspaceRoot,
      baseUrl: harness.baseUrl,
      rootCanonicalPath: "/team",
      pages: [
        {
          canonicalPath: "/team/page",
          relativeFilePath: "page.md",
          body: "# original",
        },
      ],
    });
    const pagePath = buildMirrorPageFilePathWithInstanceKey(
      harness.workspaceRoot,
      instanceKey,
      "/team",
      "page.md",
    );
    harness.files.set(pagePath, "# edited");

    createMirrorLocalChangeMonitor(harness.deps);
    harness.listeners.change[0](createUri(pagePath));
    await vi.runOnlyPendingTimersAsync();

    expect(harness.deps.createFileSystemWatcher).toHaveBeenCalledWith(
      { uri: { fsPath: harness.workspaceRoot } },
      ".growi-mirrors/**/{*.md,.growi-mirror.json}",
    );
    expect(harness.setSourceControlState).toHaveBeenCalledWith({
      currentCanonicalPath: "/team",
      targetScope: "subtree",
      resources: [
        expect.objectContaining({
          canonicalPath: "/team/page",
          status: "LocalChanged",
        }),
      ],
    });
    expect(harness.deps.readLocalFile).toHaveBeenCalled();
    expect("bootstrapEditSession" in harness.deps).toBe(false);
  });

  it("reflects existing local markdown changes on startup without watcher events", async () => {
    const harness = createHarness();
    const { instanceKey, manifestPath } = seedManifest({
      files: harness.files,
      workspaceRoot: harness.workspaceRoot,
      baseUrl: harness.baseUrl,
      rootCanonicalPath: "/team",
      pages: [
        {
          canonicalPath: "/team/page",
          relativeFilePath: "page.md",
          body: "# original",
        },
      ],
    });
    const pagePath = buildMirrorPageFilePathWithInstanceKey(
      harness.workspaceRoot,
      instanceKey,
      "/team",
      "page.md",
    );
    harness.files.set(pagePath, "# edited before activation");

    createMirrorLocalChangeMonitor({
      ...harness.deps,
      findMirrorManifestFiles: vi.fn(async () => [createUri(manifestPath)]),
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.runOnlyPendingTimersAsync();

    expect(harness.listeners.change).toHaveLength(1);
    expect(harness.setSourceControlState).toHaveBeenCalledWith({
      currentCanonicalPath: "/team",
      targetScope: "subtree",
      resources: [
        expect.objectContaining({
          canonicalPath: "/team/page",
          status: "LocalChanged",
        }),
      ],
    });
  });

  it("flushes repeated local edits at max wait even when debounce keeps resetting", async () => {
    const harness = createHarness();
    const { instanceKey } = seedManifest({
      files: harness.files,
      workspaceRoot: harness.workspaceRoot,
      baseUrl: harness.baseUrl,
      rootCanonicalPath: "/team",
      pages: [
        {
          canonicalPath: "/team/page",
          relativeFilePath: "page.md",
          body: "# original",
        },
      ],
    });
    const pagePath = buildMirrorPageFilePathWithInstanceKey(
      harness.workspaceRoot,
      instanceKey,
      "/team",
      "page.md",
    );
    harness.files.set(pagePath, "# edited");

    createMirrorLocalChangeMonitor(harness.deps);
    harness.listeners.change[0](createUri(pagePath));
    await vi.advanceTimersByTimeAsync(0);

    for (let index = 0; index < 5; index += 1) {
      await vi.advanceTimersByTimeAsync(900);
      harness.listeners.change[0](createUri(pagePath));
      await vi.advanceTimersByTimeAsync(0);
    }

    await vi.advanceTimersByTimeAsync(499);
    expect(harness.setSourceControlState).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(harness.setSourceControlState).toHaveBeenCalledTimes(1);
    expect(harness.setSourceControlState).toHaveBeenCalledWith({
      currentCanonicalPath: "/team",
      targetScope: "subtree",
      resources: [
        expect.objectContaining({
          canonicalPath: "/team/page",
          status: "LocalChanged",
        }),
      ],
    });
  });

  it("does not list files whose body matches manifest contentHash", async () => {
    const harness = createHarness();
    const { instanceKey } = seedManifest({
      files: harness.files,
      workspaceRoot: harness.workspaceRoot,
      baseUrl: harness.baseUrl,
      rootCanonicalPath: "/team",
      pages: [
        {
          canonicalPath: "/team/page",
          relativeFilePath: "page.md",
          body: "# original",
        },
      ],
    });
    const pagePath = buildMirrorPageFilePathWithInstanceKey(
      harness.workspaceRoot,
      instanceKey,
      "/team",
      "page.md",
    );

    createMirrorLocalChangeMonitor(harness.deps);
    harness.listeners.change[0](createUri(pagePath));
    await vi.runOnlyPendingTimersAsync();

    expect(harness.setSourceControlState).toHaveBeenCalledWith({
      currentCanonicalPath: "/team",
      targetScope: "subtree",
      resources: [],
    });
  });

  it("promotes existing remote changes to conflict when the same page changes locally", async () => {
    const harness = createHarness({
      currentState: {
        currentCanonicalPath: "/team",
        targetScope: "subtree",
        resources: [
          {
            canonicalPath: "/team/page",
            status: "RemoteChanged",
            localFileUri: {
              scheme: "file",
              path: "/workspace/.growi-mirrors/example/team/page.md",
              fsPath: "/workspace/.growi-mirrors/example/team/page.md",
            },
            remoteUri: { scheme: "growi", path: "/team/page.md" },
          },
        ],
      },
    });
    const { instanceKey } = seedManifest({
      files: harness.files,
      workspaceRoot: harness.workspaceRoot,
      baseUrl: harness.baseUrl,
      rootCanonicalPath: "/team",
      pages: [
        {
          canonicalPath: "/team/page",
          relativeFilePath: "page.md",
          body: "# original",
        },
      ],
    });
    const pagePath = buildMirrorPageFilePathWithInstanceKey(
      harness.workspaceRoot,
      instanceKey,
      "/team",
      "page.md",
    );
    harness.files.set(pagePath, "# edited");

    createMirrorLocalChangeMonitor(harness.deps);
    harness.listeners.change[0](createUri(pagePath));
    await vi.runOnlyPendingTimersAsync();

    expect(harness.setSourceControlState).toHaveBeenCalledWith({
      currentCanonicalPath: "/team",
      targetScope: "subtree",
      resources: [
        expect.objectContaining({
          canonicalPath: "/team/page",
          status: "Conflict",
        }),
      ],
    });
  });

  it("keeps existing remote and conflict resources when no local changes remain", async () => {
    const remoteResource = {
      canonicalPath: "/team/remote",
      status: "RemoteChanged" as const,
      localFileUri: {
        scheme: "file",
        path: "/remote.md",
        fsPath: "/remote.md",
      },
      remoteUri: { scheme: "growi", path: "/team/remote.md" },
    };
    const harness = createHarness({
      currentState: {
        currentCanonicalPath: "/team",
        targetScope: "subtree",
        resources: [remoteResource],
      },
    });
    const { instanceKey } = seedManifest({
      files: harness.files,
      workspaceRoot: harness.workspaceRoot,
      baseUrl: harness.baseUrl,
      rootCanonicalPath: "/team",
      pages: [
        {
          canonicalPath: "/team/remote",
          relativeFilePath: "remote.md",
          body: "# original",
        },
      ],
    });
    const pagePath = buildMirrorPageFilePathWithInstanceKey(
      harness.workspaceRoot,
      instanceKey,
      "/team",
      "remote.md",
    );

    createMirrorLocalChangeMonitor(harness.deps);
    harness.listeners.change[0](createUri(pagePath));
    await vi.runOnlyPendingTimersAsync();

    expect(harness.setSourceControlState).toHaveBeenCalledWith({
      currentCanonicalPath: "/team",
      targetScope: "subtree",
      resources: [remoteResource],
    });
  });

  it("skips invalid manifests, unreadable files, and missing workspaces without changing state", async () => {
    const invalidHarness = createHarness();
    const invalidManifestPath = path.join(
      invalidHarness.workspaceRoot,
      ".growi-mirrors",
      buildInstanceKey(invalidHarness.baseUrl),
      "team",
      ".growi-mirror.json",
    );
    invalidHarness.files.set(invalidManifestPath, "{");

    createMirrorLocalChangeMonitor(invalidHarness.deps);
    invalidHarness.listeners.change[0](createUri(invalidManifestPath));
    await vi.runOnlyPendingTimersAsync();

    expect(invalidHarness.setSourceControlState).not.toHaveBeenCalled();

    const unreadableHarness = createHarness();
    const { instanceKey } = seedManifest({
      files: unreadableHarness.files,
      workspaceRoot: unreadableHarness.workspaceRoot,
      baseUrl: unreadableHarness.baseUrl,
      rootCanonicalPath: "/team",
      pages: [
        {
          canonicalPath: "/team/page",
          relativeFilePath: "page.md",
          body: "# original",
        },
      ],
    });
    const unreadablePagePath = buildMirrorPageFilePathWithInstanceKey(
      unreadableHarness.workspaceRoot,
      instanceKey,
      "/team",
      "page.md",
    );
    unreadableHarness.files.delete(unreadablePagePath);

    createMirrorLocalChangeMonitor(unreadableHarness.deps);
    unreadableHarness.listeners.change[0](createUri(unreadablePagePath));
    await vi.runOnlyPendingTimersAsync();

    expect(unreadableHarness.setSourceControlState).not.toHaveBeenCalled();

    const noWorkspaceHarness = createHarness({ workspaceFolders: [] });
    const disposable = createMirrorLocalChangeMonitor(noWorkspaceHarness.deps);

    expect(
      noWorkspaceHarness.deps.createFileSystemWatcher,
    ).not.toHaveBeenCalled();
    disposable.dispose();
  });

  it("does not update after dispose", async () => {
    const harness = createHarness();
    const { instanceKey } = seedManifest({
      files: harness.files,
      workspaceRoot: harness.workspaceRoot,
      baseUrl: harness.baseUrl,
      rootCanonicalPath: "/team",
      pages: [
        {
          canonicalPath: "/team/page",
          relativeFilePath: "page.md",
          body: "# original",
        },
      ],
    });
    const pagePath = buildMirrorPageFilePathWithInstanceKey(
      harness.workspaceRoot,
      instanceKey,
      "/team",
      "page.md",
    );
    harness.files.set(pagePath, "# edited");

    const disposable = createMirrorLocalChangeMonitor(harness.deps);
    harness.listeners.change[0](createUri(pagePath));
    disposable.dispose();
    await vi.runOnlyPendingTimersAsync();

    expect(harness.setSourceControlState).not.toHaveBeenCalled();
    expect(harness.watcher.dispose).toHaveBeenCalledTimes(1);
  });
});
