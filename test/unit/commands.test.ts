import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  type CommandDeps,
  createAddPrefixCommand,
  createClearPrefixesCommand,
  createCompareLocalBundleWithGrowiCommand,
  createCompareLocalWorkFileWithCurrentPageCommand,
  createConfigureApiTokenCommand,
  createConfigureBaseUrlCommand,
  createDownloadCurrentPageSetToLocalBundleCommand,
  createDownloadCurrentPageToLocalFileCommand,
  createEndEditCommand,
  createExplorerCompareLocalBundleWithGrowiCommand,
  createExplorerCompareLocalWorkFileWithCurrentPageCommand,
  createExplorerDownloadCurrentPageSetToLocalBundleCommand,
  createExplorerDownloadCurrentPageToLocalFileCommand,
  createExplorerOpenPageItemCommand,
  createExplorerRefreshCurrentPageCommand,
  createExplorerShowBacklinksCommand,
  createExplorerShowCurrentPageInfoCommand,
  createExplorerShowRevisionHistoryDiffCommand,
  createExplorerUploadExportedLocalFileToGrowiCommand,
  createExplorerUploadLocalBundleToGrowiCommand,
  createOpenDirectoryPageCommand,
  createOpenPageCommand,
  createOpenPrefixRootPageCommand,
  createRefreshCurrentPageCommand,
  createRefreshListingCommand,
  createShowBacklinksCommand,
  createShowCurrentPageActionsCommand,
  createShowCurrentPageInfoCommand,
  createShowRevisionHistoryDiffCommand,
  createStartEditCommand,
  createUploadExportedLocalFileToGrowiCommand,
  createUploadLocalBundleToGrowiCommand,
  GROWI_COMMANDS,
  GROWI_SECRET_KEYS,
  normalizeBaseUrl,
  type StartEditBootstrapResult,
  type UriLike,
} from "../../src/vscode/commands";
import type { GrowiEditSession } from "../../src/vscode/fsProvider";
import type { ResolveParsedGrowiReferenceResult } from "../../src/vscode/pageReferenceResolver";

