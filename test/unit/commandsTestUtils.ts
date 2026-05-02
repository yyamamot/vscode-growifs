import { createHash } from "node:crypto";

import { vi } from "vitest";

import type {
  BookmarkListEntry,
  CommandDeps,
  StartEditBootstrapResult,
  UriLike,
} from "../../src/vscode/commands";
import type { GrowiEditSession } from "../../src/vscode/fsProvider";
import type { ResolveParsedGrowiReferenceResult } from "../../src/vscode/pageReferenceResolver";

export function createDeps() {
  type QuickPickItem = Parameters<CommandDeps["showQuickPick"]>[0][number];
  type QuickPickResult = Awaited<ReturnType<CommandDeps["showQuickPick"]>>;
  type RevisionListResult = Awaited<ReturnType<CommandDeps["listRevisions"]>>;
  type AttachmentListResult = Awaited<
    ReturnType<CommandDeps["listAttachments"]>
  >;
  type RevisionReadResult = Awaited<ReturnType<CommandDeps["readRevision"]>>;
  type BookmarkListResult = Awaited<ReturnType<CommandDeps["getBookmarks"]>>;
  type BookmarkQuickPickResult = Awaited<
    ReturnType<CommandDeps["showBookmarkQuickPick"]>
  >;
  type OpenPageQuickPickResult = Awaited<
    ReturnType<CommandDeps["showOpenPageQuickPick"]>
  >;
  type MirrorCompareSourceControlState = ReturnType<
    NonNullable<CommandDeps["getMirrorCompareSourceControlState"]>
  >;

  return {
    addBookmark: vi.fn(
      async (
        canonicalPath: string,
        pageId?: string,
      ): Promise<
        | {
            ok: true;
            value: readonly BookmarkListEntry[];
            added: boolean;
          }
        | {
            ok: false;
            reason:
              | "InvalidBaseUrl"
              | "InvalidPath"
              | "BaseUrlNotConfigured"
              | "ApiTokenNotConfigured"
              | "InvalidApiToken"
              | "PermissionDenied"
              | "ApiNotSupported"
              | "ConnectionFailed"
              | "NotFound";
          }
      > => ({
        ok: true,
        value: [
          {
            canonicalPath,
            addedAt: "2026-04-17T00:00:00.000Z",
            pageId: pageId ?? "page-1",
          },
        ],
        added: true,
      }),
    ),
    addPrefix: vi.fn(
      async (
        _rawPrefix: string,
      ): Promise<
        | { ok: true; value: string[]; added: boolean }
        | {
            ok: false;
            reason:
              | "InvalidBaseUrl"
              | "InvalidPath"
              | "AncestorConflict"
              | "DescendantConflict";
          }
      > => ({ ok: true, value: [], added: true }),
    ),
    createPage: vi.fn(
      async (
        _canonicalPath: string,
        _body: string,
      ): Promise<
        | { ok: true; pageInfo?: undefined }
        | {
            ok: false;
            reason:
              | "BaseUrlNotConfigured"
              | "ApiTokenNotConfigured"
              | "InvalidApiToken"
              | "PermissionDenied"
              | "ApiNotSupported"
              | "ConnectionFailed"
              | "NotFound"
              | "AlreadyExists";
          }
      > => ({ ok: true }),
    ),
    resolveCreatePageBody: vi.fn(async (_canonicalPath: string) => ""),
    deletePage: vi.fn(
      async (_input: {
        pageId: string;
        revisionId: string;
        canonicalPath: string;
        mode: "page" | "subtree";
      }): Promise<
        | { ok: true }
        | {
            ok: false;
            reason:
              | "BaseUrlNotConfigured"
              | "ApiTokenNotConfigured"
              | "InvalidApiToken"
              | "PermissionDenied"
              | "ApiNotSupported"
              | "ConnectionFailed"
              | "NotFound"
              | "HasChildren"
              | "Rejected";
            message?: string;
          }
      > => ({ ok: true }),
    ),
    renamePage: vi.fn(
      async (input: {
        pageId: string;
        revisionId: string;
        currentCanonicalPath: string;
        targetCanonicalPath: string;
        mode: "page" | "subtree";
      }): Promise<
        | { ok: true; canonicalPath: string; pageInfo?: undefined }
        | {
            ok: false;
            reason:
              | "BaseUrlNotConfigured"
              | "ApiTokenNotConfigured"
              | "InvalidApiToken"
              | "PermissionDenied"
              | "ApiNotSupported"
              | "ConnectionFailed"
              | "ParentNotFound"
              | "NotFound"
              | "AlreadyExists"
              | "Rejected";
            message?: string;
          }
      > => ({ ok: true, canonicalPath: input.targetCanonicalPath }),
    ),
    clearPrefixes: vi.fn(
      async (): Promise<
        | { ok: true; value: string[]; cleared: boolean; removed: string[] }
        | { ok: false; reason: "InvalidBaseUrl" }
      > => ({ ok: true, value: [], cleared: true, removed: ["/team/dev"] }),
    ),
    deleteBookmark: vi.fn(
      async (
        canonicalPath: string,
        pageId?: string,
      ): Promise<
        | {
            ok: true;
            value: readonly BookmarkListEntry[];
            removed: boolean;
          }
        | {
            ok: false;
            reason:
              | "InvalidBaseUrl"
              | "InvalidPath"
              | "BaseUrlNotConfigured"
              | "ApiTokenNotConfigured"
              | "InvalidApiToken"
              | "PermissionDenied"
              | "ApiNotSupported"
              | "ConnectionFailed"
              | "NotFound";
          }
      > => ({
        ok: true,
        value: [
          {
            canonicalPath,
            addedAt: "2026-04-17T00:00:00.000Z",
            pageId: pageId ?? "page-1",
          },
        ],
        removed: true,
      }),
    ),
    deletePrefix: vi.fn(
      async (
        _rawPrefix: string,
      ): Promise<
        | { ok: true; value: string[]; removed: boolean }
        | { ok: false; reason: "InvalidBaseUrl" | "InvalidPath" }
      > => ({ ok: true, value: [], removed: true }),
    ),
    executeCommand: vi.fn(async (_command: string, ..._args: unknown[]) => {}),
    checkRemoteMetadataForPage: vi.fn(async (_canonicalPath: string) => true),
    bootstrapEditSession: vi.fn(
      async (_canonicalPath: string): Promise<StartEditBootstrapResult> => ({
        ok: true,
        value: {
          pageId: "page-123",
          baseRevisionId: "revision-001",
          baseUpdatedAt: "2026-03-08T00:00:00.000Z",
          baseBody: "# title",
        },
      }),
    ),
    closeEditSession: vi.fn(),
    getActiveEditorUri: vi.fn((): UriLike | undefined => undefined),
    getActiveEditorText: vi.fn((): string | undefined => undefined),
    getBaseUrl: vi.fn((): string | undefined => undefined),
    getEditSession: vi.fn(
      (_canonicalPath: string): GrowiEditSession | undefined => undefined,
    ),
    getCurrentPageInfo: vi.fn(
      (
        _canonicalPath: string,
      ):
        | {
            pageId: string;
            revisionId?: string;
            url: string;
            path: string;
            lastUpdatedBy: string;
            lastUpdatedAt: string;
          }
        | undefined => undefined,
    ),
    getLocalWorkspaceRoot: vi.fn((): string | undefined => "/workspace"),
    getBookmarks: vi.fn(
      async (): Promise<BookmarkListResult> => ({
        ok: true,
        value: [],
      }),
    ),
    getRegisteredPrefixes: vi.fn((): string[] => []),
    getOpenPageInitialCandidatePaths: vi.fn((): readonly string[] => []),
    getOpenPageBoundedSearchLimit: vi.fn((): number => 300),
    getLocalMirrorMaxPrefixPages: vi.fn((): number => 50),
    isBookmarked: vi.fn((_canonicalPath: string) => false),
    invalidateReadDirectoryCache: vi.fn(),
    invalidateReadFileCache: vi.fn(),
    listPages: vi.fn(
      async (
        _canonicalPrefixPath: string,
      ): Promise<
        | {
            ok: true;
            paths: string[];
            hasMore?: boolean;
            nextPage?: number;
            fetchedCount?: number;
          }
        | {
            ok: false;
            reason:
              | "BaseUrlNotConfigured"
              | "ApiTokenNotConfigured"
              | "InvalidApiToken"
              | "PermissionDenied"
              | "ApiNotSupported"
              | "ConnectionFailed";
          }
      > => ({ ok: true, paths: [] }),
    ),
    listAttachments: vi.fn(
      async (): Promise<AttachmentListResult> => ({
        ok: true,
        attachments: [
          {
            attachmentId: "attachment-1",
            originalName: "design.png",
            downloadUrl: "/attachment/design.png",
          },
        ],
      }),
    ),
    listRevisions: vi.fn(
      async (): Promise<RevisionListResult> => ({
        ok: true,
        revisions: [
          {
            revisionId: "revision-002",
            createdAt: "2026-03-08T10:00:00.000Z",
            author: "bob",
          },
          {
            revisionId: "revision-001",
            createdAt: "2026-03-08T09:00:00.000Z",
            author: "alice",
          },
        ],
      }),
    ),
    findOpenTextDocument: vi.fn(
      (_path: string): { isDirty: boolean } | undefined => undefined,
    ),
    findOpenTextDocumentByUri: vi.fn(
      (_uri: UriLike): { isDirty: boolean } | undefined => undefined,
    ),
    openDiff: vi.fn(
      async (
        _leftUri: UriLike,
        _rightUri: UriLike,
        _title: string,
      ): Promise<void> => {},
    ),
    openChanges: vi.fn(
      async (
        _title: string,
        _resources: readonly [UriLike, UriLike, UriLike][],
      ): Promise<void> => {},
    ),
    clearMirrorCompareSourceControlState: vi.fn(),
    clearMirrorCompareTreeSnapshotState: vi.fn(),
    getMirrorCompareSourceControlState: vi.fn<
      () => MirrorCompareSourceControlState
    >(() => undefined),
    openLocalFile: vi.fn(async (_path: string): Promise<void> => {}),
    openUri: vi.fn(async (_uri: string): Promise<void> => {}),
    openExternalUri: vi.fn(async (_uri: string): Promise<void> => {}),
    readLocalFile: vi.fn(async (_path: string): Promise<string> => ""),
    refreshOpenGrowiPage: vi.fn(
      async (
        _canonicalPath: string,
      ): Promise<"reopened" | "not-open" | "dirty" | "failed"> => "not-open",
    ),
    saveDocument: vi.fn(async (_uri: UriLike): Promise<boolean> => true),
    readPageBody: vi.fn(
      async (
        _canonicalPath: string,
      ): Promise<
        | { ok: true; body: string }
        | {
            ok: false;
            reason:
              | "NotFound"
              | "BaseUrlNotConfigured"
              | "ApiTokenNotConfigured"
              | "InvalidApiToken"
              | "PermissionDenied"
              | "ApiNotSupported"
              | "ConnectionFailed";
          }
      > => ({ ok: true, body: "" }),
    ),
    readRevision: vi.fn(
      async (
        _pageId: string,
        revisionId: string,
      ): Promise<RevisionReadResult> => ({
        ok: true,
        body: `# ${revisionId}`,
      }),
    ),
    resolvePageReference: vi.fn(
      async (reference): Promise<ResolveParsedGrowiReferenceResult> => {
        if (reference.kind === "canonicalPath") {
          return {
            ok: true,
            canonicalPath: reference.canonicalPath,
            uri: reference.uri,
          } as const;
        }
        if (reference.kind === "pageIdPermalink") {
          return {
            ok: true,
            canonicalPath: `/resolved/${reference.pageId}`,
            uri: `growi:/resolved/${reference.pageId}.md`,
          } as const;
        }
        return {
          ok: true,
          canonicalPath: reference.canonicalPath,
          uri: `growi:${reference.canonicalPath}.md`,
        } as const;
      },
    ),
    readDirectory: vi.fn(async (_uri: string): Promise<void> => {}),
    reopenRenamedPages: vi.fn(
      async (): Promise<{
        attempted: boolean;
        hasDirty: boolean;
        hasFailed: boolean;
      }> => ({
        attempted: true,
        hasDirty: false,
        hasFailed: false,
      }),
    ),
    closeDeletedPages: vi.fn(
      async (): Promise<{
        attempted: boolean;
        hasFailed: boolean;
      }> => ({
        attempted: true,
        hasFailed: false,
      }),
    ),
    refreshPrefixTree: vi.fn(),
    clearSubtreeState: vi.fn(),
    seedRevisionContent: vi.fn(),
    showErrorMessage: vi.fn(),
    showEndEditDiscardConfirmation: vi.fn(
      async (): Promise<"saveAndReturn" | "discardAndReturn" | "cancel"> =>
        "cancel",
    ),
    showInformationMessage: vi.fn(),
    showInputBox: vi.fn(
      async (_options): Promise<string | undefined> => undefined,
    ),
    showBookmarkQuickPick: vi.fn(
      async (): Promise<BookmarkQuickPickResult> => undefined,
    ),
    showOpenPageQuickPick: vi.fn(
      async (
        _items: Parameters<CommandDeps["showOpenPageQuickPick"]>[0],
        _options: Parameters<CommandDeps["showOpenPageQuickPick"]>[1],
      ): Promise<OpenPageQuickPickResult> => ({ action: "directInput" }),
    ),
    showClearPrefixesConfirmation: vi.fn(
      async (
        _baseUrl: string,
        _prefixes: readonly string[],
      ): Promise<boolean> => true,
    ),
    showRenameScopeConfirmation: vi.fn(
      async (): Promise<"single" | "subtree" | "cancel"> => "single",
    ),
    showDeleteScopeConfirmation: vi.fn(
      async (): Promise<"single" | "subtree" | "cancel"> => "single",
    ),
    showDeletePageConfirmation: vi.fn(async (): Promise<boolean> => true),
    showQuickPick: vi.fn(
      async (
        _items: readonly QuickPickItem[],
        _options: { placeHolder: string },
      ): Promise<QuickPickResult> => undefined,
    ),
    setMirrorCompareSourceControlState: vi.fn(),
    setMirrorCompareTreeSnapshotState: vi.fn(),
    showWarningMessage: vi.fn(),
    storeSecret: vi.fn(
      async (_key: string, _value: string): Promise<void> => {},
    ),
    setEditSession: vi.fn(),
    updateBaseUrl: vi.fn(async (_value: string): Promise<void> => {}),
    deleteLocalPath: vi.fn(async (_path: string): Promise<void> => {}),
    writeLocalFile: vi.fn(
      async (_path: string, _content: string): Promise<void> => {},
    ),
    writePage: vi.fn(
      async (
        _canonicalPath: string,
        _body: string,
        _editSession: GrowiEditSession,
      ) => ({ ok: true }) as const,
    ),
  } satisfies CommandDeps;
}

