import * as vscode from "vscode";

import { normalizeCanonicalPath } from "../core/uri";
import {
  type CommandRegistrar,
  combineDisposables,
  registerExplorerCommands,
} from "./commandRegistration";
import {
  createExplorerCompareLocalMirrorSubtreeWithGrowiCommand,
  createExplorerCompareLocalMirrorWithGrowiCommand,
  createExplorerCreateLocalMirrorForCurrentPageCommand,
  createExplorerCreateLocalMirrorForCurrentPrefixCommand,
  createExplorerCreatePageHereCommand,
  createExplorerDeletePageCommand,
  createExplorerOpenPageInBrowserCommand,
  createExplorerOpenPageItemCommand,
  createExplorerRefreshCurrentPageCommand,
  createExplorerRenamePageCommand,
  createExplorerShowBacklinksCommand,
  createExplorerShowCurrentPageAttachmentsCommand,
  createExplorerShowCurrentPageInfoCommand,
  createExplorerShowRevisionHistoryDiffCommand,
  createExplorerUploadLocalMirrorSubtreeToGrowiCommand,
  createExplorerUploadLocalMirrorToGrowiCommand,
} from "./commands";
import { GROWI_COMMANDS } from "./commandsConstants";
import type { CommandDeps } from "./commandsTypes";
import {
  createGrowiPrefixTreeDataProvider,
  GROWI_EXPLORER_VIEW_ID,
  GROWI_LOAD_MORE_LISTING_COMMAND,
  type GrowiPrefixTreeDataProvider,
  type PrefixTreeDeps,
  type PrefixTreeItem,
} from "./prefixTree";

export type ExplorerItemActionsTarget =
  | vscode.Uri
  | {
      uri?: vscode.Uri | { scheme?: string; path?: string };
      contextValue?: string;
    }
  | undefined;

type ExplorerItemActionQuickPickItem = vscode.QuickPickItem & {
  command: string;
};

type GrowiExplorerTreeView = {
  readonly selection: readonly PrefixTreeItem[];
  onDidChangeSelection(
    listener: (event: { selection: readonly PrefixTreeItem[] }) => unknown,
  ): vscode.Disposable;
  reveal(
    element: PrefixTreeItem,
    options?: { select?: boolean; focus?: boolean; expand?: boolean | number },
  ): Thenable<void>;
  dispose(): void;
};

interface RegisterExplorerCommandsInput {
  commandDeps: CommandDeps;
  tracedCommandRegistrar: CommandRegistrar;
}

interface RegisterLoadMoreListingCommandInput {
  loadMoreReadDirectory(uri: vscode.Uri): Promise<void>;
  showErrorMessage(message: string): void;
}

interface GrowiExplorerFeature {
  prefixTreeDataProvider: GrowiPrefixTreeDataProvider;
  refresh(): void;
  registerTreeView(): vscode.Disposable;
  registerExplorerCommands(
    input: RegisterExplorerCommandsInput,
  ): vscode.Disposable;
  registerLoadMoreListingCommand(
    input: RegisterLoadMoreListingCommandInput,
  ): vscode.Disposable;
  registerTestSupportCommands(
    commandDeps: Pick<CommandDeps, "isBookmarked">,
  ): vscode.Disposable;
}

function normalizeUiReviewTreeCanonicalPath(uri: vscode.Uri | undefined) {
  const pathname = uri?.path;
  if (!pathname) {
    return undefined;
  }
  if (pathname.endsWith(".md")) {
    return pathname.slice(0, -3) || "/";
  }
  if (pathname.endsWith("/")) {
    return pathname.slice(0, -1) || "/";
  }
  return pathname;
}

async function collectUiReviewTreeItems(
  provider: vscode.TreeDataProvider<unknown>,
  maxDepth: number,
) {
  const collected: Array<Record<string, unknown>> = [];

  async function visit(
    items: readonly unknown[] | undefined,
    depth: number,
    parentUri: string | undefined,
  ) {
    for (const item of items ?? []) {
      const treeItem = item as {
        command?: { command?: string };
        contextValue?: string;
        description?: string | boolean;
        kind?: string;
        label?: string | vscode.TreeItemLabel;
        uri?: vscode.Uri;
      };
      const label =
        typeof treeItem.label === "string"
          ? treeItem.label
          : treeItem.label?.label;
      collected.push({
        label,
        kind: treeItem.kind,
        uri: treeItem.uri?.toString(),
        canonicalPath: normalizeUiReviewTreeCanonicalPath(treeItem.uri),
        contextValue: treeItem.contextValue,
        description: treeItem.description,
        command: treeItem.command?.command,
        depth,
        parentUri,
      });

      if (treeItem.kind === "directory" && depth < maxDepth) {
        const children = await provider.getChildren?.(item);
        await visit(children ?? [], depth + 1, treeItem.uri?.toString());
      }
    }
  }

  const roots = await provider.getChildren?.();
  await visit(roots ?? [], 0, undefined);
  return collected;
}