function createDeps() {
  type QuickPickItem = Parameters<CommandDeps["showQuickPick"]>[0][number];
  type QuickPickResult = Awaited<ReturnType<CommandDeps["showQuickPick"]>>;
  type RevisionListResult = Awaited<ReturnType<CommandDeps["listRevisions"]>>;
  type RevisionReadResult = Awaited<ReturnType<CommandDeps["readRevision"]>>;

  return {
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
    clearPrefixes: vi.fn(
      async (): Promise<
        | { ok: true; value: string[]; cleared: boolean; removed: string[] }
        | { ok: false; reason: "InvalidBaseUrl" }
      > => ({ ok: true, value: [], cleared: true, removed: ["/team/dev"] }),
    ),
    executeCommand: vi.fn(async (_command: string, ..._args: unknown[]) => {}),
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
            url: string;
            path: string;
            lastUpdatedBy: string;
            lastUpdatedAt: string;
          }
        | undefined => undefined,
    ),
    getLocalWorkspaceRoot: vi.fn((): string | undefined => "/workspace"),
    getRegisteredPrefixes: vi.fn((): string[] => []),
    invalidateReadDirectoryCache: vi.fn(),
    invalidateReadFileCache: vi.fn(),
    listPages: vi.fn(
      async (
        _canonicalPrefixPath: string,
      ): Promise<
        | { ok: true; paths: string[] }
        | { ok: false; reason: "ApiNotSupported" | "ConnectionFailed" }
      > => ({ ok: true, paths: [] }),
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
    openLocalFile: vi.fn(async (_path: string): Promise<void> => {}),
    openUri: vi.fn(async (_uri: string): Promise<void> => {}),
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
            reason: "NotFound" | "ApiNotSupported" | "ConnectionFailed";
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
    refreshPrefixTree: vi.fn(),
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
    showClearPrefixesConfirmation: vi.fn(
      async (
        _baseUrl: string,
        _prefixes: readonly string[],
      ): Promise<boolean> => true,
    ),
    showQuickPick: vi.fn(
      async (
        _items: readonly QuickPickItem[],
        _options: { placeHolder: string },
      ): Promise<QuickPickResult> => undefined,
    ),
    showWarningMessage: vi.fn(),
    storeSecret: vi.fn(
      async (_key: string, _value: string): Promise<void> => {},
    ),
    setEditSession: vi.fn(),
    updateBaseUrl: vi.fn(async (_value: string): Promise<void> => {}),
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

function createUri(scheme: string, path: string) {
  return { scheme, path, fsPath: path };
}

function createBundleRelativePath(canonicalPath: string) {
  if (canonicalPath === "/") {
    return "__root__.md";
  }

  return `${canonicalPath.slice(1)}.md`;
}

function hashBodyForTest(body: string) {
  return createHash("sha256").update(body).digest("hex");
}

function createBundleManifest(
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
  return `${JSON.stringify(
    {
      version: 1,
      kind: "growi-current-set",
      bundleName: "growi-current-set",
      baseUrl: options?.baseUrl ?? "https://growi.example.com/",
      rootCanonicalPath:
        options?.rootCanonicalPath ?? pages[0]?.canonicalPath ?? "/",
      exportedAt,
      pages: pages.map((page) => ({
        canonicalPath: page.canonicalPath,
        relativeFilePath: createBundleRelativePath(page.canonicalPath),
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

describe("normalizeBaseUrl", () => {
  it("accepts http and https URLs", () => {
    expect(normalizeBaseUrl("https://growi.example.com")).toEqual({
      ok: true,
      value: "https://growi.example.com/",
    });
    expect(normalizeBaseUrl("http://localhost:3000/")).toEqual({
      ok: true,
      value: "http://localhost:3000/",
    });
  });

  it("rejects unsupported URLs", () => {
    expect(normalizeBaseUrl("ftp://growi.example.com")).toEqual({
      ok: false,
      reason: "InvalidUrl",
    });
  });
});

describe("createConfigureBaseUrlCommand", () => {
  it("stores a normalized base URL", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://old.example.com/");
    deps.showInputBox.mockResolvedValue("https://growi.example.com");

    await createConfigureBaseUrlCommand(deps)();

    expect(deps.updateBaseUrl).toHaveBeenCalledWith(
      "https://growi.example.com/",
    );
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "GROWI base URL を更新しました。",
    );
  });

  it("keeps API token handling out of public configuration", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("https://growi.example.com");

    await createConfigureBaseUrlCommand(deps)();

    expect(deps.updateBaseUrl).toHaveBeenCalledWith(
      "https://growi.example.com/",
    );
    expect(deps.storeSecret).not.toHaveBeenCalled();
  });

  it("rejects invalid base URLs", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("not-a-url");

    await createConfigureBaseUrlCommand(deps)();

    expect(deps.updateBaseUrl).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "GROWI base URL には http:// または https:// の URL を入力してください。",
    );
  });
});

describe("createConfigureApiTokenCommand", () => {
  it("stores a non-empty token in secret storage", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("  secret-token  ");

    await createConfigureApiTokenCommand(deps)();

    expect(deps.storeSecret).toHaveBeenCalledWith(
      GROWI_SECRET_KEYS.apiToken,
      "secret-token",
    );
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "GROWI API token を保存しました。",
    );
  });

  it("does not write API token into public settings", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("secret-token");

    await createConfigureApiTokenCommand(deps)();

    expect(deps.storeSecret).toHaveBeenCalledWith(
      GROWI_SECRET_KEYS.apiToken,
      "secret-token",
    );
    expect(deps.updateBaseUrl).not.toHaveBeenCalled();
  });

  it("rejects an empty token", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("   ");

    await createConfigureApiTokenCommand(deps)();

    expect(deps.storeSecret).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "GROWI API token は空にできません。",
    );
  });
});

describe("createCompareLocalWorkFileWithCurrentPageCommand", () => {
  it("opens vscode diff from local work file metadata", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.getActiveEditorUri.mockReturnValue(
      createUri("file", "/workspace/growi-current.md"),
    );
    deps.getActiveEditorText.mockReturnValue(
      '<!-- GROWI-ROUNDTRIP {"version":1,"baseUrl":"https://growi.example.com/","canonicalPath":"/team/dev/spec","pageId":"page-123","baseRevisionId":"revision-001","exportedAt":"2026-03-09T00:00:00.000Z"} -->\n\n# local body\n',
    );

    await createCompareLocalWorkFileWithCurrentPageCommand(deps)();

    expect(deps.openDiff).toHaveBeenCalledWith(
      { scheme: "growi", path: "/team/dev/spec.md" },
      {
        scheme: "file",
        path: "/workspace/growi-current.md",
        fsPath: "/workspace/growi-current.md",
      },
      "GROWI Diff: /team/dev/spec <-> growi-current.md",
    );
  });

  it("rejects compare when active editor is not growi-current.md", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("file", "/workspace/other.md"),
    );
    deps.getActiveEditorText.mockReturnValue("# local body\n");

    await createCompareLocalWorkFileWithCurrentPageCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "growi-current.md を開いた状態で Compare Local Work File with Current Page を実行してください。",
    );
    expect(deps.openDiff).not.toHaveBeenCalled();
  });

  it("rejects compare when no local workspace folder is open", async () => {
    const deps = createDeps();
    deps.getLocalWorkspaceRoot.mockReturnValue(undefined);

    await createCompareLocalWorkFileWithCurrentPageCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "ローカル folder が開かれていないため Compare Local Work File with Current Page を実行できません。先に file: workspace を開いてください。",
    );
  });

  it("rejects invalid metadata in local work file", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("file", "/workspace/growi-current.md"),
    );
    deps.getActiveEditorText.mockReturnValue("# local body\n");

    await createCompareLocalWorkFileWithCurrentPageCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "growi-current.md の GROWI metadata を読み取れないため Compare Local Work File with Current Page を実行できません。再度 download してください。",
    );
    expect(deps.openDiff).not.toHaveBeenCalled();
  });

  it("rejects base URL mismatch before opening diff", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://other.example.com/");
    deps.getActiveEditorUri.mockReturnValue(
      createUri("file", "/workspace/growi-current.md"),
    );
    deps.getActiveEditorText.mockReturnValue(
      '<!-- GROWI-ROUNDTRIP {"version":1,"baseUrl":"https://growi.example.com/","canonicalPath":"/team/dev/spec","pageId":"page-123","baseRevisionId":"revision-001","exportedAt":"2026-03-09T00:00:00.000Z"} -->\n\n# local body\n',
    );

    await createCompareLocalWorkFileWithCurrentPageCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "export 元の GROWI base URL が現在設定と一致しないため Compare Local Work File with Current Page を実行できません。接続先を確認してください。",
    );
    expect(deps.openDiff).not.toHaveBeenCalled();
  });

  it("allows compare even when local work file has unsaved changes", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.getActiveEditorUri.mockReturnValue(
      createUri("file", "/workspace/growi-current.md"),
    );
    deps.getActiveEditorText.mockReturnValue(
      '<!-- GROWI-ROUNDTRIP {"version":1,"baseUrl":"https://growi.example.com/","canonicalPath":"/team/dev/spec","pageId":"page-123","baseRevisionId":"revision-001","exportedAt":"2026-03-09T00:00:00.000Z"} -->\n\n# unsaved body\n',
    );

    await createCompareLocalWorkFileWithCurrentPageCommand(deps)();

    expect(deps.openDiff).toHaveBeenCalledTimes(1);
  });
});

describe("createAddPrefixCommand", () => {
  it("shows placeholder and prompt for canonical path and idurl input", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue(undefined);

    await createAddPrefixCommand(deps)();

    expect(deps.showInputBox).toHaveBeenCalledWith({
      placeHolder: "https://growi.example.com/67ca... or /team/dev",
      prompt: "登録する Prefix または same-instance idurl を入力してください",
      title: "GROWI: Add Prefix",
    });
  });

  it("adds prefix and shows information message", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/team/dev");
    deps.addPrefix.mockResolvedValue({
      ok: true,
      value: ["/team/dev"],
      added: true,
    });

    await createAddPrefixCommand(deps)();

    expect(deps.addPrefix).toHaveBeenCalledWith("/team/dev");
    expect(deps.resolvePageReference).toHaveBeenCalledWith({
      kind: "canonicalPath",
      canonicalPath: "/team/dev",
      uri: "growi:/team/dev.md",
      source: "path",
    });
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "GROWI Prefix を追加しました。",
    );
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("resolves same-instance idurl before registering prefix", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/wiki/");
    deps.showInputBox.mockResolvedValue(
      "https://growi.example.com/wiki/0123456789abcdefabcdef01",
    );
    deps.resolvePageReference.mockResolvedValue({
      ok: true,
      canonicalPath: "/team/dev/spec",
      uri: "growi:/team/dev/spec.md",
    });
    deps.addPrefix.mockResolvedValue({
      ok: true,
      value: ["/team/dev/spec"],
      added: true,
    });

    await createAddPrefixCommand(deps)();

    expect(deps.resolvePageReference).toHaveBeenCalledWith({
      kind: "pageIdPermalink",
      pageId: "0123456789abcdefabcdef01",
      source: "url",
    });
    expect(deps.addPrefix).toHaveBeenCalledWith("/team/dev/spec");
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "GROWI Prefix を追加しました。",
    );
  });

  it("shows an error when base URL is not configured", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/team/dev");
    deps.addPrefix.mockResolvedValue({ ok: false, reason: "InvalidBaseUrl" });

    await createAddPrefixCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "GROWI base URL が未設定です。先に Configure Base URL を実行してください。",
    );
  });

  it("shows an error for invalid prefix path", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("team/dev");

    await createAddPrefixCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Prefix には先頭 / 付きのページパスを入力してください。",
    );
    expect(deps.resolvePageReference).not.toHaveBeenCalled();
    expect(deps.addPrefix).not.toHaveBeenCalled();
  });

  it("rejects foreign-host idurl input", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/wiki/");
    deps.showInputBox.mockResolvedValue(
      "https://other.example.com/wiki/0123456789abcdefabcdef01",
    );

    await createAddPrefixCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Prefix には先頭 / 付き canonical path または same-instance idurl を入力してください。",
    );
    expect(deps.resolvePageReference).not.toHaveBeenCalled();
    expect(deps.addPrefix).not.toHaveBeenCalled();
  });

  it("rejects non-idurl same-instance URL input", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/wiki/");
    deps.showInputBox.mockResolvedValue(
      "https://growi.example.com/wiki/team/dev",
    );

    await createAddPrefixCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Prefix には先頭 / 付き canonical path または same-instance idurl を入力してください。",
    );
    expect(deps.resolvePageReference).not.toHaveBeenCalled();
    expect(deps.addPrefix).not.toHaveBeenCalled();
  });

  it("shows an error when idurl cannot be resolved", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/wiki/");
    deps.showInputBox.mockResolvedValue(
      "https://growi.example.com/wiki/0123456789abcdefabcdef01",
    );
    deps.resolvePageReference.mockResolvedValue({
      ok: false,
      reason: "NotFound",
    } as const);

    await createAddPrefixCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "指定した idurl に対応するページが見つかりませんでした。",
    );
    expect(deps.addPrefix).not.toHaveBeenCalled();
  });

  it("shows information for duplicate prefix re-sync", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/team/dev");
    deps.addPrefix.mockResolvedValue({
      ok: true,
      value: ["/team/dev"],
      added: false,
    });

    await createAddPrefixCommand(deps)();

    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "指定した Prefix は既に登録済みです。Explorer 表示を再同期しました。",
    );
    expect(deps.addPrefix).toHaveBeenCalledWith("/team/dev");
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("shows an error for ancestor conflict", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/team");
    deps.addPrefix.mockResolvedValue({
      ok: false,
      reason: "AncestorConflict",
    });

    await createAddPrefixCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "指定した Prefix は既存 Prefix の祖先です。より具体的な Prefix を指定してください。",
    );
  });

  it("shows an error for descendant conflict", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/team/dev/feature");
    deps.addPrefix.mockResolvedValue({
      ok: false,
      reason: "DescendantConflict",
    });

    await createAddPrefixCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "指定した Prefix は既存 Prefix の子孫です。既存 Prefix と重複しない Prefix を指定してください。",
    );
  });
});

describe("createClearPrefixesCommand", () => {
  it("shows an error when base URL is not configured", async () => {
    const deps = createDeps();

    await createClearPrefixesCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "GROWI base URL が未設定です。先に Configure Base URL を実行してください。",
    );
    expect(deps.clearPrefixes).not.toHaveBeenCalled();
  });

  it("shows information when no prefixes are registered", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.getRegisteredPrefixes.mockReturnValue([]);

    await createClearPrefixesCommand(deps)();

    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "現在の接続先に削除対象の Prefix はありません。",
    );
    expect(deps.showClearPrefixesConfirmation).not.toHaveBeenCalled();
  });

  it("does nothing when confirmation is cancelled", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.getRegisteredPrefixes.mockReturnValue(["/team/dev"]);
    deps.showClearPrefixesConfirmation.mockResolvedValue(false);

    await createClearPrefixesCommand(deps)();

    expect(deps.clearPrefixes).not.toHaveBeenCalled();
    expect(deps.showInformationMessage).not.toHaveBeenCalled();
  });

  it("clears prefixes after confirmation", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.getRegisteredPrefixes.mockReturnValue(["/team/dev", "/team/ops"]);
    deps.clearPrefixes.mockResolvedValue({
      ok: true,
      value: [],
      cleared: true,
      removed: ["/team/dev", "/team/ops"],
    });

    await createClearPrefixesCommand(deps)();

    expect(deps.showClearPrefixesConfirmation).toHaveBeenCalledWith(
      "https://growi.example.com/",
      ["/team/dev", "/team/ops"],
    );
    expect(deps.clearPrefixes).toHaveBeenCalledTimes(1);
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "現在の接続先に登録された GROWI Prefix を削除しました。",
    );
  });
});

describe("createOpenPageCommand", () => {
  it("opens a normalized growi URI for valid input", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/team//dev/設計.md/");

    await createOpenPageCommand(deps)();

    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/設計.md");
  });

  it("resolves same-instance permalink URL before opening", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/wiki/");
    deps.showInputBox.mockResolvedValue(
      "https://growi.example.com/wiki/0123456789abcdefabcdef01",
    );
    deps.resolvePageReference.mockResolvedValue({
      ok: true,
      canonicalPath: "/team/dev/spec",
      uri: "growi:/team/dev/spec.md",
    });

    await createOpenPageCommand(deps)();

    expect(deps.resolvePageReference).toHaveBeenCalled();
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/spec.md");
  });

  it("falls back to canonical path when ambiguous root-relative permalink is not found", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/0123456789abcdefabcdef01");
    deps.resolvePageReference.mockResolvedValue({
      ok: true,
      canonicalPath: "/0123456789abcdefabcdef01",
      uri: "growi:/0123456789abcdefabcdef01.md",
    });

    await createOpenPageCommand(deps)();

    expect(deps.readPageBody).toHaveBeenCalledWith("/0123456789abcdefabcdef01");
    expect(deps.openUri).toHaveBeenCalledWith(
      "growi:/0123456789abcdefabcdef01.md",
    );
  });

  it("shows an error for invalid input", async () => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("team/dev");

    await createOpenPageCommand(deps)();

    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "GROWI の URL、same-instance permalink、または先頭 / 付きのページパスを入力してください。",
    );
  });

  it("rejects foreign-host permalink URLs", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.showInputBox.mockResolvedValue(
      "https://other.example.com/0123456789abcdefabcdef01",
    );

    await createOpenPageCommand(deps)();

    expect(deps.resolvePageReference).not.toHaveBeenCalled();
    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "GROWI の URL、same-instance permalink、または先頭 / 付きのページパスを入力してください。",
    );
  });

  it.each([
    [
      "NotFound",
      "対象ページが見つからないため GROWI ページを開けませんでした。",
    ],
    [
      "ApiNotSupported",
      "本文取得 API が未対応のため GROWI ページを開けませんでした。",
    ],
    [
      "ConnectionFailed",
      "GROWI への接続に失敗したため GROWI ページを開けませんでした。",
    ],
  ] as const)("shows an error when page preflight fails: %s", async (reason, message) => {
    const deps = createDeps();
    deps.showInputBox.mockResolvedValue("/team/dev/spec");
    deps.readPageBody.mockResolvedValue({ ok: false, reason });

    await createOpenPageCommand(deps)();

    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(message);
  });
});

describe("createOpenPrefixRootPageCommand", () => {
  it("opens the canonical page for a registered prefix root item", async () => {
    const deps = createDeps();

    await createOpenPrefixRootPageCommand(deps)({
      uri: createUri("growi", "/team/dev/"),
    });

    expect(deps.resolvePageReference).toHaveBeenCalledWith({
      kind: "canonicalPath",
      canonicalPath: "/team/dev",
      uri: "growi:/team/dev.md",
      source: "path",
    });
    expect(deps.readPageBody).toHaveBeenCalledWith("/team/dev");
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev.md");
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("shows not found when the prefix root page does not exist", async () => {
    const deps = createDeps();
    deps.readPageBody.mockResolvedValue({
      ok: false,
      reason: "NotFound",
    });

    await createOpenPrefixRootPageCommand(deps)({
      uri: createUri("growi", "/team/dev/"),
    });

    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "対象ページが見つからないため GROWI ページを開けませんでした。",
    );
  });

  it("rejects invalid command targets", async () => {
    const deps = createDeps();

    await createOpenPrefixRootPageCommand(deps)({
      uri: createUri("file", "/tmp/README.md"),
    });

    expect(deps.resolvePageReference).not.toHaveBeenCalled();
    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Open Prefix Root Page は登録済み Prefix root でのみ実行できます。",
    );
  });
});

describe("createOpenDirectoryPageCommand", () => {
  it("opens the canonical page for a directory item with a paired page", async () => {
    const deps = createDeps();

    await createOpenDirectoryPageCommand(deps)({
      uri: createUri("growi", "/team/dev/"),
    });

    expect(deps.resolvePageReference).toHaveBeenCalledWith({
      kind: "canonicalPath",
      canonicalPath: "/team/dev",
      uri: "growi:/team/dev.md",
      source: "path",
    });
    expect(deps.readPageBody).toHaveBeenCalledWith("/team/dev");
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev.md");
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("shows not found when the paired directory page does not exist", async () => {
    const deps = createDeps();
    deps.readPageBody.mockResolvedValue({
      ok: false,
      reason: "NotFound",
    });

    await createOpenDirectoryPageCommand(deps)({
      uri: createUri("growi", "/team/dev/"),
    });

    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "対象ページが見つからないため GROWI ページを開けませんでした。",
    );
  });

  it("rejects invalid command targets", async () => {
    const deps = createDeps();

    await createOpenDirectoryPageCommand(deps)({
      uri: createUri("growi", "/team/dev.md"),
    });

    expect(deps.resolvePageReference).not.toHaveBeenCalled();
    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Open Directory Page は実ページを持つ growi: ディレクトリでのみ実行できます。",
    );
  });
});

describe("Explorer context wrapper commands", () => {
  it("opens page items through vscode.open", async () => {
    const deps = createDeps();

    await createExplorerOpenPageItemCommand(deps)({
      uri: createUri("growi", "/team/dev/spec.md"),
      contextValue: "growi.page",
    });

    expect(deps.executeCommand).toHaveBeenCalledWith("vscode.open", {
      scheme: "growi",
      path: "/team/dev/spec.md",
      fsPath: "/team/dev/spec.md",
    });
  });

  it("delegates current-page actions with a page URI as-is", async () => {
    const deps = createDeps();

    await createExplorerShowCurrentPageInfoCommand(deps)({
      uri: createUri("growi", "/team/dev/spec.md"),
      contextValue: "growi.page",
    });

    expect(deps.executeCommand).toHaveBeenCalledWith(
      GROWI_COMMANDS.showCurrentPageInfo,
      createUri("growi", "/team/dev/spec.md"),
    );
  });

  it("maps directory items to their paired page URI", async () => {
    const deps = createDeps();

    await createExplorerDownloadCurrentPageSetToLocalBundleCommand(deps)({
      uri: createUri("growi", "/team/dev/"),
      contextValue: "growi.directoryWithPage",
    });

    expect(deps.executeCommand).toHaveBeenCalledWith(
      GROWI_COMMANDS.downloadCurrentPageSetToLocalBundle,
      { scheme: "growi", path: "/team/dev.md" },
    );
  });

  it("maps prefix root items to their canonical page URI", async () => {
    const deps = createDeps();

    await createExplorerRefreshCurrentPageCommand(deps)({
      uri: createUri("growi", "/team/"),
      contextValue: "growi.prefixRoot",
    });

    expect(deps.executeCommand).toHaveBeenCalledWith(
      GROWI_COMMANDS.refreshCurrentPage,
      { scheme: "growi", path: "/team.md" },
    );
  });

  it("ignores invalid Explorer targets for current-page wrappers", async () => {
    const deps = createDeps();

    await createExplorerShowBacklinksCommand(deps)({
      uri: createUri("file", "/tmp/current.md"),
    });

    expect(deps.executeCommand).not.toHaveBeenCalled();
  });

  it("forwards local round trip wrappers without a target URI", async () => {
    const deps = createDeps();

    await createExplorerCompareLocalWorkFileWithCurrentPageCommand(deps)({
      uri: createUri("growi", "/team/dev/spec.md"),
      contextValue: "growi.page",
    });
    await createExplorerUploadExportedLocalFileToGrowiCommand(deps)({
      uri: createUri("growi", "/team/dev/spec.md"),
      contextValue: "growi.page",
    });
    await createExplorerCompareLocalBundleWithGrowiCommand(deps)({
      uri: createUri("growi", "/team/dev/"),
      contextValue: "growi.directoryWithPage",
    });
    await createExplorerUploadLocalBundleToGrowiCommand(deps)({
      uri: createUri("growi", "/team/"),
      contextValue: "growi.prefixRoot",
    });

    expect(deps.executeCommand).toHaveBeenNthCalledWith(
      1,
      GROWI_COMMANDS.compareLocalWorkFileWithCurrentPage,
    );
    expect(deps.executeCommand).toHaveBeenNthCalledWith(
      2,
      GROWI_COMMANDS.uploadExportedLocalFileToGrowi,
    );
    expect(deps.executeCommand).toHaveBeenNthCalledWith(
      3,
      GROWI_COMMANDS.compareLocalBundleWithGrowi,
    );
    expect(deps.executeCommand).toHaveBeenNthCalledWith(
      4,
      GROWI_COMMANDS.uploadLocalBundleToGrowi,
    );
  });

  it("delegates revision history diff from string canonical paths", async () => {
    const deps = createDeps();

    await createExplorerShowRevisionHistoryDiffCommand(deps)("/team/dev/spec");
    await createExplorerDownloadCurrentPageToLocalFileCommand(deps)(
      "/team/dev/spec",
    );

    expect(deps.executeCommand).toHaveBeenNthCalledWith(
      1,
      GROWI_COMMANDS.showRevisionHistoryDiff,
      { scheme: "growi", path: "/team/dev/spec.md" },
    );
    expect(deps.executeCommand).toHaveBeenNthCalledWith(
      2,
      GROWI_COMMANDS.downloadCurrentPageToLocalFile,
      { scheme: "growi", path: "/team/dev/spec.md" },
    );
  });
});

describe("createRefreshCurrentPageCommand", () => {
  it("invalidates cache and reopens current page from argument URI", async () => {
    const deps = createDeps();

    await createRefreshCurrentPageCommand(deps)(
      createUri("growi", "/team/dev/設計.md"),
    );

    expect(deps.invalidateReadFileCache).toHaveBeenCalledWith("/team/dev/設計");
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/設計.md");
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("invalidates cache and reopens current page from active editor URI", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/設計.md"),
    );

    await createRefreshCurrentPageCommand(deps)();

    expect(deps.invalidateReadFileCache).toHaveBeenCalledWith("/team/dev/設計");
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/設計.md");
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("shows an error for non-growi or non-page URI", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("file", "/tmp/README.md"),
    );

    await createRefreshCurrentPageCommand(deps)();

    expect(deps.invalidateReadFileCache).not.toHaveBeenCalled();
    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Refresh Current Page は growi: ページでのみ実行できます。",
    );
  });

  it("rejects refresh when edit session is dirty", async () => {
    const deps = createDeps();
    deps.getEditSession.mockReturnValue({
      pageId: "page-123",
      baseRevisionId: "revision-001",
      baseUpdatedAt: "2026-03-08T00:00:00.000Z",
      baseBody: "# title",
      enteredAt: "2026-03-08T00:00:00.000Z",
      dirty: true,
    });

    await createRefreshCurrentPageCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.invalidateReadFileCache).not.toHaveBeenCalled();
    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "未保存の変更があるため Refresh Current Page を実行できません。先に保存または End Edit を実行してください。",
    );
  });

  it.each([
    [
      new Error("FileNotFound"),
      "対象ページが見つからないため Refresh Current Page を実行できませんでした。",
    ],
    [
      new Error("read page API is not supported"),
      "本文取得 API が未対応のため Refresh Current Page を実行できませんでした。",
    ],
    [
      new Error("failed to connect to GROWI"),
      "GROWI への接続に失敗したため Refresh Current Page を実行できませんでした。",
    ],
    [new Error("unexpected"), "Refresh Current Page の再読込に失敗しました。"],
  ])("maps refresh current page failure to message", async (error, message) => {
    const deps = createDeps();
    deps.openUri.mockRejectedValue(error);

    await createRefreshCurrentPageCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.invalidateReadFileCache).toHaveBeenCalledWith("/team/dev/spec");
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/spec.md");
    expect(deps.showErrorMessage).toHaveBeenCalledWith(message);
  });
});

describe("createStartEditCommand", () => {
  it("bootstraps and stores edit session with dirty=false", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );

    await createStartEditCommand(deps)();

    expect(deps.bootstrapEditSession).toHaveBeenCalledWith("/team/dev/spec");
    expect(deps.setEditSession).toHaveBeenCalledWith(
      "/team/dev/spec",
      expect.objectContaining({
        pageId: "page-123",
        baseRevisionId: "revision-001",
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody: "# title",
        dirty: false,
      }),
    );
    expect(deps.invalidateReadFileCache).toHaveBeenCalledWith("/team/dev/spec");
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("skips bootstrap when edit session already exists", async () => {
    const deps = createDeps();
    deps.getEditSession.mockReturnValue({
      pageId: "existing-page-id",
      baseRevisionId: "existing-revision-id",
      baseUpdatedAt: "2026-03-08T00:00:00.000Z",
      baseBody: "existing body",
      enteredAt: "2026-03-08T01:00:00.000Z",
      dirty: false,
    });

    await createStartEditCommand(deps)(createUri("growi", "/team/dev/spec.md"));

    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.setEditSession).not.toHaveBeenCalled();
    expect(deps.invalidateReadFileCache).not.toHaveBeenCalled();
  });

  it("rejects non-growi, directory, and root URIs", async () => {
    const deps = createDeps();

    await createStartEditCommand(deps)(createUri("file", "/tmp/readme.md"));
    await createStartEditCommand(deps)(createUri("growi", "/team/dev/"));
    await createStartEditCommand(deps)(createUri("growi", "/"));

    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledTimes(3);
    expect(deps.showErrorMessage).toHaveBeenNthCalledWith(
      1,
      "Start Edit は growi: ページでのみ実行できます。",
    );
    expect(deps.showErrorMessage).toHaveBeenNthCalledWith(
      2,
      "Start Edit は growi: ページでのみ実行できます。",
    );
    expect(deps.showErrorMessage).toHaveBeenNthCalledWith(
      3,
      "Start Edit は growi: ページでのみ実行できます。",
    );
  });

  it.each([
    [
      "ApiNotSupported",
      "編集開始 API が未対応のため Start Edit を実行できません。",
    ],
    [
      "ConnectionFailed",
      "GROWI への接続に失敗したため Start Edit を実行できませんでした。",
    ],
    [
      "NotFound",
      "対象ページが見つからないため Start Edit を実行できませんでした。",
    ],
  ] as const)("maps %s bootstrap failure to Japanese message", async (reason, message) => {
    const deps = createDeps();
    deps.bootstrapEditSession.mockResolvedValue({ ok: false, reason });

    await createStartEditCommand(deps)(createUri("growi", "/team/dev/spec.md"));

    expect(deps.showErrorMessage).toHaveBeenCalledWith(message);
    expect(deps.setEditSession).not.toHaveBeenCalled();
    expect(deps.invalidateReadFileCache).not.toHaveBeenCalled();
  });
});

describe("createEndEditCommand", () => {
  it("closes session without confirmation when dirty=false", async () => {
    const deps = createDeps();
    deps.getEditSession.mockReturnValue({
      pageId: "page-123",
      baseRevisionId: "revision-001",
      baseUpdatedAt: "2026-03-08T00:00:00.000Z",
      baseBody: "# title",
      enteredAt: "2026-03-08T00:00:00.000Z",
      dirty: false,
    });

    await createEndEditCommand(deps)(createUri("growi", "/team/dev/spec.md"));

    expect(deps.showEndEditDiscardConfirmation).not.toHaveBeenCalled();
    expect(deps.closeEditSession).toHaveBeenCalledWith("/team/dev/spec");
    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("saves the document when dirty=true and save was selected", async () => {
    const deps = createDeps();
    deps.getEditSession.mockReturnValue({
      pageId: "page-123",
      baseRevisionId: "revision-001",
      baseUpdatedAt: "2026-03-08T00:00:00.000Z",
      baseBody: "# title",
      enteredAt: "2026-03-08T00:00:00.000Z",
      dirty: true,
    });
    deps.showEndEditDiscardConfirmation.mockResolvedValue("saveAndReturn");

    await createEndEditCommand(deps)(createUri("growi", "/team/dev/spec.md"));

    expect(deps.showEndEditDiscardConfirmation).toHaveBeenCalledTimes(1);
    expect(deps.saveDocument).toHaveBeenCalledWith(
      createUri("growi", "/team/dev/spec.md"),
    );
    expect(deps.closeEditSession).not.toHaveBeenCalled();
    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("asks confirmation and closes + reopens when dirty=true and discarded", async () => {
    const deps = createDeps();
    deps.getEditSession.mockReturnValue({
      pageId: "page-123",
      baseRevisionId: "revision-001",
      baseUpdatedAt: "2026-03-08T00:00:00.000Z",
      baseBody: "# title",
      enteredAt: "2026-03-08T00:00:00.000Z",
      dirty: true,
    });
    deps.showEndEditDiscardConfirmation.mockResolvedValue("discardAndReturn");

    await createEndEditCommand(deps)(createUri("growi", "/team/dev/spec.md"));

    expect(deps.showEndEditDiscardConfirmation).toHaveBeenCalledTimes(1);
    expect(deps.closeEditSession).toHaveBeenCalledWith("/team/dev/spec");
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/spec.md");
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("keeps session when dirty=true and canceled", async () => {
    const deps = createDeps();
    deps.getEditSession.mockReturnValue({
      pageId: "page-123",
      baseRevisionId: "revision-001",
      baseUpdatedAt: "2026-03-08T00:00:00.000Z",
      baseBody: "# title",
      enteredAt: "2026-03-08T00:00:00.000Z",
      dirty: true,
    });
    deps.showEndEditDiscardConfirmation.mockResolvedValue("cancel");

    await createEndEditCommand(deps)(createUri("growi", "/team/dev/spec.md"));

    expect(deps.saveDocument).not.toHaveBeenCalled();
    expect(deps.closeEditSession).not.toHaveBeenCalled();
    expect(deps.openUri).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("rejects non-growi, directory, and root URIs", async () => {
    const deps = createDeps();

    await createEndEditCommand(deps)(createUri("file", "/tmp/readme.md"));
    await createEndEditCommand(deps)(createUri("growi", "/team/dev/"));
    await createEndEditCommand(deps)(createUri("growi", "/"));

    expect(deps.getEditSession).not.toHaveBeenCalled();
    expect(deps.closeEditSession).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledTimes(3);
    expect(deps.showErrorMessage).toHaveBeenNthCalledWith(
      1,
      "End Edit は growi: ページでのみ実行できます。",
    );
    expect(deps.showErrorMessage).toHaveBeenNthCalledWith(
      2,
      "End Edit は growi: ページでのみ実行できます。",
    );
    expect(deps.showErrorMessage).toHaveBeenNthCalledWith(
      3,
      "End Edit は growi: ページでのみ実行できます。",
    );
  });
});

describe("createRefreshListingCommand", () => {
  it("invalidates cache and probes listing from directory URI", async () => {
    const deps = createDeps();

    await createRefreshListingCommand(deps)(createUri("growi", "/team/dev/"));

    expect(deps.invalidateReadDirectoryCache).toHaveBeenCalledWith("/team/dev");
    expect(deps.readDirectory).toHaveBeenCalledWith("growi:/team/dev/");
    expect(deps.refreshPrefixTree).toHaveBeenCalledTimes(1);
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("invalidates parent cache and probes listing from active editor page URI", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/設計.md"),
    );

    await createRefreshListingCommand(deps)();

    expect(deps.invalidateReadDirectoryCache).toHaveBeenCalledWith("/team/dev");
    expect(deps.readDirectory).toHaveBeenCalledWith("growi:/team/dev/");
    expect(deps.refreshPrefixTree).toHaveBeenCalledTimes(1);
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("accepts explorer tree item arguments from title actions", async () => {
    const deps = createDeps();

    await createRefreshListingCommand(deps)({
      uri: createUri("growi", "/team/dev/"),
    });

    expect(deps.invalidateReadDirectoryCache).toHaveBeenCalledWith("/team/dev");
    expect(deps.readDirectory).toHaveBeenCalledWith("growi:/team/dev/");
    expect(deps.refreshPrefixTree).toHaveBeenCalledTimes(1);
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("shows an error when directory URI is not provided as an argument", async () => {
    const deps = createDeps();

    await createRefreshListingCommand(deps)(
      createUri("growi", "/team/dev/設計.md"),
    );

    expect(deps.invalidateReadDirectoryCache).not.toHaveBeenCalled();
    expect(deps.readDirectory).not.toHaveBeenCalled();
    expect(deps.refreshPrefixTree).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Refresh Listing は growi: ディレクトリでのみ実行できます。",
    );
  });

  it.each([
    [
      new Error("list pages API is not supported"),
      "一覧取得 API が未対応のため Refresh Listing を実行できませんでした。",
    ],
    [
      new Error("failed to connect to GROWI"),
      "GROWI への接続に失敗したため Refresh Listing を実行できませんでした。",
    ],
    [new Error("unexpected"), "Refresh Listing の再読込に失敗しました。"],
  ])("maps refresh listing failure to message", async (error, message) => {
    const deps = createDeps();
    deps.readDirectory.mockRejectedValue(error);

    await createRefreshListingCommand(deps)(createUri("growi", "/team/dev/"));

    expect(deps.invalidateReadDirectoryCache).toHaveBeenCalledWith("/team/dev");
    expect(deps.readDirectory).toHaveBeenCalledWith("growi:/team/dev/");
    expect(deps.refreshPrefixTree).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(message);
  });
});

describe("createDownloadCurrentPageToLocalFileCommand", () => {
  it("rejects non-growi, directory, and root URIs", async () => {
    const deps = createDeps();

    await createDownloadCurrentPageToLocalFileCommand(deps)(
      createUri("file", "/tmp/readme.md"),
    );
    await createDownloadCurrentPageToLocalFileCommand(deps)(
      createUri("growi", "/team/dev/"),
    );
    await createDownloadCurrentPageToLocalFileCommand(deps)(
      createUri("growi", "/"),
    );

    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenNthCalledWith(
      1,
      "Download Current Page to Local Work File は growi: ページでのみ実行できます。",
    );
    expect(deps.showErrorMessage).toHaveBeenNthCalledWith(
      2,
      "Download Current Page to Local Work File は growi: ページでのみ実行できます。",
    );
    expect(deps.showErrorMessage).toHaveBeenNthCalledWith(
      3,
      "Download Current Page to Local Work File は growi: ページでのみ実行できます。",
    );
  });

  it("rejects dirty edit session before exporting", async () => {
    const deps = createDeps();
    deps.getEditSession.mockReturnValue({
      pageId: "page-123",
      baseRevisionId: "revision-001",
      baseUpdatedAt: "2026-03-08T00:00:00.000Z",
      baseBody: "# title",
      enteredAt: "2026-03-08T00:00:00.000Z",
      dirty: true,
    });

    await createDownloadCurrentPageToLocalFileCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "未保存の変更があるため Download Current Page to Local Work File を実行できません。先に保存または End Edit を実行してください。",
    );
  });

  it("rejects download when no local workspace folder is open", async () => {
    const deps = createDeps();
    deps.getLocalWorkspaceRoot.mockReturnValue(undefined);

    await createDownloadCurrentPageToLocalFileCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "ローカル folder が開かれていないため Download Current Page to Local Work File を実行できません。先に file: workspace を開いてください。",
    );
  });

  it("rejects download when local work file is dirty in an open editor", async () => {
    const deps = createDeps();
    deps.findOpenTextDocument.mockReturnValue({ isDirty: true });

    await createDownloadCurrentPageToLocalFileCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "growi-current.md に未保存の変更があるため Download Current Page to Local Work File を実行できません。先に保存、Upload Local Work File to GROWI、または退避してください。",
    );
  });

  it("writes the local work file with embedded metadata, then opens it", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.bootstrapEditSession.mockResolvedValue({
      ok: true,
      value: {
        pageId: "page-123",
        baseRevisionId: "revision-001",
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody: "# exported body\n",
      },
    });

    await createDownloadCurrentPageToLocalFileCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.writeLocalFile).toHaveBeenCalledWith(
      "/workspace/growi-current.md",
      expect.stringMatching(
        /^<!-- GROWI-ROUNDTRIP \{"version":1,"baseUrl":"https:\/\/growi\.example\.com\/","canonicalPath":"\/team\/dev\/spec","pageId":"page-123","baseRevisionId":"revision-001","exportedAt":"[^"]+"\} -->\n\n# exported body\n$/u,
      ),
    );
    expect(deps.openLocalFile).toHaveBeenCalledWith(
      "/workspace/growi-current.md",
    );
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "現在ページを growi-current.md へ保存しました。",
    );
  });

  it.each([
    [
      "ApiNotSupported",
      "本文取得 API が未対応のため Download Current Page to Local Work File を実行できませんでした。",
    ],
    [
      "ConnectionFailed",
      "GROWI への接続に失敗したため Download Current Page to Local Work File を実行できませんでした。",
    ],
    [
      "NotFound",
      "対象ページが見つからないため Download Current Page to Local Work File を実行できませんでした。",
    ],
  ] as const)("maps snapshot failure to message: %s", async (reason, message) => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.bootstrapEditSession.mockResolvedValue({ ok: false, reason });

    await createDownloadCurrentPageToLocalFileCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.showErrorMessage).toHaveBeenCalledWith(message);
    expect(deps.writeLocalFile).not.toHaveBeenCalled();
  });
});

describe("createUploadExportedLocalFileToGrowiCommand", () => {
  it("uploads the local work file and refreshes embedded metadata", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.refreshOpenGrowiPage.mockResolvedValue("reopened");
    deps.readLocalFile.mockResolvedValue(
      '<!-- GROWI-ROUNDTRIP {"version":1,"baseUrl":"https://growi.example.com/","canonicalPath":"/team/dev/spec","pageId":"page-123","baseRevisionId":"revision-001","exportedAt":"2026-03-09T00:00:00.000Z"} -->\n\n# uploaded body\n',
    );
    deps.bootstrapEditSession
      .mockResolvedValueOnce({
        ok: true,
        value: {
          pageId: "page-123",
          baseRevisionId: "revision-001",
          baseUpdatedAt: "2026-03-08T00:00:00.000Z",
          baseBody: "# remote body\n",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          pageId: "page-123",
          baseRevisionId: "revision-002",
          baseUpdatedAt: "2026-03-09T00:10:00.000Z",
          baseBody: "# uploaded body\n",
        },
      });

    await createUploadExportedLocalFileToGrowiCommand(deps)();

    expect(deps.writePage).toHaveBeenCalledWith(
      "/team/dev/spec",
      "# uploaded body\n",
      expect.objectContaining({
        pageId: "page-123",
        baseRevisionId: "revision-001",
        baseBody: "# remote body\n",
      }),
    );
    expect(deps.invalidateReadFileCache).toHaveBeenCalledWith("/team/dev/spec");
    expect(deps.refreshOpenGrowiPage).toHaveBeenCalledWith("/team/dev/spec");
    expect(deps.writeLocalFile).toHaveBeenCalledWith(
      "/workspace/growi-current.md",
      expect.stringContaining('"baseRevisionId":"revision-002"'),
    );
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "growi-current.md の内容を GROWI へ反映しました。",
    );
  });

  it("rejects upload when no local workspace folder is open", async () => {
    const deps = createDeps();
    deps.getLocalWorkspaceRoot.mockReturnValue(undefined);

    await createUploadExportedLocalFileToGrowiCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "ローカル folder が開かれていないため Upload Local Work File to GROWI を実行できません。先に file: workspace を開いてください。",
    );
    expect(deps.writePage).not.toHaveBeenCalled();
  });

  it("rejects upload when local work file is missing", async () => {
    const deps = createDeps();
    deps.readLocalFile.mockRejectedValue(new Error("ENOENT"));

    await createUploadExportedLocalFileToGrowiCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "growi-current.md の読み込みに失敗したため Upload Local Work File to GROWI を実行できませんでした。先に Download Current Page to Local Work File を実行してください。",
    );
    expect(deps.writePage).not.toHaveBeenCalled();
  });

  it("rejects invalid embedded metadata", async () => {
    const deps = createDeps();
    deps.readLocalFile.mockResolvedValue("# uploaded body\n");

    await createUploadExportedLocalFileToGrowiCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "growi-current.md の GROWI metadata を読み取れませんでした。再度 download してください。",
    );
    expect(deps.writePage).not.toHaveBeenCalled();
  });

  it("rejects base URL mismatch", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://other.example.com/");
    deps.readLocalFile.mockResolvedValue(
      '<!-- GROWI-ROUNDTRIP {"version":1,"baseUrl":"https://growi.example.com/","canonicalPath":"/team/dev/spec","pageId":"page-123","baseRevisionId":"revision-001","exportedAt":"2026-03-09T00:00:00.000Z"} -->\n\n# uploaded body\n',
    );

    await createUploadExportedLocalFileToGrowiCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "export 元の GROWI base URL が現在設定と一致しません。接続先を確認してください。",
    );
    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
  });

  it("rejects revision mismatch as conflict", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockResolvedValue(
      '<!-- GROWI-ROUNDTRIP {"version":1,"baseUrl":"https://growi.example.com/","canonicalPath":"/team/dev/spec","pageId":"page-123","baseRevisionId":"revision-001","exportedAt":"2026-03-09T00:00:00.000Z"} -->\n\n# uploaded body\n',
    );
    deps.bootstrapEditSession.mockResolvedValue({
      ok: true,
      value: {
        pageId: "page-123",
        baseRevisionId: "revision-999",
        baseUpdatedAt: "2026-03-09T00:00:00.000Z",
        baseBody: "# remote body\n",
      },
    });

    await createUploadExportedLocalFileToGrowiCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "download 後に GROWI 側が更新されたため Upload Local Work File to GROWI を中止しました。再度 download してやり直してください。",
    );
    expect(deps.writePage).not.toHaveBeenCalled();
  });

  it("shows warning when metadata refresh fails after upload", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.refreshOpenGrowiPage.mockResolvedValue("not-open");
    deps.readLocalFile.mockResolvedValue(
      '<!-- GROWI-ROUNDTRIP {"version":1,"baseUrl":"https://growi.example.com/","canonicalPath":"/team/dev/spec","pageId":"page-123","baseRevisionId":"revision-001","exportedAt":"2026-03-09T00:00:00.000Z"} -->\n\n# uploaded body\n',
    );
    deps.bootstrapEditSession
      .mockResolvedValueOnce({
        ok: true,
        value: {
          pageId: "page-123",
          baseRevisionId: "revision-001",
          baseUpdatedAt: "2026-03-08T00:00:00.000Z",
          baseBody: "# remote body\n",
        },
      })
      .mockResolvedValueOnce({ ok: false, reason: "ConnectionFailed" });

    await createUploadExportedLocalFileToGrowiCommand(deps)();

    expect(deps.showWarningMessage).toHaveBeenCalledWith(
      "GROWI への upload は成功しましたが metadata の更新に失敗しました。次回 upload 前に再度 download してください。",
    );
  });

  it("shows warning when open growi page is dirty after upload", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.refreshOpenGrowiPage.mockResolvedValue("dirty");
    deps.readLocalFile.mockResolvedValue(
      '<!-- GROWI-ROUNDTRIP {"version":1,"baseUrl":"https://growi.example.com/","canonicalPath":"/team/dev/spec","pageId":"page-123","baseRevisionId":"revision-001","exportedAt":"2026-03-09T00:00:00.000Z"} -->\n\n# uploaded body\n',
    );
    deps.bootstrapEditSession
      .mockResolvedValueOnce({
        ok: true,
        value: {
          pageId: "page-123",
          baseRevisionId: "revision-001",
          baseUpdatedAt: "2026-03-08T00:00:00.000Z",
          baseBody: "# remote body\n",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          pageId: "page-123",
          baseRevisionId: "revision-002",
          baseUpdatedAt: "2026-03-09T00:10:00.000Z",
          baseBody: "# uploaded body\n",
        },
      });

    await createUploadExportedLocalFileToGrowiCommand(deps)();

    expect(deps.showWarningMessage).toHaveBeenCalledWith(
      "GROWI への upload は成功しましたが、表示中の growi: ページは未保存変更があるため自動再読込しませんでした。",
    );
    expect(deps.showInformationMessage).not.toHaveBeenCalled();
  });

  it("shows warning when reopen fails after upload", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.refreshOpenGrowiPage.mockResolvedValue("failed");
    deps.readLocalFile.mockResolvedValue(
      '<!-- GROWI-ROUNDTRIP {"version":1,"baseUrl":"https://growi.example.com/","canonicalPath":"/team/dev/spec","pageId":"page-123","baseRevisionId":"revision-001","exportedAt":"2026-03-09T00:00:00.000Z"} -->\n\n# uploaded body\n',
    );
    deps.bootstrapEditSession
      .mockResolvedValueOnce({
        ok: true,
        value: {
          pageId: "page-123",
          baseRevisionId: "revision-001",
          baseUpdatedAt: "2026-03-08T00:00:00.000Z",
          baseBody: "# remote body\n",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          pageId: "page-123",
          baseRevisionId: "revision-002",
          baseUpdatedAt: "2026-03-09T00:10:00.000Z",
          baseBody: "# uploaded body\n",
        },
      });

    await createUploadExportedLocalFileToGrowiCommand(deps)();

    expect(deps.showWarningMessage).toHaveBeenCalledWith(
      "GROWI への upload は成功しましたが、表示中の growi: ページ再読込に失敗しました。Refresh Current Page を実行してください。",
    );
    expect(deps.showInformationMessage).not.toHaveBeenCalled();
  });

  it("combines metadata and reopen warnings after upload", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.refreshOpenGrowiPage.mockResolvedValue("failed");
    deps.readLocalFile.mockResolvedValue(
      '<!-- GROWI-ROUNDTRIP {"version":1,"baseUrl":"https://growi.example.com/","canonicalPath":"/team/dev/spec","pageId":"page-123","baseRevisionId":"revision-001","exportedAt":"2026-03-09T00:00:00.000Z"} -->\n\n# uploaded body\n',
    );
    deps.bootstrapEditSession
      .mockResolvedValueOnce({
        ok: true,
        value: {
          pageId: "page-123",
          baseRevisionId: "revision-001",
          baseUpdatedAt: "2026-03-08T00:00:00.000Z",
          baseBody: "# remote body\n",
        },
      })
      .mockResolvedValueOnce({ ok: false, reason: "ConnectionFailed" });

    await createUploadExportedLocalFileToGrowiCommand(deps)();

    expect(deps.showWarningMessage).toHaveBeenCalledWith(
      "GROWI への upload は成功しましたが metadata の更新に失敗しました。次回 upload 前に再度 download してください。 GROWI への upload は成功しましたが、表示中の growi: ページ再読込に失敗しました。Refresh Current Page を実行してください。",
    );
  });
});

describe("bundle commands", () => {
  it("downloads the active page set into growi-current-set with manifest metadata", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.listPages.mockResolvedValue({
      ok: true,
      paths: ["/team/dev/spec/child", "/team/dev/spec"],
    });
    deps.bootstrapEditSession.mockImplementation(async (canonicalPath) => ({
      ok: true,
      value: {
        pageId: `page:${canonicalPath}`,
        baseRevisionId: `revision:${canonicalPath}:001`,
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody: `# ${canonicalPath}\n`,
      },
    }));

    const manifest = await createDownloadCurrentPageSetToLocalBundleCommand(
      deps,
    )(createUri("growi", "/team/dev/spec.md"));

    expect(manifest).toMatchObject({
      kind: "growi-current-set",
      bundleName: "growi-current-set",
      baseUrl: "https://growi.example.com/",
      rootCanonicalPath: "/team/dev/spec",
    });
    expect(deps.writeLocalFile).toHaveBeenCalledWith(
      "/workspace/growi-current-set/team/dev/spec.md",
      "# /team/dev/spec\n",
    );
    expect(deps.writeLocalFile).toHaveBeenCalledWith(
      "/workspace/growi-current-set/team/dev/spec/child.md",
      "# /team/dev/spec/child\n",
    );

    const manifestCall = deps.writeLocalFile.mock.calls.find(
      ([filePath]) => filePath === "/workspace/growi-current-set/manifest.json",
    );
    expect(manifestCall).toBeDefined();
    expect(JSON.parse(manifestCall?.[1] as string)).toMatchObject({
      kind: "growi-current-set",
      bundleName: "growi-current-set",
      rootCanonicalPath: "/team/dev/spec",
      pages: [
        {
          canonicalPath: "/team/dev/spec",
          relativeFilePath: "team/dev/spec.md",
          pageId: "page:/team/dev/spec",
          baseRevisionId: "revision:/team/dev/spec:001",
          contentHash: hashBodyForTest("# /team/dev/spec\n"),
        },
        {
          canonicalPath: "/team/dev/spec/child",
          relativeFilePath: "team/dev/spec/child.md",
          pageId: "page:/team/dev/spec/child",
          baseRevisionId: "revision:/team/dev/spec/child:001",
          contentHash: hashBodyForTest("# /team/dev/spec/child\n"),
        },
      ],
    });
    expect(deps.openLocalFile).toHaveBeenCalledWith(
      "/workspace/growi-current-set/manifest.json",
    );
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "現在ページ配下を growi-current-set/ に保存しました。",
    );
  });

  it("rejects bundle download before export when the subtree exceeds 50 pages", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.listPages.mockResolvedValue({
      ok: true,
      paths: Array.from(
        { length: 50 },
        (_, index) => `/team/dev/spec/${index}`,
      ),
    });

    await createDownloadCurrentPageSetToLocalBundleCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.writeLocalFile).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "active page 配下が 50 pages を超えるため Download Current Page Set to Local Bundle を実行できません。",
    );
  });

  it("compares the local bundle against GROWI and returns page-level statuses", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (filePath === "/workspace/growi-current-set/manifest.json") {
        return createBundleManifest([
          {
            canonicalPath: "/team/dev/spec",
            body: "# remote same\n",
            baseRevisionId: "revision:/team/dev/spec:001",
          },
          {
            canonicalPath: "/team/dev/spec/local-only",
            body: "# remote old\n",
            baseRevisionId: "revision:/team/dev/spec/local-only:001",
          },
          {
            canonicalPath: "/team/dev/spec/conflict",
            body: "# remote old\n",
            baseRevisionId: "revision:/team/dev/spec/conflict:001",
          },
          {
            canonicalPath: "/team/dev/spec/remote-only",
            body: "# remote old\n",
            baseRevisionId: "revision:/team/dev/spec/remote-only:001",
          },
          {
            canonicalPath: "/team/dev/spec/missing",
            body: "# remote missing\n",
            baseRevisionId: "revision:/team/dev/spec/missing:001",
          },
        ]);
      }
      if (filePath.endsWith("team/dev/spec.md")) {
        return "# remote same\n";
      }
      if (filePath.endsWith("team/dev/spec/local-only.md")) {
        return "# local changed\n";
      }
      if (filePath.endsWith("team/dev/spec/conflict.md")) {
        return "# local conflict\n";
      }
      if (filePath.endsWith("team/dev/spec/remote-only.md")) {
        return "# remote old\n";
      }
      throw new Error("ENOENT");
    });
    deps.bootstrapEditSession.mockImplementation(async (canonicalPath) => {
      if (canonicalPath === "/team/dev/spec/missing") {
        return { ok: false, reason: "NotFound" } as const;
      }
      if (canonicalPath === "/team/dev/spec/conflict") {
        return {
          ok: true,
          value: {
            pageId: `page:${canonicalPath}`,
            baseRevisionId: "revision:/team/dev/spec/conflict:002",
            baseUpdatedAt: "2026-03-08T00:00:00.000Z",
            baseBody: "# remote conflict\n",
          },
        };
      }
      if (canonicalPath === "/team/dev/spec/remote-only") {
        return {
          ok: true,
          value: {
            pageId: `page:${canonicalPath}`,
            baseRevisionId: "revision:/team/dev/spec/remote-only:002",
            baseUpdatedAt: "2026-03-08T00:00:00.000Z",
            baseBody: "# remote changed\n",
          },
        };
      }
      return {
        ok: true,
        value: {
          pageId: `page:${canonicalPath}`,
          baseRevisionId: `revision:${canonicalPath}:001`,
          baseUpdatedAt: "2026-03-08T00:00:00.000Z",
          baseBody: "# remote\n",
        },
      };
    });

    const results = await createCompareLocalBundleWithGrowiCommand(deps)();

    expect(results).toEqual([
      { canonicalPath: "/team/dev/spec", status: "Unchanged" },
      { canonicalPath: "/team/dev/spec/local-only", status: "LocalChanged" },
      { canonicalPath: "/team/dev/spec/conflict", status: "Conflict" },
      { canonicalPath: "/team/dev/spec/remote-only", status: "RemoteChanged" },
      { canonicalPath: "/team/dev/spec/missing", status: "MissingLocal" },
    ]);
    expect(deps.openChanges).toHaveBeenCalledWith(
      "GROWI Bundle Diff: /team/dev/spec",
      [
        [
          {
            scheme: "file",
            path: "/workspace/growi-current-set/team/dev/spec/local-only.md",
            fsPath: "/workspace/growi-current-set/team/dev/spec/local-only.md",
          },
          { scheme: "growi", path: "/team/dev/spec/local-only.md" },
          {
            scheme: "file",
            path: "/workspace/growi-current-set/team/dev/spec/local-only.md",
            fsPath: "/workspace/growi-current-set/team/dev/spec/local-only.md",
          },
        ],
        [
          {
            scheme: "file",
            path: "/workspace/growi-current-set/team/dev/spec/conflict.md",
            fsPath: "/workspace/growi-current-set/team/dev/spec/conflict.md",
          },
          { scheme: "growi", path: "/team/dev/spec/conflict.md" },
          {
            scheme: "file",
            path: "/workspace/growi-current-set/team/dev/spec/conflict.md",
            fsPath: "/workspace/growi-current-set/team/dev/spec/conflict.md",
          },
        ],
        [
          {
            scheme: "file",
            path: "/workspace/growi-current-set/team/dev/spec/remote-only.md",
            fsPath: "/workspace/growi-current-set/team/dev/spec/remote-only.md",
          },
          { scheme: "growi", path: "/team/dev/spec/remote-only.md" },
          {
            scheme: "file",
            path: "/workspace/growi-current-set/team/dev/spec/remote-only.md",
            fsPath: "/workspace/growi-current-set/team/dev/spec/remote-only.md",
          },
        ],
      ],
    );
    expect(deps.openDiff).not.toHaveBeenCalled();
    expect(deps.showWarningMessage).toHaveBeenCalledWith(
      [
        "Compare Local Bundle with GROWI では一部ページを changes editor に含めませんでした。",
        "MissingLocal: /team/dev/spec/missing",
      ].join("\n"),
    );
    expect(deps.showInformationMessage).not.toHaveBeenCalled();
  });

  it("does not open changes editor when the bundle has no diff targets", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.bootstrapEditSession.mockResolvedValue({
      ok: true,
      value: {
        pageId: "page:/team/dev/spec",
        baseRevisionId: "revision:/team/dev/spec:001",
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody: "# remote same\n",
      },
    });
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (filePath === "/workspace/growi-current-set/manifest.json") {
        return createBundleManifest([
          {
            canonicalPath: "/team/dev/spec",
            body: "# remote same\n",
            baseRevisionId: "revision:/team/dev/spec:001",
          },
        ]);
      }
      if (filePath.endsWith("team/dev/spec.md")) {
        return "# remote same\n";
      }
      throw new Error(`unexpected file: ${filePath}`);
    });

    const results = await createCompareLocalBundleWithGrowiCommand(deps)();

    expect(results).toEqual([
      { canonicalPath: "/team/dev/spec", status: "Unchanged" },
    ]);
    expect(deps.openChanges).not.toHaveBeenCalled();
    expect(deps.openDiff).not.toHaveBeenCalled();
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "Compare Local Bundle with GROWI で changes editor の対象はありませんでした。",
    );
  });

  it("uploads only changed bundle pages and skips unchanged, conflict, and missing remote pages", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (filePath === "/workspace/growi-current-set/manifest.json") {
        return createBundleManifest([
          {
            canonicalPath: "/team/dev/spec/changed",
            body: "# remote old\n",
            baseRevisionId: "revision:/team/dev/spec/changed:001",
          },
          {
            canonicalPath: "/team/dev/spec/unchanged",
            body: "# remote same\n",
            baseRevisionId: "revision:/team/dev/spec/unchanged:001",
          },
          {
            canonicalPath: "/team/dev/spec/conflict",
            body: "# remote old\n",
            baseRevisionId: "revision:/team/dev/spec/conflict:001",
          },
          {
            canonicalPath: "/team/dev/spec/missing",
            body: "# remote old\n",
            baseRevisionId: "revision:/team/dev/spec/missing:001",
          },
        ]);
      }
      if (filePath.endsWith("team/dev/spec/changed.md")) {
        return "# local changed\n";
      }
      if (filePath.endsWith("team/dev/spec/unchanged.md")) {
        return "# remote same\n";
      }
      if (filePath.endsWith("team/dev/spec/conflict.md")) {
        return "# local conflict\n";
      }
      if (filePath.endsWith("team/dev/spec/missing.md")) {
        return "# local missing\n";
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.bootstrapEditSession.mockImplementation(async (canonicalPath) => {
      if (canonicalPath === "/team/dev/spec/missing") {
        return { ok: false, reason: "NotFound" } as const;
      }
      if (canonicalPath === "/team/dev/spec/conflict") {
        return {
          ok: true,
          value: {
            pageId: `page:${canonicalPath}`,
            baseRevisionId: "revision:/team/dev/spec/conflict:999",
            baseUpdatedAt: "2026-03-08T00:00:00.000Z",
            baseBody: "# remote newer\n",
          },
        };
      }
      if (canonicalPath === "/team/dev/spec/changed") {
        const callCount = deps.bootstrapEditSession.mock.calls.filter(
          ([path]) => path === canonicalPath,
        ).length;
        if (callCount === 1) {
          return {
            ok: true,
            value: {
              pageId: "page:/team/dev/spec/changed",
              baseRevisionId: "revision:/team/dev/spec/changed:001",
              baseUpdatedAt: "2026-03-08T00:00:00.000Z",
              baseBody: "# remote old\n",
            },
          };
        }
        return {
          ok: true,
          value: {
            pageId: "page:/team/dev/spec/changed",
            baseRevisionId: "revision:/team/dev/spec/changed:002",
            baseUpdatedAt: "2026-03-09T00:00:00.000Z",
            baseBody: "# local changed\n",
          },
        };
      }
      return {
        ok: true,
        value: {
          pageId: `page:${canonicalPath}`,
          baseRevisionId: `revision:${canonicalPath}:001`,
          baseUpdatedAt: "2026-03-08T00:00:00.000Z",
          baseBody: "# remote\n",
        },
      };
    });

    const results = await createUploadLocalBundleToGrowiCommand(deps)();

    expect(results).toEqual([
      { canonicalPath: "/team/dev/spec/changed", status: "Uploaded" },
      { canonicalPath: "/team/dev/spec/unchanged", status: "Unchanged" },
      { canonicalPath: "/team/dev/spec/conflict", status: "Conflict" },
      { canonicalPath: "/team/dev/spec/missing", status: "MissingRemote" },
    ]);
    expect(deps.writePage).toHaveBeenCalledTimes(1);
    expect(deps.writePage).toHaveBeenCalledWith(
      "/team/dev/spec/changed",
      "# local changed\n",
      expect.objectContaining({
        pageId: "page:/team/dev/spec/changed",
        baseRevisionId: "revision:/team/dev/spec/changed:001",
        baseBody: "# remote old\n",
      }),
    );
    expect(deps.refreshOpenGrowiPage).toHaveBeenCalledTimes(1);
    expect(deps.refreshOpenGrowiPage).toHaveBeenCalledWith(
      "/team/dev/spec/changed",
    );

    const manifestWrite = deps.writeLocalFile.mock.calls.find(
      ([filePath]) => filePath === "/workspace/growi-current-set/manifest.json",
    );
    expect(manifestWrite).toBeDefined();
    expect(JSON.parse(manifestWrite?.[1] as string)).toMatchObject({
      exportedAt: expect.any(String),
      pages: expect.arrayContaining([
        expect.objectContaining({
          canonicalPath: "/team/dev/spec/changed",
          baseRevisionId: "revision:/team/dev/spec/changed:002",
          contentHash: hashBodyForTest("# local changed\n"),
        }),
        expect.objectContaining({
          canonicalPath: "/team/dev/spec/conflict",
          baseRevisionId: "revision:/team/dev/spec/conflict:001",
          contentHash: hashBodyForTest("# remote old\n"),
        }),
      ]),
    });
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      [
        "Upload Local Bundle to GROWI を完了しました。",
        "Uploaded: /team/dev/spec/changed",
        "Unchanged: /team/dev/spec/unchanged",
        "Conflict: /team/dev/spec/conflict",
        "MissingRemote: /team/dev/spec/missing",
      ].join("\n"),
    );
  });
});

