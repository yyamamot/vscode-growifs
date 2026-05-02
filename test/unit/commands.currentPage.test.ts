import { describe, expect, it, vi } from "vitest";

import {
  createOpenCurrentPageHubCommand,
  createShowCurrentPageActionsCommand,
  createShowCurrentPageAttachmentsCommand,
  createShowCurrentPageInfoCommand,
  createShowRevisionHistoryDiffCommand,
  GROWI_COMMANDS,
  loadCurrentPageDetailSummary,
} from "../../src/vscode/commands";
import { createDeps, createUri } from "./commandsTestUtils";

describe("createShowCurrentPageActionsCommand", () => {
  it("includes bookmark add or remove depending on the current page state", async () => {
    const executeCommand = vi.fn(async () => {});
    const showQuickPick = vi.fn(async () => ({
      label: "ブックマークに追加",
      command: GROWI_COMMANDS.addCurrentPageBookmark,
    }));

    await createShowCurrentPageActionsCommand({
      getActiveEditorUri() {
        return createUri("growi", "/team/dev/spec.md");
      },
      isBookmarked(canonicalPath: string) {
        return canonicalPath === "/team/dev/guide";
      },
      executeCommand,
      showErrorMessage: vi.fn(),
      showQuickPick,
    })();

    expect(showQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          label: "ブックマークに追加",
          command: GROWI_COMMANDS.addCurrentPageBookmark,
        }),
      ]),
      { placeHolder: "現在ページに対して実行する操作を選択してください。" },
    );
    expect(executeCommand).toHaveBeenCalledWith(
      GROWI_COMMANDS.addCurrentPageBookmark,
      createUri("growi", "/team/dev/spec.md"),
    );
  });

  it("includes delete, rename and revision history diff in current page actions", async () => {
    const executeCommand = vi.fn(async () => {});
    const showQuickPick = vi.fn(async () => ({
      label: "ページを削除",
      command: GROWI_COMMANDS.deletePage,
    }));

    await createShowCurrentPageActionsCommand({
      getActiveEditorUri() {
        return createUri("growi", "/team/dev/spec.md");
      },
      isBookmarked() {
        return false;
      },
      executeCommand,
      showErrorMessage: vi.fn(),
      showQuickPick,
    })();

    expect(showQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          label: "ページ名を変更",
          command: GROWI_COMMANDS.renamePage,
        }),
        expect.objectContaining({
          label: "ページを削除",
          command: GROWI_COMMANDS.deletePage,
        }),
        expect.objectContaining({
          label: "履歴差分を表示",
          command: GROWI_COMMANDS.showRevisionHistoryDiff,
        }),
        expect.objectContaining({
          label: "添付一覧を表示",
          command: GROWI_COMMANDS.showCurrentPageAttachments,
        }),
        expect.objectContaining({
          label: "ブックマークに追加",
          command: GROWI_COMMANDS.addCurrentPageBookmark,
        }),
      ]),
      { placeHolder: "現在ページに対して実行する操作を選択してください。" },
    );
    expect(executeCommand).toHaveBeenCalledWith(
      GROWI_COMMANDS.deletePage,
      createUri("growi", "/team/dev/spec.md"),
    );
  });
});