function createExplorerItemActionsTargetFromTreeItem(
  item: unknown,
): ExplorerItemActionsTarget {
  if (!item || typeof item !== "object") {
    return undefined;
  }
  const candidate = item as {
    uri?: unknown;
    contextValue?: unknown;
  };
  if (!candidate.uri) {
    return undefined;
  }
  return {
    uri: candidate.uri as vscode.Uri | { scheme?: string; path?: string },
    contextValue:
      typeof candidate.contextValue === "string"
        ? candidate.contextValue
        : undefined,
  };
}

function coerceExplorerItemActionsUri(value: unknown): vscode.Uri | undefined {
  if (
    value &&
    typeof value === "object" &&
    "scheme" in value &&
    typeof value.scheme === "string" &&
    "path" in value &&
    typeof value.path === "string"
  ) {
    const uriFrom = (
      vscode.Uri as typeof vscode.Uri & {
        from?: (components: { scheme: string; path: string }) => vscode.Uri;
      }
    ).from;
    return typeof uriFrom === "function"
      ? uriFrom({ scheme: value.scheme, path: value.path })
      : (value as vscode.Uri);
  }
  return undefined;
}

function resolveExplorerItemActionsUri(
  target: ExplorerItemActionsTarget,
): vscode.Uri | undefined {
  const directUri = coerceExplorerItemActionsUri(target);
  if (directUri) {
    return directUri;
  }
  const uri = target && "uri" in target ? target.uri : undefined;
  return coerceExplorerItemActionsUri(uri);
}

function canonicalPathFromExplorerItemActionsUri(uri: vscode.Uri | undefined) {
  if (!uri || uri.scheme !== "growi") {
    return undefined;
  }
  const rawPath = uri.path.endsWith(".md") ? uri.path.slice(0, -3) : uri.path;
  const normalized = normalizeCanonicalPath(rawPath);
  return normalized.ok ? normalized.value : undefined;
}

function createExplorerActionItem(
  label: string,
  command: string,
  description?: string,
): ExplorerItemActionQuickPickItem {
  return description === undefined
    ? { label, command }
    : { label, command, description };
}

