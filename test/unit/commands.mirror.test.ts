import { describe, expect, it } from "vitest";

import {
  createCompareLocalMirrorSubtreeWithGrowiCommand,
  createCompareLocalMirrorWithGrowiCommand,
  createExplorerCompareLocalMirrorSubtreeWithGrowiCommand,
  createExplorerCompareLocalMirrorWithGrowiCommand,
  createExplorerCreateLocalMirrorForCurrentPageCommand,
  createExplorerCreateLocalMirrorForCurrentPrefixCommand,
  createExplorerShowRevisionHistoryDiffCommand,
  createExplorerUploadLocalMirrorSubtreeToGrowiCommand,
  createExplorerUploadLocalMirrorToGrowiCommand,
  createLocalMirrorForCurrentPageCommand,
  createLocalMirrorForCurrentPrefixCommand,
  createScmCompareMirrorAgainCommand,
  createScmTakeRemoteMirrorResourcesCommand,
  createScmUploadMirrorResourcesCommand,
  createUploadLocalMirrorSubtreeToGrowiCommand,
  createUploadLocalMirrorToGrowiCommand,
  GROWI_COMMANDS,
} from "../../src/vscode/commands";

import {
  createBundleManifest,
  createDeps,
  createMirrorRelativePath,
  createMirrorRootPath,
  createUri,
  hashBodyForTest,
} from "./commandsTestUtils";

describe("createCompareLocalMirrorWithGrowiCommand", () => {
  it("opens vscode changes for the current page mirror", async () => {
    const deps = createDeps();
    const relativeFilePath = createMirrorRelativePath(
      "/team/dev/spec",
      "/team/dev/spec",
    );
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/.growi-mirror.json`
      ) {
        return createBundleManifest([
          {
            canonicalPath: "/team/dev/spec",
            body: "# remote old\n",
            baseRevisionId: "revision-001",
          },
        ]);
      }
      if (
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/${relativeFilePath}`
      ) {
        return "# local body\n";
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.bootstrapEditSession.mockResolvedValue({
      ok: true,
      value: {
        pageId: "page:/team/dev/spec",
        baseRevisionId: "revision-001",
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody: "# remote old\n",
      },
    });

    await createCompareLocalMirrorWithGrowiCommand(deps)();

    expect(deps.openChanges).toHaveBeenCalledWith(
      "GROWI Mirror Diff: /team/dev/spec",
      [
        [
          {
            scheme: "file",
            path: `${createMirrorRootPath("/team/dev/spec")}/${relativeFilePath}`,
            fsPath: `${createMirrorRootPath("/team/dev/spec")}/${relativeFilePath}`,
          },
          { scheme: "growi", path: "/team/dev/spec.md" },
          {
            scheme: "file",
            path: `${createMirrorRootPath("/team/dev/spec")}/${relativeFilePath}`,
            fsPath: `${createMirrorRootPath("/team/dev/spec")}/${relativeFilePath}`,
          },
        ],
      ],
    );
  });

  it("rejects compare when active editor is not growi page", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("file", "/workspace/other.md"),
    );

    await createCompareLocalMirrorWithGrowiCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "Compare Local Mirror with GROWI は growi: ページでのみ実行できます。",
    );
    expect(deps.openChanges).not.toHaveBeenCalled();
  });

  it("rejects compare when no local file workspace is open", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.getLocalWorkspaceRoot.mockReturnValue(undefined);

    await createCompareLocalMirrorWithGrowiCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "ローカル file: workspace/folder が開かれていないため Compare Local Mirror with GROWI を実行できません。先に file: workspace/folder を開いてください。",
    );
  });

  it("rejects invalid mirror manifest", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockResolvedValueOnce("{invalid");

    await createCompareLocalMirrorWithGrowiCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      ".growi-mirror.json の GROWI metadata を読み取れないため Compare Local Mirror with GROWI を実行できません。再度 Sync Local Mirror を実行してください。",
    );
    expect(deps.openChanges).not.toHaveBeenCalled();
  });

  it("rejects base URL mismatch before opening diff", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.readLocalFile.mockResolvedValueOnce(
      createBundleManifest(
        [
          {
            canonicalPath: "/team/dev/spec",
            body: "# remote old\n",
            baseRevisionId: "revision-001",
          },
        ],
        { baseUrl: "https://other.example.com/" },
      ),
    );

    await createCompareLocalMirrorWithGrowiCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "mirror の GROWI base URL が現在設定と一致しないため Compare Local Mirror with GROWI を実行できません。接続先を確認してください。",
    );
    expect(deps.openChanges).not.toHaveBeenCalled();
  });

  it("allows compare even when mirror file has unsaved changes", async () => {
    const deps = createDeps();
    const relativeFilePath = createMirrorRelativePath(
      "/team/dev/spec",
      "/team/dev/spec",
    );
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/.growi-mirror.json`
      ) {
        return createBundleManifest([
          {
            canonicalPath: "/team/dev/spec",
            body: "# remote old\n",
            baseRevisionId: "revision-001",
          },
        ]);
      }
      if (
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/${relativeFilePath}`
      ) {
        return "# unsaved body\n";
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.bootstrapEditSession.mockResolvedValue({
      ok: true,
      value: {
        pageId: "page:/team/dev/spec",
        baseRevisionId: "revision-001",
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody: "# remote old\n",
      },
    });

    await createCompareLocalMirrorWithGrowiCommand(deps)();

    expect(deps.openChanges).toHaveBeenCalledTimes(1);
  });
});

describe("Explorer context wrapper mirror commands", () => {
  it("delegates current-page actions with a synthetic directory page URI as-is", async () => {
    const deps = createDeps();

    await createExplorerCreateLocalMirrorForCurrentPrefixCommand(deps)({
      uri: createUri("growi", "/team/dev.md"),
      contextValue: "growi.directoryPage",
    });

    expect(deps.executeCommand).toHaveBeenCalledWith(
      GROWI_COMMANDS.createLocalMirrorForCurrentPrefix,
      createUri("growi", "/team/dev.md"),
    );
  });

  it("maps local round trip wrappers to the resolved page URI", async () => {
    const deps = createDeps();

    await createExplorerCompareLocalMirrorWithGrowiCommand(deps)({
      uri: createUri("growi", "/team/dev/spec.md"),
      contextValue: "growi.page",
    });
    await createExplorerUploadLocalMirrorToGrowiCommand(deps)({
      uri: createUri("growi", "/team/dev/spec.md"),
      contextValue: "growi.page",
    });
    await createExplorerCompareLocalMirrorSubtreeWithGrowiCommand(deps)({
      uri: createUri("growi", "/team/dev/"),
      contextValue: "growi.directory",
    });
    await createExplorerUploadLocalMirrorSubtreeToGrowiCommand(deps)({
      uri: createUri("growi", "/team/"),
      contextValue: "growi.prefixRoot",
    });

    expect(deps.executeCommand).toHaveBeenNthCalledWith(
      1,
      GROWI_COMMANDS.compareLocalMirrorWithGrowi,
      { uri: createUri("growi", "/team/dev/spec.md"), scope: "page" },
    );
    expect(deps.executeCommand).toHaveBeenNthCalledWith(
      2,
      GROWI_COMMANDS.uploadLocalMirrorToGrowi,
      { uri: createUri("growi", "/team/dev/spec.md"), scope: "page" },
    );
    expect(deps.executeCommand).toHaveBeenNthCalledWith(
      3,
      GROWI_COMMANDS.compareLocalMirrorWithGrowi,
      { scheme: "growi", path: "/team/dev.md" },
    );
    expect(deps.executeCommand).toHaveBeenNthCalledWith(
      4,
      GROWI_COMMANDS.uploadLocalMirrorToGrowi,
      { scheme: "growi", path: "/team.md" },
    );
  });

  it("ignores invalid Explorer targets for local round trip wrappers", async () => {
    const deps = createDeps();

    await createExplorerCompareLocalMirrorSubtreeWithGrowiCommand(deps)({
      uri: createUri("file", "/tmp/current.md"),
    });
    await createExplorerUploadLocalMirrorSubtreeToGrowiCommand(deps)({
      uri: createUri("file", "/tmp/current.md"),
    });

    expect(deps.executeCommand).not.toHaveBeenCalled();
  });

  it("delegates revision history diff from string canonical paths", async () => {
    const deps = createDeps();

    await createExplorerShowRevisionHistoryDiffCommand(deps)("/team/dev/spec");
    await createExplorerCreateLocalMirrorForCurrentPageCommand(deps)(
      "/team/dev/spec",
    );

    expect(deps.executeCommand).toHaveBeenNthCalledWith(
      1,
      GROWI_COMMANDS.showRevisionHistoryDiff,
      { scheme: "growi", path: "/team/dev/spec.md" },
    );
    expect(deps.executeCommand).toHaveBeenNthCalledWith(
      2,
      GROWI_COMMANDS.createLocalMirrorForCurrentPage,
      { scheme: "growi", path: "/team/dev/spec.md" },
    );
  });
});