describe("createShowBacklinksCommand", () => {
  it("shows an error for non-growi or non-page URI", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("file", "/tmp/readme.md"),
    );

    await createShowBacklinksCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Show Backlinks は growi: ページでのみ実行できます。",
    );
    expect(deps.listPages).not.toHaveBeenCalled();
    expect(deps.readPageBody).not.toHaveBeenCalled();
  });

  it("shows an error when no prefixes are registered", async () => {
    const deps = createDeps();
    deps.getRegisteredPrefixes.mockReturnValue([]);

    await createShowBacklinksCommand(deps)(
      createUri("growi", "/team/dev/current.md"),
    );

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Backlinks の対象 Prefix がありません。先に Add Prefix を実行してください。",
    );
    expect(deps.listPages).not.toHaveBeenCalled();
  });

  it("shows information when no backlinks are found", async () => {
    const deps = createDeps();
    deps.getRegisteredPrefixes.mockReturnValue(["/team/dev"]);
    deps.listPages.mockResolvedValue({ ok: true, paths: ["/team/dev/other"] });
    deps.readPageBody.mockResolvedValue({ ok: true, body: "no links" });

    await createShowBacklinksCommand(deps)(
      createUri("growi", "/team/dev/current.md"),
    );

    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "Backlinks は見つかりませんでした。",
    );
    expect(deps.showQuickPick).not.toHaveBeenCalled();
  });

  it("shows quick pick and opens selected backlink page", async () => {
    const deps = createDeps();
    deps.getRegisteredPrefixes.mockReturnValue(["/team/dev"]);
    deps.listPages.mockResolvedValue({
      ok: true,
      paths: ["/team/dev/current", "/team/dev/backlink"],
    });
    deps.readPageBody.mockResolvedValue({
      ok: true,
      body: "[to](/team/dev/current)",
    });
    deps.showQuickPick.mockResolvedValue({
      label: "/team/dev/backlink",
      canonicalPath: "/team/dev/backlink",
    });

    await createShowBacklinksCommand(deps)(
      createUri("growi", "/team/dev/current.md"),
    );

    expect(deps.showQuickPick).toHaveBeenCalledWith(
      [{ label: "/team/dev/backlink", canonicalPath: "/team/dev/backlink" }],
      { placeHolder: "登録済み Prefix 配下を検索しました。" },
    );
    expect(deps.openUri).toHaveBeenCalledWith("growi:/team/dev/backlink.md");
  });

  it("maps list/read/connection failures to fixed messages", async () => {
    const deps = createDeps();
    deps.getRegisteredPrefixes.mockReturnValue(["/team/dev"]);

    deps.listPages.mockResolvedValueOnce({
      ok: false,
      reason: "ApiNotSupported",
    });
    await createShowBacklinksCommand(deps)(
      createUri("growi", "/team/dev/current.md"),
    );
    expect(deps.showErrorMessage).toHaveBeenLastCalledWith(
      "Backlinks の対象一覧 API が未対応のため実行できません。",
    );

    deps.listPages.mockResolvedValueOnce({
      ok: true,
      paths: ["/team/dev/backlink"],
    });
    deps.readPageBody.mockResolvedValueOnce({
      ok: false,
      reason: "ApiNotSupported",
    });
    await createShowBacklinksCommand(deps)(
      createUri("growi", "/team/dev/current.md"),
    );
    expect(deps.showErrorMessage).toHaveBeenLastCalledWith(
      "Backlinks の本文取得 API が未対応のため実行できません。",
    );

    deps.listPages.mockResolvedValueOnce({
      ok: false,
      reason: "ConnectionFailed",
    });
    await createShowBacklinksCommand(deps)(
      createUri("growi", "/team/dev/current.md"),
    );
    expect(deps.showErrorMessage).toHaveBeenLastCalledWith(
      "GROWI への接続に失敗したため Backlinks を実行できませんでした。",
    );
  });
});