describe("createShowCurrentPageAttachmentsCommand", () => {
  it("shows attachment quick pick for the current page and opens the selected browser URL", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/wiki/");
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      url: "https://growi.example.com/wiki/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T09:00:00.000Z",
    });
    deps.listAttachments.mockResolvedValue({
      ok: true,
      attachments: [
        {
          attachmentId: "attachment-002",
          originalName: "report.pdf",
          fileFormat: "application/pdf",
          fileSize: 2048,
          downloadUrl: "https://growi.example.com/wiki/attachment/report",
        },
        {
          attachmentId: "attachment-003",
          originalName: "notes.txt",
          fileFormat: "text/plain",
          fileSize: 64,
          downloadUrl: "/attachment/attachment-003",
        },
        {
          attachmentId: "attachment-001",
          originalName: "image.png",
          fileFormat: "image/png",
          fileSize: 1024,
          downloadUrl: "attachment/image.png",
        },
      ],
    });
    deps.showQuickPick.mockResolvedValueOnce({
      label: "image.png",
      description: "image/png ・ 1024 bytes",
      detail: "https://growi.example.com/wiki/attachment/image.png",
      attachmentId: "attachment-001",
      downloadUrl: "https://growi.example.com/wiki/attachment/image.png",
    } as never);

    const result = await createShowCurrentPageAttachmentsCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.listAttachments).toHaveBeenCalledWith("page-123");
    expect(deps.showQuickPick).toHaveBeenCalledWith(
      [
        {
          label: "image.png",
          description: "image/png ・ 1024 bytes",
          detail: "https://growi.example.com/wiki/attachment/image.png",
          attachmentId: "attachment-001",
          downloadUrl: "https://growi.example.com/wiki/attachment/image.png",
        },
        {
          label: "notes.txt",
          description: "text/plain ・ 64 bytes",
          detail: "https://growi.example.com/attachment/attachment-003",
          attachmentId: "attachment-003",
          downloadUrl: "https://growi.example.com/attachment/attachment-003",
        },
        {
          label: "report.pdf",
          description: "application/pdf ・ 2048 bytes",
          detail: "https://growi.example.com/wiki/attachment/report",
          attachmentId: "attachment-002",
          downloadUrl: "https://growi.example.com/wiki/attachment/report",
        },
      ],
      {
        placeHolder: "添付一覧からブラウザで表示する添付を選択してください。",
      },
    );
    expect(deps.openExternalUri).toHaveBeenCalledWith(
      "https://growi.example.com/wiki/attachment/image.png",
    );
    expect(result).toBe("https://growi.example.com/wiki/attachment/image.png");
    expect(deps.showErrorMessage).not.toHaveBeenCalled();
  });

  it("shows information when there are no attachments", async () => {
    const deps = createDeps();
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      url: "https://growi.example.com/wiki/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T09:00:00.000Z",
    });
    deps.listAttachments.mockResolvedValue({ ok: true, attachments: [] });

    const result = await createShowCurrentPageAttachmentsCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(result).toBeUndefined();
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "現在ページに添付はありません。",
    );
    expect(deps.openExternalUri).not.toHaveBeenCalled();
  });

  it("shows information when no attachment can be opened in a browser", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/wiki/");
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      url: "https://growi.example.com/wiki/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T09:00:00.000Z",
    });
    deps.listAttachments.mockResolvedValue({
      ok: true,
      attachments: [
        {
          attachmentId: "attachment-001",
          originalName: "archive.bin",
          fileFormat: "application/octet-stream",
          fileSize: 4096,
          downloadUrl: "ftp://example.com/archive.bin",
        },
      ],
    });

    const result = await createShowCurrentPageAttachmentsCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(result).toBeUndefined();
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "ブラウザで表示できる添付はありません。",
    );
    expect(deps.openExternalUri).not.toHaveBeenCalled();
  });

  it("shows an error when page info is unavailable", async () => {
    const deps = createDeps();
    deps.listAttachments.mockResolvedValue({
      ok: true,
      attachments: [],
    });

    await createShowCurrentPageAttachmentsCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "現在ページメタ情報を取得できないため添付一覧を表示できません。ページを開き直して再実行してください。",
    );
    expect(deps.openExternalUri).not.toHaveBeenCalled();
  });

  it("maps API failures to fixed messages", async () => {
    const deps = createDeps();
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      url: "https://growi.example.com/wiki/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T09:00:00.000Z",
    });
    deps.listAttachments.mockResolvedValueOnce({
      ok: false,
      reason: "ApiNotSupported",
    });

    await createShowCurrentPageAttachmentsCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );
    expect(deps.showErrorMessage).toHaveBeenLastCalledWith(
      "添付一覧 API が未対応のため添付一覧を表示できません。",
    );

    deps.listAttachments.mockResolvedValueOnce({
      ok: false,
      reason: "ConnectionFailed",
    });
    await createShowCurrentPageAttachmentsCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );
    expect(deps.showErrorMessage).toHaveBeenLastCalledWith(
      "GROWI への接続に失敗したため添付一覧を表示できませんでした。",
    );
  });

  it("shows information when the selection is canceled", async () => {
    const deps = createDeps();
    deps.getBaseUrl.mockReturnValue("https://growi.example.com/wiki/");
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      url: "https://growi.example.com/wiki/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T09:00:00.000Z",
    });
    deps.listAttachments.mockResolvedValue({
      ok: true,
      attachments: [
        {
          attachmentId: "attachment-001",
          originalName: "report.pdf",
          fileFormat: "application/pdf",
          fileSize: 2048,
          downloadUrl: "attachment/report.pdf",
        },
      ],
    });
    deps.showQuickPick.mockResolvedValueOnce(undefined);

    const result = await createShowCurrentPageAttachmentsCommand(deps)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(result).toBeUndefined();
    expect(deps.showInformationMessage).toHaveBeenCalledWith(
      "添付一覧の表示をキャンセルしました。",
    );
    expect(deps.openExternalUri).not.toHaveBeenCalled();
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

