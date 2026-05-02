import * as vscode from "vscode";
import { normalizeCanonicalPath } from "../core/uri";
import type { MirrorCompareScmState } from "./mirror/mirrorCompareScm";
import type { OpenedPageDecorationStatus } from "./pageFreshnessService";

export const GROWI_EXPLORER_VIEW_ID = "growi.explorer";
export const GROWI_LOAD_MORE_LISTING_COMMAND = "growi.loadMoreListing";
export const GROWI_EXPLORER_OPEN_PAGE_ITEM_COMMAND =
  "growi.explorerOpenPageItem";

export interface PrefixDirectoryListingState {
  partial: boolean;
  fetchedCount: number;
  hasMore: boolean;
}

export interface PrefixTreeDeps {
  getRegisteredPrefixes(): readonly string[];
  isBookmarked(canonicalPath: string): boolean;
  readDirectory(
    uri: vscode.Uri,
  ): Thenable<readonly [string, vscode.FileType][]>;
  getDirectoryListingState?(
    uri: vscode.Uri,
  ): PrefixDirectoryListingState | undefined;
}

export interface PrefixTreeItem extends vscode.TreeItem {
  kind: "directory" | "page" | "loadMore";
  uri: vscode.Uri;
  parentUri?: vscode.Uri;
}

interface TreeEntryCandidate {
  kind: "directory" | "page";
  label: string;
  uri: vscode.Uri;
  isDirectoryPage?: boolean;
}

const PAGE_DECORATION_PRESENTATIONS: Record<
  Exclude<OpenedPageDecorationStatus, "none">,
  { description: string; tooltip: string }
> = {
  remoteNewer: {
    description: "remote newer",
    tooltip:
      "GROWI 側が新しい状態です。Refresh Current Page で再読込してください。",
  },
  localChanges: {
    description: "ローカルの変更",
    tooltip:
      "ローカル側に GROWI へ未反映の変更があります。Compare Local Mirror with GROWI または GROWIに反映で確認してください。",
  },
  remoteChanges: {
    description: "GROWI側の変更",
    tooltip:
      "GROWI側の変更がローカルに未取り込みです。Compare Local Mirror with GROWI または ローカルに取り込むで確認してください。",
  },
  conflicts: {
    description: "競合",
    tooltip:
      "ローカル側と GROWI 側の両方に変更があります。Compare Local Mirror with GROWI で差分を確認してください。",
  },
};

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

function labelFromUri(uri: vscode.Uri): string {
  const normalized = normalizeCanonicalPath(uri.path);
  const path = normalized.ok ? normalized.value : uri.path.replace(/\/$/u, "");
  return path === "/" ? "/" : (path.split("/").filter(Boolean).at(-1) ?? path);
}

function buildPageContextValue(
  kind: "page" | "directoryPage",
  isBookmarked: boolean,
): string {
  if (kind === "page") {
    return isBookmarked ? "growi.pageBookmarked" : "growi.page";
  }
  return isBookmarked ? "growi.directoryPageBookmarked" : "growi.directoryPage";
}

function createPageItem(
  uri: vscode.Uri,
  label: string,
  isBookmarked: boolean,
): PrefixTreeItem {
  const item = new vscode.TreeItem(
    label,
    vscode.TreeItemCollapsibleState.None,
  ) as PrefixTreeItem;
  item.kind = "page";
  item.uri = uri;
  item.resourceUri = uri;
  item.contextValue = buildPageContextValue("page", isBookmarked);
  item.iconPath = vscode.ThemeIcon.File;
  item.command = {
    command: GROWI_EXPLORER_OPEN_PAGE_ITEM_COMMAND,
    title: "Open GROWI Page",
    arguments: [uri],
  };
  return item;
}

function createDirectoryPageItem(
  uri: vscode.Uri,
  label: string,
  isBookmarked: boolean,
): PrefixTreeItem {
  const item = createPageItem(uri, label, isBookmarked);
  item.contextValue = buildPageContextValue("directoryPage", isBookmarked);
  return item;
}

