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
    ThemeIcon: {
      File: { id: "file" },
      Folder: { id: "folder" },
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

  it("uses __root__.md as the synthetic page label for the slash prefix", async () => {
    const provider = createGrowiPrefixTreeDataProvider({
      getRegisteredPrefixes: () => ["/"],
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

  it("assigns vscode.open command to page items", async () => {
    const provider = createGrowiPrefixTreeDataProvider({
      getRegisteredPrefixes: () => ["/team"],
      readDirectory: vi.fn(async () =>
        createDirectoryEntries([["spec.md", vscode.FileType.File]]),
      ),
    });

    const [root] = await provider.getChildren();
    const [page] = await provider.getChildren(root);

    expect(page.command).toEqual({
      command: "vscode.open",
      title: "Open GROWI Page",
      arguments: [page.uri],
    });
  });

  it("fires refresh events", async () => {
    const provider = createGrowiPrefixTreeDataProvider({
      getRegisteredPrefixes: () => [],
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
      readDirectory: vi.fn(),
    });
    const page = {
      kind: "page",
      label: "spec.md",
      uri: vscode.Uri.parse("growi:/team/spec.md"),
    } as PrefixTreeItem;

    await expect(provider.getChildren(page)).resolves.toEqual([]);
  });
});
