import * as vscode from "vscode";

export const GROWI_EXPLORER_VIEW_ID = "growi.explorer";

export interface PrefixTreeDeps {
  getRegisteredPrefixes(): readonly string[];
  readDirectory(
    uri: vscode.Uri,
  ): Thenable<readonly [string, vscode.FileType][]>;
}

export interface PrefixTreeItem extends vscode.TreeItem {
  kind: "directory" | "page";
  uri: vscode.Uri;
}

interface TreeEntryCandidate {
  kind: "directory" | "page";
  label: string;
  uri: vscode.Uri;
  hasDirectoryPage?: boolean;
}

function toPrefixUri(prefix: string): vscode.Uri {
  return vscode.Uri.parse(prefix === "/" ? "growi:/" : `growi:${prefix}/`);
}

function toChildUri(
  parent: vscode.Uri,
  name: string,
  type: vscode.FileType,
): vscode.Uri {
  const basePath = parent.path.endsWith("/") ? parent.path : `${parent.path}/`;
  const nextPath =
    type === vscode.FileType.Directory
      ? `${basePath}${name}/`
      : `${basePath}${name}`;
  return vscode.Uri.parse(`growi:${nextPath}`);
}

function createDirectoryItem(uri: vscode.Uri, label: string): PrefixTreeItem {
  const item = new vscode.TreeItem(
    label,
    vscode.TreeItemCollapsibleState.Collapsed,
  ) as PrefixTreeItem;
  item.kind = "directory";
  item.uri = uri;
  item.resourceUri = uri;
  item.contextValue = "growi.directory";
  item.iconPath = vscode.ThemeIcon.Folder;
  return item;
}

function createPrefixRootItem(uri: vscode.Uri, label: string): PrefixTreeItem {
  const item = createDirectoryItem(uri, label);
  item.contextValue = "growi.prefixRoot";
  return item;
}

function createDirectoryWithPageItem(
  uri: vscode.Uri,
  label: string,
): PrefixTreeItem {
  const item = createDirectoryItem(uri, label);
  item.contextValue = "growi.directoryWithPage";
  return item;
}

function createPageItem(uri: vscode.Uri, label: string): PrefixTreeItem {
  const item = new vscode.TreeItem(
    label,
    vscode.TreeItemCollapsibleState.None,
  ) as PrefixTreeItem;
  item.kind = "page";
  item.uri = uri;
  item.resourceUri = uri;
  item.contextValue = "growi.page";
  item.iconPath = vscode.ThemeIcon.File;
  item.command = {
    command: "vscode.open",
    title: "Open GROWI Page",
    arguments: [uri],
  };
  return item;
}

function buildChildCandidates(
  parent: vscode.Uri,
  entries: readonly [string, vscode.FileType][],
): TreeEntryCandidate[] {
  const directories = new Set(
    entries
      .filter(([, type]) => type === vscode.FileType.Directory)
      .map(([name]) => name),
  );

  const candidates: TreeEntryCandidate[] = [];
  for (const [name, type] of entries) {
    if (type === vscode.FileType.Directory) {
      candidates.push({
        kind: "directory",
        label: name,
        uri: toChildUri(parent, name, type),
        hasDirectoryPage: entries.some(
          ([fileName, fileType]) =>
            fileType === vscode.FileType.File && fileName === `${name}.md`,
        ),
      });
      continue;
    }

    if (name.endsWith(".md") && directories.has(name.slice(0, -3))) {
      continue;
    }

    candidates.push({
      kind: "page",
      label: name,
      uri: toChildUri(parent, name, type),
    });
  }

  return candidates;
}

export class GrowiPrefixTreeDataProvider
  implements vscode.TreeDataProvider<PrefixTreeItem>
{
  private readonly emitter = new vscode.EventEmitter<
    PrefixTreeItem | undefined | null
  >();

  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly deps: PrefixTreeDeps) {}

  refresh(item?: PrefixTreeItem): void {
    this.emitter.fire(item);
  }

  getTreeItem(element: PrefixTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: PrefixTreeItem): Promise<PrefixTreeItem[]> {
    if (!element) {
      return this.deps
        .getRegisteredPrefixes()
        .map((prefix) => createPrefixRootItem(toPrefixUri(prefix), prefix));
    }

    if (element.kind !== "directory") {
      return [];
    }

    const entries = await this.deps.readDirectory(element.uri);
    return buildChildCandidates(element.uri, entries).map((candidate) => {
      if (candidate.kind === "directory") {
        if (candidate.hasDirectoryPage) {
          return createDirectoryWithPageItem(candidate.uri, candidate.label);
        }
        return createDirectoryItem(candidate.uri, candidate.label);
      }
      return createPageItem(candidate.uri, candidate.label);
    });
  }
}

export function createGrowiPrefixTreeDataProvider(
  deps: PrefixTreeDeps,
): GrowiPrefixTreeDataProvider {
  return new GrowiPrefixTreeDataProvider(deps);
}