export function createUri(scheme: string, path: string) {
  return { scheme, path, fsPath: path };
}

export function createMirrorRelativePath(
  rootCanonicalPath: string,
  canonicalPath: string,
  allCanonicalPaths: readonly string[] = [canonicalPath],
) {
  const basename = canonicalPath.split("/").filter(Boolean).at(-1);
  const reservedName = basename ? `__${basename}__.md` : "__root__.md";
  const hasDescendants = allCanonicalPaths.some(
    (candidate) =>
      candidate !== canonicalPath && candidate.startsWith(`${canonicalPath}/`),
  );

  if (canonicalPath === rootCanonicalPath) {
    return reservedName;
  }

  if (rootCanonicalPath === "/") {
    const relative = canonicalPath.slice(1);
    if (hasDescendants) {
      return `${relative}/${reservedName}`;
    }
    return `${relative}.md`;
  }

  const relative = canonicalPath.slice(rootCanonicalPath.length + 1);
  if (hasDescendants) {
    return `${relative}/${reservedName}`;
  }
  return `${relative}.md`;
}

export function createMirrorRootPath(rootCanonicalPath: string) {
  return `/workspace/.growi-mirrors/growi.example.com${rootCanonicalPath}`;
}

export function hashBodyForTest(body: string) {
  return createHash("sha256").update(body).digest("hex");
}