describe("createLocalMirrorForCurrentPageCommand", () => {
  it("rejects non-growi, directory, and root URIs", async () => {
    const deps = createDeps();

    await createLocalMirrorForCurrentPageCommand(deps)(
      createUri("file", "/tmp/readme.md"),
    );
    await createLocalMirrorForCurrentPageCommand(deps)(
      createUri("growi", "/team/dev/"),
    );
    await createLocalMirrorForCurrentPageCommand(deps)(createUri("growi", "/"));

    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenNthCalledWith(
      1,
      "Sync Local Mirror for Current Page は growi: ページでのみ実行できます。",
    );
    expect(deps.showErrorMessage).toHaveBeenNthCalledWith(
      2,
      "Sync Local Mirror for Current Page は growi: ページでのみ実行できます。",
    );
    expect(deps.showErrorMessage).toHaveBeenNthCalledWith(
      3,
      "Sync Local Mirror for Current Page は growi: ページでのみ実行できます。",
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

    await createLocalMirrorForCurrentPageCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "未保存の変更があるため Sync Local Mirror for Current Page を実行できません。先に保存または End Edit を実行してください。",
    );
  });

  it("rejects download when no local file workspace is open", async () => {
    const deps = createDeps();
    deps.getLocalWorkspaceRoot.mockReturnValue(undefined);

    await createLocalMirrorForCurrentPageCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "ローカル file: workspace/folder が開かれていないため Sync Local Mirror for Current Page を実行できません。先に file: workspace/folder を開いてください。",
    );
  });

  it("writes the page mirror and manifest, then opens the reserved page file", async () => {
    const deps = createDeps();
    const relativeFilePath = createMirrorRelativePath(
      "/team/dev/spec",
      "/team/dev/spec",
    );
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

    await createLocalMirrorForCurrentPageCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.writeLocalFile).toHaveBeenCalledWith(
      `${createMirrorRootPath("/team/dev/spec")}/${relativeFilePath}`,
      "# exported body\n",
    );
    expect(deps.openLocalFile).toHaveBeenCalledWith(
      `${createMirrorRootPath("/team/dev/spec")}/${relativeFilePath}`,
    );
    const manifestWrite = deps.writeLocalFile.mock.calls.find(
      ([filePath]) =>
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/.growi-mirror.json`,
    );
    expect(manifestWrite).toBeDefined();
    expect(JSON.parse(manifestWrite?.[1] as string)).toMatchObject({
      version: 1,
      baseUrl: "https://growi.example.com/",
      rootCanonicalPath: "/team/dev/spec",
      mode: "page",
      pages: [
        {
          canonicalPath: "/team/dev/spec",
          relativeFilePath,
          pageId: "page-123",
          baseRevisionId: "revision-001",
          contentHash: hashBodyForTest("# exported body\n"),
        },
      ],
    });
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "現在ページをローカルに同期しました。",
    );
  });

  it("reuses the nearest ancestor prefix mirror for current page export", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath === `${createMirrorRootPath("/sample")}/.growi-mirror.json`
      ) {
        return createBundleManifest(
          [
            { canonicalPath: "/sample", body: "# sample\n" },
            { canonicalPath: "/sample/hello", body: "# old hello\n" },
          ],
          { rootCanonicalPath: "/sample" },
        );
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.bootstrapEditSession.mockResolvedValue({
      ok: true,
      value: {
        pageId: "page:/sample/hello",
        baseRevisionId: "revision:/sample/hello:002",
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody: "# refreshed hello\n",
      },
    });

    await createLocalMirrorForCurrentPageCommand(deps)(
      createUri("growi", "/sample/hello.md"),
    );

    expect(deps.writeLocalFile).toHaveBeenCalledWith(
      `${createMirrorRootPath("/sample")}/hello.md`,
      "# refreshed hello\n",
    );
    expect(deps.writeLocalFile).not.toHaveBeenCalledWith(
      `${createMirrorRootPath("/sample/hello")}/__hello__.md`,
      "# refreshed hello\n",
    );
    expect(deps.openLocalFile).toHaveBeenCalledWith(
      `${createMirrorRootPath("/sample")}/hello.md`,
    );
    const manifestWrite = deps.writeLocalFile.mock.calls.find(
      ([filePath]) =>
        filePath === `${createMirrorRootPath("/sample")}/.growi-mirror.json`,
    );
    expect(manifestWrite).toBeDefined();
    expect(JSON.parse(manifestWrite?.[1] as string)).toMatchObject({
      rootCanonicalPath: "/sample",
      mode: "prefix",
      pages: expect.arrayContaining([
        expect.objectContaining({
          canonicalPath: "/sample/hello",
          relativeFilePath: "hello.md",
          baseRevisionId: "revision:/sample/hello:002",
          contentHash: hashBodyForTest("# refreshed hello\n"),
        }),
      ]),
    });
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "既存 prefix mirror 内の現在ページをローカルに同期しました。",
    );
  });

  it("prefers the nearest ancestor prefix mirror when multiple exist", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath ===
        `${createMirrorRootPath("/sample/test")}/.growi-mirror.json`
      ) {
        return createBundleManifest(
          [
            { canonicalPath: "/sample/test", body: "# test\n" },
            { canonicalPath: "/sample/test/hello", body: "# old hello\n" },
          ],
          { rootCanonicalPath: "/sample/test" },
        );
      }
      if (
        filePath === `${createMirrorRootPath("/sample")}/.growi-mirror.json`
      ) {
        return createBundleManifest(
          [
            { canonicalPath: "/sample", body: "# sample\n" },
            { canonicalPath: "/sample/test/hello", body: "# older hello\n" },
          ],
          { rootCanonicalPath: "/sample" },
        );
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.bootstrapEditSession.mockResolvedValue({
      ok: true,
      value: {
        pageId: "page:/sample/test/hello",
        baseRevisionId: "revision:/sample/test/hello:002",
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody: "# refreshed hello\n",
      },
    });

    await createLocalMirrorForCurrentPageCommand(deps)(
      createUri("growi", "/sample/test/hello.md"),
    );

    expect(deps.writeLocalFile).toHaveBeenCalledWith(
      `${createMirrorRootPath("/sample/test")}/hello.md`,
      "# refreshed hello\n",
    );
    const manifestWrite = deps.writeLocalFile.mock.calls.find(
      ([filePath]) =>
        filePath ===
        `${createMirrorRootPath("/sample/test")}/.growi-mirror.json`,
    );
    expect(manifestWrite).toBeDefined();
    expect(JSON.parse(manifestWrite?.[1] as string)).toMatchObject({
      rootCanonicalPath: "/sample/test",
      pages: expect.arrayContaining([
        expect.objectContaining({
          canonicalPath: "/sample/test/hello",
          relativeFilePath: "hello.md",
        }),
      ]),
    });
  });

  it("falls back to a standalone page mirror when ancestor manifests are not reusable prefix mirrors", async () => {
    const deps = createDeps();
    const relativeFilePath = createMirrorRelativePath(
      "/sample/hello",
      "/sample/hello",
    );
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath === `${createMirrorRootPath("/sample")}/.growi-mirror.json`
      ) {
        return `${JSON.stringify(
          {
            version: 1,
            baseUrl: "https://growi.example.com/",
            rootCanonicalPath: "/sample",
            mode: "page",
            exportedAt: "2026-03-08T00:00:00.000Z",
            pages: [
              {
                canonicalPath: "/sample/hello",
                relativeFilePath: "hello.md",
                pageId: "page:/sample/hello",
                baseRevisionId: "revision:/sample/hello:001",
                exportedAt: "2026-03-08T00:00:00.000Z",
                contentHash: hashBodyForTest("# old hello\n"),
              },
            ],
          },
          null,
          2,
        )}\n`;
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.bootstrapEditSession.mockResolvedValue({
      ok: true,
      value: {
        pageId: "page:/sample/hello",
        baseRevisionId: "revision:/sample/hello:002",
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody: "# refreshed hello\n",
      },
    });

    await createLocalMirrorForCurrentPageCommand(deps)(
      createUri("growi", "/sample/hello.md"),
    );

    expect(deps.writeLocalFile).toHaveBeenCalledWith(
      `${createMirrorRootPath("/sample/hello")}/${relativeFilePath}`,
      "# refreshed hello\n",
    );
  });

  it("rejects reuse when the ancestor prefix mirror tracks the page as skipped", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath === `${createMirrorRootPath("/sample")}/.growi-mirror.json`
      ) {
        return `${JSON.stringify(
          {
            version: 1,
            baseUrl: "https://growi.example.com/",
            rootCanonicalPath: "/sample",
            mode: "prefix",
            exportedAt: "2026-03-08T00:00:00.000Z",
            pages: [
              {
                canonicalPath: "/sample",
                relativeFilePath: "__sample__.md",
                pageId: "page:/sample",
                baseRevisionId: "revision:/sample:001",
                exportedAt: "2026-03-08T00:00:00.000Z",
                contentHash: hashBodyForTest("# sample\n"),
              },
            ],
            skippedPages: [
              {
                canonicalPath: "/sample/hello",
                relativeFilePath: "hello.md",
                reason: "ReservedFileNameCollision",
              },
            ],
          },
          null,
          2,
        )}\n`;
      }
      throw new Error(`unexpected file: ${filePath}`);
    });

    await createLocalMirrorForCurrentPageCommand(deps)(
      createUri("growi", "/sample/hello.md"),
    );

    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.writeLocalFile).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "既存 prefix mirror で対象ページが衝突により skip されているため Sync Local Mirror for Current Page を実行できません。prefix mirror を見直してください。",
    );
  });

  it("rejects reuse when the ancestor prefix mirror file is dirty", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath === `${createMirrorRootPath("/sample")}/.growi-mirror.json`
      ) {
        return createBundleManifest(
          [
            { canonicalPath: "/sample", body: "# sample\n" },
            { canonicalPath: "/sample/hello", body: "# old hello\n" },
          ],
          { rootCanonicalPath: "/sample" },
        );
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.findOpenTextDocument.mockReturnValue({ isDirty: true });

    await createLocalMirrorForCurrentPageCommand(deps)(
      createUri("growi", "/sample/hello.md"),
    );

    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "既存 prefix mirror に未保存の変更があるため Sync Local Mirror for Current Page を実行できません。先に保存してください。",
    );
  });

  it("removes stale tracked mirror files when reserved filenames change", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/.growi-mirror.json`
      ) {
        return `${JSON.stringify(
          {
            version: 1,
            baseUrl: "https://growi.example.com/",
            rootCanonicalPath: "/team/dev/spec",
            mode: "page",
            exportedAt: "2026-03-08T00:00:00.000Z",
            pages: [
              {
                canonicalPath: "/team/dev/spec",
                relativeFilePath: "__root__.md",
                pageId: "page-123",
                baseRevisionId: "revision-001",
                exportedAt: "2026-03-08T00:00:00.000Z",
                contentHash: hashBodyForTest("# old body\n"),
              },
            ],
          },
          null,
          2,
        )}\n`;
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.bootstrapEditSession.mockResolvedValue({
      ok: true,
      value: {
        pageId: "page-123",
        baseRevisionId: "revision-002",
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody: "# exported body\n",
      },
    });

    await createLocalMirrorForCurrentPageCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.deleteLocalPath).toHaveBeenCalledWith(
      `${createMirrorRootPath("/team/dev/spec")}/__root__.md`,
    );
  });

  it.each([
    [
      "BaseUrlNotConfigured",
      "GROWI base URL が未設定です。先に Configure Base URL を実行してください。",
    ],
    [
      "ApiTokenNotConfigured",
      "GROWI API token が未設定です。先に Configure API Token を実行してください。",
    ],
    [
      "InvalidApiToken",
      "GROWI API token が無効です。Configure API Token を確認してください。",
    ],
    [
      "PermissionDenied",
      "GROWI へのアクセス権が不足しているか、接続先が認証を拒否しました。権限設定と API Token を確認してください。",
    ],
    [
      "ApiNotSupported",
      "本文取得 API が未対応のため Sync Local Mirror for Current Page を実行できませんでした。",
    ],
    [
      "ConnectionFailed",
      "GROWI への接続に失敗したため Sync Local Mirror for Current Page を実行できませんでした。",
    ],
    [
      "NotFound",
      "対象ページが見つからないため Sync Local Mirror for Current Page を実行できませんでした。",
    ],
  ] as const)("maps snapshot failure to message: %s", async (reason, message) => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.bootstrapEditSession.mockResolvedValue({ ok: false, reason });

    await createLocalMirrorForCurrentPageCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.showErrorMessage).toHaveBeenCalledWith(message);
    expect(deps.writeLocalFile).not.toHaveBeenCalled();
  });
});