function buildExplorerItemActionItems(
  contextValue: string | undefined,
  isBookmarked: boolean,
): ExplorerItemActionQuickPickItem[] {
  if (contextValue === "growi.loadMore") {
    return [];
  }

  if (contextValue === "growi.directory") {
    return [
      createExplorerActionItem(
        "ここに作成",
        GROWI_COMMANDS.explorerCreatePageHere,
      ),
      createExplorerActionItem(
        "配下ページの差分を確認",
        GROWI_COMMANDS.explorerCompareLocalMirrorSubtreeWithGrowi,
      ),
    ];
  }

  if (contextValue === "growi.prefixRoot") {
    return [
      createExplorerActionItem(
        "Prefix ページを開く",
        GROWI_COMMANDS.openPrefixRootPage,
      ),
      createExplorerActionItem(
        "ブラウザで表示",
        GROWI_COMMANDS.explorerOpenPageInBrowser,
      ),
      createExplorerActionItem(
        "ここに作成",
        GROWI_COMMANDS.explorerCreatePageHere,
      ),
      createExplorerActionItem(
        "配下ページをローカルに同期",
        GROWI_COMMANDS.explorerCreateLocalMirrorForCurrentPrefix,
      ),
      createExplorerActionItem(
        "配下ページの差分を確認",
        GROWI_COMMANDS.explorerCompareLocalMirrorSubtreeWithGrowi,
      ),
      createExplorerActionItem(
        "プレフィックスを削除",
        GROWI_COMMANDS.deletePrefix,
      ),
    ];
  }

  const pageActions = [
    createExplorerActionItem(
      "ブラウザで表示",
      GROWI_COMMANDS.explorerOpenPageInBrowser,
    ),
    createExplorerActionItem(
      "ページを更新",
      GROWI_COMMANDS.explorerRefreshCurrentPage,
    ),
    createExplorerActionItem(
      "ページ詳細を開く",
      GROWI_COMMANDS.openCurrentPageHub,
    ),
    createExplorerActionItem(
      "ここに作成",
      GROWI_COMMANDS.explorerCreatePageHere,
    ),
    createExplorerActionItem(
      "ページ名を変更",
      GROWI_COMMANDS.explorerRenamePage,
    ),
    createExplorerActionItem(
      isBookmarked ? "ブックマークから削除" : "ブックマークに追加",
      isBookmarked
        ? GROWI_COMMANDS.removeCurrentPageBookmark
        : GROWI_COMMANDS.addCurrentPageBookmark,
    ),
    createExplorerActionItem(
      "このページをローカルに同期",
      GROWI_COMMANDS.explorerCreateLocalMirrorForCurrentPage,
    ),
    createExplorerActionItem(
      "このページの差分を確認",
      GROWI_COMMANDS.explorerCompareLocalMirrorWithGrowi,
    ),
    createExplorerActionItem("ページを削除", GROWI_COMMANDS.explorerDeletePage),
  ];

  if (
    contextValue === "growi.directoryPage" ||
    contextValue === "growi.directoryPageBookmarked"
  ) {
    pageActions.splice(
      10,
      0,
      createExplorerActionItem(
        "配下ページをローカルに同期",
        GROWI_COMMANDS.explorerCreateLocalMirrorForCurrentPrefix,
      ),
    );
  }

  return pageActions;
}

function showExplorerItemActionsQuickPick(
  target: ExplorerItemActionsTarget,
  options: {
    isBookmarked(canonicalPath: string): boolean;
    executeCommand(command: string, ...args: unknown[]): Promise<void>;
    showErrorMessage(message: string): void;
  },
) {
  const targetUri = resolveExplorerItemActionsUri(target);
  const contextValue =
    target && "contextValue" in target ? target.contextValue : undefined;
  const canonicalPath = canonicalPathFromExplorerItemActionsUri(targetUri);
  const isBookmarked = canonicalPath
    ? options.isBookmarked(canonicalPath)
    : false;
  const items = buildExplorerItemActionItems(contextValue, isBookmarked);

  if (!targetUri || items.length === 0) {
    options.showErrorMessage(
      "Tree item actions は GROWI Explorer の操作可能な item でのみ表示できます。",
    );
    return;
  }

  const quickPick =
    vscode.window.createQuickPick<ExplorerItemActionQuickPickItem>();
  quickPick.ignoreFocusOut = true;
  quickPick.placeholder = canonicalPath
    ? `Tree item action を選択してください: ${canonicalPath}`
    : "Tree item action を選択してください。";
  quickPick.items = items;
  quickPick.onDidAccept(() => {
    const selected = quickPick.selectedItems[0];
    quickPick.hide();
    quickPick.dispose();
    if (!selected) {
      return;
    }
    void options.executeCommand(selected.command, {
      uri: targetUri,
      contextValue,
    });
  });
  quickPick.onDidHide(() => {
    quickPick.dispose();
  });
  quickPick.show();
}

function registerGrowiExplorerTreeView(
  treeDataProvider: vscode.TreeDataProvider<PrefixTreeItem>,
  onSelectionChanged: (target: ExplorerItemActionsTarget) => void,
  onTreeViewCreated: (treeView: GrowiExplorerTreeView | undefined) => void,
): vscode.Disposable {
  const windowWithTreeView = vscode.window as typeof vscode.window & {
    createTreeView?: <T>(
      viewId: string,
      options: { treeDataProvider: vscode.TreeDataProvider<T> },
    ) => GrowiExplorerTreeView;
    registerTreeDataProvider?: (
      viewId: string,
      treeDataProvider: vscode.TreeDataProvider<unknown>,
    ) => vscode.Disposable;
  };

  if (typeof windowWithTreeView.createTreeView === "function") {
    const treeView = windowWithTreeView.createTreeView(GROWI_EXPLORER_VIEW_ID, {
      treeDataProvider,
    });
    onTreeViewCreated(treeView);
    onSelectionChanged(
      createExplorerItemActionsTargetFromTreeItem(treeView.selection[0]),
    );
    const selectionDisposable = treeView.onDidChangeSelection((event) => {
      onSelectionChanged(
        createExplorerItemActionsTargetFromTreeItem(event.selection[0]),
      );
    });
    return {
      dispose() {
        selectionDisposable.dispose();
        treeView.dispose();
        onTreeViewCreated(undefined);
      },
    };
  }

  onTreeViewCreated(undefined);
  return (
    windowWithTreeView.registerTreeDataProvider?.(
      GROWI_EXPLORER_VIEW_ID,
      treeDataProvider,
    ) ?? { dispose() {} }
  );
}