export function createBundleManifest(
  pages: Array<{
    canonicalPath: string;
    body: string;
    pageId?: string;
    baseRevisionId?: string;
    exportedAt?: string;
  }>,
  options?: {
    baseUrl?: string;
    rootCanonicalPath?: string;
    exportedAt?: string;
  },
) {
  const exportedAt = options?.exportedAt ?? "2026-03-09T00:00:00.000Z";
  const rootCanonicalPath =
    options?.rootCanonicalPath ?? pages[0]?.canonicalPath ?? "/";
  return `${JSON.stringify(
    {
      version: 1,
      baseUrl: options?.baseUrl ?? "https://growi.example.com/",
      rootCanonicalPath,
      mode: pages.length === 1 ? "page" : "prefix",
      exportedAt,
      pages: pages.map((page) => ({
        canonicalPath: page.canonicalPath,
        relativeFilePath: createMirrorRelativePath(
          rootCanonicalPath,
          page.canonicalPath,
          pages.map((candidate) => candidate.canonicalPath),
        ),
        pageId: page.pageId ?? `page:${page.canonicalPath}`,
        baseRevisionId:
          page.baseRevisionId ?? `revision:${page.canonicalPath}:001`,
        exportedAt: page.exportedAt ?? exportedAt,
        contentHash: hashBodyForTest(page.body),
      })),
    },
    null,
    2,
  )}\n`;
}
