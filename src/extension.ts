import path from "node:path";
import * as vscode from "vscode";
import { assertPathOutsideExtensionRootForMutation } from "./core/mutationGuard";
import { buildGrowiUriFromInput, normalizeCanonicalPath } from "./core/uri";
import { createGrowiAssetProxy } from "./vscode/assetProxy";
import {
  combineDisposables,
  registerBookmarkCommands,
  registerCurrentPageCommands,
  registerMirrorCommands,
  registerNavigationCommands,
  registerPrefixCommands,
} from "./vscode/commandRegistration";
import {
  type BookmarkListEntry,
  buildOpenPageSearchEntry,
  createAddCurrentPageBookmarkCommand,
  createAddPrefixCommand,
  createClearPrefixesCommand,
  createCompareLocalMirrorSubtreeWithGrowiCommand,
  createConfigureApiTokenCommand,
  createConfigureBaseUrlCommand,
  createCreatePageCommand,
  createDeletePageCommand,
  createDeletePrefixCommand,
  createEndEditCommand,
  createLocalMirrorForCurrentPageCommand,
  createLocalMirrorForCurrentPrefixCommand,
  createOpenCurrentPageHubCommand,
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
  createShowLocalMirrorActionsCommand,
  createShowRevisionHistoryDiffCommand,
  createStartEditCommand,
  createUploadLocalMirrorSubtreeToGrowiCommand,
  isOpenPageDirectInputPreferred,
  loadCurrentPageDetailSummary,
  type OpenPageSearchEntry,
  rankOpenPageSearchEntries,
} from "./vscode/commands";
import {
  GROWI_COMMANDS,
  GROWI_README_URI,
  GROWI_SECRET_KEYS,
  OPEN_PAGE_DIRECT_INPUT_DESCRIPTION,
  OPEN_PAGE_DIRECT_INPUT_LABEL,
  OPEN_PAGE_QUICK_PICK_PLACEHOLDER,
  SHOW_BOOKMARKS_OPEN_DETAIL_PREFIX,
  SHOW_BOOKMARKS_PLACEHOLDER,
  SHOW_BOOKMARKS_STATUS_OUTSIDE_PREFIX,
  SHOW_BOOKMARKS_STATUS_UNRESOLVABLE,
} from "./vscode/commandsConstants";
import {
  getGrowiLocalMirrorMaxPrefixPages,
  getGrowiPageListingInitialPageSize,
  getGrowiPageListingMaxAutoPagesPerPrefix,
} from "./vscode/config";
import { createCurrentPageDetailWebviewController } from "./vscode/currentPageDetailWebview";
import { registerDocumentProviderFeature } from "./vscode/documentProviderFeature";
import { createEditSessionRegistry } from "./vscode/editSessionRegistry";
import { createGrowiExplorerFeature } from "./vscode/explorerFeature";
import {
  type GrowiCurrentRevisionReader,
  type GrowiEditSession,
  type GrowiEditSessionReference,
  GrowiFileSystemProvider,
  type GrowiPageCreator,
  type GrowiPageDeleter,
  type GrowiPageListOptions,
  type GrowiPageListReader,
  type GrowiPageReader,
  type GrowiPageRenameResult,
  type GrowiPageWriter,
  type GrowiSaveFailureNotifier,
} from "./vscode/fsProvider";
import type { GrowiBookmarkEntry } from "./vscode/growiApi";
import { createGrowiApiAdapter } from "./vscode/growiApi";
import {
  extendMarkdownPreviewIt,
  setGrowiAssetProxyUrlResolver,
} from "./vscode/markdownPreview";
import type {
  MirrorCompareScmResource,
  MirrorCompareScmState,
} from "./vscode/mirror/mirrorCompareScm";
import { createGrowiMirrorCompareSourceControl } from "./vscode/mirror/mirrorCompareSourceControl";
import { createVscodeMirrorLocalChangeMonitor } from "./vscode/mirror/mirrorLocalChangeMonitor";
import { createMirrorRemoteMetadataChecker } from "./vscode/mirror/mirrorRemoteMetadataCheck";
import { createPageFreshnessService } from "./vscode/pageFreshnessService";
import {
  createPageReferenceResolver,
  type ResolveParsedGrowiReferenceResult,
} from "./vscode/pageReferenceResolver";
import { createPrefixRegistry } from "./vscode/prefixRegistry";
import { GrowiRevisionContentProvider } from "./vscode/revisionContentProvider";
import { GROWI_REVISION_SCHEME } from "./vscode/revisionModel";
import { registerRuntimeLogFeature } from "./vscode/runtimeLogFeature";
import { RuntimeLogger } from "./vscode/runtimeLogger";