async function findPrefixTreeItemByCanonicalPath(
  treeDataProvider: vscode.TreeDataProvider<PrefixTreeItem>,
  canonicalPath: string,
): Promise<PrefixTreeItem | undefined> {
  const target = normalizeCanonicalPath(canonicalPath);
  if (!target.ok) {
    return undefined;
  }
  const queue = [...((await treeDataProvider.getChildren?.()) ?? [])];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) {
      continue;
    }
    const itemPath = canonicalPathFromExplorerItemActionsUri(item.uri);
    if (itemPath === target.value) {
      return item;
    }
    const key = item.uri.toString();
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);
    if (item.kind === "directory") {
      queue.push(...((await treeDataProvider.getChildren?.(item)) ?? []));
    }
  }
  return undefined;
}

export function createGrowiExplorerFeature(
  prefixTreeDeps: PrefixTreeDeps,
): GrowiExplorerFeature {
  const prefixTreeDataProvider =
    createGrowiPrefixTreeDataProvider(prefixTreeDeps);
  let selectedExplorerItemActionsTarget: ExplorerItemActionsTarget;
  let growiExplorerTreeView: GrowiExplorerTreeView | undefined;

  return {
    prefixTreeDataProvider,
    refresh() {
      prefixTreeDataProvider.refresh();
    },
    registerTreeView() {
      return registerGrowiExplorerTreeView(
        prefixTreeDataProvider,
        (target) => {
          selectedExplorerItemActionsTarget = target;
        },
        (treeView) => {
          growiExplorerTreeView = treeView;
        },
      );
    },
    registerExplorerCommands({ commandDeps, tracedCommandRegistrar }) {
      return registerExplorerCommands([
        {
          commandId: "growi.showExplorerItemActions",
          handler: async (target?: unknown) => {
            const resolvedTarget =
              target === undefined
                ? selectedExplorerItemActionsTarget
                : (target as ExplorerItemActionsTarget);
            showExplorerItemActionsQuickPick(resolvedTarget, {
              isBookmarked(canonicalPath: string) {
                return commandDeps.isBookmarked(canonicalPath);
              },
              async executeCommand(command: string, ...args: unknown[]) {
                await vscode.commands.executeCommand(command, ...args);
              },
              showErrorMessage(message: string) {
                commandDeps.showErrorMessage(message);
              },
            });
          },
        },
        {
          commandId: GROWI_COMMANDS.explorerOpenPageItem,
          handler: createExplorerOpenPageItemCommand(commandDeps),
        },
        {
          commandId: GROWI_COMMANDS.explorerOpenPageInBrowser,
          handler: createExplorerOpenPageInBrowserCommand(commandDeps),
          registrar: tracedCommandRegistrar,
        },
        {
          commandId: GROWI_COMMANDS.explorerCreatePageHere,
          handler: createExplorerCreatePageHereCommand(commandDeps),
        },
        {
          commandId: GROWI_COMMANDS.explorerRenamePage,
          handler: createExplorerRenamePageCommand(commandDeps),
        },
        {
          commandId: GROWI_COMMANDS.explorerDeletePage,
          handler: createExplorerDeletePageCommand(commandDeps),
        },
        {
          commandId: GROWI_COMMANDS.explorerRefreshCurrentPage,
          handler: createExplorerRefreshCurrentPageCommand(commandDeps),
        },
        {
          commandId: GROWI_COMMANDS.explorerShowBacklinks,
          handler: createExplorerShowBacklinksCommand(commandDeps),
        },
        {
          commandId: GROWI_COMMANDS.explorerShowCurrentPageInfo,
          handler: createExplorerShowCurrentPageInfoCommand(commandDeps),
        },
        {
          commandId: GROWI_COMMANDS.explorerShowCurrentPageAttachments,
          handler: createExplorerShowCurrentPageAttachmentsCommand(commandDeps),
          registrar: tracedCommandRegistrar,
        },
        {
          commandId: GROWI_COMMANDS.explorerShowRevisionHistoryDiff,
          handler: createExplorerShowRevisionHistoryDiffCommand(commandDeps),
        },
        {
          commandId: GROWI_COMMANDS.explorerCreateLocalMirrorForCurrentPage,
          handler:
            createExplorerCreateLocalMirrorForCurrentPageCommand(commandDeps),
        },
        {
          commandId: GROWI_COMMANDS.explorerCreateLocalMirrorForCurrentPrefix,
          handler:
            createExplorerCreateLocalMirrorForCurrentPrefixCommand(commandDeps),
        },
        {
          commandId: GROWI_COMMANDS.explorerCompareLocalMirrorWithGrowi,
          handler:
            createExplorerCompareLocalMirrorWithGrowiCommand(commandDeps),
        },
        {
          commandId: GROWI_COMMANDS.explorerUploadLocalMirrorToGrowi,
          handler: createExplorerUploadLocalMirrorToGrowiCommand(commandDeps),
        },
        {
          commandId: GROWI_COMMANDS.explorerCompareLocalMirrorSubtreeWithGrowi,
          handler:
            createExplorerCompareLocalMirrorSubtreeWithGrowiCommand(
              commandDeps,
            ),
        },
        {
          commandId: GROWI_COMMANDS.explorerUploadLocalMirrorSubtreeToGrowi,
          handler:
            createExplorerUploadLocalMirrorSubtreeToGrowiCommand(commandDeps),
        },
      ]);
    },
    registerLoadMoreListingCommand({
      loadMoreReadDirectory,
      showErrorMessage,
    }) {
      return vscode.commands.registerCommand(
        GROWI_LOAD_MORE_LISTING_COMMAND,
        async (uri: vscode.Uri) => {
          try {
            await loadMoreReadDirectory(uri);
            prefixTreeDataProvider.refresh();
          } catch (error) {
            const message =
              error instanceof Error && error.message.length > 0
                ? error.message
                : "一覧の追加取得に失敗しました。";
            showErrorMessage(message);
          }
        },
      );
    },
    registerTestSupportCommands(commandDeps) {
      return combineDisposables([
        vscode.commands.registerCommand(
          "growi.__test.collectExplorerTreeItems",
          async (maxDepth = 2) =>
            await collectUiReviewTreeItems(prefixTreeDataProvider, maxDepth),
        ),
        vscode.commands.registerCommand(
          "growi.__test.revealExplorerTreeItem",
          async (
            canonicalPath: unknown,
            options?: {
              select?: boolean;
              focus?: boolean;
              expand?: boolean | number;
            },
          ) => {
            if (!growiExplorerTreeView || typeof canonicalPath !== "string") {
              return false;
            }
            const item = await findPrefixTreeItemByCanonicalPath(
              prefixTreeDataProvider,
              canonicalPath,
            );
            if (!item) {
              return false;
            }
            await growiExplorerTreeView.reveal(item, {
              select: options?.select ?? true,
              focus: options?.focus ?? true,
              expand: options?.expand ?? false,
            });
            return true;
          },
        ),
        vscode.commands.registerCommand(
          "growi.__test.collectExplorerItemActionsQuickPickState",
          async (target?: unknown) => {
            const targetUri = resolveExplorerItemActionsUri(
              target as ExplorerItemActionsTarget,
            );
            const contextValue =
              target && typeof target === "object" && "contextValue" in target
                ? (target.contextValue as string | undefined)
                : undefined;
            const canonicalPath =
              canonicalPathFromExplorerItemActionsUri(targetUri);
            const isBookmarked = canonicalPath
              ? commandDeps.isBookmarked(canonicalPath)
              : false;
            const items =
              targetUri === undefined
                ? []
                : buildExplorerItemActionItems(contextValue, isBookmarked);

            return {
              name: "treeItemActions",
              placeholder: canonicalPath
                ? `Tree item action を選択してください: ${canonicalPath}`
                : "Tree item action を選択してください。",
              items: items.map((item) => ({
                label: item.label,
                description: item.description,
                command: item.command,
              })),
            };
          },
        ),
      ]);
    },
  };
}
