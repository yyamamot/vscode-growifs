import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";
import { buildGrowiUriFromInput } from "./core/uri";
import { createGrowiAssetProxy } from "./vscode/assetProxy";
import {
  type BookmarkListEntry,
  createAddCurrentPageBookmarkCommand,
  createAddPrefixCommand,
  createClearPrefixesCommand,
  createCompareLocalBundleWithGrowiCommand,
  createConfigureApiTokenCommand,
  createConfigureBaseUrlCommand,
  createCreatePageCommand,
  createDeletePageCommand,
  createDeletePrefixCommand,
  createDownloadCurrentPageSetToLocalBundleCommand,
  createDownloadCurrentPageToLocalFileCommand,
  createEndEditCommand,
  createExplorerCompareLocalBundleWithGrowiCommand,
  createExplorerCompareLocalWorkFileWithCurrentPageCommand,
  createExplorerCreatePageHereCommand,
  createExplorerDeletePageCommand,
  createExplorerDownloadCurrentPageSetToLocalBundleCommand,
  createExplorerDownloadCurrentPageToLocalFileCommand,
  createExplorerOpenPageInBrowserCommand,
  createExplorerOpenPageItemCommand,
  createExplorerRefreshCurrentPageCommand,
  createExplorerRenamePageCommand,
  createExplorerShowBacklinksCommand,
  createExplorerShowCurrentPageAttachmentsCommand,
  createExplorerShowCurrentPageInfoCommand,
  createExplorerShowRevisionHistoryDiffCommand,
  createExplorerUploadExportedLocalFileToGrowiCommand,
  createExplorerUploadLocalBundleToGrowiCommand,
  createOpenDirectoryPageCommand,
  createOpenPageCommand,
  createOpenPrefixRootPageCommand,
  createOpenReadmeCommand,
  createRefreshCurrentPageCommand,
  createRefreshListingCommand,
  createRefreshLocalMirrorCommand,
  createRemoveCurrentPageBookmarkCommand,
  createRenamePageCommand,
  createScmCompareMirrorAgainCommand,
  createScmTakeRemoteMirrorResourcesCommand,
  createScmUploadMirrorResourcesCommand,
  createShowBacklinksCommand,
  createShowBookmarksCommand,
  createShowCurrentPageActionsCommand,
  createShowCurrentPageAttachmentsCommand,
  createShowCurrentPageInfoCommand,
  createShowLocalRoundTripActionsCommand,
  createShowRevisionHistoryDiffCommand,
  createStartEditCommand,
  createUploadLocalBundleToGrowiCommand,
  GROWI_COMMANDS,
  GROWI_SECRET_KEYS,
  isOpenPageDirectInputPreferred,
  type OpenPageSearchEntry,
  rankOpenPageSearchEntries,
} from "./vscode/commands";
import { createGrowiDocumentSymbolProvider } from "./vscode/documentSymbols";
import {
  collectDrawioAutoFoldSelectionLines,
  createDrawioFoldingRangeProvider,
} from "./vscode/drawioFolding";
import { createEditSessionRegistry } from "./vscode/editSessionRegistry";
import {
  type GrowiCurrentRevisionReader,
  type GrowiEditSession,
  type GrowiEditSessionReference,
  GrowiFileSystemProvider,
  type GrowiPageCreator,
  type GrowiPageDeleter,
  type GrowiPageListReader,
  type GrowiPageReader,
  type GrowiPageRenameResult,
  type GrowiPageWriter,
  type GrowiSaveFailureNotifier,
} from "./vscode/fsProvider";
import type { GrowiBookmarkEntry } from "./vscode/growiApi";
import { createGrowiApiAdapter } from "./vscode/growiApi";
import {
  collectGrowiLinkDiagnostics,
  createGrowiDefinitionProvider,
  createGrowiDocumentLinkProvider,
} from "./vscode/linkNavigation";
import {
  extendMarkdownPreviewIt,
  setGrowiAssetProxyUrlResolver,
} from "./vscode/markdownPreview";
import type {
  MirrorCompareScmResource,
  MirrorCompareScmState,
} from "./vscode/mirrorCompareScm";
import { createGrowiMirrorCompareSourceControl } from "./vscode/mirrorCompareSourceControl";
import { createPageFreshnessService } from "./vscode/pageFreshnessService";
import {
  createPageReferenceResolver,
  type ResolveParsedGrowiReferenceResult,
} from "./vscode/pageReferenceResolver";
import { createPrefixRegistry } from "./vscode/prefixRegistry";
import {
  createGrowiPrefixTreeDataProvider,
  GROWI_EXPLORER_VIEW_ID,
} from "./vscode/prefixTree";
import { GrowiRevisionContentProvider } from "./vscode/revisionContentProvider";
import { GROWI_REVISION_SCHEME } from "./vscode/revisionModel";
import { RuntimeLogger } from "./vscode/runtimeLogger";

export { buildGrowiUriFromInput, normalizeCanonicalPath } from "./core/uri";
export {
  createAddCurrentPageBookmarkCommand,
  createAddPrefixCommand,
  createClearPrefixesCommand,
  createCompareLocalBundleWithGrowiCommand,
  createCompareLocalWorkFileWithCurrentPageCommand,
  createConfigureApiTokenCommand,
  createConfigureBaseUrlCommand,
  createCreatePageCommand,
  createDeletePrefixCommand,
  createDownloadCurrentPageSetToLocalBundleCommand,
  createDownloadCurrentPageToLocalFileCommand,
  createEndEditCommand,
  createExplorerCompareLocalBundleWithGrowiCommand,
  createExplorerCompareLocalWorkFileWithCurrentPageCommand,
  createExplorerCreatePageHereCommand,
  createExplorerDeletePageCommand,
  createExplorerDownloadCurrentPageSetToLocalBundleCommand,
  createExplorerDownloadCurrentPageToLocalFileCommand,
  createExplorerOpenPageInBrowserCommand,
  createExplorerOpenPageItemCommand,
  createExplorerRefreshCurrentPageCommand,
  createExplorerRenamePageCommand,
  createExplorerShowBacklinksCommand,
  createExplorerShowCurrentPageInfoCommand,
  createExplorerShowRevisionHistoryDiffCommand,
  createExplorerUploadExportedLocalFileToGrowiCommand,
  createExplorerUploadLocalBundleToGrowiCommand,
  createOpenPageCommand,
  createOpenReadmeCommand,
  createRefreshCurrentPageCommand,
  createRefreshListingCommand,
  createRemoveCurrentPageBookmarkCommand,
  createRenamePageCommand,
  createScmCompareMirrorAgainCommand,
  createShowBacklinksCommand,
  createShowBookmarksCommand,
  createShowCurrentPageActionsCommand,
  createShowCurrentPageInfoCommand,
  createShowLocalRoundTripActionsCommand,
  createShowRevisionHistoryDiffCommand,
  createStartEditCommand,
  createUploadExportedLocalFileToGrowiCommand,
  createUploadLocalBundleToGrowiCommand,
  GROWI_COMMANDS,
  normalizeBaseUrl,
} from "./vscode/commands";

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function mapReadPageBodyError(
  error: unknown,
):
  | { ok: false; reason: "NotFound" }
  | { ok: false; reason: "BaseUrlNotConfigured" }
  | { ok: false; reason: "ApiTokenNotConfigured" }
  | { ok: false; reason: "InvalidApiToken" }
  | { ok: false; reason: "PermissionDenied" }
  | { ok: false; reason: "ApiNotSupported" }
  | { ok: false; reason: "ConnectionFailed" } {
  const text = getErrorText(error);

  if (text.includes("FileNotFound")) {
    return { ok: false, reason: "NotFound" };
  }
  if (text.includes("base URL is not configured")) {
    return { ok: false, reason: "BaseUrlNotConfigured" };
  }
  if (text.includes("API token is not configured")) {
    return { ok: false, reason: "ApiTokenNotConfigured" };
  }
  if (text.includes("invalid API token")) {
    return { ok: false, reason: "InvalidApiToken" };
  }
  if (text.includes("read page API is not supported")) {
    return { ok: false, reason: "ApiNotSupported" };
  }
  if (text.includes("permission denied")) {
    return { ok: false, reason: "PermissionDenied" };
  }
  if (text.includes("failed to connect to GROWI")) {
    return { ok: false, reason: "ConnectionFailed" };
  }
  return { ok: false, reason: "ApiNotSupported" };
}

