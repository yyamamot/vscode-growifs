import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => {
  class EventEmitter<T> {
    private listener: ((event: T) => void) | undefined;

    event = vi.fn((listener: (event: T) => void) => {
      this.listener = listener;
      return { dispose: vi.fn() };
    });

    fire = vi.fn((event: T) => {
      this.listener?.(event);
    });

    dispose = vi.fn();
  }

  class TreeItem {
    label: string;
    collapsibleState: number;
    resourceUri?: { scheme: string; path: string; toString(): string };
    contextValue?: string;
    iconPath?: unknown;
    description?: string;
    tooltip?: unknown;
    command?: { command: string; title: string; arguments?: unknown[] };

    constructor(label: string, collapsibleState: number) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  const parseUri = (value: string) => {
    const separator = value.indexOf(":");
    const scheme = separator >= 0 ? value.slice(0, separator) : "";
    const path = separator >= 0 ? value.slice(separator + 1) : value;
    return {
      scheme,
      path,
      toString: () => value,
    };
  };

  return {
    EventEmitter,
    FileType: {
      File: 1,
      Directory: 2,
    },
    ThemeIcon: class {
      static File = { id: "file" };
      static Folder = { id: "folder" };
      static Warning = { id: "warning" };
      id: string;

      constructor(id: string) {
        this.id = id;
      }
    },
    TreeItem,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    Uri: {
      parse: vi.fn(parseUri),
    },
  };
});

import * as vscode from "vscode";
import {
  createGrowiPrefixTreeDataProvider,
  type PrefixTreeItem,
} from "../../src/vscode/prefixTree";

function createDirectoryEntries(
  entries: [string, vscode.FileType][],
): readonly [string, vscode.FileType][] {
  return entries;
}