describe("createOpenCurrentPageHubCommand", () => {
  it("shows page detail reference actions and delegates the selected command", async () => {
    const deps = createDeps();
    deps.showQuickPick.mockResolvedValueOnce({
      label: "添付一覧を表示",
      command: GROWI_COMMANDS.showCurrentPageAttachments,
    });

    await createOpenCurrentPageHubCommand(deps as never)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.showQuickPick).toHaveBeenCalledWith(
      [
        {
          label: "ページ情報を表示",
          description: "URL、pageId、revision、更新情報",
          command: GROWI_COMMANDS.showCurrentPageInfo,
        },
        {
          label: "被リンクを表示",
          description: "現在ページへの参照元",
          command: GROWI_COMMANDS.showBacklinks,
        },
        {
          label: "添付一覧を表示",
          description: "現在ページに紐づく添付",
          command: GROWI_COMMANDS.showCurrentPageAttachments,
        },
        {
          label: "履歴差分を表示",
          description: "revision を選択して VS Code diff で比較",
          command: GROWI_COMMANDS.showRevisionHistoryDiff,
        },
      ],
      {
        placeHolder: "ページ詳細で確認する項目を選択してください。",
      },
    );
    expect(deps.executeCommand).toHaveBeenCalledWith(
      GROWI_COMMANDS.showCurrentPageAttachments,
      createUri("growi", "/team/dev/spec.md"),
    );
  });

  it("resolves TreeView command targets for page detail", async () => {
    const deps = createDeps();
    deps.showQuickPick.mockResolvedValueOnce({
      label: "被リンクを表示",
      command: GROWI_COMMANDS.showBacklinks,
    });

    await createOpenCurrentPageHubCommand(deps as never)({
      uri: createUri("growi", "/team/dev/spec.md"),
      contextValue: "growi.page",
    });

    expect(deps.executeCommand).toHaveBeenCalledWith(
      GROWI_COMMANDS.showBacklinks,
      createUri("growi", "/team/dev/spec.md"),
    );
  });

  it("opens the page detail webview when the host provides it", async () => {
    const deps = {
      ...createDeps(),
      openPageDetailWebview: vi.fn(async (): Promise<void> => {}),
      loadPageDetailSummary: vi.fn(async () => ({
        pageInfo: {
          pageId: "page-123",
          revisionId: "revision-002",
          url: "https://growi.example.com/team/dev/spec",
          path: "/team/dev/spec",
          lastUpdatedBy: "alice",
          lastUpdatedAt: "2026-03-08T10:00:00.000Z",
        },
      })),
    };

    await createOpenCurrentPageHubCommand(deps as never)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(deps.openPageDetailWebview).toHaveBeenCalledWith({
      canonicalPath: "/team/dev/spec",
      targetUri: createUri("growi", "/team/dev/spec.md"),
      summary: {
        pageInfo: {
          pageId: "page-123",
          revisionId: "revision-002",
          url: "https://growi.example.com/team/dev/spec",
          path: "/team/dev/spec",
          lastUpdatedBy: "alice",
          lastUpdatedAt: "2026-03-08T10:00:00.000Z",
        },
      },
      actions: [
        {
          label: "ページ情報を表示",
          description: "URL、pageId、revision、更新情報",
          command: GROWI_COMMANDS.showCurrentPageInfo,
        },
        {
          label: "被リンクを表示",
          description: "現在ページへの参照元",
          command: GROWI_COMMANDS.showBacklinks,
        },
        {
          label: "添付一覧を表示",
          description: "現在ページに紐づく添付",
          command: GROWI_COMMANDS.showCurrentPageAttachments,
        },
        {
          label: "履歴差分を表示",
          description: "revision を選択して VS Code diff で比較",
          command: GROWI_COMMANDS.showRevisionHistoryDiff,
        },
      ],
    });
    expect(deps.loadPageDetailSummary).toHaveBeenCalledWith("/team/dev/spec");
    expect(deps.showQuickPick).not.toHaveBeenCalled();
  });

  it("does not show local mirror actions in page detail", async () => {
    const deps = createDeps();
    deps.showQuickPick.mockResolvedValueOnce(undefined);

    await createOpenCurrentPageHubCommand(deps as never)(
      createUri("growi", "/team/dev/spec.md"),
    );

    expect(JSON.stringify(deps.showQuickPick.mock.calls[0]?.[0])).not.toContain(
      GROWI_COMMANDS.createLocalMirrorForCurrentPage,
    );
  });

  it("shows an error for non-growi or non-page URI", async () => {
    const deps = createDeps();
    deps.getActiveEditorUri.mockReturnValue(
      createUri("file", "/tmp/readme.md"),
    );

    await createOpenCurrentPageHubCommand(deps as never)();

    expect(deps.showQuickPick).not.toHaveBeenCalled();
    expect(deps.executeCommand).not.toHaveBeenCalled();
    expect(deps.showErrorMessage).toHaveBeenCalledWith(
      "ページ詳細は growi: ページでのみ開けます。",
    );
  });
});