describe("createShowCurrentPageActionsCommand", () => {
  it("includes revision history diff in current page actions", async () => {
    const executeCommand = vi.fn(async () => {});
    const showQuickPick = vi.fn(async () => ({
      label: "履歴差分を表示",
      command: GROWI_COMMANDS.showRevisionHistoryDiff,
    }));

    await createShowCurrentPageActionsCommand({
      getActiveEditorUri() {
        return createUri("growi", "/team/dev/spec.md");
      },
      executeCommand,
      showErrorMessage: vi.fn(),
      showQuickPick,
    })();

    expect(showQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          label: "履歴差分を表示",
          command: GROWI_COMMANDS.showRevisionHistoryDiff,
        }),
      ]),
      { placeHolder: "現在ページに対して実行する操作を選択してください。" },
    );
    expect(executeCommand).toHaveBeenCalledWith(
      GROWI_COMMANDS.showRevisionHistoryDiff,
      createUri("growi", "/team/dev/spec.md"),
    );
  });
});

describe("createShowRevisionHistoryDiffCommand", () => {
  it("opens diff for current page and selected revision", async () => {
    const deps = createDeps();
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T09:00:00.000Z",
    });
    deps.showQuickPick.mockResolvedValueOnce({
      label: "2026-03-08T09:00:00.000Z",
      description: "alice",
      detail: "revision-001",
      revisionId: "revision-001",
      createdAt: "2026-03-08T09:00:00.000Z",
      author: "alice",
    } as never);

    await createShowRevisionHistoryDiffCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.listRevisions).toHaveBeenCalledWith("page-123");
    expect(deps.readRevision).toHaveBeenCalledTimes(1);
    expect(deps.readRevision).toHaveBeenCalledWith("page-123", "revision-001");
    expect(deps.seedRevisionContent).toHaveBeenCalledTimes(1);
    expect(deps.openDiff).toHaveBeenCalledWith(
      {
        scheme: "growi",
        path: "/team/dev/spec.md",
      },
      {
        scheme: "growi-revision",
        path: "/page-123/revision-001/team/dev/spec.md",
      },
      "GROWI Revision Diff: /team/dev/spec (current <-> revision-001)",
    );
  });

  it("shows information when there are not enough revisions", async () => {
    const deps = createDeps();
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T09:00:00.000Z",
    });
    deps.listRevisions.mockResolvedValue({
      ok: true,
      revisions: [
        {
          revisionId: "revision-001",
          createdAt: "2026-03-08T09:00:00.000Z",
          author: "alice",
        },
      ],
    });

    await createShowRevisionHistoryDiffCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "比較可能な revision が不足しているため履歴差分を表示できません。",
    );
    expect(deps.openDiff).not.toHaveBeenCalled();
  });

  it("maps list failures to fixed messages", async () => {
    const deps = createDeps();
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T09:00:00.000Z",
    });

    deps.listRevisions.mockResolvedValueOnce({
      ok: false,
      reason: "ApiNotSupported",
    });
    await createShowRevisionHistoryDiffCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );
    expect(deps.showErrorMessage).toHaveBeenLastCalledWith(
      "revision 一覧 API が未対応のため履歴差分を実行できません。",
    );

    deps.listRevisions.mockResolvedValueOnce({
      ok: false,
      reason: "ConnectionFailed",
    });
    await createShowRevisionHistoryDiffCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );
    expect(deps.showErrorMessage).toHaveBeenLastCalledWith(
      "GROWI への接続に失敗したため履歴差分を実行できませんでした。",
    );
  });

  it("maps revision read failures to fixed messages", async () => {
    const deps = createDeps();
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T09:00:00.000Z",
    });
    deps.showQuickPick.mockResolvedValueOnce({
      label: "2026-03-08T09:00:00.000Z",
      description: "alice",
      detail: "revision-001",
      revisionId: "revision-001",
      createdAt: "2026-03-08T09:00:00.000Z",
      author: "alice",
    } as never);

    deps.readRevision.mockReset();
    deps.readRevision.mockResolvedValueOnce({
      ok: false,
      reason: "ApiNotSupported",
    } as never);
    await createShowRevisionHistoryDiffCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );
    expect(deps.showErrorMessage).toHaveBeenLastCalledWith(
      "revision 本文取得 API が未対応のため履歴差分を実行できません。",
    );

    deps.showQuickPick.mockResolvedValueOnce({
      label: "2026-03-08T09:00:00.000Z",
      description: "alice",
      detail: "revision-001",
      revisionId: "revision-001",
      createdAt: "2026-03-08T09:00:00.000Z",
      author: "alice",
    } as never);

    deps.readRevision.mockReset();
    deps.readRevision.mockResolvedValueOnce({
      ok: false,
      reason: "ConnectionFailed",
    } as never);
    await createShowRevisionHistoryDiffCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );
    expect(deps.showErrorMessage).toHaveBeenLastCalledWith(
      "GROWI への接続に失敗したため履歴差分を実行できませんでした。",
    );
  });
});