function createLoadMoreItem(
  parentUri: vscode.Uri,
  state: PrefixDirectoryListingState,
): PrefixTreeItem {
  const normalizedPath = normalizeCanonicalPath(parentUri.path);
  const targetPath = normalizedPath.ok ? normalizedPath.value : parentUri.path;
  const item = new vscode.TreeItem(
    "さらに読み込む",
    vscode.TreeItemCollapsibleState.None,
  ) as PrefixTreeItem;
  item.kind = "loadMore";
  item.uri = parentUri;
  item.parentUri = parentUri;
  item.contextValue = "growi.loadMore";
  item.iconPath = new vscode.ThemeIcon("cloud-download");
  item.description = `部分表示: ${targetPath}・取得済み ${state.fetchedCount} 件`;
  item.tooltip = `${targetPath} 配下の一部のみ表示しています。取得済み: ${state.fetchedCount} 件。選択するとこの階層の続きを取得します。`;
  item.command = {
    command: GROWI_LOAD_MORE_LISTING_COMMAND,
    title: "Load More GROWI Pages",
    arguments: [parentUri],
  };
  return item;
}

function isDecoratedPageItem(item: PrefixTreeItem): boolean {
  return (
    item.contextValue === "growi.page" ||
    item.contextValue === "growi.pageBookmarked" ||
    item.contextValue === "growi.directoryPage" ||
    item.contextValue === "growi.directoryPageBookmarked"
  );
}

function applyOpenedPageDecoration(
  item: PrefixTreeItem,
  canonicalPath: string,
  pageDecorationStatuses: ReadonlyMap<string, OpenedPageDecorationStatus>,
): PrefixTreeItem {
  if (!isDecoratedPageItem(item)) {
    return item;
  }

  const status = pageDecorationStatuses.get(canonicalPath);
  if (!status || status === "none") {
    return item;
  }

  const presentation = PAGE_DECORATION_PRESENTATIONS[status];
  item.iconPath = new vscode.ThemeIcon("warning");
  item.description = presentation.description;
  item.tooltip = presentation.tooltip;
  return item;
}