describe("loadCurrentPageDetailSummary", () => {
  it("loads page info and top 5 previews for page detail", async () => {
    const deps = createDeps();
    deps.getRegisteredPrefixes.mockReturnValue(["/team/dev"]);
    deps.getCurrentPageInfo.mockReturnValue({
      pageId: "page-123",
      revisionId: "revision-002",
      url: "https://growi.example.com/team/dev/spec",
      path: "/team/dev/spec",
      lastUpdatedBy: "alice",
      lastUpdatedAt: "2026-03-08T10:00:00.000Z",
    });
    deps.listAttachments.mockResolvedValue({
      ok: true,
      attachments: Array.from({ length: 6 }, (_, index) => ({
        attachmentId: `attachment-${index + 1}`,
        originalName: `file-${index + 1}.png`,
      })),
    });
    deps.listRevisions.mockResolvedValue({
      ok: true,
      revisions: Array.from({ length: 6 }, (_, index) => ({
        revisionId: `revision-${index + 1}`,
        createdAt: `2026-03-08T10:0${index}:00.000Z`,
        author: `user-${index + 1}`,
      })),
    });
    deps.listPages.mockResolvedValue({
      ok: true,
      paths: [
        "/team/dev/source-1",
        "/team/dev/source-2",
        "/team/dev/source-3",
        "/team/dev/source-4",
        "/team/dev/source-5",
        "/team/dev/source-6",
      ],
    });
    deps.readPageBody.mockImplementation(async (canonicalPath) => ({
      ok: true,
      body: `[spec](/team/dev/spec) from ${canonicalPath}`,
    }));

    const summary = await loadCurrentPageDetailSummary(deps, "/team/dev/spec");

    expect(summary.pageInfo?.pageId).toBe("page-123");
    expect(summary.attachments).toMatchObject({
      items: [
        "file-1.png",
        "file-2.png",
        "file-3.png",
        "file-4.png",
        "file-5.png",
      ],
      totalCount: 6,
      partial: true,
    });
    expect(summary.revisions).toMatchObject({
      items: [
        "2026-03-08T10:00:00.000Z / user-1",
        "2026-03-08T10:01:00.000Z / user-2",
        "2026-03-08T10:02:00.000Z / user-3",
        "2026-03-08T10:03:00.000Z / user-4",
        "2026-03-08T10:04:00.000Z / user-5",
      ],
      totalCount: 6,
      partial: true,
    });
    expect(summary.backlinks?.items).toHaveLength(5);
    expect(summary.backlinks?.partial).toBe(true);
  });
});