export function activate(context: vscode.ExtensionContext): void {
  const runtimeLogsEnabled = process.env.GROWI_RUNTIME_MODE === "debug-f5";
  void vscode.commands.executeCommand?.(
    "setContext",
    "growi.runtimeLogsEnabled",
    runtimeLogsEnabled,
  );
  const workspaceState = context.workspaceState ?? {
    get<T>(_key: string, defaultValue?: T): T {
      return defaultValue as T;
    },
    async update(_key: string, _value: unknown): Promise<void> {},
  };
  const prefixRegistry = createPrefixRegistry(workspaceState);
  const bookmarkCache = {
    baseUrl: undefined as string | undefined,
    userId: undefined as string | undefined,
    bookmarks: [] as GrowiBookmarkEntry[],
  };
  const prefixTreeDataProvider = createGrowiPrefixTreeDataProvider({
    getRegisteredPrefixes() {
      return prefixRegistry.getPrefixes(
        vscode.workspace.getConfiguration("growi").get<string>("baseUrl"),
      );
    },
    isBookmarked(canonicalPath: string) {
      const baseUrl = vscode.workspace
        .getConfiguration("growi")
        .get<string>("baseUrl");
      if (!baseUrl || bookmarkCache.baseUrl !== baseUrl) {
        return false;
      }
      return bookmarkCache.bookmarks.some(
        (bookmark) => bookmark.canonicalPath === canonicalPath,
      );
    },
    readDirectory(uri) {
      return vscode.workspace.fs.readDirectory(uri);
    },
  });
  const outputChannel = (
    vscode.window as typeof vscode.window & {
      createOutputChannel?: (
        name: string,
      ) => Pick<vscode.OutputChannel, "appendLine" | "dispose">;
    }
  ).createOutputChannel?.("GROWI") ?? {
    appendLine(_value: string): void {},
    dispose(): void {},
  };
  const runtimeLogger = new RuntimeLogger();
  const mirrorCompareSourceControl = createGrowiMirrorCompareSourceControl();
  const appendRuntimeStatus = (prefix: string) => {
    const status = runtimeLogger.getRuntimeLogStatus();
    outputChannel.appendLine(
      `[${new Date().toISOString()}] ${prefix} enabled=${status.enabled} mode=${status.mode} configuredPath=${status.configuredPath} resolvedPath=${status.resolvedPath ?? "(unresolved)"} workspaceResolved=${status.workspaceResolved}`,
    );
  };
  appendRuntimeStatus("runtime log status");
  type RuntimeCommandTraceState = {
    commandId: string;
    outcome?: "failed" | "canceled";
    errorCode?: string;
  };
  const runtimeCommandTraceStack: RuntimeCommandTraceState[] = [];
  const getCurrentRuntimeCommandTrace = () =>
    runtimeCommandTraceStack[runtimeCommandTraceStack.length - 1];
  const inferRuntimeTraceErrorCode = (message: string): string => {
    const text = message.toLowerCase();
    if (text.includes("base url")) {
      return "BaseUrlNotConfigured";
    }
    if (text.includes("api token")) {
      return text.includes("invalid")
        ? "InvalidApiToken"
        : "ApiTokenNotConfigured";
    }
    if (text.includes("permission denied") || text.includes("アクセス権")) {
      return "PermissionDenied";
    }
    if (text.includes("接続に失敗") || text.includes("failed to connect")) {
      return "ConnectionFailed";
    }
    if (text.includes("未対応") || text.includes("not supported")) {
      return "ApiNotSupported";
    }
    if (text.includes("見つから") || text.includes("not found")) {
      return "NotFound";
    }
    if (text.includes("invalid target")) {
      return "InvalidTarget";
    }
    if (text.includes("unavailable")) {
      return "Unavailable";
    }
    if (text.includes("open failed")) {
      return "OpenFailed";
    }
    return "UserVisibleError";
  };
  const markCurrentRuntimeCommandTrace = (
    outcome: "failed" | "canceled",
    errorCode?: string,
  ) => {
    const current = getCurrentRuntimeCommandTrace();
    if (!current) {
      return;
    }
    if (current.outcome === "failed") {
      return;
    }
    current.outcome = outcome;
    if (errorCode && !current.errorCode) {
      current.errorCode = errorCode;
    }
  };
  const sanitizeExternalTarget = (uri: string): string => {
    try {
      const parsed = new URL(uri);
      return `${parsed.host}${parsed.pathname}`;
    } catch {
      return "(invalid-uri)";
    }
  };
  const tracedCommandIds = new Set<string>([
    GROWI_COMMANDS.openPage,
    GROWI_COMMANDS.addCurrentPageBookmark,
    GROWI_COMMANDS.removeCurrentPageBookmark,
    GROWI_COMMANDS.showBookmarks,
    GROWI_COMMANDS.compareLocalMirrorWithGrowi,
    GROWI_COMMANDS.uploadLocalMirrorToGrowi,
    GROWI_COMMANDS.scmCompareMirrorAgain,
    GROWI_COMMANDS.scmUploadMirrorResources,
    GROWI_COMMANDS.scmTakeRemoteMirrorResources,
    GROWI_COMMANDS.showCurrentPageInfo,
    GROWI_COMMANDS.showCurrentPageAttachments,
    GROWI_COMMANDS.explorerOpenPageInBrowser,
    GROWI_COMMANDS.explorerShowCurrentPageAttachments,
  ]);
  const wrapRuntimeTracedCommand = <TArgs extends unknown[], TResult>(
    commandId: string,
    handler: (...args: TArgs) => TResult | Promise<TResult>,
  ) => {
    if (!tracedCommandIds.has(commandId)) {
      return handler;
    }
    return (async (...args: TArgs): Promise<TResult> => {
      runtimeCommandTraceStack.push({ commandId });
      await runtimeLogger.logWithStatus({
        level: "info",
        event: "command.started",
        source: "command",
        operation: `command:${commandId}`,
        entityType: "command",
        entityId: commandId,
        virtualPath: commandId,
        outcome: "started",
      });
      try {
        const result = await handler(...args);
        const current = getCurrentRuntimeCommandTrace();
        if (current?.outcome === "canceled") {
          await runtimeLogger.logWithStatus({
            level: "info",
            event: "command.canceled",
            source: "command",
            operation: `command:${commandId}`,
            entityType: "command",
            entityId: commandId,
            virtualPath: commandId,
            outcome: "canceled",
            errorCode: current.errorCode ?? "Canceled",
          });
        } else if (current?.outcome === "failed") {
          await runtimeLogger.logWithStatus({
            level: "error",
            event: "command.failed",
            source: "command",
            operation: `command:${commandId}`,
            entityType: "command",
            entityId: commandId,
            virtualPath: commandId,
            outcome: "failed",
            errorCode: current.errorCode ?? "UserVisibleError",
          });
        } else {
          await runtimeLogger.logWithStatus({
            level: "info",
            event: "command.succeeded",
            source: "command",
            operation: `command:${commandId}`,
            entityType: "command",
            entityId: commandId,
            virtualPath: commandId,
            outcome: "succeeded",
          });
        }
        return result;
      } catch (error) {
        await runtimeLogger.logWithStatus({
          level: "error",
          event: "command.failed",
          source: "command",
          operation: `command:${commandId}`,
          entityType: "command",
          entityId: commandId,
          virtualPath: commandId,
          outcome: "failed",
          errorCode: "UnhandledException",
        });
        throw error;
      } finally {
        runtimeCommandTraceStack.pop();
      }
    }) as typeof handler;
  };
  const registerGrowiCommand = <TArgs extends unknown[], TResult>(
    commandId: string,
    handler: (...args: TArgs) => TResult | Promise<TResult>,
  ) =>
    vscode.commands.registerCommand(
      commandId,
      wrapRuntimeTracedCommand(commandId, handler),
    );
  const describeScmCommandArg = (value: unknown): string => {
    if (Array.isArray(value)) {
      return `array(len=${value.length})`;
    }
    if (!value || typeof value !== "object") {
      return typeof value;
    }

    if (
      "mirrorCompareResource" in value &&
      value.mirrorCompareResource &&
      typeof value.mirrorCompareResource === "object"
    ) {
      const resource = value.mirrorCompareResource as {
        canonicalPath?: unknown;
        status?: unknown;
      };
      const status =
        typeof resource.status === "string" ? resource.status : "(unknown)";
      const canonicalPath =
        typeof resource.canonicalPath === "string"
          ? resource.canonicalPath
          : "(unknown)";
      return `resourceState(${status}:${canonicalPath})`;
    }

    if ("id" in value && typeof value.id === "string") {
      return `group(${value.id})`;
    }

    return `object(keys=${Object.keys(value)
      .slice(0, 4)
      .join(",")})`;
  };
  const describeScmCommandArgs = (args: readonly unknown[]): string => {
    if (args.length === 0) {
      return "none";
    }
    return args.slice(0, 6).map(describeScmCommandArg).join(" | ");
  };
  const describeMirrorCompareResources = (
    resources: readonly MirrorCompareScmResource[],
  ): string => {
    if (resources.length === 0) {
      return "0";
    }
    const summary = resources
      .slice(0, 10)
      .map((resource) => `${resource.status}:${resource.canonicalPath}`)
      .join(", ");
    const suffix = resources.length > 10 ? ", ..." : "";
    return `${resources.length} [${summary}${suffix}]`;
  };
  const logScmCommandContext = async (
    commandId: string,
    args: readonly unknown[],
    resources: readonly MirrorCompareScmResource[],
  ) => {
    await runtimeLogger.logWithStatus({
      level: "info",
      event: "command.context",
      source: "command",
      operation: `command:${commandId}`,
      entityType: "command",
      entityId: commandId,
      virtualPath: commandId,
      outcome: "started",
      details: `args=${describeScmCommandArgs(args)} resolved=${describeMirrorCompareResources(resources)}`,
    });
  };
  const growiApi = createGrowiApiAdapter({
    diagnostics: {
      log(message: string) {
        outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
      },
      logStructured(event) {
        void runtimeLogger
          .logWithStatus({
            ...event,
            source: "adapter",
          })
          .then((result) => {
            if (!result.ok) {
              appendRuntimeStatus(
                `runtime log write failed: ${result.message}`,
              );
            }
          });
      },
    },
  });

  const refreshGrowiExplorer = () => {
    prefixTreeDataProvider.refresh();
  };

  const getConfiguredApiContext = async () => {
    const baseUrl = deps.getBaseUrl()?.trim();
    if (!baseUrl) {
      return { ok: false, reason: "BaseUrlNotConfigured" } as const;
    }

    const apiToken = (
      await context.secrets.get?.(GROWI_SECRET_KEYS.apiToken)
    )?.trim();
    if (!apiToken) {
      return { ok: false, reason: "ApiTokenNotConfigured" } as const;
    }

    return { ok: true, baseUrl, apiToken } as const;
  };

  const replaceBookmarkCache = (
    baseUrl: string,
    userId: string,
    bookmarks: readonly GrowiBookmarkEntry[],
  ) => {
    bookmarkCache.baseUrl = baseUrl;
    bookmarkCache.userId = userId;
    bookmarkCache.bookmarks = [...bookmarks];
  };

  const clearBookmarkCache = () => {
    bookmarkCache.baseUrl = undefined;
    bookmarkCache.userId = undefined;
    bookmarkCache.bookmarks = [];
  };

  const syncBookmarks = async () => {
    const configured = await getConfiguredApiContext();
    if (!configured.ok) {
      clearBookmarkCache();
      return configured;
    }

    const currentUserResult = await growiApi.getCurrentUser(
      configured.baseUrl,
      configured.apiToken,
    );
    if (!currentUserResult.ok) {
      clearBookmarkCache();
      return currentUserResult;
    }

    const listResult = await growiApi.listBookmarks(
      currentUserResult.userId,
      configured.baseUrl,
      configured.apiToken,
    );
    if (!listResult.ok) {
      clearBookmarkCache();
      return listResult;
    }

    replaceBookmarkCache(
      configured.baseUrl,
      currentUserResult.userId,
      listResult.bookmarks,
    );
    return {
      ok: true,
      baseUrl: configured.baseUrl,
      userId: currentUserResult.userId,
      bookmarks: listResult.bookmarks,
    } as const;
  };

  const resolveBookmarkPageInfo = async (canonicalPath: string) => {
    const currentPageInfo =
      fileSystemProvider.getCurrentPageInfo(canonicalPath);
    if (currentPageInfo?.pageId) {
      return { ok: true, pageInfo: currentPageInfo } as const;
    }

    const editSession = editSessionRegistry.getEditSession(canonicalPath);
    if (editSession?.pageId) {
      return {
        ok: true,
        pageInfo: {
          pageId: editSession.pageId,
          revisionId: editSession.baseRevisionId,
          url: "",
          path: canonicalPath,
          lastUpdatedBy: "",
          lastUpdatedAt: editSession.baseUpdatedAt,
        },
      } as const;
    }

    const configured = await getConfiguredApiContext();
    if (!configured.ok) {
      return configured;
    }

    return await growiApi.getPageInfo(
      canonicalPath,
      configured.baseUrl,
      configured.apiToken,
    );
  };

  const isWithinRegisteredPrefixes = (
    canonicalPath: string,
    registeredPrefixes: readonly string[],
  ) =>
    registeredPrefixes.some(
      (prefix) =>
        canonicalPath === prefix || canonicalPath.startsWith(`${prefix}/`),
    );

  const buildBookmarkListEntries = async (
    bookmarks: readonly GrowiBookmarkEntry[],
  ): Promise<readonly BookmarkListEntry[]> => {
    const configured = await getConfiguredApiContext();
    if (!configured.ok) {
      return bookmarks;
    }

    const registeredPrefixes = prefixRegistry.getPrefixes(configured.baseUrl);
    const entries = await Promise.all(
      bookmarks.map(async (bookmark) => {
        const resolved = await growiApi.resolvePageId(
          bookmark.pageId,
          configured.baseUrl,
          configured.apiToken,
        );
        if (!resolved.ok || resolved.canonicalPath !== bookmark.canonicalPath) {
          return {
            ...bookmark,
            status: "unresolvable",
          } as const;
        }

        if (
          !isWithinRegisteredPrefixes(
            bookmark.canonicalPath,
            registeredPrefixes,
          )
        ) {
          return {
            ...bookmark,
            status: "outsidePrefix",
          } as const;
        }

        return {
          ...bookmark,
          status: "normal",
        } as const;
      }),
    );

    return entries;
  };

  const noopDisposable: vscode.Disposable = { dispose() {} };
  const pageReader: GrowiPageReader = {
    async readPage(canonicalPath: string) {
      const configured = await getConfiguredApiContext();
      if (!configured.ok) {
        return configured;
      }

      return growiApi.readPage(
        canonicalPath,
        configured.baseUrl,
        configured.apiToken,
      );
    },
  };
  const pageListReader: GrowiPageListReader = {
    async listPages(canonicalPrefixPath: string) {
      const configured = await getConfiguredApiContext();
      if (!configured.ok) {
        return configured;
      }

      return growiApi.listPages(
        canonicalPrefixPath,
        configured.baseUrl,
        configured.apiToken,
      );
    },
  };
  const editSessionRegistry = createEditSessionRegistry();
  const editSessionReference: GrowiEditSessionReference = editSessionRegistry;
  const resolvePageId = async (pageId: string) => {
    const configured = await getConfiguredApiContext();
    if (!configured.ok) {
      return configured;
    }

    return growiApi.resolvePageId(
      pageId,
      configured.baseUrl,
      configured.apiToken,
    );
  };
  const pageReferenceResolver = createPageReferenceResolver({
    resolvePageId,
  });
  const currentRevisionReader: GrowiCurrentRevisionReader = {
    async getCurrentRevision(canonicalPath: string) {
      const baseUrl = deps.getBaseUrl()?.trim();
      if (!baseUrl) {
        return { ok: false } as const;
      }

      const apiToken = (
        await context.secrets.get?.(GROWI_SECRET_KEYS.apiToken)
      )?.trim();
      if (!apiToken) {
        return { ok: false } as const;
      }

      return growiApi.getCurrentRevision(canonicalPath, baseUrl, apiToken);
    },
  };
  const pageWriter: GrowiPageWriter = {
    async writePage(_canonicalPath: string, body: string, editSession) {
      const configured = await getConfiguredApiContext();
      if (!configured.ok) {
        return configured;
      }
      if (!editSession.pageId || !editSession.baseRevisionId) {
        return { ok: false, reason: "ApiNotSupported" } as const;
      }

      return growiApi.writePage(
        body,
        editSession,
        configured.baseUrl,
        configured.apiToken,
      );
    },
  };
  const pageCreator: GrowiPageCreator = {
    async createPage(canonicalPath: string, body: string) {
      const configured = await getConfiguredApiContext();
      if (!configured.ok) {
        return configured;
      }

      return growiApi.createPage(
        canonicalPath,
        body,
        configured.baseUrl,
        configured.apiToken,
      );
    },
    async resolveCreatePageBody(canonicalPath: string) {
      const configured = await getConfiguredApiContext();
      if (!configured.ok) {
        return "";
      }

      return growiApi.resolveCreatePageBody(
        canonicalPath,
        configured.baseUrl,
        configured.apiToken,
      );
    },
  };
  const pageDeleter: GrowiPageDeleter = {
    async deletePage(input) {
      const configured = await getConfiguredApiContext();
      if (!configured.ok) {
        return configured;
      }

      return growiApi.deletePage(
        input,
        configured.baseUrl,
        configured.apiToken,
      );
    },
  };
  const pageRenamer = {
    async renamePage(input: {
      pageId: string;
      revisionId: string;
      currentCanonicalPath: string;
      targetCanonicalPath: string;
      mode: "page" | "subtree";
    }): Promise<GrowiPageRenameResult> {
      const configured = await getConfiguredApiContext();
      if (!configured.ok) {
        return configured;
      }

      return growiApi.renamePage(
        input,
        configured.baseUrl,
        configured.apiToken,
      );
    },
  };
  const revisionContentProvider = new GrowiRevisionContentProvider({
    async readRevision(pageId: string, revisionId: string) {
      const configured = await getConfiguredApiContext();
      if (!configured.ok) {
        return configured;
      }

      return growiApi.readRevision(
        pageId,
        revisionId,
        configured.baseUrl,
        configured.apiToken,
      );
    },
  });

  const deps = {
    async addBookmark(canonicalPath: string, pageId?: string) {
      const configured = await getConfiguredApiContext();
      if (!configured.ok) {
        return configured;
      }

      const resolvedPageInfo = pageId
        ? { ok: true as const, pageInfo: { pageId } }
        : await resolveBookmarkPageInfo(canonicalPath);
      if (!resolvedPageInfo.ok || !resolvedPageInfo.pageInfo?.pageId) {
        return resolvedPageInfo.ok
          ? ({ ok: false, reason: "NotFound" } as const)
          : resolvedPageInfo;
      }

      const bookmarkInfo = await growiApi.getBookmarkInfo(
        resolvedPageInfo.pageInfo.pageId,
        configured.baseUrl,
        configured.apiToken,
      );
      if (!bookmarkInfo.ok) {
        return bookmarkInfo;
      }
      if (bookmarkInfo.isBookmarked) {
        const synced = await syncBookmarks();
        return synced.ok
          ? ({ ok: true, value: synced.bookmarks, added: false } as const)
          : synced;
      }

      const updateResult = await growiApi.updateBookmark(
        resolvedPageInfo.pageInfo.pageId,
        true,
        configured.baseUrl,
        configured.apiToken,
      );
      if (!updateResult.ok) {
        return updateResult;
      }

      const synced = await syncBookmarks();
      if (!synced.ok) {
        return synced;
      }
      refreshGrowiExplorer();
      return { ok: true, value: synced.bookmarks, added: true } as const;
    },
    async addPrefix(rawPrefix: string) {
      const result = await prefixRegistry.addPrefix(
        vscode.workspace.getConfiguration("growi").get<string>("baseUrl"),
        rawPrefix,
      );
      if (result.ok) {
        refreshGrowiExplorer();
      }
      return result;
    },
    async clearPrefixes() {
      const result = await prefixRegistry.clearPrefixes(
        vscode.workspace.getConfiguration("growi").get<string>("baseUrl"),
      );
      if (result.ok) {
        refreshGrowiExplorer();
      }
      return result;
    },
    async deletePrefix(rawPrefix: string) {
      const result = await prefixRegistry.deletePrefix(
        vscode.workspace.getConfiguration("growi").get<string>("baseUrl"),
        rawPrefix,
      );
      if (result.ok && result.removed) {
        refreshGrowiExplorer();
      }
      return result;
    },
    async deleteBookmark(canonicalPath: string, pageId?: string) {
      const configured = await getConfiguredApiContext();
      if (!configured.ok) {
        return configured;
      }

      const resolvedPageInfo = pageId
        ? { ok: true as const, pageInfo: { pageId } }
        : await resolveBookmarkPageInfo(canonicalPath);
      if (!resolvedPageInfo.ok || !resolvedPageInfo.pageInfo?.pageId) {
        return resolvedPageInfo.ok
          ? ({
              ok: true,
              value: bookmarkCache.bookmarks,
              removed: false,
            } as const)
          : resolvedPageInfo;
      }

      const bookmarkInfo = await growiApi.getBookmarkInfo(
        resolvedPageInfo.pageInfo.pageId,
        configured.baseUrl,
        configured.apiToken,
      );
      if (!bookmarkInfo.ok) {
        if (bookmarkInfo.reason === "NotFound") {
          const synced = await syncBookmarks();
          return synced.ok
            ? ({ ok: true, value: synced.bookmarks, removed: false } as const)
            : synced;
        }
        return bookmarkInfo;
      }
      if (!bookmarkInfo.isBookmarked) {
        const synced = await syncBookmarks();
        return synced.ok
          ? ({ ok: true, value: synced.bookmarks, removed: false } as const)
          : synced;
      }

      const updateResult = await growiApi.updateBookmark(
        resolvedPageInfo.pageInfo.pageId,
        false,
        configured.baseUrl,
        configured.apiToken,
      );
      if (!updateResult.ok) {
        return updateResult;
      }

      const synced = await syncBookmarks();
      if (!synced.ok) {
        return synced;
      }
      refreshGrowiExplorer();
      return { ok: true, value: synced.bookmarks, removed: true } as const;
    },
    async bootstrapEditSession(canonicalPath: string) {
      const configured = await getConfiguredApiContext();
      if (!configured.ok) {
        return configured;
      }
      return growiApi.fetchPageSnapshot(
        canonicalPath,
        configured.baseUrl,
        configured.apiToken,
      );
    },
    closeEditSession(canonicalPath: string) {
      editSessionRegistry.closeEditSession(canonicalPath);
    },
    getActiveEditorUri() {
      return vscode.window.activeTextEditor?.document.uri;
    },
    getActiveEditorText() {
      return vscode.window.activeTextEditor?.document.getText();
    },
    getBaseUrl() {
      return vscode.workspace.getConfiguration("growi").get<string>("baseUrl");
    },
    getEditSession(canonicalPath: string) {
      return editSessionRegistry.getEditSession(canonicalPath);
    },
    getCurrentPageInfo(canonicalPath: string) {
      return fileSystemProvider.getCurrentPageInfo(canonicalPath);
    },
    getLocalWorkspaceRoot() {
      return (
        vscode.workspace.workspaceFolders?.find(
          (folder) => folder.uri.scheme === "file",
        )?.uri.fsPath ?? undefined
      );
    },
    async getBookmarks() {
      const synced = await syncBookmarks();
      return synced.ok
        ? ({
            ok: true,
            value: await buildBookmarkListEntries(synced.bookmarks),
          } as const)
        : synced;
    },
    getRegisteredPrefixes() {
      return prefixRegistry.getPrefixes(deps.getBaseUrl());
    },
    isBookmarked(canonicalPath: string) {
      const baseUrl = deps.getBaseUrl();
      if (!baseUrl || bookmarkCache.baseUrl !== baseUrl) {
        return false;
      }
      return bookmarkCache.bookmarks.some(
        (bookmark) => bookmark.canonicalPath === canonicalPath,
      );
    },
    invalidateReadDirectoryCache(canonicalDirectoryPath: string) {
      fileSystemProvider.invalidateReadDirectoryCache(canonicalDirectoryPath);
    },
    invalidateReadFileCache(canonicalPath: string) {
      fileSystemProvider.invalidateReadFileCache(canonicalPath);
    },
    async listPages(canonicalPrefixPath: string) {
      const configured = await getConfiguredApiContext();
      if (!configured.ok) {
        return configured;
      }

      return growiApi.listPages(
        canonicalPrefixPath,
        configured.baseUrl,
        configured.apiToken,
      );
    },
    async createPage(canonicalPath: string, body: string) {
      return pageCreator.createPage(canonicalPath, body);
    },
    async resolveCreatePageBody(canonicalPath: string) {
      return pageCreator.resolveCreatePageBody(canonicalPath);
    },
    async deletePage(input: {
      pageId: string;
      revisionId: string;
      canonicalPath: string;
      mode: "page" | "subtree";
    }) {
      return await pageDeleter.deletePage(input);
    },
    async renamePage(input: {
      pageId: string;
      revisionId: string;
      currentCanonicalPath: string;
      targetCanonicalPath: string;
      mode: "page" | "subtree";
    }) {
      return await pageRenamer.renamePage(input);
    },
    async listRevisions(pageId: string) {
      const configured = await getConfiguredApiContext();
      if (!configured.ok) {
        return configured;
      }

      return growiApi.listRevisions(
        pageId,
        configured.baseUrl,
        configured.apiToken,
      );
    },
    async listAttachments(pageId: string) {
      const configured = await getConfiguredApiContext();
      if (!configured.ok) {
        return configured;
      }

      return growiApi.listAttachments(
        pageId,
        configured.baseUrl,
        configured.apiToken,
      );
    },
    findOpenTextDocument(localPath: string) {
      const document = vscode.workspace.textDocuments.find(
        (candidate) =>
          candidate.uri.scheme === "file" && candidate.uri.fsPath === localPath,
      );
      if (!document) {
        return undefined;
      }
      return {
        isDirty: document.isDirty,
      };
    },
    findOpenTextDocumentByUri(uri: { scheme: string; path: string }) {
      const targetUri = vscode.Uri.parse(`${uri.scheme}:${uri.path}`);
      const document = vscode.workspace.textDocuments.find(
        (candidate) => candidate.uri.toString() === targetUri.toString(),
      );
      if (!document) {
        return undefined;
      }
      return {
        isDirty: document.isDirty,
      };
    },
    async openUri(uri: string) {
      await vscode.commands.executeCommand(
        "vscode.open",
        vscode.Uri.parse(uri),
      );
    },
    async openExternalUri(uri: string) {
      const currentTrace = getCurrentRuntimeCommandTrace();
      const sanitizedTarget = sanitizeExternalTarget(uri);
      if (currentTrace) {
        await runtimeLogger.logWithStatus({
          level: "info",
          event: "externalOpen.started",
          source: "command",
          operation: `command:${currentTrace.commandId}`,
          entityType: "externalUri",
          entityId: currentTrace.commandId,
          virtualPath: sanitizedTarget,
          outcome: "started",
        });
      }
      try {
        await vscode.env.openExternal(vscode.Uri.parse(uri));
        if (currentTrace) {
          await runtimeLogger.logWithStatus({
            level: "info",
            event: "externalOpen.succeeded",
            source: "command",
            operation: `command:${currentTrace.commandId}`,
            entityType: "externalUri",
            entityId: currentTrace.commandId,
            virtualPath: sanitizedTarget,
            outcome: "succeeded",
          });
        }
      } catch (error) {
        if (currentTrace) {
          markCurrentRuntimeCommandTrace("failed", "OpenExternalFailed");
          await runtimeLogger.logWithStatus({
            level: "error",
            event: "externalOpen.failed",
            source: "command",
            operation: `command:${currentTrace.commandId}`,
            entityType: "externalUri",
            entityId: currentTrace.commandId,
            virtualPath: sanitizedTarget,
            outcome: "failed",
            errorCode: "OpenExternalFailed",
          });
        }
        throw error;
      }
    },
    async openLocalFile(localPath: string) {
      await vscode.commands.executeCommand(
        "vscode.open",
        vscode.Uri.file(localPath),
      );
    },
    async openDiff(
      leftUri: { scheme: string; path: string; fsPath?: string },
      rightUri: { scheme: string; path: string; fsPath?: string },
      title: string,
    ) {
      const toVscodeUri = (uri: {
        scheme: string;
        path: string;
        fsPath?: string;
      }) =>
        uri.scheme === "file"
          ? vscode.Uri.file(uri.fsPath ?? uri.path)
          : vscode.Uri.parse(`${uri.scheme}:${uri.path}`);
      await vscode.commands.executeCommand(
        "vscode.diff",
        toVscodeUri(leftUri),
        toVscodeUri(rightUri),
        title,
      );
    },
    clearMirrorCompareSourceControlState() {
      mirrorCompareSourceControl.clear();
    },
    getMirrorCompareSourceControlState() {
      return mirrorCompareSourceControl.getState();
    },
    async readLocalFile(localPath: string) {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.file(localPath),
      );
      return new TextDecoder().decode(bytes);
    },
    async refreshOpenGrowiPage(canonicalPath: string) {
      const targetUri = vscode.Uri.parse(`growi:${canonicalPath}.md`);
      const document = vscode.workspace.textDocuments.find(
        (candidate) => candidate.uri.toString() === targetUri.toString(),
      );
      if (!document) {
        return "not-open" as const;
      }

      const editSession = editSessionRegistry.getEditSession(canonicalPath);
      if (editSession?.dirty) {
        return "dirty" as const;
      }

      try {
        await vscode.commands.executeCommand("vscode.open", targetUri, {
          preserveFocus: true,
          preview: false,
        });
        await reevaluateActiveGrowiPageStatus();
        return "reopened" as const;
      } catch {
        return "failed" as const;
      }
    },
    async saveDocument(uri: { scheme: string; path: string }) {
      const targetUri = vscode.Uri.parse(`${uri.scheme}:${uri.path}`);
      const document = vscode.workspace.textDocuments.find(
        (candidate) => candidate.uri.toString() === targetUri.toString(),
      );
      if (!document) {
        return false;
      }
      return await document.save();
    },
    async readPageBody(canonicalPath: string) {
      const growiUri = vscode.Uri.parse(`growi:${canonicalPath}.md`);
      try {
        const bytes = await vscode.workspace.fs.readFile(growiUri);
        return { ok: true, body: new TextDecoder().decode(bytes) } as const;
      } catch (error) {
        return mapReadPageBodyError(error);
      }
    },
    async readRevision(pageId: string, revisionId: string) {
      const configured = await getConfiguredApiContext();
      if (!configured.ok) {
        return configured;
      }

      return growiApi.readRevision(
        pageId,
        revisionId,
        configured.baseUrl,
        configured.apiToken,
      );
    },
    async resolvePageReference(
      reference: Parameters<typeof pageReferenceResolver.resolveReference>[0],
    ): Promise<ResolveParsedGrowiReferenceResult> {
      return await pageReferenceResolver.resolveReference(reference);
    },
    async readDirectory(uri: string) {
      await vscode.workspace.fs.readDirectory(vscode.Uri.parse(uri));
    },
    async reopenRenamedPages(
      oldCanonicalPath: string,
      newCanonicalPath: string,
    ) {
      const remappedDocuments = vscode.workspace.textDocuments
        .map((document) => {
          if (document.uri.scheme !== "growi") {
            return undefined;
          }

          const parsed = buildGrowiUriFromInput(document.uri.path);
          if (
            !parsed.ok ||
            !(
              parsed.value.canonicalPath === oldCanonicalPath ||
              parsed.value.canonicalPath.startsWith(`${oldCanonicalPath}/`)
            )
          ) {
            return undefined;
          }

          const suffix = parsed.value.canonicalPath.slice(
            oldCanonicalPath.length,
          );
          return {
            document,
            targetUri: vscode.Uri.parse(
              `growi:${newCanonicalPath}${suffix}.md`,
            ),
          };
        })
        .filter(
          (
            entry,
          ): entry is {
            document: vscode.TextDocument;
            targetUri: vscode.Uri;
          } => entry !== undefined,
        );

      if (remappedDocuments.length === 0) {
        return { attempted: false, hasDirty: false, hasFailed: false } as const;
      }

      const activeUri = vscode.window.activeTextEditor?.document.uri.toString();
      const activeEntries = remappedDocuments.filter(
        (entry) => entry.document.uri.toString() === activeUri,
      );
      const backgroundEntries = remappedDocuments.filter(
        (entry) => entry.document.uri.toString() !== activeUri,
      );

      let hasDirty = false;
      let hasFailed = false;
      for (const entry of backgroundEntries) {
        if (entry.document.isDirty) {
          hasDirty = true;
          continue;
        }
        try {
          await vscode.commands.executeCommand("vscode.open", entry.targetUri, {
            preserveFocus: true,
            preview: false,
          });
        } catch {
          hasFailed = true;
        }
      }

      for (const entry of activeEntries) {
        if (entry.document.isDirty) {
          hasDirty = true;
          continue;
        }
        try {
          await vscode.commands.executeCommand("vscode.open", entry.targetUri, {
            preserveFocus: false,
            preview: false,
          });
        } catch {
          hasFailed = true;
        }
      }

      return { attempted: true, hasDirty, hasFailed } as const;
    },
    async closeDeletedPages(canonicalPath: string, mode: "page" | "subtree") {
      const targetTabs = vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .filter((tab) => {
          const input = tab.input;
          if (!(input instanceof vscode.TabInputText)) {
            return false;
          }
          if (input.uri.scheme !== "growi") {
            return false;
          }

          const parsed = buildGrowiUriFromInput(input.uri.path);
          if (!parsed.ok) {
            return false;
          }

          if (mode === "subtree") {
            return (
              parsed.value.canonicalPath === canonicalPath ||
              parsed.value.canonicalPath.startsWith(`${canonicalPath}/`)
            );
          }

          return parsed.value.canonicalPath === canonicalPath;
        });

      if (targetTabs.length === 0) {
        return { attempted: false, hasFailed: false } as const;
      }

      try {
        await vscode.window.tabGroups.close(targetTabs);
        return { attempted: true, hasFailed: false } as const;
      } catch {
        return { attempted: true, hasFailed: true } as const;
      }
    },
    refreshPrefixTree() {
      refreshGrowiExplorer();
    },
    clearSubtreeState(canonicalPrefixPath: string) {
      fileSystemProvider.clearSubtreeState(canonicalPrefixPath);
      prefixTreeDataProvider.clearStaleState(canonicalPrefixPath);
      prefixTreeDataProvider.refresh();
    },
    clearMirrorCompareTreeSnapshotState() {
      prefixTreeDataProvider.clearCompareSnapshot();
      prefixTreeDataProvider.refresh();
    },
    seedRevisionContent(
      uri: { scheme: string; path: string; fsPath?: string },
      body: string,
    ) {
      const targetUri =
        uri.scheme === "file"
          ? vscode.Uri.file(uri.fsPath ?? uri.path)
          : vscode.Uri.parse(`${uri.scheme}:${uri.path}`);
      revisionContentProvider.seedRevisionContent(targetUri, body);
    },
    setMirrorCompareSourceControlState(input: MirrorCompareScmState) {
      mirrorCompareSourceControl.setState(input);
    },
    setMirrorCompareTreeSnapshotState(input: MirrorCompareScmState) {
      prefixTreeDataProvider.setCompareSnapshot(input);
      prefixTreeDataProvider.refresh();
    },
    showErrorMessage(message: string) {
      markCurrentRuntimeCommandTrace(
        "failed",
        inferRuntimeTraceErrorCode(message),
      );
      void vscode.window.showErrorMessage(message);
    },
    async showEndEditDiscardConfirmation() {
      const selected = await vscode.window.showInformationMessage(
        "未保存の変更を破棄して編集を終了しますか？",
        { modal: true },
        "保存してReadOnlyに戻る",
        "破棄して戻る",
      );
      if (selected === "保存してReadOnlyに戻る") {
        return "saveAndReturn" as const;
      }
      if (selected === "破棄して戻る") {
        return "discardAndReturn" as const;
      }
      return "cancel" as const;
    },
    showInformationMessage(message: string) {
      void vscode.window.showInformationMessage(message);
    },
    showInputBox(options: {
      password?: boolean;
      placeHolder?: string;
      prompt?: string;
      title?: string;
      value?: string;
    }) {
      return vscode.window.showInputBox(options).then((value) => {
        if (value === undefined) {
          markCurrentRuntimeCommandTrace("canceled", "Canceled");
        }
        return value;
      });
    },
    async showClearPrefixesConfirmation(
      baseUrl: string,
      prefixes: readonly string[],
    ) {
      const selected = await vscode.window.showWarningMessage(
        `現在の接続先 ${baseUrl} に登録された Prefix を削除しますか?\n${prefixes.join("\n")}`,
        { modal: true },
        "削除する",
      );
      return selected === "削除する";
    },
    async showRenameScopeConfirmation(canonicalPath: string) {
      const selected = await vscode.window.showWarningMessage(
        `${canonicalPath} には配下ページがあります。Rename Page の範囲を選択してください。`,
        { modal: true },
        "このページのみ",
        "配下も含める",
      );
      if (selected === "このページのみ") {
        return "single" as const;
      }
      if (selected === "配下も含める") {
        return "subtree" as const;
      }
      return "cancel" as const;
    },
    async showDeleteScopeConfirmation(canonicalPath: string) {
      const selected = await vscode.window.showWarningMessage(
        `${canonicalPath} には配下ページがあります。Delete Page の範囲を選択してください。`,
        { modal: true },
        "このページのみ",
        "配下も含める",
      );
      if (selected === "このページのみ") {
        return "single" as const;
      }
      if (selected === "配下も含める") {
        return "subtree" as const;
      }
      return "cancel" as const;
    },
    async showDeletePageConfirmation(
      canonicalPath: string,
      mode: "page" | "subtree",
    ) {
      const selected = await vscode.window.showWarningMessage(
        mode === "subtree"
          ? `${canonicalPath} と配下ページをゴミ箱に移動しますか？`
          : `${canonicalPath} をゴミ箱に移動しますか？`,
        { modal: true },
        "ゴミ箱に移動する",
      );
      return selected === "ゴミ箱に移動する";
    },
    async executeCommand(command: string, ...args: unknown[]) {
      await vscode.commands.executeCommand(command, ...args);
    },
    async showQuickPick(
      items: readonly { label: string; canonicalPath: string }[],
      options: { placeHolder: string },
    ) {
      const selected = await vscode.window.showQuickPick(items, options);
      if (selected === undefined) {
        markCurrentRuntimeCommandTrace("canceled", "Canceled");
      }
      return selected;
    },
    async showOpenPageQuickPick(
      items: readonly OpenPageSearchEntry[],
      options: {
        placeHolder: string;
        directInputLabel: string;
        directInputDescription: string;
      },
    ) {
      return await new Promise<string | { action: "directInput" } | undefined>(
        (resolve) => {
          const quickPick = vscode.window.createQuickPick<
            vscode.QuickPickItem & {
              canonicalPath?: string;
              action?: "directInput";
            }
          >();
          let settled = false;

          const settle = (
            value: string | { action: "directInput" } | undefined,
          ) => {
            if (settled) {
              return;
            }
            settled = true;
            quickPick.dispose();
            resolve(value);
          };

          const directInputItem = {
            label: options.directInputLabel,
            description: options.directInputDescription,
            action: "directInput" as const,
            alwaysShow: true,
          };

          const updateItems = () => {
            const rankedItems = rankOpenPageSearchEntries(
              items,
              quickPick.value,
            );
            quickPick.items = isOpenPageDirectInputPreferred(quickPick.value)
              ? [directInputItem, ...rankedItems]
              : [...rankedItems, directInputItem];
          };

          quickPick.placeholder = options.placeHolder;
          quickPick.matchOnDescription = false;
          quickPick.matchOnDetail = false;
          updateItems();

          quickPick.onDidChangeValue(() => {
            updateItems();
          });
          quickPick.onDidAccept(() => {
            const selected = quickPick.selectedItems[0];
            if (!selected) {
              settle(undefined);
              return;
            }

            if (selected.action === "directInput") {
              settle({ action: "directInput" });
              return;
            }

            if (typeof selected.canonicalPath === "string") {
              settle(selected.canonicalPath);
              return;
            }

            settle(undefined);
          });
          quickPick.onDidHide(() => {
            markCurrentRuntimeCommandTrace("canceled", "Canceled");
            settle(undefined);
          });
          quickPick.show();
        },
      );
    },
    async showBookmarkQuickPick(
      items: readonly {
        label: string;
        description?: string;
        detail?: string;
        canonicalPath: string;
        addedAt: string;
        pageId: string;
      }[],
      options: { placeHolder: string },
    ) {
      return await new Promise<
        | { action: "open" | "remove"; canonicalPath: string; pageId: string }
        | undefined
      >((resolve) => {
        const quickPick = vscode.window.createQuickPick<
          vscode.QuickPickItem & { canonicalPath: string; pageId: string }
        >();
        const removeButton: vscode.QuickInputButton = {
          iconPath: new vscode.ThemeIcon("trash"),
          tooltip: "ブックマークから削除",
        };
        let settled = false;
        const settle = (
          value:
            | {
                action: "open" | "remove";
                canonicalPath: string;
                pageId: string;
              }
            | undefined,
        ) => {
          if (settled) {
            return;
          }
          settled = true;
          quickPick.dispose();
          resolve(value);
        };

        quickPick.items = items.map((item) => ({
          ...item,
          buttons: [removeButton],
        }));
        quickPick.placeholder = options.placeHolder;
        quickPick.onDidAccept(() => {
          const selected = quickPick.selectedItems[0];
          settle(
            selected
              ? {
                  action: "open",
                  canonicalPath: selected.canonicalPath,
                  pageId: selected.pageId,
                }
              : undefined,
          );
        });
        quickPick.onDidTriggerItemButton((event) => {
          settle({
            action: "remove",
            canonicalPath: event.item.canonicalPath,
            pageId: event.item.pageId,
          });
        });
        quickPick.onDidHide(() => settle(undefined));
        quickPick.show();
      });
    },
    showWarningMessage(message: string) {
      void vscode.window.showWarningMessage(message);
    },
    async storeSecret(key: string, value: string) {
      await context.secrets.store(key, value);
      if (key === GROWI_SECRET_KEYS.apiToken) {
        clearBookmarkCache();
        refreshGrowiExplorer();
      }
    },
    setEditSession(canonicalPath: string, editSession: GrowiEditSession) {
      editSessionRegistry.setEditSession(canonicalPath, editSession);
    },
    async updateBaseUrl(value: string) {
      await vscode.workspace
        .getConfiguration("growi")
        .update("baseUrl", value, vscode.ConfigurationTarget.Global);
      clearBookmarkCache();
      refreshGrowiExplorer();
    },
    async deleteLocalPath(localPath: string) {
      await vscode.workspace.fs.delete(vscode.Uri.file(localPath), {
        recursive: true,
        useTrash: false,
      });
    },
    async writeLocalFile(localPath: string, content: string) {
      await vscode.workspace.fs.createDirectory(
        vscode.Uri.file(path.dirname(localPath)),
      );
      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(localPath),
        new TextEncoder().encode(content),
      );
    },
    async writePage(
      canonicalPath: string,
      body: string,
      editSession: GrowiEditSession,
    ) {
      return await pageWriter.writePage(canonicalPath, body, editSession);
    },
  };

  const assetProxy = createGrowiAssetProxy({
    getBaseUrl() {
      return deps.getBaseUrl();
    },
    async getApiToken() {
      return (await context.secrets.get?.(GROWI_SECRET_KEYS.apiToken))?.trim();
    },
  });
  let hasShownAssetProxyUnavailableMessage = false;
  setGrowiAssetProxyUrlResolver((internalAssetId: string) => {
    const proxyUrl = assetProxy.resolveProxyUrl(internalAssetId);
    if (!proxyUrl && !hasShownAssetProxyUnavailableMessage) {
      hasShownAssetProxyUnavailableMessage = true;
      void vscode.window.showErrorMessage(
        "GROWI image proxy is unavailable; image preview may be incomplete.",
      );
    }

    return proxyUrl;
  });

  const fileSystemProvider = new GrowiFileSystemProvider(
    pageReader,
    pageListReader,
    editSessionReference,
    currentRevisionReader,
    pageWriter,
    () => prefixRegistry.getPrefixes(deps.getBaseUrl()),
    {
      showSaveFailure(message: string) {
        void vscode.window.showErrorMessage(message);
      },
    } satisfies GrowiSaveFailureNotifier,
  );

  const openPageCommand = createOpenPageCommand(deps);
  const openPageCommandDisposable = registerGrowiCommand(
    GROWI_COMMANDS.openPage,
    openPageCommand,
  );
  const addCurrentPageBookmarkCommandDisposable = registerGrowiCommand(
    GROWI_COMMANDS.addCurrentPageBookmark,
    createAddCurrentPageBookmarkCommand(deps),
  );
  const removeCurrentPageBookmarkCommandDisposable = registerGrowiCommand(
    GROWI_COMMANDS.removeCurrentPageBookmark,
    createRemoveCurrentPageBookmarkCommand(deps),
  );
  const showBookmarksCommandDisposable = registerGrowiCommand(
    GROWI_COMMANDS.showBookmarks,
    createShowBookmarksCommand(deps),
  );
  const createPageCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.createPage,
    createCreatePageCommand(deps),
  );
  const deletePageCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.deletePage,
    createDeletePageCommand(deps),
  );
  const renamePageCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.renamePage,
    createRenamePageCommand(deps),
  );
  const refreshCurrentPageCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.refreshCurrentPage,
    async (uri?: unknown) => {
      await createRefreshCurrentPageCommand(deps)(uri as never);
      await reevaluateActiveGrowiPageStatus();
    },
  );
  const showCurrentPageActionsCommandDisposable =
    vscode.commands.registerCommand(
      GROWI_COMMANDS.showCurrentPageActions,
      createShowCurrentPageActionsCommand({
        getActiveEditorUri() {
          return deps.getActiveEditorUri();
        },
        isBookmarked(canonicalPath: string) {
          return deps.isBookmarked(canonicalPath);
        },
        async executeCommand(command: string, ...args: unknown[]) {
          await vscode.commands.executeCommand(command, ...args);
        },
        showErrorMessage(message: string) {
          deps.showErrorMessage(message);
        },
        async showQuickPick(
          items: readonly { label: string; command: string }[],
          options: { placeHolder: string },
        ) {
          return await vscode.window.showQuickPick(items, options);
        },
      }),
    );
  const showLocalMirrorActionsCommandDisposable =
    vscode.commands.registerCommand(
      "growi.showLocalMirrorActions",
      createShowLocalRoundTripActionsCommand({
        getActiveEditorUri() {
          return deps.getActiveEditorUri();
        },
        async executeCommand(command: string, ...args: unknown[]) {
          await vscode.commands.executeCommand(command, ...args);
        },
        showErrorMessage(message: string) {
          deps.showErrorMessage(message);
        },
        async showQuickPick(
          items: readonly { label: string; command: string }[],
          options: { placeHolder: string },
        ) {
          return await vscode.window.showQuickPick(items, options);
        },
      }),
    );
  const createLocalMirrorForCurrentPageCommandDisposable =
    vscode.commands.registerCommand(
      "growi.createLocalMirrorForCurrentPage",
      async (target?: unknown) => {
        await createDownloadCurrentPageToLocalFileCommand(deps)(
          target as never,
        );
        await reevaluateActiveGrowiPageStatus();
      },
    );
  const createLocalMirrorForCurrentPrefixCommandDisposable =
    vscode.commands.registerCommand(
      "growi.createLocalMirrorForCurrentPrefix",
      async (target?: unknown) => {
        const exported = await createDownloadCurrentPageSetToLocalBundleCommand(
          deps,
        )(target as never);
        if (exported) {
          await reevaluateActiveGrowiPageStatus();
        }
        return exported;
      },
    );
  const refreshLocalMirrorCommandDisposable = vscode.commands.registerCommand(
    "growi.refreshLocalMirror",
    async (target?: unknown) => {
      const result = await createRefreshLocalMirrorCommand(deps)(
        target as never,
      );
      await reevaluateActiveGrowiPageStatus();
      return result;
    },
  );
  const compareLocalMirrorWithGrowiCommand =
    createCompareLocalBundleWithGrowiCommand(deps);
  const compareLocalMirrorWithGrowiCommandDisposable =
    registerGrowiCommand(
      "growi.compareLocalMirrorWithGrowi",
      async (target?: unknown) => {
        const compared = await compareLocalMirrorWithGrowiCommand(
          target as never,
        );
        if (compared) {
          await reevaluateActiveGrowiPageStatus();
        }
        return compared;
      },
    );
  const uploadLocalMirrorToGrowiCommandDisposable =
    registerGrowiCommand(
      "growi.uploadLocalMirrorToGrowi",
      async (target?: unknown) => {
        const uploaded = await createUploadLocalBundleToGrowiCommand(deps)(
          target as never,
        );
        if (uploaded) {
          await reevaluateActiveGrowiPageStatus();
        }
        return uploaded;
      },
    );
  const scmCompareMirrorAgainCommand = createScmCompareMirrorAgainCommand(deps);
  const scmCompareMirrorAgainCommandDisposable =
    registerGrowiCommand(
      GROWI_COMMANDS.scmCompareMirrorAgain,
      async () => {
        const compared = await scmCompareMirrorAgainCommand();
        if (compared) {
          await reevaluateActiveGrowiPageStatus();
        }
        return compared;
      },
    );
  const scmUploadMirrorResourcesCommand =
    createScmUploadMirrorResourcesCommand(deps);
  const scmUploadMirrorResourcesCommandDisposable =
    registerGrowiCommand(
      GROWI_COMMANDS.scmUploadMirrorResources,
      async (...args: unknown[]) => {
        const resources =
          mirrorCompareSourceControl.getResourcesFromCommandArgs(args) ?? [];
        await logScmCommandContext(
          GROWI_COMMANDS.scmUploadMirrorResources,
          args,
          resources,
        );
        const results = await scmUploadMirrorResourcesCommand(resources);
        if (results) {
          const currentState = mirrorCompareSourceControl.getState();
          if (currentState) {
            await compareLocalMirrorWithGrowiCommand(
              {
                uri: vscode.Uri.parse(
                  `growi:${currentState.currentCanonicalPath}.md`,
                ),
                scope: currentState.targetScope,
              },
              {
                openChangesEditor: false,
              },
            );
          }
          await reevaluateActiveGrowiPageStatus();
        }
        return results;
      },
    );
  const scmTakeRemoteMirrorResourcesCommand =
    createScmTakeRemoteMirrorResourcesCommand(deps);
  const scmTakeRemoteMirrorResourcesCommandDisposable =
    registerGrowiCommand(
      GROWI_COMMANDS.scmTakeRemoteMirrorResources,
      async (...args: unknown[]) => {
        const resources =
          mirrorCompareSourceControl.getResourcesFromCommandArgs(args) ?? [];
        await logScmCommandContext(
          GROWI_COMMANDS.scmTakeRemoteMirrorResources,
          args,
          resources,
        );
        const results = await scmTakeRemoteMirrorResourcesCommand(resources);
        if (results) {
          const currentState = mirrorCompareSourceControl.getState();
          if (currentState) {
            await compareLocalMirrorWithGrowiCommand(
              {
                uri: vscode.Uri.parse(
                  `growi:${currentState.currentCanonicalPath}.md`,
                ),
                scope: currentState.targetScope,
              },
              {
                openChangesEditor: false,
              },
            );
          }
          await reevaluateActiveGrowiPageStatus();
        }
        return results;
      },
    );
  const startEditCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.startEdit,
    createStartEditCommand(deps),
  );
  const endEditCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.endEdit,
    createEndEditCommand(deps),
  );
  const refreshListingCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.refreshListing,
    createRefreshListingCommand(deps),
  );
  const showCurrentPageInfoCommandDisposable = registerGrowiCommand(
    GROWI_COMMANDS.showCurrentPageInfo,
    createShowCurrentPageInfoCommand(deps),
  );
  const showCurrentPageAttachmentsCommandDisposable = registerGrowiCommand(
    GROWI_COMMANDS.showCurrentPageAttachments,
    createShowCurrentPageAttachmentsCommand(deps),
  );
  const showRevisionHistoryDiffCommandDisposable =
    vscode.commands.registerCommand(
      GROWI_COMMANDS.showRevisionHistoryDiff,
      createShowRevisionHistoryDiffCommand(deps),
    );
  const addPrefixCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.addPrefix,
    createAddPrefixCommand(deps),
  );
  const openPrefixRootPageCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.openPrefixRootPage,
    createOpenPrefixRootPageCommand(deps),
  );
  const openDirectoryPageCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.openDirectoryPage,
    createOpenDirectoryPageCommand(deps),
  );
  const explorerOpenPageItemCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.explorerOpenPageItem,
    createExplorerOpenPageItemCommand(deps),
  );
  const explorerOpenPageInBrowserCommandDisposable = registerGrowiCommand(
    GROWI_COMMANDS.explorerOpenPageInBrowser,
    createExplorerOpenPageInBrowserCommand(deps),
  );
  const explorerCreatePageHereCommandDisposable =
    vscode.commands.registerCommand(
      GROWI_COMMANDS.explorerCreatePageHere,
      createExplorerCreatePageHereCommand(deps),
    );
  const explorerRenamePageCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.explorerRenamePage,
    createExplorerRenamePageCommand(deps),
  );
  const explorerDeletePageCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.explorerDeletePage,
    createExplorerDeletePageCommand(deps),
  );
  const explorerRefreshCurrentPageCommandDisposable =
    vscode.commands.registerCommand(
      GROWI_COMMANDS.explorerRefreshCurrentPage,
      createExplorerRefreshCurrentPageCommand(deps),
    );
  const explorerShowBacklinksCommandDisposable =
    vscode.commands.registerCommand(
      GROWI_COMMANDS.explorerShowBacklinks,
      createExplorerShowBacklinksCommand(deps),
    );
  const explorerShowCurrentPageInfoCommandDisposable =
    vscode.commands.registerCommand(
      GROWI_COMMANDS.explorerShowCurrentPageInfo,
      createExplorerShowCurrentPageInfoCommand(deps),
    );
  const explorerShowCurrentPageAttachmentsCommandDisposable =
    registerGrowiCommand(
      GROWI_COMMANDS.explorerShowCurrentPageAttachments,
      createExplorerShowCurrentPageAttachmentsCommand(deps),
    );
  const explorerShowRevisionHistoryDiffCommandDisposable =
    vscode.commands.registerCommand(
      GROWI_COMMANDS.explorerShowRevisionHistoryDiff,
      createExplorerShowRevisionHistoryDiffCommand(deps),
    );
  const explorerCreateLocalMirrorForCurrentPageCommandDisposable =
    vscode.commands.registerCommand(
      "growi.explorerCreateLocalMirrorForCurrentPage",
      createExplorerDownloadCurrentPageToLocalFileCommand(deps),
    );
  const explorerCreateLocalMirrorForCurrentPrefixCommandDisposable =
    vscode.commands.registerCommand(
      "growi.explorerCreateLocalMirrorForCurrentPrefix",
      createExplorerDownloadCurrentPageSetToLocalBundleCommand(deps),
    );
  const explorerCompareLocalMirrorWithGrowiCommandDisposable =
    vscode.commands.registerCommand(
      "growi.explorerCompareLocalMirrorWithGrowi",
      createExplorerCompareLocalWorkFileWithCurrentPageCommand(deps),
    );
  const explorerUploadLocalMirrorToGrowiCommandDisposable =
    vscode.commands.registerCommand(
      "growi.explorerUploadLocalMirrorToGrowi",
      createExplorerUploadExportedLocalFileToGrowiCommand(deps),
    );
  const explorerCompareLocalMirrorSubtreeWithGrowiCommandDisposable =
    vscode.commands.registerCommand(
      "growi.explorerCompareLocalMirrorSubtreeWithGrowi",
      createExplorerCompareLocalBundleWithGrowiCommand(deps),
    );
  const explorerUploadLocalMirrorSubtreeToGrowiCommandDisposable =
    vscode.commands.registerCommand(
      "growi.explorerUploadLocalMirrorSubtreeToGrowi",
      createExplorerUploadLocalBundleToGrowiCommand(deps),
    );
  const clearPrefixesCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.clearPrefixes,
    createClearPrefixesCommand(deps),
  );
  const deletePrefixCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.deletePrefix,
    createDeletePrefixCommand(deps),
  );
  const showBacklinksCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.showBacklinks,
    createShowBacklinksCommand(deps),
  );
  const openReadmeCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.openReadme,
    createOpenReadmeCommand({
      getExtensionRoot() {
        return context.extensionUri?.fsPath ?? process.cwd();
      },
      async openLocalFile(localPath: string) {
        await deps.openLocalFile(localPath);
      },
    }),
  );
  const clearRuntimeLogsCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.clearRuntimeLogs,
    async () => {
      if (!runtimeLogsEnabled) {
        void vscode.window.showInformationMessage(
          "Runtime logs are available only in debug-f5 mode.",
        );
        return 0;
      }

      const directory = runtimeLogger.getResolvedRuntimeLogDirectory();
      if (!directory) {
        const status = runtimeLogger.getRuntimeLogStatus();
        void vscode.window.showInformationMessage(
          `Runtime log path is not resolved yet. mode=${status.mode} configuredPath=${status.configuredPath} workspaceResolved=${status.workspaceResolved}`,
        );
        return 0;
      }

      let removed = 0;
      try {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith(".jsonl")) {
            await rm(
              vscode.Uri.joinPath(vscode.Uri.file(directory), entry.name)
                .fsPath,
              { force: true },
            );
            removed += 1;
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }

      runtimeLogger.resetRuntimeLogState();
      void vscode.window.showInformationMessage(
        `Removed ${removed} runtime log file(s).`,
      );
      return removed;
    },
  );
  const pageFreshnessService = createPageFreshnessService({
    getLocalWorkspaceRoot() {
      const folder = vscode.workspace.workspaceFolders?.find(
        (candidate) => candidate.uri.scheme === "file",
      );
      return folder?.uri.fsPath;
    },
    getBaseUrl() {
      return vscode.workspace.getConfiguration("growi").get<string>("baseUrl");
    },
    async readLocalFile(localPath: string) {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.file(localPath),
      );
      return new TextDecoder().decode(bytes);
    },
    async bootstrapEditSession(canonicalPath: string) {
      return await deps.bootstrapEditSession(canonicalPath);
    },
    getEditSession(canonicalPath: string) {
      return editSessionRegistry.getEditSession(canonicalPath);
    },
    getCurrentPageInfo(canonicalPath: string) {
      return fileSystemProvider.getCurrentPageInfo(canonicalPath);
    },
    async getCurrentRevision(canonicalPath: string) {
      return await currentRevisionReader.getCurrentRevision(canonicalPath);
    },
  });
  const revealRuntimeLogsCommandDisposable = vscode.commands.registerCommand(
    GROWI_COMMANDS.revealRuntimeLogs,
    async () => {
      if (!runtimeLogsEnabled) {
        void vscode.window.showInformationMessage(
          "Runtime logs are available only in debug-f5 mode.",
        );
        return;
      }

      const directory = runtimeLogger.getResolvedRuntimeLogDirectory();
      if (!directory) {
        const status = runtimeLogger.getRuntimeLogStatus();
        void vscode.window.showInformationMessage(
          `Runtime log path is not resolved yet. mode=${status.mode} configuredPath=${status.configuredPath} workspaceResolved=${status.workspaceResolved}`,
        );
        return;
      }

      await vscode.env.openExternal(vscode.Uri.file(directory));
      return directory;
    },
  );
  const getResolvedRuntimeLogDirectoryCommandDisposable =
    vscode.commands.registerCommand(
      "growi.__test.getResolvedRuntimeLogDirectory",
      async () => {
        const directory = runtimeLogger.getResolvedRuntimeLogDirectory();
        if (directory) {
          return directory;
        }
        const status = runtimeLogger.getRuntimeLogStatus();
        return `unresolved: mode=${status.mode} configuredPath=${status.configuredPath} workspaceResolved=${status.workspaceResolved}`;
      },
    );
  const getMirrorCompareSourceControlStateCommandDisposable =
    vscode.commands.registerCommand(
      "growi.__test.getMirrorCompareSourceControlState",
      async () => mirrorCompareSourceControl.getState(),
    );

  const linkNavigationDeps = {
    getBaseUrl() {
      return vscode.workspace.getConfiguration("growi").get<string>("baseUrl");
    },
    async resolvePageReference(
      reference: Parameters<typeof pageReferenceResolver.resolveReference>[0],
    ): Promise<ResolveParsedGrowiReferenceResult> {
      return await pageReferenceResolver.resolveReference(reference);
    },
  };

  const vscodeModule = vscode as unknown as Record<string, unknown>;
  const languagesApi = Object.hasOwn(vscodeModule, "languages")
    ? (vscodeModule.languages as
        | {
            createDiagnosticCollection?: (
              name?: string,
            ) => vscode.DiagnosticCollection;
            registerDefinitionProvider?: (
              selector: vscode.DocumentSelector,
              provider: vscode.DefinitionProvider,
            ) => vscode.Disposable;
            registerDocumentLinkProvider?: (
              selector: vscode.DocumentSelector,
              provider: vscode.DocumentLinkProvider,
            ) => vscode.Disposable;
            registerDocumentSymbolProvider?: (
              selector: vscode.DocumentSelector,
              provider: vscode.DocumentSymbolProvider,
            ) => vscode.Disposable;
            registerFoldingRangeProvider?: (
              selector: vscode.DocumentSelector,
              provider: vscode.FoldingRangeProvider,
            ) => vscode.Disposable;
          }
        | undefined)
    : undefined;
  const workspaceApi = vscode.workspace as unknown as {
    onDidOpenTextDocument?: (
      listener: (document: vscode.TextDocument) => unknown,
    ) => vscode.Disposable;
    onDidChangeTextDocument?: (
      listener: (event: { document: vscode.TextDocument }) => unknown,
    ) => vscode.Disposable;
    onDidCloseTextDocument?: (
      listener: (document: vscode.TextDocument) => unknown,
    ) => vscode.Disposable;
    textDocuments?: readonly vscode.TextDocument[];
  };
  const windowApi = vscode.window as unknown as {
    activeTextEditor?: vscode.TextEditor;
    createStatusBarItem?: (
      id?: string,
      alignment?: vscode.StatusBarAlignment,
      priority?: number,
    ) => vscode.StatusBarItem;
    onDidChangeActiveTextEditor?: (
      listener: (editor: vscode.TextEditor | undefined) => unknown,
    ) => vscode.Disposable;
  };

  const documentLinkProviderDisposable =
    languagesApi?.registerDocumentLinkProvider?.(
      { language: "markdown", scheme: "growi" },
      createGrowiDocumentLinkProvider(linkNavigationDeps),
    ) ?? noopDisposable;
  const definitionProviderDisposable =
    languagesApi?.registerDefinitionProvider?.(
      { language: "markdown", scheme: "growi" },
      createGrowiDefinitionProvider(linkNavigationDeps),
    ) ?? noopDisposable;
  const documentSymbolProviderDisposable =
    languagesApi?.registerDocumentSymbolProvider?.(
      { language: "markdown", scheme: "growi" },
      createGrowiDocumentSymbolProvider(),
    ) ?? noopDisposable;
  const drawioFoldingRangeProviderDisposable =
    languagesApi?.registerFoldingRangeProvider?.(
      { language: "markdown", scheme: "growi" },
      createDrawioFoldingRangeProvider(),
    ) ?? noopDisposable;
  const diagnosticsCollection =
    languagesApi?.createDiagnosticCollection?.("growi-link-navigation") ??
    undefined;
  const drawioAutoFoldedDocumentUris = new Set<string>();

  const updateLinkDiagnostics = (document: vscode.TextDocument) => {
    if (
      !diagnosticsCollection ||
      document.uri.scheme !== "growi" ||
      document.languageId !== "markdown"
    ) {
      return;
    }

    void collectGrowiLinkDiagnostics(document, linkNavigationDeps).then(
      (diagnostics) => {
        diagnosticsCollection.set(document.uri, diagnostics);
      },
    );
  };

  const clearLinkDiagnostics = (document: vscode.TextDocument) => {
    if (!diagnosticsCollection || document.uri.scheme !== "growi") {
      return;
    }

    diagnosticsCollection.delete(document.uri);
  };

  const updateEditSessionDirty = (document: vscode.TextDocument) => {
    if (document.uri.scheme !== "growi" || document.languageId !== "markdown") {
      return;
    }

    const editSession = editSessionRegistry.getEditSession(document.uri.path);
    if (!editSession) {
      return;
    }

    const dirty = document.getText() !== editSession.baseBody;
    editSessionRegistry.updateEditSession(document.uri.path, (session) => ({
      ...session,
      dirty,
    }));
  };
  const editStatusBarItem =
    windowApi.createStatusBarItem?.(
      "growi.editSessionStatus",
      vscode.StatusBarAlignment.Left,
      100,
    ) ?? undefined;

  const isGrowiFilePage = (document: vscode.TextDocument | undefined) =>
    Boolean(
      document &&
        document.uri.scheme === "growi" &&
        document.uri.path !== "/" &&
        !document.uri.path.endsWith("/"),
    );
  const isGrowiMarkdownPage = (document: vscode.TextDocument | undefined) =>
    Boolean(isGrowiFilePage(document) && document?.languageId === "markdown");

  const maybeAutoFoldDrawioDocument = async (
    editor: vscode.TextEditor | undefined = windowApi.activeTextEditor,
  ) => {
    if (!editor || !isGrowiMarkdownPage(editor.document)) {
      return;
    }

    const documentUri = editor.document.uri.toString();
    if (drawioAutoFoldedDocumentUris.has(documentUri)) {
      return;
    }

    const selectionLines = collectDrawioAutoFoldSelectionLines(editor.document);
    if (selectionLines.length === 0) {
      return;
    }

    drawioAutoFoldedDocumentUris.add(documentUri);
    try {
      await vscode.commands.executeCommand("editor.fold", { selectionLines });
    } catch {
      drawioAutoFoldedDocumentUris.delete(documentUri);
    }
  };

  const updateEditStatusBar = (
    editor: vscode.TextEditor | undefined = windowApi.activeTextEditor,
  ) => {
    if (!editStatusBarItem || !editor) {
      editStatusBarItem?.hide();
      return;
    }

    const { document } = editor;
    if (document.uri.scheme !== "growi") {
      editStatusBarItem.hide();
      return;
    }

    if (document.uri.path === "/" || document.uri.path.endsWith("/")) {
      editStatusBarItem.hide();
      return;
    }

    const isEditing = Boolean(
      editSessionRegistry.getEditSession(document.uri.path),
    );
    editStatusBarItem.text = isEditing ? "$(unlock) 編集中" : "$(lock) 閲覧中";
    editStatusBarItem.command = isEditing
      ? GROWI_COMMANDS.endEdit
      : GROWI_COMMANDS.startEdit;
    editStatusBarItem.show();
  };

  const resolveGrowiPageCanonicalPath = (
    document: vscode.TextDocument | undefined,
  ): string | undefined => {
    if (!document || document.uri.scheme !== "growi") {
      return undefined;
    }
    if (!document.uri.path.endsWith(".md")) {
      return undefined;
    }

    const normalized = buildGrowiUriFromInput(document.uri.path);
    if (!normalized.ok || normalized.value.canonicalPath === "/") {
      return undefined;
    }

    return normalized.value.canonicalPath;
  };

  async function updatePageLiveStatus(
    document: vscode.TextDocument | undefined,
  ): Promise<void> {
    const canonicalPath = resolveGrowiPageCanonicalPath(document);
    if (!canonicalPath) {
      return;
    }

    const liveState =
      await pageFreshnessService.getOpenedPageLiveState(canonicalPath);
    if (liveState.decorationStatus === "none") {
      prefixTreeDataProvider.clearStaleState(canonicalPath);
    } else {
      prefixTreeDataProvider.setPageDecorationStatus(
        canonicalPath,
        liveState.decorationStatus,
      );
    }
    prefixTreeDataProvider.refresh();
  }

  async function reevaluateActiveGrowiPageStatus(): Promise<void> {
    await updatePageLiveStatus(windowApi.activeTextEditor?.document);
  }

  for (const document of workspaceApi.textDocuments ?? []) {
    updateLinkDiagnostics(document);
  }
  updateEditStatusBar();
  void maybeAutoFoldDrawioDocument();

  const onDidOpenTextDocumentDisposable =
    workspaceApi.onDidOpenTextDocument?.((document) => {
      updateLinkDiagnostics(document);
      if (
        windowApi.activeTextEditor?.document.uri.toString() ===
        document.uri.toString()
      ) {
        void maybeAutoFoldDrawioDocument(windowApi.activeTextEditor);
      }
    }) ?? noopDisposable;
  const onDidChangeTextDocumentDisposable =
    workspaceApi.onDidChangeTextDocument?.((event) => {
      updateLinkDiagnostics(event.document);
      updateEditSessionDirty(event.document);
      void reevaluateActiveGrowiPageStatus();
    }) ?? noopDisposable;
  const onDidCloseTextDocumentDisposable =
    workspaceApi.onDidCloseTextDocument?.((document) => {
      clearLinkDiagnostics(document);
      drawioAutoFoldedDocumentUris.delete(document.uri.toString());
    }) ?? noopDisposable;
  const onDidChangeActiveTextEditorDisposable =
    windowApi.onDidChangeActiveTextEditor?.((editor) => {
      updateEditStatusBar(editor);
      void maybeAutoFoldDrawioDocument(editor);
      void updatePageLiveStatus(editor?.document);
    }) ?? noopDisposable;
  const onDidChangeEditSessionDisposable = editSessionRegistry.onDidChange(
    (event) => {
      updateEditStatusBar();
      if (event.kind === "set" || event.kind === "close") {
        fileSystemProvider.fireFileChangedForCanonicalPath(event.canonicalPath);
        void reevaluateActiveGrowiPageStatus();
      }
    },
  );

  const navigationCommandsDisposable: vscode.Disposable = {
    dispose() {
      openPageCommandDisposable.dispose();
      addCurrentPageBookmarkCommandDisposable.dispose();
      removeCurrentPageBookmarkCommandDisposable.dispose();
      showBookmarksCommandDisposable.dispose();
      createPageCommandDisposable.dispose();
      deletePageCommandDisposable.dispose();
      renamePageCommandDisposable.dispose();
      refreshCurrentPageCommandDisposable.dispose();
      showCurrentPageActionsCommandDisposable.dispose();
      showLocalMirrorActionsCommandDisposable.dispose();
      startEditCommandDisposable.dispose();
      endEditCommandDisposable.dispose();
      refreshLocalMirrorCommandDisposable.dispose();
      createLocalMirrorForCurrentPageCommandDisposable.dispose();
      createLocalMirrorForCurrentPrefixCommandDisposable.dispose();
      compareLocalMirrorWithGrowiCommandDisposable.dispose();
      uploadLocalMirrorToGrowiCommandDisposable.dispose();
      scmCompareMirrorAgainCommandDisposable.dispose();
      scmUploadMirrorResourcesCommandDisposable.dispose();
      scmTakeRemoteMirrorResourcesCommandDisposable.dispose();
      refreshListingCommandDisposable.dispose();
      showCurrentPageInfoCommandDisposable.dispose();
      showCurrentPageAttachmentsCommandDisposable.dispose();
      showRevisionHistoryDiffCommandDisposable.dispose();
      addPrefixCommandDisposable.dispose();
      openPrefixRootPageCommandDisposable.dispose();
      openDirectoryPageCommandDisposable.dispose();
      explorerOpenPageItemCommandDisposable.dispose();
      explorerOpenPageInBrowserCommandDisposable.dispose();
      explorerCreatePageHereCommandDisposable.dispose();
      explorerRenamePageCommandDisposable.dispose();
      explorerDeletePageCommandDisposable.dispose();
      explorerRefreshCurrentPageCommandDisposable.dispose();
      explorerShowBacklinksCommandDisposable.dispose();
      explorerShowCurrentPageInfoCommandDisposable.dispose();
      explorerShowCurrentPageAttachmentsCommandDisposable.dispose();
      explorerShowRevisionHistoryDiffCommandDisposable.dispose();
      explorerCreateLocalMirrorForCurrentPageCommandDisposable.dispose();
      explorerCreateLocalMirrorForCurrentPrefixCommandDisposable.dispose();
      explorerCompareLocalMirrorWithGrowiCommandDisposable.dispose();
      explorerUploadLocalMirrorToGrowiCommandDisposable.dispose();
      explorerCompareLocalMirrorSubtreeWithGrowiCommandDisposable.dispose();
      explorerUploadLocalMirrorSubtreeToGrowiCommandDisposable.dispose();
      clearPrefixesCommandDisposable.dispose();
      deletePrefixCommandDisposable.dispose();
      showBacklinksCommandDisposable.dispose();
      openReadmeCommandDisposable.dispose();
      clearRuntimeLogsCommandDisposable.dispose();
      revealRuntimeLogsCommandDisposable.dispose();
      getResolvedRuntimeLogDirectoryCommandDisposable.dispose();
      getMirrorCompareSourceControlStateCommandDisposable.dispose();
      documentLinkProviderDisposable.dispose();
      definitionProviderDisposable.dispose();
      documentSymbolProviderDisposable.dispose();
      drawioFoldingRangeProviderDisposable.dispose();
      onDidOpenTextDocumentDisposable.dispose();
      onDidChangeTextDocumentDisposable.dispose();
      onDidCloseTextDocumentDisposable.dispose();
      onDidChangeActiveTextEditorDisposable.dispose();
      onDidChangeEditSessionDisposable.dispose();
      editStatusBarItem?.dispose();
      diagnosticsCollection?.dispose();
      outputChannel.dispose();
      setGrowiAssetProxyUrlResolver(undefined);
      void assetProxy.dispose();
    },
  };

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider("growi", fileSystemProvider, {
      isCaseSensitive: true,
    }),
    mirrorCompareSourceControl.sourceControl,
    (
      vscode.workspace as unknown as {
        registerTextDocumentContentProvider?: (
          scheme: string,
          provider: vscode.TextDocumentContentProvider,
        ) => vscode.Disposable;
      }
    ).registerTextDocumentContentProvider?.(
      GROWI_REVISION_SCHEME,
      revisionContentProvider,
    ) ?? noopDisposable,
    (
      vscode.window as unknown as {
        registerTreeDataProvider?: (
          viewId: string,
          treeDataProvider: vscode.TreeDataProvider<unknown>,
        ) => vscode.Disposable;
      }
    ).registerTreeDataProvider?.(
      GROWI_EXPLORER_VIEW_ID,
      prefixTreeDataProvider,
    ) ?? noopDisposable,
    vscode.commands.registerCommand(
      GROWI_COMMANDS.configureBaseUrl,
      createConfigureBaseUrlCommand(deps),
    ),
    vscode.commands.registerCommand(
      GROWI_COMMANDS.configureApiToken,
      createConfigureApiTokenCommand(deps),
    ),
    openReadmeCommandDisposable,
    navigationCommandsDisposable,
  );
}

export function deactivate(): void {
  // No-op during bootstrap.
}

export function extendMarkdownIt<T>(md: T): T {
  return extendMarkdownPreviewIt(md as never) as T;
}