describe("createShowCurrentPageInfoCommand", () => {
  it("shows current page info for growi page URI", async () => {
    const deps = createDeps();
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T09:00:00.000Z",
    });

    await createShowCurrentPageInfoCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.getCurrentPageInfo).toHaveBeenCalledWith("/team/dev/spec");
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      [
        "URL: https://growi.example.com/team/dev/spec",
        "Path: /team/dev/spec",
        "Last Updated By: alice",
        "Last Updated At: 2026-03-08T09:00:00.000Z",
      ].join("\n"),
    );
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("shows an error when current page info is missing", async () => {
    const deps = createDeps();

    await createShowCurrentPageInfoCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.showInformationMessage).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "現在ページメタ情報を取得できませんでした。ページを開き直して再実行してください。",
    );
  });

  it("reads latest page info on each invocation", async () => {
    const deps = createDeps();
    let currentInfo = {
      pageId: "page-123",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T09:00:00.000Z",
    };
    deps.getCurrentPageInfo.mockImplementation(() => currentInfo);

    const command = createShowCurrentPageInfoCommand(deps);
    const uri = createUri("growi", "/team/dev/spec.md");
    await command(uri);

    currentInfo = {
      pageId: "page-123",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "bob",
      lastUpdatedAt: "2026-03-08T10:00:00.000Z",
    };
    await command(uri);

    expect(deps.getCurrentPageInfo).toHaveBeenCalledTimes(2);
    expect(deps.getCurrentPageInfo).toHaveBeenNthCalledWith(
      1,
      "/team/dev/spec",
    );
    expect(deps.getCurrentPageInfo).toHaveBeenNthCalledWith(
      2,
      "/team/dev/spec",
    );
    expect(deps.showInformationMessage).toHaveBeenNthCalledWith(
      1,
      [
        "URL: https://growi.example.com/team/dev/spec",
        "Path: /team/dev/spec",
        "Last Updated By: alice",
        "Last Updated At: 2026-03-08T09:00:00.000Z",
      ].join("\n"),
    );
    expect(deps.showInformationMessage).toHaveBeenNthCalledWith(
      2,
      [
        "URL: https://growi.example.com/team/dev/spec",
        "Path: /team/dev/spec",
        "Last Updated By: bob",
        "Last Updated At: 2026-03-08T10:00:00.000Z",
      ].join("\n"),
    );
  });

  it("shows an error for non-growi or non-page URI", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("file", "/tmp/readme.md"),
    );

    await createShowCurrentPageInfoCommand(deps)();

    expect(deps.getCurrentPageInfo).not.toHaveBeenCalled();
    expect(deps.showInformationMessage).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Show Current Page Info は growi: ページでのみ実行できます。",
    );
  });
});