describe("GrowiPrefixTreeDataProvider", () => {
  it("returns registered prefixes as root directory items", async () => {
    const provider = createGrowiPrefixTreeDataProvider({
      getRegisteredPrefixes: () => ["/team/dev", "/team/ops"],
      isBookmarked: vi.fn(() => false),
      readDirectory: vi.fn(),
    });

    const children = await provider.getChildren();

    expect(children.map((item) => item.label)).toEqual([
      "/team/dev",
      "/team/ops",
    ]);
    expect(children.every((item) => item.kind === "directory")).toBe(true);
    expect(children.map((item) => item.contextValue)).toEqual([
      "growi.prefixRoot",
      "growi.prefixRoot",
    ]);
    expect(children.map((item) => item.uri.toString())).toEqual([
      "growi:/team/dev/",
      "growi:/team/ops/",
    ]);
  });

  it("builds page and directory children from growi readDirectory entries", async () => {
    const provider = createGrowiPrefixTreeDataProvider({
      getRegisteredPrefixes: () => ["/team"],
      isBookmarked: vi.fn(() => false),
      readDirectory: vi.fn(async () =>
        createDirectoryEntries([
          ["dev", vscode.FileType.Directory],
          ["dev.md", vscode.FileType.File],
        ]),
      ),
    });

    const [root] = await provider.getChildren();
    const children = await provider.getChildren(root);

    expect(children.map((item) => [item.label, item.kind])).toEqual([
      ["__team__.md", "page"],
      ["dev", "directory"],
      ["__dev__.md", "page"],
    ]);
    expect(children.map((item) => item.contextValue)).toEqual([
      "growi.directoryPage",
      "growi.directory",
      "growi.directoryPage",
    ]);
    expect(children.map((item) => item.uri.toString())).toEqual([
      "growi:/team.md",
      "growi:/team/dev/",
      "growi:/team/dev.md",
    ]);
  });

  it("keeps standalone directories and pages visible when there is no name collision", async () => {
    const provider = createGrowiPrefixTreeDataProvider({
      getRegisteredPrefixes: () => ["/team"],
      isBookmarked: vi.fn(() => false),
      readDirectory: vi.fn(async () =>
        createDirectoryEntries([
          ["docs", vscode.FileType.Directory],
          ["guide.md", vscode.FileType.File],
        ]),
      ),
    });

    const [root] = await provider.getChildren();
    const children = await provider.getChildren(root);

    expect(children.map((item) => [item.label, item.kind])).toEqual([
      ["__team__.md", "page"],
      ["docs", "directory"],
      ["guide.md", "page"],
    ]);
    expect(children.map((item) => item.contextValue)).toEqual([
      "growi.directoryPage",
      "growi.directory",
      "growi.page",
    ]);
  });

  it("appends load more item for partial directory listings", async () => {
    const provider = createGrowiPrefixTreeDataProvider({
      getRegisteredPrefixes: () => ["/team"],
      isBookmarked: vi.fn(() => false),
      readDirectory: vi.fn(async () =>
        createDirectoryEntries([["spec.md", vscode.FileType.File]]),
      ),
      getDirectoryListingState: vi.fn(() => ({
        partial: true,
        fetchedCount: 100,
        hasMore: true,
      })),
    });

    const [root] = await provider.getChildren();
    const children = await provider.getChildren(root);

    const loadMore = children.at(-1);
    expect(loadMore?.kind).toBe("loadMore");
    expect(loadMore?.label).toBe("Load More");
    expect(loadMore?.description).toBe("Partial: /team / fetched 100");
    expect(loadMore?.tooltip).toBe(
      "Only part of /team is shown. Fetched: 100. Select this item to fetch more in this hierarchy.",
    );
    expect(loadMore?.contextValue).toBe("growi.loadMore");
    expect(loadMore?.command).toEqual({
      command: "growi.loadMoreListing",
      title: "Load More GROWI Pages",
      arguments: [root.uri],
    });
  });

  it("uses __root__.md as the synthetic page label for the slash prefix", async () => {
    const provider = createGrowiPrefixTreeDataProvider({
      getRegisteredPrefixes: () => ["/"],
      isBookmarked: vi.fn(() => false),
      readDirectory: vi.fn(async () =>
        createDirectoryEntries([["guide.md", vscode.FileType.File]]),
      ),
    });

    const [root] = await provider.getChildren();
    const children = await provider.getChildren(root);

    expect(children[0]?.label).toBe("__root__.md");
    expect(children[0]?.contextValue).toBe("growi.directoryPage");
    expect(children[0]?.uri.toString()).toBe("growi:/.md");
  });

  it("assigns the explorer open wrapper command to page items", async () => {
    const provider = createGrowiPrefixTreeDataProvider({
      getRegisteredPrefixes: () => ["/team"],
      isBookmarked: vi.fn(() => false),
      readDirectory: vi.fn(async () =>
        createDirectoryEntries([["spec.md", vscode.FileType.File]]),
      ),
    });

    const [root] = await provider.getChildren();
    const [page] = await provider.getChildren(root);

    expect(page.command).toEqual({
      command: "growi.explorerOpenPageItem",
      title: "Open GROWI Page",
      arguments: [page.uri],
    });
  });

  it("renders opened page decoration states with warning decoration", async () => {
    const provider = createGrowiPrefixTreeDataProvider({
      getRegisteredPrefixes: () => ["/team/dev"],
      isBookmarked: vi.fn(() => false),
      readDirectory: vi.fn(async () =>
        createDirectoryEntries([
          ["conflict.md", vscode.FileType.File],
          ["remote.md", vscode.FileType.File],
          ["spec.md", vscode.FileType.File],
        ]),
      ),
    });

    provider.markCanonicalPathStale("/team/dev/spec");
    provider.setPageDecorationStatus("/team/dev/remote", "remoteChanges");
    provider.setPageDecorationStatus("/team/dev/conflict", "conflicts");

    const [root] = await provider.getChildren();
    const children = await provider.getChildren(root);
    const stalePage = children.find(
      (item) => item.uri.path === "/team/dev/spec.md",
    );
    const remoteChangedPage = children.find(
      (item) => item.uri.path === "/team/dev/remote.md",
    );
    const conflictPage = children.find(
      (item) => item.uri.path === "/team/dev/conflict.md",
    );

    expect(stalePage?.label).toBe("spec.md");
    expect(stalePage?.contextValue).toBe("growi.page");
    expect((stalePage?.iconPath as { id?: string } | undefined)?.id).toBe(
      "warning",
    );
    expect(stalePage?.description).toBe("remote newer");
    expect(stalePage?.tooltip).toBe(
      "GROWI has a newer version. Reload with Refresh Current Page.",
    );
    expect(remoteChangedPage?.description).toBe("GROWI Changes");
    expect(remoteChangedPage?.tooltip).toBe(
      "GROWI changes have not been taken into local files. Check with Compare Local Mirror with GROWI or Take into Local.",
    );
    expect(conflictPage?.description).toBe("Conflicts");
    expect(conflictPage?.tooltip).toBe(
      "Both local and GROWI have changes. Check diffs with Compare Local Mirror with GROWI.",
    );
  });

  it("clears stale decorations for matching canonical paths", async () => {
    const provider = createGrowiPrefixTreeDataProvider({
      getRegisteredPrefixes: () => ["/team"],
      isBookmarked: vi.fn(() => false),
      readDirectory: vi.fn(async () =>
        createDirectoryEntries([
          ["dev", vscode.FileType.Directory],
          ["dev.md", vscode.FileType.File],
        ]),
      ),
    });

    provider.markCanonicalPathStale("/team/dev");
    provider.clearStaleState("/team");

    const [root] = await provider.getChildren();
    const children = await provider.getChildren(root);
    const stalePage = children.find((item) => item.uri.path === "/team/dev.md");

    expect((stalePage?.iconPath as { id?: string } | undefined)?.id).not.toBe(
      "warning",
    );
    expect(stalePage?.description).toBeUndefined();
    expect(stalePage?.tooltip).toBeUndefined();
  });

  it("prefers live status over compare snapshot and falls back to snapshot over remote newer", async () => {
    const provider = createGrowiPrefixTreeDataProvider({
      getRegisteredPrefixes: () => ["/team/dev"],
      isBookmarked: vi.fn(() => false),
      readDirectory: vi.fn(async () =>
        createDirectoryEntries([
          ["conflict.md", vscode.FileType.File],
          ["remote.md", vscode.FileType.File],
        ]),
      ),
    });

    provider.setCompareSnapshot({
      currentCanonicalPath: "/team/dev",
      targetScope: "subtree",
      resources: [
        {
          canonicalPath: "/team/dev/conflict",
          status: "LocalChanged",
          localFileUri: {
            scheme: "file",
            path: "/tmp/conflict.md",
            fsPath: "/tmp/conflict.md",
          },
          remoteUri: {
            scheme: "growi",
            path: "/team/dev/conflict.md",
          },
        },
        {
          canonicalPath: "/team/dev/remote",
          status: "RemoteChanged",
          localFileUri: {
            scheme: "file",
            path: "/tmp/remote.md",
            fsPath: "/tmp/remote.md",
          },
          remoteUri: {
            scheme: "growi",
            path: "/team/dev/remote.md",
          },
        },
      ],
    });
    provider.setPageDecorationStatus("/team/dev/conflict", "conflicts");
    provider.setPageDecorationStatus("/team/dev/remote", "remoteNewer");

    const [root] = await provider.getChildren();
    const children = await provider.getChildren(root);
    const conflictPage = children.find(
      (item) => item.uri.path === "/team/dev/conflict.md",
    );
    const remotePage = children.find(
      (item) => item.uri.path === "/team/dev/remote.md",
    );

    expect(conflictPage?.description).toBe("Conflicts");
    expect(remotePage?.description).toBe("GROWI Changes");

    provider.clearCompareSnapshot();

    const clearedChildren = await provider.getChildren(root);
    const clearedRemotePage = clearedChildren.find(
      (item) => item.uri.path === "/team/dev/remote.md",
    );
    expect(clearedRemotePage?.description).toBe("remote newer");
  });

  it("fires refresh events", async () => {
    const provider = createGrowiPrefixTreeDataProvider({
      getRegisteredPrefixes: () => [],
      isBookmarked: vi.fn(() => false),
      readDirectory: vi.fn(),
    });
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);

    provider.refresh();

    expect(listener).toHaveBeenCalledWith(undefined);
  });

  it("returns no children for page items", async () => {
    const provider = createGrowiPrefixTreeDataProvider({
      getRegisteredPrefixes: () => [],
      isBookmarked: vi.fn(() => false),
      readDirectory: vi.fn(),
    });
    const page = {
      kind: "page",
      label: "spec.md",
      uri: vscode.Uri.parse("growi:/team/spec.md"),
    } as PrefixTreeItem;

    await expect(provider.getChildren(page)).resolves.toEqual([]);
  });

  it("marks bookmarked pages in the tree item context value", async () => {
    const provider = createGrowiPrefixTreeDataProvider({
      getRegisteredPrefixes: () => ["/team"],
      isBookmarked: vi.fn(
        (canonicalPath: string) =>
          canonicalPath === "/team" || canonicalPath === "/team/guide",
      ),
      readDirectory: vi.fn(async () =>
        createDirectoryEntries([
          ["docs", vscode.FileType.Directory],
          ["docs.md", vscode.FileType.File],
          ["guide.md", vscode.FileType.File],
        ]),
      ),
    });

    const [root] = await provider.getChildren();
    const children = await provider.getChildren(root);

    expect(children.map((item) => item.contextValue)).toEqual([
      "growi.directoryPageBookmarked",
      "growi.directory",
      "growi.directoryPage",
      "growi.pageBookmarked",
    ]);
  });
});