function getReservedDirectoryPageLabel(canonicalPath: string): string {
  if (canonicalPath === "/") {
    return "__root__.md";
  }

  const segments = canonicalPath.split("/").filter((segment) => segment.length);
  const basename = segments.at(-1) ?? "root";
  return `__${basename}__.md`;
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
      const directoryUri = toChildUri(parent, name, type);
      candidates.push({
        kind: "directory",
        label: name,
        uri: directoryUri,
      });

      if (
        entries.some(
          ([fileName, fileType]) =>
            fileType === vscode.FileType.File && fileName === `${name}.md`,
        )
      ) {
        const canonicalPath = directoryUri.path.endsWith("/")
          ? directoryUri.path.slice(0, -1)
          : directoryUri.path;
        candidates.push({
          kind: "page",
          label: getReservedDirectoryPageLabel(canonicalPath),
          uri: toChildUri(parent, `${name}.md`, vscode.FileType.File),
          isDirectoryPage: true,
        });
      }
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
  private readonly livePageDecorationStatuses = new Map<
    string,
    OpenedPageDecorationStatus
  >();
  private readonly compareSnapshotDecorationStatuses = new Map<
    string,
    Exclude<OpenedPageDecorationStatus, "none" | "remoteNewer">
  >();

  constructor(private readonly deps: PrefixTreeDeps) {}

  refresh(item?: PrefixTreeItem): void {
    this.emitter.fire(item);
  }

  setPageDecorationStatus(
    canonicalPath: string,
    status: OpenedPageDecorationStatus,
  ): void {
    const normalized = normalizeCanonicalPath(canonicalPath);
    if (!normalized.ok) {
      return;
    }

    if (status === "none") {
      this.livePageDecorationStatuses.delete(normalized.value);
      return;
    }

    this.livePageDecorationStatuses.set(normalized.value, status);
  }

  setCompareSnapshot(state: MirrorCompareScmState): void {
    this.compareSnapshotDecorationStatuses.clear();
    for (const resource of state.resources) {
      const normalized = normalizeCanonicalPath(resource.canonicalPath);
      if (!normalized.ok) {
        continue;
      }
      this.compareSnapshotDecorationStatuses.set(
        normalized.value,
        resource.status === "LocalChanged"
          ? "localChanges"
          : resource.status === "RemoteChanged"
            ? "remoteChanges"
            : "conflicts",
      );
    }
  }

  clearCompareSnapshot(): void {
    this.compareSnapshotDecorationStatuses.clear();
  }

  markCanonicalPathStale(canonicalPath: string): void {
    this.setPageDecorationStatus(canonicalPath, "remoteNewer");
  }

  clearStaleState(canonicalPath: string): void {
    const normalized = normalizeCanonicalPath(canonicalPath);
    if (!normalized.ok) {
      return;
    }

    const prefix = normalized.value;
    for (const staleCanonicalPath of [
      ...this.livePageDecorationStatuses.keys(),
    ]) {
      if (
        staleCanonicalPath === prefix ||
        staleCanonicalPath.startsWith(`${prefix}/`)
      ) {
        this.livePageDecorationStatuses.delete(staleCanonicalPath);
      }
    }
  }

  getTreeItem(element: PrefixTreeItem): vscode.TreeItem {
    return element;
  }

  getParent(element: PrefixTreeItem): PrefixTreeItem | undefined {
    const parentUri = element.parentUri;
    if (!parentUri || parentUri.toString() === element.uri.toString()) {
      return undefined;
    }
    const parentPath = normalizeCanonicalPath(parentUri.path);
    const isPrefixRoot =
      parentPath.ok &&
      this.deps.getRegisteredPrefixes().includes(parentPath.value);
    return isPrefixRoot
      ? createPrefixRootItem(parentUri, parentPath.value)
      : createDirectoryItem(parentUri, labelFromUri(parentUri));
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
    const candidates = buildChildCandidates(element.uri, entries);
    if (element.contextValue === "growi.prefixRoot") {
      const canonicalPath = element.uri.path.endsWith("/")
        ? element.uri.path.slice(0, -1) || "/"
        : element.uri.path;
      candidates.unshift({
        kind: "page",
        label: getReservedDirectoryPageLabel(canonicalPath),
        uri: vscode.Uri.parse(
          canonicalPath === "/" ? "growi:/.md" : `growi:${canonicalPath}.md`,
        ),
        isDirectoryPage: true,
      });
    }

    const decorationStatuses = this.buildDecorationStatuses();
    const items = candidates.map((candidate) => {
      let item: PrefixTreeItem;
      if (candidate.kind === "directory") {
        item = createDirectoryItem(candidate.uri, candidate.label);
        item.parentUri = element.uri;
        return item;
      }
      const canonicalPath = normalizeCanonicalPath(candidate.uri.path);
      const normalizedPath = canonicalPath.ok ? canonicalPath.value : undefined;
      const bookmarked = normalizedPath
        ? this.deps.isBookmarked(normalizedPath)
        : false;
      if (candidate.isDirectoryPage) {
        item = applyOpenedPageDecoration(
          createDirectoryPageItem(candidate.uri, candidate.label, bookmarked),
          normalizedPath ?? "",
          decorationStatuses,
        );
        item.parentUri = element.uri;
        return item;
      }
      item = applyOpenedPageDecoration(
        createPageItem(candidate.uri, candidate.label, bookmarked),
        normalizedPath ?? "",
        decorationStatuses,
      );
      item.parentUri = element.uri;
      return item;
    });
    const listingState = this.deps.getDirectoryListingState?.(element.uri);
    if (listingState?.hasMore) {
      items.push(createLoadMoreItem(element.uri, listingState));
    }
    return items;
  }

  private buildDecorationStatuses(): ReadonlyMap<
    string,
    OpenedPageDecorationStatus
  > {
    const merged = new Map<string, OpenedPageDecorationStatus>();

    for (const [canonicalPath, status] of this
      .compareSnapshotDecorationStatuses) {
      merged.set(canonicalPath, status);
    }

    for (const [canonicalPath, status] of this.livePageDecorationStatuses) {
      if (status === "remoteNewer") {
        if (!merged.has(canonicalPath)) {
          merged.set(canonicalPath, status);
        }
        continue;
      }
      merged.set(canonicalPath, status);
    }

    return merged;
  }
}

export function createGrowiPrefixTreeDataProvider(
  deps: PrefixTreeDeps,
): GrowiPrefixTreeDataProvider {
  return new GrowiPrefixTreeDataProvider(deps);
}