export {
  assertPathOutsideExtensionRootForMutation,
  isPathWithinOrEqual,
  resolveRealPathForMutationGuard,
} from "./core/mutationGuard";
export { buildGrowiUriFromInput, normalizeCanonicalPath } from "./core/uri";
export {
  createAddCurrentPageBookmarkCommand,
  createAddPrefixCommand,
  createClearPrefixesCommand,
  createCompareLocalMirrorSubtreeWithGrowiCommand,
  createCompareLocalMirrorWithGrowiCommand,
  createConfigureApiTokenCommand,
  createConfigureBaseUrlCommand,
  createCreatePageCommand,
  createDeletePrefixCommand,
  createEndEditCommand,
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
  createExplorerShowCurrentPageInfoCommand,
  createExplorerShowRevisionHistoryDiffCommand,
  createExplorerUploadLocalMirrorSubtreeToGrowiCommand,
  createExplorerUploadLocalMirrorToGrowiCommand,
  createLocalMirrorForCurrentPageCommand,
  createLocalMirrorForCurrentPrefixCommand,
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
  createShowLocalMirrorActionsCommand,
  createShowRevisionHistoryDiffCommand,
  createStartEditCommand,
  createUploadLocalMirrorSubtreeToGrowiCommand,
  createUploadLocalMirrorToGrowiCommand,
  normalizeBaseUrl,
} from "./vscode/commands";
export { GROWI_COMMANDS } from "./vscode/commandsConstants";

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
  const explorerFeature = createGrowiExplorerFeature({
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
    getDirectoryListingState(uri) {
      return fileSystemProvider.getReadDirectoryListingState(uri);
    },
  });
  const prefixTreeDataProvider = explorerFeature.prefixTreeDataProvider;
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
  const extensionRoot = context.extensionUri?.fsPath ?? process.cwd();
  const readmeContentProvider: vscode.TextDocumentContentProvider = {
    async provideTextDocumentContent() {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.file(path.join(extensionRoot, "README.md")),
      );
      return new TextDecoder().decode(bytes);
    },
  };
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
    GROWI_COMMANDS.scmCheckRemoteMetadata,
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

    return `object(keys=${Object.keys(value).slice(0, 4).join(",")})`;
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
    explorerFeature.refresh();
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

  const mirrorRemoteMetadataChecker = createMirrorRemoteMetadataChecker({
    getWorkspaceFolders: () => vscode.workspace.workspaceFolders,
    getBaseUrl: () =>
      vscode.workspace.getConfiguration("growi").get<string>("baseUrl"),
    async readLocalFile(localPath) {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.file(localPath),
      );
      return new TextDecoder().decode(bytes);
    },
    async getPageInfo(canonicalPath) {
      const configured = await getConfiguredApiContext();
      if (!configured.ok) {
        return configured;
      }
      return growiApi.getPageInfo(
        canonicalPath,
        configured.baseUrl,
        configured.apiToken,
      );
    },
    getMirrorCompareSourceControlState: () =>
      mirrorCompareSourceControl.getState(),
    setMirrorCompareSourceControlState: (state) =>
      mirrorCompareSourceControl.setState(state),
    setMirrorCompareTreeSnapshotState: (state) => {
      prefixTreeDataProvider.setCompareSnapshot(state);
      prefixTreeDataProvider.refresh();
    },
    now: () => Date.now(),
  });

  const mirrorLocalChangeMonitor = createVscodeMirrorLocalChangeMonitor({
    getBaseUrl: () =>
      vscode.workspace.getConfiguration("growi").get<string>("baseUrl"),
    getMirrorCompareSourceControlState: () =>
      mirrorCompareSourceControl.getState(),
    setMirrorCompareSourceControlState: (state) =>
      mirrorCompareSourceControl.setState(state),
    setMirrorCompareTreeSnapshotState: (state) => {
      prefixTreeDataProvider.setCompareSnapshot(state);
      prefixTreeDataProvider.refresh();
    },
    onLocalOnlyRefresh: ({ localChangedResources }) => {
      void mirrorRemoteMetadataChecker.checkLocalChangedResources(
        localChangedResources,
      );
    },
  });

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
    async listPages(
      canonicalPrefixPath: string,
      options?: GrowiPageListOptions,
    ) {
      const configured = await getConfiguredApiContext();
      if (!configured.ok) {
        return configured;
      }

      return growiApi.listPages(
        canonicalPrefixPath,
        configured.baseUrl,
        configured.apiToken,
        options?.limit === undefined
          ? {
              ...options,
              limit: getGrowiPageListingInitialPageSize(),
            }
          : options,
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

  const collectOpenPageInitialCandidatePaths = (): string[] => {
    const paths = new Set<string>();
    const baseUrl = vscode.workspace
      .getConfiguration("growi")
      .get<string>("baseUrl");
    if (baseUrl && bookmarkCache.baseUrl === baseUrl) {
      for (const bookmark of bookmarkCache.bookmarks) {
        paths.add(bookmark.canonicalPath);
      }
    }

    for (const document of vscode.workspace.textDocuments) {
      if (
        document.uri.scheme !== "growi" ||
        !document.uri.path.endsWith(".md")
      ) {
        continue;
      }
      const normalized = normalizeCanonicalPath(document.uri.path.slice(0, -3));
      if (normalized.ok) {
        paths.add(normalized.value);
      }
    }

    for (const cachedPath of fileSystemProvider.getCachedReadDirectoryPaths()) {
      paths.add(cachedPath);
    }

    return [...paths];
  };

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
    async checkRemoteMetadataForPage(canonicalPath: string) {
      return mirrorRemoteMetadataChecker.checkPageMetadata(canonicalPath, {
        respectCooldown: true,
        allowCreateState: true,
      });
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
    getOpenPageInitialCandidatePaths() {
      return collectOpenPageInitialCandidatePaths();
    },
    getOpenPageBoundedSearchLimit() {
      return getGrowiPageListingMaxAutoPagesPerPrefix();
    },
    getLocalMirrorMaxPrefixPages() {
      return getGrowiLocalMirrorMaxPrefixPages();
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
    async listPages(
      canonicalPrefixPath: string,
      options?: GrowiPageListOptions,
    ) {
      const configured = await getConfiguredApiContext();
      if (!configured.ok) {
        return configured;
      }

      return growiApi.listPages(
        canonicalPrefixPath,
        configured.baseUrl,
        configured.apiToken,
        options?.limit === undefined
          ? {
              ...options,
              limit: getGrowiPageListingInitialPageSize(),
            }
          : options,
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
        search(query: string): Promise<readonly OpenPageSearchEntry[]>;
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
          let searchSequence = 0;

          const setRankedItems = (
            entries: readonly OpenPageSearchEntry[],
            query: string,
          ) => {
            const rankedItems = rankOpenPageSearchEntries(entries, query);
            quickPick.items = isOpenPageDirectInputPreferred(query)
              ? [directInputItem, ...rankedItems]
              : [...rankedItems, directInputItem];
          };

          const updateItems = () => {
            const query = quickPick.value;
            const sequence = ++searchSequence;
            if (query.trim().length === 0) {
              setRankedItems(items, query);
              return;
            }

            void options
              .search(query)
              .then((searchedItems) => {
                if (settled || sequence !== searchSequence) {
                  return;
                }
                setRankedItems(searchedItems, query);
              })
              .catch(() => {
                if (settled || sequence !== searchSequence) {
                  return;
                }
                quickPick.items = [directInputItem];
              });
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
      await assertPathOutsideExtensionRootForMutation(extensionRoot, localPath);
      await vscode.workspace.fs.delete(vscode.Uri.file(localPath), {
        recursive: true,
        useTrash: false,
      });
    },
    async writeLocalFile(localPath: string, content: string) {
      await assertPathOutsideExtensionRootForMutation(extensionRoot, localPath);
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
  const currentPageDetailWebviewController =
    createCurrentPageDetailWebviewController({
      extensionUri: context.extensionUri,
      executeCommand(command: string, ...args: unknown[]) {
        return vscode.commands.executeCommand(command, ...args);
      },
    });
  let reevaluateActiveGrowiPageStatus = async (): Promise<void> => {};
  const compareLocalMirrorWithGrowiCommand =
    createCompareLocalMirrorSubtreeWithGrowiCommand(deps);
  const scmCompareMirrorAgainCommand = createScmCompareMirrorAgainCommand(deps);
  const scmUploadMirrorResourcesCommand =
    createScmUploadMirrorResourcesCommand(deps);
  const scmTakeRemoteMirrorResourcesCommand =
    createScmTakeRemoteMirrorResourcesCommand(deps);
  const navigationCommandsDisposable = registerNavigationCommands([
    {
      commandId: GROWI_COMMANDS.openPage,
      handler: openPageCommand,
      registrar: registerGrowiCommand,
    },
  ]);
  const readmeCommandDisposable = registerNavigationCommands([
    {
      commandId: GROWI_COMMANDS.openReadme,
      handler: createOpenReadmeCommand({
        async openUri(uri: string) {
          await deps.openUri(uri);
        },
      }),
    },
  ]);
  const bookmarkCommandsDisposable = registerBookmarkCommands([
    {
      commandId: GROWI_COMMANDS.addCurrentPageBookmark,
      handler: createAddCurrentPageBookmarkCommand(deps),
      registrar: registerGrowiCommand,
    },
    {
      commandId: GROWI_COMMANDS.removeCurrentPageBookmark,
      handler: createRemoveCurrentPageBookmarkCommand(deps),
      registrar: registerGrowiCommand,
    },
    {
      commandId: GROWI_COMMANDS.showBookmarks,
      handler: createShowBookmarksCommand(deps),
      registrar: registerGrowiCommand,
    },
  ]);
  const currentPageCommandsDisposable = registerCurrentPageCommands([
    {
      commandId: GROWI_COMMANDS.createPage,
      handler: createCreatePageCommand(deps),
    },
    {
      commandId: GROWI_COMMANDS.deletePage,
      handler: createDeletePageCommand(deps),
    },
    {
      commandId: GROWI_COMMANDS.renamePage,
      handler: createRenamePageCommand(deps),
    },
    {
      commandId: GROWI_COMMANDS.refreshCurrentPage,
      handler: async (uri?: unknown) => {
        await createRefreshCurrentPageCommand(deps)(uri as never);
        await reevaluateActiveGrowiPageStatus();
      },
    },
    {
      commandId: GROWI_COMMANDS.showCurrentPageActions,
      handler: createShowCurrentPageActionsCommand({
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
    },
    {
      commandId: GROWI_COMMANDS.openCurrentPageHub,
      handler: createOpenCurrentPageHubCommand({
        getActiveEditorUri() {
          return deps.getActiveEditorUri();
        },
        isBookmarked(canonicalPath: string) {
          return deps.isBookmarked(canonicalPath);
        },
        async executeCommand(command: string, ...args: unknown[]) {
          await vscode.commands.executeCommand(command, ...args);
        },
        async loadPageDetailSummary(canonicalPath: string) {
          return await loadCurrentPageDetailSummary(deps, canonicalPath);
        },
        async openPageDetailWebview(input) {
          currentPageDetailWebviewController.open(input);
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
    },
    {
      commandId: GROWI_COMMANDS.startEdit,
      handler: createStartEditCommand(deps),
    },
    { commandId: GROWI_COMMANDS.endEdit, handler: createEndEditCommand(deps) },
    {
      commandId: GROWI_COMMANDS.showCurrentPageInfo,
      handler: createShowCurrentPageInfoCommand(deps),
      registrar: registerGrowiCommand,
    },
    {
      commandId: GROWI_COMMANDS.showCurrentPageAttachments,
      handler: createShowCurrentPageAttachmentsCommand(deps),
      registrar: registerGrowiCommand,
    },
    {
      commandId: GROWI_COMMANDS.showRevisionHistoryDiff,
      handler: createShowRevisionHistoryDiffCommand(deps),
    },
    {
      commandId: GROWI_COMMANDS.showBacklinks,
      handler: createShowBacklinksCommand(deps),
    },
  ]);
  const mirrorCommandsDisposable = registerMirrorCommands([
    {
      commandId: GROWI_COMMANDS.showLocalMirrorActions,
      handler: createShowLocalMirrorActionsCommand({
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
    },
    {
      commandId: GROWI_COMMANDS.createLocalMirrorForCurrentPage,
      handler: async (target?: unknown) => {
        await createLocalMirrorForCurrentPageCommand(deps)(target as never);
        await reevaluateActiveGrowiPageStatus();
      },
    },
    {
      commandId: GROWI_COMMANDS.createLocalMirrorForCurrentPrefix,
      handler: async (target?: unknown) => {
        const exported = await createLocalMirrorForCurrentPrefixCommand(deps)(
          target as never,
        );
        if (exported) {
          await reevaluateActiveGrowiPageStatus();
        }
        return exported;
      },
    },
    {
      commandId: GROWI_COMMANDS.refreshLocalMirror,
      handler: async (target?: unknown) => {
        const result = await createRefreshLocalMirrorCommand(deps)(
          target as never,
        );
        await reevaluateActiveGrowiPageStatus();
        return result;
      },
    },
    {
      commandId: GROWI_COMMANDS.compareLocalMirrorWithGrowi,
      handler: async (target?: unknown) => {
        const compared = await compareLocalMirrorWithGrowiCommand(
          target as never,
        );
        if (compared) {
          await reevaluateActiveGrowiPageStatus();
        }
        return compared;
      },
      registrar: registerGrowiCommand,
    },
    {
      commandId: GROWI_COMMANDS.uploadLocalMirrorToGrowi,
      handler: async (target?: unknown) => {
        const uploaded = await createUploadLocalMirrorSubtreeToGrowiCommand(
          deps,
        )(target as never);
        if (uploaded) {
          await reevaluateActiveGrowiPageStatus();
        }
        return uploaded;
      },
      registrar: registerGrowiCommand,
    },
    {
      commandId: GROWI_COMMANDS.scmCompareMirrorAgain,
      handler: async () => {
        const compared = await scmCompareMirrorAgainCommand();
        if (compared) {
          await reevaluateActiveGrowiPageStatus();
        }
        return compared;
      },
      registrar: registerGrowiCommand,
    },
    {
      commandId: GROWI_COMMANDS.scmCheckRemoteMetadata,
      handler: async () => {
        return await mirrorRemoteMetadataChecker.checkCurrentMirrorMetadata();
      },
      registrar: registerGrowiCommand,
    },
    {
      commandId: GROWI_COMMANDS.scmUploadMirrorResources,
      handler: async (...args: unknown[]) => {
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
      registrar: registerGrowiCommand,
    },
    {
      commandId: GROWI_COMMANDS.scmTakeRemoteMirrorResources,
      handler: async (...args: unknown[]) => {
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
      registrar: registerGrowiCommand,
    },
  ]);
  const prefixCommandsDisposable = registerPrefixCommands([
    {
      commandId: GROWI_COMMANDS.refreshListing,
      handler: createRefreshListingCommand(deps),
    },
    {
      commandId: GROWI_COMMANDS.addPrefix,
      handler: createAddPrefixCommand(deps),
    },
    {
      commandId: GROWI_COMMANDS.openPrefixRootPage,
      handler: createOpenPrefixRootPageCommand(deps),
    },
    {
      commandId: GROWI_COMMANDS.openDirectoryPage,
      handler: createOpenDirectoryPageCommand(deps),
    },
    {
      commandId: GROWI_COMMANDS.clearPrefixes,
      handler: createClearPrefixesCommand(deps),
    },
    {
      commandId: GROWI_COMMANDS.deletePrefix,
      handler: createDeletePrefixCommand(deps),
    },
  ]);
  const loadMoreListingCommandDisposable =
    explorerFeature.registerLoadMoreListingCommand({
      async loadMoreReadDirectory(uri) {
        await fileSystemProvider.loadMoreReadDirectory(uri);
      },
      showErrorMessage(message: string) {
        void vscode.window.showErrorMessage(message);
      },
    });
  const explorerCommandsDisposable = explorerFeature.registerExplorerCommands({
    commandDeps: deps,
    tracedCommandRegistrar: registerGrowiCommand,
  });
  const runtimeLogCommandsDisposable = registerRuntimeLogFeature({
    runtimeLogger,
    runtimeLogsEnabled,
  });
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
  const explorerTestSupportCommandsDisposable =
    explorerFeature.registerTestSupportCommands(deps);
  const collectOpenPageQuickPickStateCommandDisposable =
    vscode.commands.registerCommand(
      "growi.__test.collectOpenPageQuickPickState",
      async (query = "") => {
        const prefixes = prefixRegistry.getPrefixes(
          vscode.workspace.getConfiguration("growi").get<string>("baseUrl"),
        );
        const normalizedQuery = String(query).trim();
        const canonicalPaths = new Set(
          normalizedQuery.length === 0
            ? collectOpenPageInitialCandidatePaths()
            : [],
        );
        if (normalizedQuery.length > 0) {
          const listedPages = await Promise.all(
            prefixes.map(
              async (prefix) =>
                await pageListReader.listPages(prefix, {
                  page: 1,
                  limit: getGrowiPageListingMaxAutoPagesPerPrefix(),
                }),
            ),
          );
          for (const result of listedPages) {
            if (!result.ok) {
              continue;
            }
            for (const canonicalPath of result.paths) {
              canonicalPaths.add(canonicalPath);
            }
          }
        }
        const entries = [...canonicalPaths]
          .sort((left, right) => {
            const labelOrder = left.localeCompare(right, "ja");
            return labelOrder !== 0 ? labelOrder : left.localeCompare(right);
          })
          .map((canonicalPath) => buildOpenPageSearchEntry(canonicalPath));
        const rankedItems = rankOpenPageSearchEntries(entries, query);
        const directInputItem = {
          label: OPEN_PAGE_DIRECT_INPUT_LABEL,
          description: OPEN_PAGE_DIRECT_INPUT_DESCRIPTION,
          action: "directInput" as const,
        };
        const items = isOpenPageDirectInputPreferred(query)
          ? [directInputItem, ...rankedItems]
          : [...rankedItems, directInputItem];
        return {
          name: "openPage",
          placeholder: OPEN_PAGE_QUICK_PICK_PLACEHOLDER,
          value: query,
          items: items.map((item) => ({
            label: item.label,
            description: item.description,
            canonicalPath:
              "canonicalPath" in item ? item.canonicalPath : undefined,
            action: item.action,
          })),
        };
      },
    );
  const collectBookmarksQuickPickStateCommandDisposable =
    vscode.commands.registerCommand(
      "growi.__test.collectBookmarksQuickPickState",
      async () => {
        const bookmarksResult = await syncBookmarks();
        const bookmarks = bookmarksResult.ok
          ? await buildBookmarkListEntries(bookmarksResult.bookmarks)
          : [];
        const formatBookmarkDetail = (bookmark: BookmarkListEntry) => {
          if (bookmark.status === "unresolvable") {
            return `${SHOW_BOOKMARKS_STATUS_UNRESOLVABLE} ・ ${SHOW_BOOKMARKS_OPEN_DETAIL_PREFIX} ${bookmark.addedAt}`;
          }
          if (bookmark.status === "outsidePrefix") {
            return `${SHOW_BOOKMARKS_STATUS_OUTSIDE_PREFIX} ・ ${SHOW_BOOKMARKS_OPEN_DETAIL_PREFIX} ${bookmark.addedAt}`;
          }
          return `${SHOW_BOOKMARKS_OPEN_DETAIL_PREFIX} ${bookmark.addedAt}`;
        };
        return {
          name: "bookmarks",
          placeholder: SHOW_BOOKMARKS_PLACEHOLDER,
          items: bookmarks.map((bookmark) => ({
            label:
              bookmark.canonicalPath.split("/").filter(Boolean).at(-1) ??
              bookmark.canonicalPath,
            description: bookmark.canonicalPath,
            detail: formatBookmarkDetail(bookmark),
            canonicalPath: bookmark.canonicalPath,
            pageId: bookmark.pageId,
            status: bookmark.status,
            buttons: [{ tooltip: "ブックマークから削除", iconPath: "trash" }],
          })),
        };
      },
    );
  const collectCurrentPageActionsQuickPickStateCommandDisposable =
    vscode.commands.registerCommand(
      "growi.__test.collectCurrentPageActionsQuickPickState",
      async (uri?: unknown) => {
        let collected:
          | {
              placeholder: string;
              items: readonly {
                label: string;
                description?: string;
                command: string;
              }[];
            }
          | undefined;
        await createShowCurrentPageActionsCommand({
          getActiveEditorUri() {
            return deps.getActiveEditorUri();
          },
          isBookmarked(canonicalPath: string) {
            return deps.isBookmarked(canonicalPath);
          },
          async executeCommand() {
            return;
          },
          showErrorMessage(message: string) {
            deps.showErrorMessage(message);
          },
          async showQuickPick(
            items: readonly {
              label: string;
              description?: string;
              command: string;
            }[],
            options: { placeHolder: string },
          ) {
            collected = {
              placeholder: options.placeHolder,
              items: items.map((item) => ({
                label: item.label,
                description: item.description,
                command: item.command,
              })),
            };
            return undefined;
          },
        })(uri as never);
        return {
          name: "currentPageActions",
          placeholder: collected?.placeholder ?? "",
          items: collected?.items ?? [],
        };
      },
    );
  const collectPageDetailActionsQuickPickStateCommandDisposable =
    vscode.commands.registerCommand(
      "growi.__test.collectPageDetailActionsQuickPickState",
      async (uri?: unknown) => {
        let collected:
          | {
              placeholder: string;
              items: readonly {
                label: string;
                description?: string;
                command: string;
              }[];
            }
          | undefined;
        await createOpenCurrentPageHubCommand({
          getActiveEditorUri() {
            return deps.getActiveEditorUri();
          },
          isBookmarked(canonicalPath: string) {
            return deps.isBookmarked(canonicalPath);
          },
          async executeCommand() {
            return;
          },
          showErrorMessage(message: string) {
            deps.showErrorMessage(message);
          },
          async showQuickPick(
            items: readonly {
              label: string;
              description?: string;
              command: string;
            }[],
            options: { placeHolder: string },
          ) {
            collected = {
              placeholder: options.placeHolder,
              items: items.map((item) => ({
                label: item.label,
                description: item.description,
                command: item.command,
              })),
            };
            return undefined;
          },
        })(uri as never);
        return {
          name: "pageDetailActions",
          placeholder: collected?.placeholder ?? "",
          items: collected?.items ?? [],
        };
      },
    );
  const collectLocalMirrorActionsQuickPickStateCommandDisposable =
    vscode.commands.registerCommand(
      "growi.__test.collectLocalMirrorActionsQuickPickState",
      async (uri?: unknown) => {
        let collected:
          | {
              placeholder: string;
              items: readonly {
                label: string;
                description?: string;
                command: string;
              }[];
            }
          | undefined;
        await createShowLocalMirrorActionsCommand({
          getActiveEditorUri() {
            return deps.getActiveEditorUri();
          },
          async executeCommand() {
            return;
          },
          showErrorMessage(message: string) {
            deps.showErrorMessage(message);
          },
          async showQuickPick(
            items: readonly {
              label: string;
              description?: string;
              command: string;
            }[],
            options: { placeHolder: string },
          ) {
            collected = {
              placeholder: options.placeHolder,
              items: items.map((item) => ({
                label: item.label,
                description: item.description,
                command: item.command,
              })),
            };
            return undefined;
          },
        })(uri as never);
        return {
          name: "localMirrorActions",
          placeholder: collected?.placeholder ?? "",
          items: collected?.items ?? [],
        };
      },
    );
  const documentProviderFeature = registerDocumentProviderFeature({
    getBaseUrl() {
      return vscode.workspace.getConfiguration("growi").get<string>("baseUrl");
    },
    async resolvePageReference(
      reference: Parameters<typeof pageReferenceResolver.resolveReference>[0],
    ): Promise<ResolveParsedGrowiReferenceResult> {
      return await pageReferenceResolver.resolveReference(reference);
    },
    editSessionRegistry,
    fileSystemProvider,
    mirrorRemoteMetadataChecker,
    pageFreshnessService,
    prefixTreeDataProvider,
  });
  reevaluateActiveGrowiPageStatus =
    documentProviderFeature.reevaluateActiveGrowiPageStatus;
  const testSupportCommandsDisposable = combineDisposables([
    getResolvedRuntimeLogDirectoryCommandDisposable,
    getMirrorCompareSourceControlStateCommandDisposable,
    explorerTestSupportCommandsDisposable,
    collectOpenPageQuickPickStateCommandDisposable,
    collectBookmarksQuickPickStateCommandDisposable,
    collectCurrentPageActionsQuickPickStateCommandDisposable,
    collectPageDetailActionsQuickPickStateCommandDisposable,
    collectLocalMirrorActionsQuickPickStateCommandDisposable,
  ]);
  const activationDisposables = combineDisposables([
    navigationCommandsDisposable,
    bookmarkCommandsDisposable,
    currentPageCommandsDisposable,
    mirrorCommandsDisposable,
    prefixCommandsDisposable,
    loadMoreListingCommandDisposable,
    explorerCommandsDisposable,
    runtimeLogCommandsDisposable,
    testSupportCommandsDisposable,
    documentProviderFeature.disposable,
    currentPageDetailWebviewController,
    outputChannel,
    {
      dispose() {
        setGrowiAssetProxyUrlResolver(undefined);
        void assetProxy.dispose();
      },
    },
  ]);
  const registerTextDocumentContentProvider = (
    vscode.workspace as unknown as {
      registerTextDocumentContentProvider?: (
        scheme: string,
        provider: vscode.TextDocumentContentProvider,
      ) => vscode.Disposable;
    }
  ).registerTextDocumentContentProvider;
  const revisionContentProviderDisposable =
    registerTextDocumentContentProvider?.(
      GROWI_REVISION_SCHEME,
      revisionContentProvider,
    ) ?? noopDisposable;
  const readmeContentProviderDisposable =
    registerTextDocumentContentProvider?.(
      vscode.Uri.parse(GROWI_README_URI).scheme,
      readmeContentProvider,
    ) ?? noopDisposable;
  const textDocumentContentProvidersDisposable: vscode.Disposable = {
    dispose() {
      revisionContentProviderDisposable.dispose();
      readmeContentProviderDisposable.dispose();
    },
  };

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider("growi", fileSystemProvider, {
      isCaseSensitive: true,
    }),
    mirrorCompareSourceControl.sourceControl,
    mirrorLocalChangeMonitor,
    textDocumentContentProvidersDisposable,
    explorerFeature.registerTreeView(),
    vscode.commands.registerCommand(
      GROWI_COMMANDS.configureBaseUrl,
      createConfigureBaseUrlCommand(deps),
    ),
    vscode.commands.registerCommand(
      GROWI_COMMANDS.configureApiToken,
      createConfigureApiTokenCommand(deps),
    ),
    readmeCommandDisposable,
    activationDisposables,
  );
}

export function deactivate(): void {
  // No-op during bootstrap.
}

export function extendMarkdownIt<T>(md: T): T {
  return extendMarkdownPreviewIt(md as never) as T;
}