describe("createUploadLocalMirrorToGrowiCommand", () => {
  it("uploads the current page mirror and refreshes manifest metadata", async () => {
    const deps = createDeps();
    const relativeFilePath = createMirrorRelativePath(
      "/team/dev/spec",
      "/team/dev/spec",
    );
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.refreshOpenGrowiPage.mockResolvedValue("reopened");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/.growi-mirror.json`
      ) {
        return createBundleManifest([
          {
            canonicalPath: "/team/dev/spec",
            body: "# remote body\n",
            pageId: "page-123",
            baseRevisionId: "revision-001",
          },
        ]);
      }
      if (
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/${relativeFilePath}`
      ) {
        return "# uploaded body\n";
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
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

    await createUploadLocalMirrorToGrowiCommand(deps)();

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
    const manifestWrite = deps.writeLocalFile.mock.calls.find(
      ([filePath]) =>
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/.growi-mirror.json`,
    );
    expect(manifestWrite).toBeDefined();
    expect(JSON.parse(manifestWrite?.[1] as string)).toMatchObject({
      pages: [
        {
          canonicalPath: "/team/dev/spec",
          baseRevisionId: "revision-002",
          contentHash: hashBodyForTest("# uploaded body\n"),
        },
      ],
    });
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "Upload Local Mirror to GROWI を完了しました。\nUploaded: /team/dev/spec",
    );
  });

  it("rejects upload when no local file workspace is open", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.getLocalWorkspaceRoot.mockReturnValue(undefined);

    await createUploadLocalMirrorToGrowiCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "ローカル file: workspace/folder が開かれていないため Upload Local Mirror to GROWI を実行できません。先に file: workspace/folder を開いてください。",
    );
    expect(deps.writePage).not.toHaveBeenCalled();
  });

  it("rejects upload when manifest is missing", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.readLocalFile.mockRejectedValue(new Error("ENOENT"));
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");

    await createUploadLocalMirrorToGrowiCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "対象の local mirror が見つからないため Upload Local Mirror to GROWI を実行できませんでした。先に Sync Local Mirror を実行してください。",
    );
    expect(deps.writePage).not.toHaveBeenCalled();
  });

  it("rejects invalid mirror manifest", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockResolvedValue("{invalid");

    await createUploadLocalMirrorToGrowiCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      ".growi-mirror.json の GROWI metadata を読み取れませんでした。再度 Sync Local Mirror を実行してください。",
    );
    expect(deps.writePage).not.toHaveBeenCalled();
  });

  it("rejects base URL mismatch", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockResolvedValue(
      createBundleManifest(
        [
          {
            canonicalPath: "/team/dev/spec",
            body: "# remote body\n",
          },
        ],
        { baseUrl: "https://other.example.com/" },
      ),
    );

    await createUploadLocalMirrorToGrowiCommand(deps)();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "mirror の GROWI base URL が現在設定と一致しません。接続先を確認してください。",
    );
    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
  });

  it("rejects revision mismatch as conflict", async () => {
    const deps = createDeps();
    const relativeFilePath = createMirrorRelativePath(
      "/team/dev/spec",
      "/team/dev/spec",
    );
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/.growi-mirror.json`
      ) {
        return createBundleManifest([
          {
            canonicalPath: "/team/dev/spec",
            body: "# remote body\n",
            pageId: "page-123",
            baseRevisionId: "revision-001",
          },
        ]);
      }
      if (
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/${relativeFilePath}`
      ) {
        return "# uploaded body\n";
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.bootstrapEditSession.mockResolvedValue({
      ok: true,
      value: {
        pageId: "page-123",
        baseRevisionId: "revision-999",
        baseUpdatedAt: "2026-03-09T00:00:00.000Z",
        baseBody: "# remote body\n",
      },
    });

    await createUploadLocalMirrorToGrowiCommand(deps)();

    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "Upload Local Mirror to GROWI を完了しました。\nConflict: /team/dev/spec",
    );
    expect(deps.writePage).not.toHaveBeenCalled();
  });

  it("shows warning when manifest refresh and reopen fail after upload", async () => {
    const deps = createDeps();
    const relativeFilePath = createMirrorRelativePath(
      "/team/dev/spec",
      "/team/dev/spec",
    );
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.refreshOpenGrowiPage.mockResolvedValue("failed");
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/.growi-mirror.json`
      ) {
        return createBundleManifest([
          {
            canonicalPath: "/team/dev/spec",
            body: "# remote body\n",
            pageId: "page-123",
            baseRevisionId: "revision-001",
          },
        ]);
      }
      if (
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/${relativeFilePath}`
      ) {
        return "# uploaded body\n";
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
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

    await createUploadLocalMirrorToGrowiCommand(deps)();

    expect(deps.showWarningMessage).toHaveBeenCalledWith(
      [
        "Upload Local Mirror to GROWI を完了しました。",
        "Uploaded: /team/dev/spec",
        "GROWI への mirror upload は成功しましたが manifest の更新に一部失敗しました。次回 upload 前に再度 Sync Local Mirror を実行してください。",
        "/team/dev/spec: GROWI への upload は成功しましたが、表示中の growi: ページ再読込に失敗しました。Refresh Current Page を実行してください。",
      ].join("\n"),
    );
  });
});

describe("bundle commands", () => {
  it("downloads the active page set into local mirror with manifest metadata", async () => {
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

    const manifest = await createLocalMirrorForCurrentPrefixCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(manifest).toMatchObject({
      baseUrl: "https://growi.example.com/",
      rootCanonicalPath: "/team/dev/spec",
      mode: "prefix",
    });
    const rootRelativeFilePath = createMirrorRelativePath(
      "/team/dev/spec",
      "/team/dev/spec",
      ["/team/dev/spec", "/team/dev/spec/child"],
    );
    expect(deps.writeLocalFile).toHaveBeenCalledWith(
      `${createMirrorRootPath("/team/dev/spec")}/${rootRelativeFilePath}`,
      "# /team/dev/spec\n",
    );
    expect(deps.writeLocalFile).toHaveBeenCalledWith(
      `${createMirrorRootPath("/team/dev/spec")}/child.md`,
      "# /team/dev/spec/child\n",
    );

    const manifestCall = deps.writeLocalFile.mock.calls.find(
      ([filePath]) =>
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/.growi-mirror.json`,
    );
    expect(manifestCall).toBeDefined();
    expect(JSON.parse(manifestCall?.[1] as string)).toMatchObject({
      rootCanonicalPath: "/team/dev/spec",
      mode: "prefix",
      pages: [
        {
          canonicalPath: "/team/dev/spec",
          relativeFilePath: rootRelativeFilePath,
          pageId: "page:/team/dev/spec",
          baseRevisionId: "revision:/team/dev/spec:001",
          contentHash: hashBodyForTest("# /team/dev/spec\n"),
        },
        {
          canonicalPath: "/team/dev/spec/child",
          relativeFilePath: "child.md",
          pageId: "page:/team/dev/spec/child",
          baseRevisionId: "revision:/team/dev/spec/child:001",
          contentHash: hashBodyForTest("# /team/dev/spec/child\n"),
        },
      ],
    });
    expect(deps.openLocalFile).toHaveBeenCalledWith(
      `${createMirrorRootPath("/team/dev/spec")}/${rootRelativeFilePath}`,
    );
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "現在ページ配下をローカルに同期しました。",
    );
  });

  it("exports directory pages to reserved filenames inside their directories", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.listPages.mockResolvedValue({
      ok: true,
      paths: ["/team/dev/spec/guide", "/team/dev/spec/guide/advanced"],
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

    const manifest = await createLocalMirrorForCurrentPrefixCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(manifest?.pages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalPath: "/team/dev/spec",
          relativeFilePath: "__spec__.md",
        }),
        expect.objectContaining({
          canonicalPath: "/team/dev/spec/guide",
          relativeFilePath: "guide/__guide__.md",
        }),
        expect.objectContaining({
          canonicalPath: "/team/dev/spec/guide/advanced",
          relativeFilePath: "guide/advanced.md",
        }),
      ]),
    );
  });

  it("reuses the nearest ancestor prefix mirror for current prefix export", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath === `${createMirrorRootPath("/sample")}/.growi-mirror.json`
      ) {
        return createBundleManifest(
          [
            { canonicalPath: "/sample", body: "# sample\n" },
            { canonicalPath: "/sample/test", body: "# old test\n" },
            { canonicalPath: "/sample/test/hello", body: "# old hello\n" },
          ],
          { rootCanonicalPath: "/sample" },
        );
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.listPages.mockResolvedValue({
      ok: true,
      paths: ["/sample/test/hello"],
    });
    deps.bootstrapEditSession.mockImplementation(async (canonicalPath) => ({
      ok: true,
      value: {
        pageId: `page:${canonicalPath}`,
        baseRevisionId: `revision:${canonicalPath}:002`,
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody:
          canonicalPath === "/sample/test"
            ? "# refreshed test\n"
            : "# refreshed hello\n",
      },
    }));

    await createLocalMirrorForCurrentPrefixCommand(deps)(
      createUri("growi", "/sample/test.md"),
    );

    expect(deps.writeLocalFile).toHaveBeenCalledWith(
      `${createMirrorRootPath("/sample")}/test/__test__.md`,
      "# refreshed test\n",
    );
    expect(deps.writeLocalFile).toHaveBeenCalledWith(
      `${createMirrorRootPath("/sample")}/test/hello.md`,
      "# refreshed hello\n",
    );
    expect(deps.writeLocalFile).not.toHaveBeenCalledWith(
      `${createMirrorRootPath("/sample/test")}/.growi-mirror.json`,
      expect.any(String),
    );
    const manifestWrite = deps.writeLocalFile.mock.calls.find(
      ([filePath]) =>
        filePath === `${createMirrorRootPath("/sample")}/.growi-mirror.json`,
    );
    expect(manifestWrite).toBeDefined();
    expect(JSON.parse(manifestWrite?.[1] as string)).toMatchObject({
      rootCanonicalPath: "/sample",
      mode: "prefix",
      pages: expect.arrayContaining([
        expect.objectContaining({
          canonicalPath: "/sample/test",
          relativeFilePath: "test/__test__.md",
          baseRevisionId: "revision:/sample/test:002",
        }),
        expect.objectContaining({
          canonicalPath: "/sample/test/hello",
          relativeFilePath: "test/hello.md",
          baseRevisionId: "revision:/sample/test/hello:002",
        }),
      ]),
    });
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "既存 prefix mirror 内の現在ページ配下をローカルに同期しました。",
    );
  });

  it("rejects ancestor prefix reuse when a tracked subtree file is dirty", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath === `${createMirrorRootPath("/sample")}/.growi-mirror.json`
      ) {
        return createBundleManifest(
          [
            { canonicalPath: "/sample", body: "# sample\n" },
            { canonicalPath: "/sample/test", body: "# old test\n" },
            { canonicalPath: "/sample/test/hello", body: "# old hello\n" },
          ],
          { rootCanonicalPath: "/sample" },
        );
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.listPages.mockResolvedValue({
      ok: true,
      paths: ["/sample/test/hello"],
    });
    deps.findOpenTextDocument.mockImplementation((filePath: string) =>
      filePath.endsWith("/test/hello.md") ? { isDirty: true } : undefined,
    );

    await createLocalMirrorForCurrentPrefixCommand(deps)(
      createUri("growi", "/sample/test.md"),
    );

    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "既存 prefix mirror に未保存の変更があるため Sync Local Mirror for Current Prefix を実行できません。先に保存してください。",
    );
  });

  it("exports Japanese page names without replacing them with underscores", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.listPages.mockResolvedValue({
      ok: true,
      paths: ["/sample/test/無題のページ-1"],
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

    const manifest = await createLocalMirrorForCurrentPrefixCommand(deps)(
      createUri("growi", "/sample.md"),
    );

    expect(deps.writeLocalFile).toHaveBeenCalledWith(
      `${createMirrorRootPath("/sample")}/test/無題のページ-1.md`,
      "# /sample/test/無題のページ-1\n",
    );
    expect(manifest?.pages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalPath: "/sample/test/無題のページ-1",
          relativeFilePath: "test/無題のページ-1.md",
        }),
      ]),
    );
  });

  it("skips pages that collide with reserved directory filenames", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.listPages.mockResolvedValue({
      ok: true,
      paths: ["/sample/test", "/sample/test/__test__"],
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

    const manifest = await createLocalMirrorForCurrentPrefixCommand(deps)(
      createUri("growi", "/sample.md"),
    );

    expect(deps.writeLocalFile).toHaveBeenCalledWith(
      `${createMirrorRootPath("/sample")}/test/__test__.md`,
      "# /sample/test\n",
    );
    expect(deps.bootstrapEditSession).not.toHaveBeenCalledWith(
      "/sample/test/__test__",
    );
    expect(manifest?.skippedPages).toEqual([
      {
        canonicalPath: "/sample/test/__test__",
        relativeFilePath: "test/__test__.md",
        reason: "ReservedFileNameCollision",
      },
    ]);
    expect(deps.showWarningMessage).toHaveBeenCalledWith(
      [
        "現在ページ配下をローカルに同期しました。",
        "Local Mirror では一部ページを保存しませんでした。",
        "ReservedFileNameCollision: /sample/test/__test__ -> test/__test__.md",
      ].join("\n"),
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

    await createLocalMirrorForCurrentPrefixCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.writeLocalFile).not.toHaveBeenCalled();
    expect(deps.listPages).toHaveBeenCalledWith("/team/dev/spec", {
      limit: 50,
    });
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "active page 配下が 50 pages を超えるため Sync Local Mirror for Current Prefix を実行できません。",
    );
  });

  it("uses the configured prefix mirror page limit before export", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.getLocalMirrorMaxPrefixPages.mockReturnValue(3);
    deps.listPages.mockResolvedValue({
      ok: true,
      paths: ["/team/dev/spec/a", "/team/dev/spec/b", "/team/dev/spec/c"],
    });

    await createLocalMirrorForCurrentPrefixCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.listPages).toHaveBeenCalledWith("/team/dev/spec", {
      limit: 3,
    });
    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.writeLocalFile).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "active page 配下が 3 pages を超えるため Sync Local Mirror for Current Prefix を実行できません。",
    );
  });

  it("rejects prefix mirror export when listing reports more pages are available", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.listPages.mockResolvedValue({
      ok: true,
      paths: ["/team/dev/spec/a"],
      hasMore: true,
    });

    await createLocalMirrorForCurrentPrefixCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.bootstrapEditSession).not.toHaveBeenCalled();
    expect(deps.writeLocalFile).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "active page 配下が 50 pages を超えるため Sync Local Mirror for Current Prefix を実行できません。",
    );
  });

  it("compares the local bundle against GROWI and returns page-level statuses", async () => {
    const deps = createDeps();
    const rootRelativeFilePath = createMirrorRelativePath(
      "/team/dev/spec",
      "/team/dev/spec",
      [
        "/team/dev/spec",
        "/team/dev/spec/local-only",
        "/team/dev/spec/conflict",
        "/team/dev/spec/remote-only",
        "/team/dev/spec/missing",
      ],
    );
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/.growi-mirror.json`
      ) {
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
      if (filePath.endsWith(rootRelativeFilePath)) {
        return "# remote same\n";
      }
      if (filePath.endsWith("local-only.md")) {
        return "# local changed\n";
      }
      if (filePath.endsWith("conflict.md")) {
        return "# local conflict\n";
      }
      if (filePath.endsWith("remote-only.md")) {
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

    const results = await createCompareLocalMirrorSubtreeWithGrowiCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(results).toEqual([
      { canonicalPath: "/team/dev/spec", status: "Unchanged" },
      { canonicalPath: "/team/dev/spec/local-only", status: "LocalChanged" },
      { canonicalPath: "/team/dev/spec/conflict", status: "Conflict" },
      { canonicalPath: "/team/dev/spec/remote-only", status: "RemoteChanged" },
      { canonicalPath: "/team/dev/spec/missing", status: "MissingLocal" },
    ]);
    expect(deps.openChanges).toHaveBeenCalledWith(
      "GROWI Mirror Diff: /team/dev/spec",
      [
        [
          {
            scheme: "file",
            path: `${createMirrorRootPath("/team/dev/spec")}/local-only.md`,
            fsPath: `${createMirrorRootPath("/team/dev/spec")}/local-only.md`,
          },
          { scheme: "growi", path: "/team/dev/spec/local-only.md" },
          {
            scheme: "file",
            path: `${createMirrorRootPath("/team/dev/spec")}/local-only.md`,
            fsPath: `${createMirrorRootPath("/team/dev/spec")}/local-only.md`,
          },
        ],
        [
          {
            scheme: "file",
            path: `${createMirrorRootPath("/team/dev/spec")}/conflict.md`,
            fsPath: `${createMirrorRootPath("/team/dev/spec")}/conflict.md`,
          },
          { scheme: "growi", path: "/team/dev/spec/conflict.md" },
          {
            scheme: "file",
            path: `${createMirrorRootPath("/team/dev/spec")}/conflict.md`,
            fsPath: `${createMirrorRootPath("/team/dev/spec")}/conflict.md`,
          },
        ],
        [
          {
            scheme: "file",
            path: `${createMirrorRootPath("/team/dev/spec")}/remote-only.md`,
            fsPath: `${createMirrorRootPath("/team/dev/spec")}/remote-only.md`,
          },
          { scheme: "growi", path: "/team/dev/spec/remote-only.md" },
          {
            scheme: "file",
            path: `${createMirrorRootPath("/team/dev/spec")}/remote-only.md`,
            fsPath: `${createMirrorRootPath("/team/dev/spec")}/remote-only.md`,
          },
        ],
      ],
    );
    expect(deps.openDiff).not.toHaveBeenCalled();
    expect(deps.showWarningMessage).toHaveBeenCalledWith(
      [
        "Compare Local Mirror with GROWI では一部ページを changes editor に含めませんでした。",
        "MissingLocal: /team/dev/spec/missing",
      ].join("\n"),
    );
    expect(deps.setMirrorCompareSourceControlState).toHaveBeenCalledWith({
      currentCanonicalPath: "/team/dev/spec",
      targetScope: "subtree",
      resources: [
        {
          canonicalPath: "/team/dev/spec/local-only",
          status: "LocalChanged",
          localFileUri: {
            scheme: "file",
            path: `${createMirrorRootPath("/team/dev/spec")}/local-only.md`,
            fsPath: `${createMirrorRootPath("/team/dev/spec")}/local-only.md`,
          },
          remoteUri: {
            scheme: "growi",
            path: "/team/dev/spec/local-only.md",
          },
        },
        {
          canonicalPath: "/team/dev/spec/conflict",
          status: "Conflict",
          localFileUri: {
            scheme: "file",
            path: `${createMirrorRootPath("/team/dev/spec")}/conflict.md`,
            fsPath: `${createMirrorRootPath("/team/dev/spec")}/conflict.md`,
          },
          remoteUri: {
            scheme: "growi",
            path: "/team/dev/spec/conflict.md",
          },
        },
        {
          canonicalPath: "/team/dev/spec/remote-only",
          status: "RemoteChanged",
          localFileUri: {
            scheme: "file",
            path: `${createMirrorRootPath("/team/dev/spec")}/remote-only.md`,
            fsPath: `${createMirrorRootPath("/team/dev/spec")}/remote-only.md`,
          },
          remoteUri: {
            scheme: "growi",
            path: "/team/dev/spec/remote-only.md",
          },
        },
      ],
    });
    expect(deps.setMirrorCompareTreeSnapshotState).toHaveBeenCalledWith({
      currentCanonicalPath: "/team/dev/spec",
      targetScope: "subtree",
      resources: [
        {
          canonicalPath: "/team/dev/spec/local-only",
          status: "LocalChanged",
          localFileUri: {
            scheme: "file",
            path: `${createMirrorRootPath("/team/dev/spec")}/local-only.md`,
            fsPath: `${createMirrorRootPath("/team/dev/spec")}/local-only.md`,
          },
          remoteUri: {
            scheme: "growi",
            path: "/team/dev/spec/local-only.md",
          },
        },
        {
          canonicalPath: "/team/dev/spec/conflict",
          status: "Conflict",
          localFileUri: {
            scheme: "file",
            path: `${createMirrorRootPath("/team/dev/spec")}/conflict.md`,
            fsPath: `${createMirrorRootPath("/team/dev/spec")}/conflict.md`,
          },
          remoteUri: {
            scheme: "growi",
            path: "/team/dev/spec/conflict.md",
          },
        },
        {
          canonicalPath: "/team/dev/spec/remote-only",
          status: "RemoteChanged",
          localFileUri: {
            scheme: "file",
            path: `${createMirrorRootPath("/team/dev/spec")}/remote-only.md`,
            fsPath: `${createMirrorRootPath("/team/dev/spec")}/remote-only.md`,
          },
          remoteUri: {
            scheme: "growi",
            path: "/team/dev/spec/remote-only.md",
          },
        },
      ],
    });
    expect(deps.clearMirrorCompareSourceControlState).not.toHaveBeenCalled();
    expect(deps.clearMirrorCompareTreeSnapshotState).not.toHaveBeenCalled();
    expect(deps.showInformationMessage).not.toHaveBeenCalled();
  });

  it("does not open changes editor when the bundle has no diff targets", async () => {
    const deps = createDeps();
    const rootRelativeFilePath = createMirrorRelativePath(
      "/team/dev/spec",
      "/team/dev/spec",
    );
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
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
      if (
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/.growi-mirror.json`
      ) {
        return createBundleManifest([
          {
            canonicalPath: "/team/dev/spec",
            body: "# remote same\n",
            baseRevisionId: "revision:/team/dev/spec:001",
          },
        ]);
      }
      if (filePath.endsWith(rootRelativeFilePath)) {
        return "# remote same\n";
      }
      throw new Error(`unexpected file: ${filePath}`);
    });

    const results = await createCompareLocalMirrorSubtreeWithGrowiCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(results).toEqual([
      { canonicalPath: "/team/dev/spec", status: "Unchanged" },
    ]);
    expect(deps.openChanges).not.toHaveBeenCalled();
    expect(deps.openDiff).not.toHaveBeenCalled();
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "Compare Local Mirror with GROWI で changes editor の対象はありませんでした。",
    );
    expect(deps.clearMirrorCompareSourceControlState).toHaveBeenCalledTimes(1);
    expect(deps.clearMirrorCompareTreeSnapshotState).toHaveBeenCalledTimes(1);
    expect(deps.setMirrorCompareSourceControlState).not.toHaveBeenCalled();
    expect(deps.setMirrorCompareTreeSnapshotState).not.toHaveBeenCalled();
  });

  it("clears SCM compare state when opening the changes editor fails", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.openChanges.mockRejectedValue(new Error("open failed"));
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/.growi-mirror.json`
      ) {
        return createBundleManifest([
          {
            canonicalPath: "/team/dev/spec",
            body: "# remote old\n",
            baseRevisionId: "revision:/team/dev/spec:001",
          },
        ]);
      }
      if (filePath.endsWith("__spec__.md")) {
        return "# local changed\n";
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.bootstrapEditSession.mockResolvedValue({
      ok: true,
      value: {
        pageId: "page:/team/dev/spec",
        baseRevisionId: "revision:/team/dev/spec:001",
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody: "# remote old\n",
      },
    });

    await expect(
      createCompareLocalMirrorSubtreeWithGrowiCommand(deps)(
        createUri("growi", "/team/dev/spec.md"),
      ),
    ).resolves.toBeUndefined();

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "mirror の差分ビューを開けませんでした。",
    );
    expect(deps.clearMirrorCompareSourceControlState).toHaveBeenCalledTimes(1);
    expect(deps.clearMirrorCompareTreeSnapshotState).toHaveBeenCalledTimes(1);
    expect(deps.setMirrorCompareSourceControlState).not.toHaveBeenCalled();
    expect(deps.setMirrorCompareTreeSnapshotState).not.toHaveBeenCalled();
  });

  it("reuses an ancestor prefix mirror for page compare and limits the scope to the selected page", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath ===
        `${createMirrorRootPath("/sample/hello")}/.growi-mirror.json`
      ) {
        throw new Error("missing exact manifest");
      }
      if (
        filePath === `${createMirrorRootPath("/sample")}/.growi-mirror.json`
      ) {
        return createBundleManifest(
          [
            { canonicalPath: "/sample", body: "# sample\n" },
            { canonicalPath: "/sample/hello", body: "# old hello\n" },
            { canonicalPath: "/sample/test", body: "# test\n" },
          ],
          { rootCanonicalPath: "/sample" },
        );
      }
      if (filePath === `${createMirrorRootPath("/sample")}/hello.md`) {
        return "# local hello\n";
      }
      if (filePath === `${createMirrorRootPath("/sample")}/test.md`) {
        return "# test\n";
      }
      if (filePath === `${createMirrorRootPath("/sample")}/__sample__.md`) {
        return "# sample\n";
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.bootstrapEditSession.mockImplementation(async (canonicalPath) => ({
      ok: true,
      value: {
        pageId: `page:${canonicalPath}`,
        baseRevisionId:
          canonicalPath === "/sample/hello"
            ? "revision:/sample/hello:001"
            : `revision:${canonicalPath}:001`,
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody:
          canonicalPath === "/sample/hello"
            ? "# remote hello\n"
            : "# unchanged\n",
      },
    }));

    await createCompareLocalMirrorWithGrowiCommand(deps)(
      createUri("growi", "/sample/hello.md"),
    );

    expect(deps.bootstrapEditSession).toHaveBeenCalledTimes(1);
    expect(deps.bootstrapEditSession).toHaveBeenCalledWith("/sample/hello");
    expect(deps.openChanges).toHaveBeenCalledWith(
      "GROWI Mirror Diff: /sample/hello",
      [
        [
          {
            scheme: "file",
            path: `${createMirrorRootPath("/sample")}/hello.md`,
            fsPath: `${createMirrorRootPath("/sample")}/hello.md`,
          },
          { scheme: "growi", path: "/sample/hello.md" },
          {
            scheme: "file",
            path: `${createMirrorRootPath("/sample")}/hello.md`,
            fsPath: `${createMirrorRootPath("/sample")}/hello.md`,
          },
        ],
      ],
    );
  });

  it("reuses an ancestor prefix mirror for subtree compare and limits the scope to the selected subtree", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath ===
        `${createMirrorRootPath("/sample/test")}/.growi-mirror.json`
      ) {
        throw new Error("missing exact manifest");
      }
      if (
        filePath === `${createMirrorRootPath("/sample")}/.growi-mirror.json`
      ) {
        return createBundleManifest(
          [
            { canonicalPath: "/sample", body: "# sample\n" },
            { canonicalPath: "/sample/hello", body: "# hello\n" },
            { canonicalPath: "/sample/test", body: "# test\n" },
            { canonicalPath: "/sample/test/child", body: "# old child\n" },
          ],
          { rootCanonicalPath: "/sample" },
        );
      }
      if (filePath === `${createMirrorRootPath("/sample")}/test/__test__.md`) {
        return "# test\n";
      }
      if (filePath === `${createMirrorRootPath("/sample")}/test/child.md`) {
        return "# local child\n";
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.bootstrapEditSession.mockImplementation(async (canonicalPath) => ({
      ok: true,
      value: {
        pageId: `page:${canonicalPath}`,
        baseRevisionId:
          canonicalPath === "/sample/test/child"
            ? "revision:/sample/test/child:001"
            : `revision:${canonicalPath}:001`,
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody:
          canonicalPath === "/sample/test/child"
            ? "# remote child\n"
            : "# same\n",
      },
    }));

    const results = await createCompareLocalMirrorSubtreeWithGrowiCommand(deps)(
      {
        uri: createUri("growi", "/sample/test.md"),
        scope: "subtree",
      },
    );

    expect(results).toEqual([
      { canonicalPath: "/sample/test", status: "Unchanged" },
      { canonicalPath: "/sample/test/child", status: "LocalChanged" },
    ]);
    expect(deps.bootstrapEditSession).toHaveBeenCalledTimes(2);
    expect(deps.bootstrapEditSession).not.toHaveBeenCalledWith("/sample/hello");
    expect(deps.openChanges).toHaveBeenCalledWith(
      "GROWI Mirror Diff: /sample/test/*",
      expect.any(Array),
    );
  });

  it("prefers the exact manifest over an ancestor prefix mirror for compare", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath ===
        `${createMirrorRootPath("/sample/hello")}/.growi-mirror.json`
      ) {
        return createBundleManifest(
          [{ canonicalPath: "/sample/hello", body: "# old hello\n" }],
          { rootCanonicalPath: "/sample/hello" },
        );
      }
      if (
        filePath === `${createMirrorRootPath("/sample/hello")}/__hello__.md`
      ) {
        return "# local hello\n";
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.bootstrapEditSession.mockResolvedValue({
      ok: true,
      value: {
        pageId: "page:/sample/hello",
        baseRevisionId: "revision:/sample/hello:001",
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody: "# remote hello\n",
      },
    });

    await createCompareLocalMirrorWithGrowiCommand(deps)(
      createUri("growi", "/sample/hello.md"),
    );

    expect(deps.readLocalFile).not.toHaveBeenCalledWith(
      `${createMirrorRootPath("/sample")}/.growi-mirror.json`,
    );
    expect(deps.openChanges).toHaveBeenCalledWith(
      "GROWI Mirror Diff: /sample/hello",
      expect.any(Array),
    );
  });

  it("does not read legacy mirror roots when the new root is missing", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (filePath.startsWith("/workspace/.growi-mirrors/")) {
        throw new Error("missing new manifest");
      }
      if (filePath.startsWith("/workspace/.growi-workspaces/")) {
        throw new Error("legacy mirror root must not be read");
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.bootstrapEditSession.mockResolvedValue({
      ok: true,
      value: {
        pageId: "page:/sample/hello",
        baseRevisionId: "revision:/sample/hello:001",
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody: "# remote hello\n",
      },
    });

    const results = await createCompareLocalMirrorWithGrowiCommand(deps)(
      createUri("growi", "/sample/hello.md"),
    );

    expect(results).toBeUndefined();
    expect(deps.openChanges).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "対象の local mirror が見つからないため Compare Local Mirror with GROWI を実行できませんでした。先に Sync Local Mirror を実行してください。",
    );
  });

  it("shows a dedicated error when the ancestor prefix mirror only tracks the page as skipped", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath ===
        `${createMirrorRootPath("/sample/hello")}/.growi-mirror.json`
      ) {
        throw new Error("missing exact manifest");
      }
      if (
        filePath === `${createMirrorRootPath("/sample")}/.growi-mirror.json`
      ) {
        return `${JSON.stringify(
          {
            version: 1,
            baseUrl: "https://growi.example.com/",
            rootCanonicalPath: "/sample",
            mode: "prefix",
            exportedAt: "2026-03-09T00:00:00.000Z",
            pages: [
              {
                canonicalPath: "/sample",
                relativeFilePath: "__sample__.md",
                pageId: "page:/sample",
                baseRevisionId: "revision:/sample:001",
                exportedAt: "2026-03-09T00:00:00.000Z",
                contentHash: hashBodyForTest("# sample\n"),
              },
            ],
            skippedPages: [
              {
                canonicalPath: "/sample/hello",
                relativeFilePath: "hello.md",
                reason: "ReservedFileNameCollision",
              },
            ],
          },
          null,
          2,
        )}\n`;
      }
      throw new Error(`unexpected file: ${filePath}`);
    });

    const results = await createCompareLocalMirrorWithGrowiCommand(deps)(
      createUri("growi", "/sample/hello.md"),
    );

    expect(results).toBeUndefined();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "既存 prefix mirror で対象ページまたは配下が衝突により skip されているため Compare Local Mirror with GROWI を実行できません。prefix mirror を見直してください。",
    );
  });

  it("uploads only changed bundle pages and skips unchanged, conflict, and missing remote pages", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.getActiveEditorUri.mockReturnValue(
      createUri("growi", "/team/dev/spec.md"),
    );
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/.growi-mirror.json`
      ) {
        return createBundleManifest(
          [
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
          ],
          {
            rootCanonicalPath: "/team/dev/spec",
          },
        );
      }
      if (filePath.endsWith("unchanged.md")) {
        return "# remote same\n";
      }
      if (filePath.endsWith("changed.md")) {
        return "# local changed\n";
      }
      if (filePath.endsWith("conflict.md")) {
        return "# local conflict\n";
      }
      if (filePath.endsWith("missing.md")) {
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

    const results = await createUploadLocalMirrorSubtreeToGrowiCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

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
      ([filePath]) =>
        filePath ===
        `${createMirrorRootPath("/team/dev/spec")}/.growi-mirror.json`,
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
        "Upload Local Mirror to GROWI を完了しました。",
        "Uploaded: /team/dev/spec/changed",
        "Unchanged: /team/dev/spec/unchanged",
        "Conflict: /team/dev/spec/conflict",
        "MissingRemote: /team/dev/spec/missing",
      ].join("\n"),
    );
  });

  it("reuses an ancestor prefix mirror for page upload and updates only the selected page entry", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath ===
        `${createMirrorRootPath("/sample/hello")}/.growi-mirror.json`
      ) {
        throw new Error("missing exact manifest");
      }
      if (
        filePath === `${createMirrorRootPath("/sample")}/.growi-mirror.json`
      ) {
        return createBundleManifest(
          [
            {
              canonicalPath: "/sample/hello",
              body: "# old hello\n",
              baseRevisionId: "revision:/sample/hello:001",
            },
            {
              canonicalPath: "/sample/test",
              body: "# old test\n",
              baseRevisionId: "revision:/sample/test:001",
            },
          ],
          { rootCanonicalPath: "/sample" },
        );
      }
      if (filePath === `${createMirrorRootPath("/sample")}/hello.md`) {
        return "# local hello\n";
      }
      if (filePath === `${createMirrorRootPath("/sample")}/test.md`) {
        return "# old test\n";
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.bootstrapEditSession.mockImplementation(async (canonicalPath) => {
      if (canonicalPath === "/sample/hello") {
        const callCount = deps.bootstrapEditSession.mock.calls.filter(
          ([path]) => path === canonicalPath,
        ).length;
        return {
          ok: true,
          value: {
            pageId: "page:/sample/hello",
            baseRevisionId:
              callCount === 1
                ? "revision:/sample/hello:001"
                : "revision:/sample/hello:002",
            baseUpdatedAt: "2026-03-08T00:00:00.000Z",
            baseBody: callCount === 1 ? "# old hello\n" : "# local hello\n",
          },
        };
      }
      return {
        ok: true,
        value: {
          pageId: `page:${canonicalPath}`,
          baseRevisionId: `revision:${canonicalPath}:001`,
          baseUpdatedAt: "2026-03-08T00:00:00.000Z",
          baseBody: "# old\n",
        },
      };
    });

    await createUploadLocalMirrorToGrowiCommand(deps)(
      createUri("growi", "/sample/hello.md"),
    );

    expect(deps.writePage).toHaveBeenCalledTimes(1);
    expect(deps.writePage).toHaveBeenCalledWith(
      "/sample/hello",
      "# local hello\n",
      expect.objectContaining({
        baseRevisionId: "revision:/sample/hello:001",
      }),
    );
    const manifestWrite = deps.writeLocalFile.mock.calls.find(
      ([filePath]) =>
        filePath === `${createMirrorRootPath("/sample")}/.growi-mirror.json`,
    );
    expect(manifestWrite).toBeDefined();
    expect(JSON.parse(manifestWrite?.[1] as string)).toMatchObject({
      pages: expect.arrayContaining([
        expect.objectContaining({
          canonicalPath: "/sample/hello",
          baseRevisionId: "revision:/sample/hello:002",
          contentHash: hashBodyForTest("# local hello\n"),
        }),
        expect.objectContaining({
          canonicalPath: "/sample/test",
          baseRevisionId: "revision:/sample/test:001",
          contentHash: hashBodyForTest("# old test\n"),
        }),
      ]),
    });
  });

  it("uploads selected local-change resources from SCM page by page", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath ===
        `${createMirrorRootPath("/sample/hello")}/.growi-mirror.json`
      ) {
        return createBundleManifest([
          {
            canonicalPath: "/sample/hello",
            body: "# old hello\n",
            baseRevisionId: "revision:/sample/hello:001",
          },
        ]);
      }
      if (
        filePath === `${createMirrorRootPath("/sample/hello")}/__hello__.md`
      ) {
        return "# local hello\n";
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.bootstrapEditSession.mockImplementation(async (canonicalPath) => {
      const callCount = deps.bootstrapEditSession.mock.calls.filter(
        ([path]) => path === canonicalPath,
      ).length;
      return {
        ok: true,
        value: {
          pageId: "page:/sample/hello",
          baseRevisionId:
            callCount === 1
              ? "revision:/sample/hello:001"
              : "revision:/sample/hello:002",
          baseUpdatedAt: "2026-03-08T00:00:00.000Z",
          baseBody: callCount === 1 ? "# old hello\n" : "# local hello\n",
        },
      };
    });

    const results = await createScmUploadMirrorResourcesCommand(deps)([
      {
        canonicalPath: "/sample/hello",
        status: "LocalChanged",
        localFileUri: {
          scheme: "file",
          path: `${createMirrorRootPath("/sample/hello")}/__hello__.md`,
          fsPath: `${createMirrorRootPath("/sample/hello")}/__hello__.md`,
        },
        remoteUri: {
          scheme: "growi",
          path: "/sample/hello.md",
        },
      },
    ]);

    expect(results).toEqual([
      { canonicalPath: "/sample/hello", status: "Uploaded" },
    ]);
    expect(deps.writePage).toHaveBeenCalledWith(
      "/sample/hello",
      "# local hello\n",
      expect.objectContaining({
        baseRevisionId: "revision:/sample/hello:001",
      }),
    );
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      [
        "Upload Local Mirror to GROWI を完了しました。",
        "Uploaded: /sample/hello",
      ].join("\n"),
    );
  });

  it("takes selected remote-change resources into the local mirror", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath ===
        `${createMirrorRootPath("/sample/hello")}/.growi-mirror.json`
      ) {
        return createBundleManifest([
          {
            canonicalPath: "/sample/hello",
            body: "# old hello\n",
            baseRevisionId: "revision:/sample/hello:001",
          },
        ]);
      }
      if (
        filePath === `${createMirrorRootPath("/sample/hello")}/__hello__.md`
      ) {
        return "# old hello\n";
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.bootstrapEditSession.mockResolvedValue({
      ok: true,
      value: {
        pageId: "page:/sample/hello",
        baseRevisionId: "revision:/sample/hello:002",
        baseUpdatedAt: "2026-03-09T00:00:00.000Z",
        baseBody: "# remote newer\n",
      },
    });

    const results = await createScmTakeRemoteMirrorResourcesCommand(deps)([
      {
        canonicalPath: "/sample/hello",
        status: "RemoteChanged",
        localFileUri: {
          scheme: "file",
          path: `${createMirrorRootPath("/sample/hello")}/__hello__.md`,
          fsPath: `${createMirrorRootPath("/sample/hello")}/__hello__.md`,
        },
        remoteUri: {
          scheme: "growi",
          path: "/sample/hello.md",
        },
      },
    ]);

    expect(results).toEqual([
      { canonicalPath: "/sample/hello", status: "TakenRemote" },
    ]);
    expect(deps.writeLocalFile).toHaveBeenCalledWith(
      `${createMirrorRootPath("/sample/hello")}/__hello__.md`,
      "# remote newer\n",
    );
    expect(deps.writeLocalFile).toHaveBeenCalledWith(
      `${createMirrorRootPath("/sample/hello")}/.growi-mirror.json`,
      expect.any(String),
    );
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      [
        "GROWI側の変更をローカルに取り込みました。",
        "TakenRemote: /sample/hello",
      ].join("\n"),
    );
  });

  it("re-runs the last compare target from SCM Compare Again", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.getMirrorCompareSourceControlState.mockReturnValue({
      currentCanonicalPath: "/sample",
      targetScope: "subtree",
      resources: [],
    });
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (
        filePath === `${createMirrorRootPath("/sample")}/.growi-mirror.json`
      ) {
        return createBundleManifest(
          [
            {
              canonicalPath: "/sample",
              body: "# sample\n",
              baseRevisionId: "revision:/sample:001",
            },
            {
              canonicalPath: "/sample/child",
              body: "# old child\n",
              baseRevisionId: "revision:/sample/child:001",
            },
          ],
          { rootCanonicalPath: "/sample" },
        );
      }
      if (filePath === `${createMirrorRootPath("/sample")}/__sample__.md`) {
        return "# sample\n";
      }
      if (filePath === `${createMirrorRootPath("/sample")}/child.md`) {
        return "# local child\n";
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.bootstrapEditSession.mockImplementation(async (canonicalPath) => ({
      ok: true,
      value: {
        pageId: `page:${canonicalPath}`,
        baseRevisionId:
          canonicalPath === "/sample/child"
            ? "revision:/sample/child:001"
            : `revision:${canonicalPath}:001`,
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody:
          canonicalPath === "/sample/child" ? "# remote child\n" : "# sample\n",
      },
    }));

    const results = await createScmCompareMirrorAgainCommand(deps)();

    expect(results).toEqual([
      { canonicalPath: "/sample", status: "Unchanged" },
      { canonicalPath: "/sample/child", status: "LocalChanged" },
    ]);
    expect(deps.openChanges).toHaveBeenCalledWith(
      "GROWI Mirror Diff: /sample",
      expect.any(Array),
    );
    expect(deps.setMirrorCompareSourceControlState).toHaveBeenCalledWith({
      currentCanonicalPath: "/sample",
      targetScope: "subtree",
      resources: [
        {
          canonicalPath: "/sample/child",
          status: "LocalChanged",
          localFileUri: {
            scheme: "file",
            path: `${createMirrorRootPath("/sample")}/child.md`,
            fsPath: `${createMirrorRootPath("/sample")}/child.md`,
          },
          remoteUri: {
            scheme: "growi",
            path: "/sample/child.md",
          },
        },
      ],
    });
    expect(deps.setMirrorCompareTreeSnapshotState).toHaveBeenCalledWith({
      currentCanonicalPath: "/sample",
      targetScope: "subtree",
      resources: [
        {
          canonicalPath: "/sample/child",
          status: "LocalChanged",
          localFileUri: {
            scheme: "file",
            path: `${createMirrorRootPath("/sample")}/child.md`,
            fsPath: `${createMirrorRootPath("/sample")}/child.md`,
          },
          remoteUri: {
            scheme: "growi",
            path: "/sample/child.md",
          },
        },
      ],
    });
  });

  it("skips non-local SCM selections when uploading", async () => {
    const deps = createDeps();

    const results = await createScmUploadMirrorResourcesCommand(deps)([
      {
        canonicalPath: "/sample/conflict",
        status: "Conflict",
        localFileUri: {
          scheme: "file",
          path: "/workspace/.growi-mirrors/growi.example.com/sample/conflict.md",
          fsPath:
            "/workspace/.growi-mirrors/growi.example.com/sample/conflict.md",
        },
        remoteUri: {
          scheme: "growi",
          path: "/sample/conflict.md",
        },
      },
    ]);

    expect(results).toEqual([]);
    expect(deps.writePage).not.toHaveBeenCalled();
    expect(deps.showWarningMessage).toHaveBeenCalledWith(
      [
        "ローカルの変更では一部選択項目を対象外として skip しました。",
        "Conflict: /sample/conflict",
      ].join("\n"),
    );
  });

  it("does not read legacy mirror roots when uploading without a new root", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/");
    deps.readLocalFile.mockImplementation(async (filePath: string) => {
      if (filePath.startsWith("/workspace/.growi-mirrors/")) {
        throw new Error("missing new manifest");
      }
      if (filePath.startsWith("/workspace/.growi-workspaces/")) {
        throw new Error("legacy mirror root must not be read");
      }
      throw new Error(`unexpected file: ${filePath}`);
    });
    deps.bootstrapEditSession.mockImplementation(async () => ({
      ok: true,
      value: {
        pageId: "page:/sample/hello",
        baseRevisionId:
          deps.bootstrapEditSession.mock.calls.length === 1
            ? "revision:/sample/hello:001"
            : "revision:/sample/hello:002",
        baseUpdatedAt: "2026-03-08T00:00:00.000Z",
        baseBody:
          deps.bootstrapEditSession.mock.calls.length === 1
            ? "# old hello\n"
            : "# local hello\n",
      },
    }));

    const results = await createUploadLocalMirrorToGrowiCommand(deps)(
      createUri("growi", "/sample/hello.md"),
    );

    expect(results).toBeUndefined();
    expect(deps.writeLocalFile).not.toHaveBeenCalled();
    expect(deps.deleteLocalPath).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "対象の local mirror が見つからないため Upload Local Mirror to GROWI を実行できませんでした。先に Sync Local Mirror を実行してください。",
    );
  });
});
